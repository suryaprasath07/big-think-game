import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

const dev      = process.env.NODE_ENV !== "production";
const app      = next({ dev });
const handle   = app.getRequestHandler();

const NEXT_PORT = parseInt(process.env.PORT    || "3000", 10);
const WS_PORT   = parseInt(process.env.WS_PORT || "3001", 10);

const MAX_HP        = 100;
const RESPAWN_MS    = 5000;
const MOVE_THROTTLE = 50; // ms — drop player_move if faster than 20hz

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vec3 { x: number; y: number; z: number }

interface GamePlayer {
  id: string;
  name: string;
  pos: Vec3;
  rot: Vec3;
  vel: Vec3;
  anim: string;
  hp: number;
  maxHp: number;
  isDead: boolean;
  lastMoveAt: number;
}

interface PlayerRecord {
  id: string;
  name: string;
  ws: WebSocket;
  roomId: string | null;
}

interface Room {
  id: string;
  name: string;
  hostId: string;
  players: Map<string, PlayerRecord>;
  arena: string | null;
  status: "lobby" | "playing";
  maxPlayers: number;
  createdAt: number;
  // game state (only meaningful when status === "playing")
  gameState: Map<string, GamePlayer>;
  scores:    Map<string, number>; // ← new
  tick: number;
}

const players = new Map<string, PlayerRecord>();
const rooms   = new Map<string, Room>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(ws: WebSocket, event: string, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

function broadcast(room: Room, event: string, data: unknown, excludeId?: string) {
  const msg = JSON.stringify({ event, data });
  room.players.forEach((p, id) => {
    if (id !== excludeId && p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  });
}

function broadcastAll(event: string, data: unknown) {
  const msg = JSON.stringify({ event, data });
  players.forEach((p) => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  });
}

function roomSnapshot(room: Room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    arena: room.arena,
    status: room.status,
    maxPlayers: room.maxPlayers,
    createdAt: room.createdAt,
    players: Array.from(room.players.values()).map((p) => ({ id: p.id, name: p.name })),
  };
}

function getRoomList() {
  return Array.from(rooms.values())
    .filter((r) => r.status === "lobby")
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({
      id: r.id,
      name: r.name,
      playerCount: r.players.size,
      maxPlayers: r.maxPlayers,
      arena: r.arena,
      createdAt: r.createdAt,
    }));
}

function getSpawnPos(): Vec3 {
  const angle = Math.random() * Math.PI * 2;
  return { x: Math.cos(angle) * 4, y: 0, z: Math.sin(angle) * 4 };
}

function buildGameSnapshot(room: Room) {
  return {
    tick: room.tick,
    players: Array.from(room.gameState.values()).map((gp) => ({
      id: gp.id,
      name: room.players.get(gp.id)?.name ?? gp.id,
      pos: gp.pos,
      rot: gp.rot,
      hp: gp.hp,
      maxHp: gp.maxHp,
      isDead: gp.isDead,
      anim: gp.anim,
    })),
    scores: Object.fromEntries(room.scores), // ← include scores
  };
}

function initGamePlayer(id: string): GamePlayer {
  return {
    id,
    pos: getSpawnPos(),
    rot: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    anim: "idle",
    hp: MAX_HP,
    maxHp: MAX_HP,
    isDead: false,
    lastMoveAt: 0,
    name: "",
  };
}

function handleLeave(player: PlayerRecord) {
  const roomId = player.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  room.players.delete(player.id);
  room.gameState.delete(player.id);
  player.roomId = null;

  if (room.players.size === 0) {
    rooms.delete(roomId);
  } else if (room.hostId === player.id) {
    const newHost = room.players.values().next().value as PlayerRecord;
    room.hostId = newHost.id;
    broadcast(room, "host_changed", { hostId: newHost.id, room: roomSnapshot(room) });
  } else {
    broadcast(room, "player_left", { playerId: player.id, room: roomSnapshot(room) });
  }

  broadcastAll("room_list", getRoomList());
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

app.prepare().then(() => {

  createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  }).listen(NEXT_PORT, () => {
    console.log(`> Next.js ready on http://localhost:${NEXT_PORT}`);
  });

  const wss = new WebSocketServer({ port: WS_PORT });
  console.log(`> Game WS   ready on ws://localhost:${WS_PORT}`);

  wss.on("connection", (ws) => {
    const playerId = randomUUID();
    const player: PlayerRecord = {
      id: playerId,
      name: `Player_${playerId.slice(0, 4).toUpperCase()}`,
      ws,
      roomId: null,
    };
    players.set(playerId, player);

    send(ws, "connected", { playerId, name: player.name });
    send(ws, "room_list", getRoomList());

    ws.on("message", (raw) => {
      try {
        const { event, data } = JSON.parse(raw.toString());

        switch (event) {

          // ── Lobby events ────────────────────────────────────────────────

          case "set_name": {
            if (typeof data?.name === "string") {
              player.name = data.name.trim().slice(0, 24) || player.name;
              if (player.roomId) {
                const room = rooms.get(player.roomId);
                if (room) {
                  broadcast(room, "room_updated", roomSnapshot(room), playerId);
                  send(ws, "room_updated", roomSnapshot(room));
                }
              }
            }
            break;
          }

          case "get_room_list": { send(ws, "room_list", getRoomList()); break; }

          case "create_room": {
            if (player.roomId) { send(ws, "error", { message: "Already in a room." }); break; }
            const room: Room = {
              id: randomUUID(),
              name: (data?.name as string)?.trim().slice(0, 32) || `${player.name}'s Room`,
              hostId: playerId,
              players: new Map([[playerId, player]]),
              arena: null,
              status: "lobby",
              maxPlayers: Math.min(Math.max(data?.maxPlayers ?? 8, 2), 16),
              createdAt: Date.now(),
              gameState: new Map(),
              scores: new Map(), // ← initialize scores
              tick: 0,
            };
            rooms.set(room.id, room);
            player.roomId = room.id;
            send(ws, "room_joined", roomSnapshot(room));
            broadcastAll("room_list", getRoomList());
            break;
          }

          case "join_room": {
            if (player.roomId) { send(ws, "error", { message: "Already in a room." }); break; }
            const room = rooms.get(data?.roomId);
            if (!room)                               { send(ws, "error", { message: "Room not found."           }); break; }
            if (room.status !== "lobby")             { send(ws, "error", { message: "Game already in progress." }); break; }
            if (room.players.size >= room.maxPlayers){ send(ws, "error", { message: "Room is full."             }); break; }
            room.players.set(playerId, player);
            player.roomId = room.id;
            send(ws, "room_joined", roomSnapshot(room));
            broadcast(room, "player_joined", { player: { id: playerId, name: player.name }, room: roomSnapshot(room) }, playerId);
            broadcastAll("room_list", getRoomList());
            break;
          }

          case "leave_room": { if (!player.roomId) break; handleLeave(player); send(ws, "room_left", {}); break; }

          case "select_arena": {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room || room.hostId !== playerId) break;
            room.arena = data?.arenaId ?? null;
            const snap = roomSnapshot(room);
            broadcast(room, "arena_selected", { arenaId: room.arena, room: snap });
            send(ws, "arena_selected", { arenaId: room.arena, room: snap });
            break;
          }

          case "start_game": {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room || room.hostId !== playerId) break;
            if (!room.arena) { send(ws, "error", { message: "Select an arena first." }); break; }
            room.status = "playing";

            // Initialise game state
            room.players.forEach((p) => {
              room.gameState.set(p.id, initGamePlayer(p.id));
            });

            // Reset scores
            room.scores.clear();
            room.players.forEach((p) => room.scores.set(p.id, 0));

            const snap = roomSnapshot(room);
            broadcast(room, "game_started", { roomId: room.id, arenaId: room.arena, room: snap });
            send(ws, "game_started", { roomId: room.id, arenaId: room.arena, room: snap });

            // Send initial snapshot
            const gs = buildGameSnapshot(room);
            room.players.forEach((p) => send(p.ws, "game_state_snapshot", gs));
            broadcastAll("room_list", getRoomList());
            break;
          }

          // ── Game events ────────────────────────────────────────────────

          case "player_move": {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room || room.status !== "playing") break;
            const gp = room.gameState.get(playerId);
            if (!gp || gp.isDead) break;

            const now = Date.now();
            if (now - gp.lastMoveAt < MOVE_THROTTLE) break;
            gp.lastMoveAt = now;

            if (data?.pos) gp.pos = data.pos;
            if (data?.rot) gp.rot = data.rot;
            if (data?.vel) gp.vel = data.vel;
            if (data?.anim) gp.anim = data.anim;
            room.tick++;

            broadcast(room, "player_state", {
              playerId,
              seq:  data?.seq ?? 0,
              pos:  gp.pos,
              rot:  gp.rot,
              vel:  gp.vel,
              anim: gp.anim,
              t:    data?.t ?? now,
            }, playerId);
            break;
          }

          case "player_attack": {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room || room.status !== "playing") break;

            const attacker = room.gameState.get(playerId);
            if (!attacker || attacker.isDead) break;

            const targetId = data?.targetId as string;
            const target   = room.gameState.get(targetId);
            if (!target || target.isDead) break;

            const dx = attacker.pos.x - target.pos.x;
            const dz = attacker.pos.z - target.pos.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist > 8) break;

            const rawDamage = Math.min(Math.max(Number(data?.damage) || 10, 1), 50);
            target.hp = Math.max(0, target.hp - rawDamage);

            const healthPayload = {
              playerId:   targetId,
              hp:         target.hp,
              maxHp:      target.maxHp,
              delta:      -rawDamage,
              attackerId: playerId,
            };
            broadcast(room, "health_update", healthPayload);
            send(ws, "health_update", healthPayload);

            // ── Handle death & update scores ──────────────────────────────
            if (target.hp <= 0 && !target.isDead) {
              target.isDead = true;
              target.anim   = "dead";

              // Increment killer's score
              const killerScore = (room.scores.get(playerId) ?? 0) + 1;
              room.scores.set(playerId, killerScore);

              const scorePayload = { scores: Object.fromEntries(room.scores) };
              broadcast(room, "score_update", scorePayload);
              send(ws, "score_update", scorePayload);

              const diedPayload = { playerId: targetId, killerId: playerId, respawnIn: RESPAWN_MS };
              broadcast(room, "player_died", diedPayload);
              send(ws, "player_died", diedPayload);

              setTimeout(() => {
                const r = rooms.get(room.id);
                if (!r) return;
                const gp2 = r.gameState.get(targetId);
                if (!gp2) return;
                gp2.hp     = MAX_HP;
                gp2.isDead = false;
                gp2.anim   = "idle";
                gp2.pos    = getSpawnPos();

                const respawnPayload = { playerId: targetId, pos: gp2.pos };
                r.players.forEach((p) => send(p.ws, "player_respawned", respawnPayload));

                const healPayload = {
                  playerId: targetId,
                  hp:       gp2.hp,
                  maxHp:    gp2.maxHp,
                  delta:    MAX_HP,
                };
                r.players.forEach((p) => send(p.ws, "health_update", healPayload));
              }, RESPAWN_MS);
            }
            break;
          }

          case "player_respawn_request": {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room || room.status !== "playing") break;
            const gp = room.gameState.get(playerId);
            if (!gp || !gp.isDead) break;

            gp.hp     = MAX_HP;
            gp.isDead = false;
            gp.anim   = "idle";
            gp.pos    = getSpawnPos();

            const payload = { playerId, pos: gp.pos };
            room.players.forEach((p) => send(p.ws, "player_respawned", payload));
            room.players.forEach((p) => send(p.ws, "health_update", {
              playerId, hp: gp.hp, maxHp: gp.maxHp, delta: MAX_HP,
            }));
            break;
          }

          case "chat_message": {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room) break;
            const text = String(data?.text ?? "").trim().slice(0, 200);
            if (!text) break;
            const payload = {
              playerId,
              playerName: player.name,
              text,
              timestamp: Date.now(),
            };
            broadcast(room, "chat_message", payload);
            send(ws, "chat_message", payload);
            break;
          }

          case "player_emote": {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room || room.status !== "playing") break;
            broadcast(room, "player_emote", { playerId, emoteId: data?.emoteId }, playerId);
            break;
          }
        }
      } catch (err) {
        console.error("[WS] parse error:", err);
      }
    });

    ws.on("close", () => { handleLeave(player); players.delete(playerId); });
    ws.on("error", (err) => console.error(`[WS] player ${playerId}:`, err));
  });
});