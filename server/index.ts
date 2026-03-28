import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// ─── In-memory state ──────────────────────────────────────────────────────────

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
}

const players = new Map<string, PlayerRecord>();
const rooms   = new Map<string, Room>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(ws: WebSocket, event: string, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

function broadcast(
  room: Room,
  event: string,
  data: unknown,
  excludeId?: string
) {
  const msg = JSON.stringify({ event, data });
  room.players.forEach((p, id) => {
    if (id !== excludeId && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg);
    }
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
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
    })),
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

function handleLeave(player: PlayerRecord) {
  const roomId = player.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.players.delete(player.id);
  player.roomId = null;

  if (room.players.size === 0) {
    rooms.delete(roomId);
  } else if (room.hostId === player.id) {
    // Transfer host to next player
    const newHost = room.players.values().next().value as PlayerRecord;
    room.hostId = newHost.id;
    broadcast(room, "host_changed", {
      hostId: newHost.id,
      room: roomSnapshot(room),
    });
  } else {
    broadcast(room, "player_left", {
      playerId: player.id,
      room: roomSnapshot(room),
    });
  }

  // Refresh lobby list for anyone browsing
  broadcastAll("room_list", getRoomList());
}

// ─── Server bootstrap ─────────────────────────────────────────────────────────

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    const playerId = randomUUID();
    const player: PlayerRecord = {
      id: playerId,
      name: `Player_${playerId.slice(0, 4).toUpperCase()}`,
      ws,
      roomId: null,
    };
    players.set(playerId, player);

    // Greet new connection
    send(ws, "connected", { playerId, name: player.name });
    send(ws, "room_list", getRoomList());

    ws.on("message", (raw) => {
      try {
        const { event, data } = JSON.parse(raw.toString());

        switch (event) {
          // ── Identity ───────────────────────────────────────────────────────
          case "set_name": {
            if (typeof data?.name === "string") {
              player.name = data.name.trim().slice(0, 24) || player.name;
              // If in a room, notify others
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

          // ── Room list refresh ──────────────────────────────────────────────
          case "get_room_list": {
            send(ws, "room_list", getRoomList());
            break;
          }

          // ── Create room ────────────────────────────────────────────────────
          case "create_room": {
            if (player.roomId) {
              send(ws, "error", { message: "Already in a room. Leave first." });
              break;
            }
            const room: Room = {
              id: randomUUID(),
              name: (data?.name as string)?.trim().slice(0, 32) || `${player.name}'s Room`,
              hostId: playerId,
              players: new Map([[playerId, player]]),
              arena: null,
              status: "lobby",
              maxPlayers: Math.min(Math.max(data?.maxPlayers ?? 8, 2), 16),
              createdAt: Date.now(),
            };
            rooms.set(room.id, room);
            player.roomId = room.id;

            send(ws, "room_joined", roomSnapshot(room));
            broadcastAll("room_list", getRoomList());
            break;
          }

          // ── Join room ──────────────────────────────────────────────────────
          case "join_room": {
            if (player.roomId) {
              send(ws, "error", { message: "Already in a room. Leave first." });
              break;
            }
            const room = rooms.get(data?.roomId);
            if (!room) {
              send(ws, "error", { message: "Room not found." });
              break;
            }
            if (room.status !== "lobby") {
              send(ws, "error", { message: "Game already in progress." });
              break;
            }
            if (room.players.size >= room.maxPlayers) {
              send(ws, "error", { message: "Room is full." });
              break;
            }

            room.players.set(playerId, player);
            player.roomId = room.id;

            send(ws, "room_joined", roomSnapshot(room));
            broadcast(room, "player_joined", {
              player: { id: playerId, name: player.name },
              room: roomSnapshot(room),
            }, playerId);
            broadcastAll("room_list", getRoomList());
            break;
          }

          // ── Leave room ─────────────────────────────────────────────────────
          case "leave_room": {
            if (!player.roomId) break;
            handleLeave(player);
            send(ws, "room_left", {});
            break;
          }

          // ── Host: select arena ─────────────────────────────────────────────
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

          // ── Host: start game ───────────────────────────────────────────────
          case "start_game": {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room || room.hostId !== playerId) break;
            if (!room.arena) {
              send(ws, "error", { message: "Select an arena first." });
              break;
            }

            room.status = "playing";
            const snap = roomSnapshot(room);
            broadcast(room, "game_started", { roomId: room.id, arenaId: room.arena, room: snap });
            send(ws, "game_started", { roomId: room.id, arenaId: room.arena, room: snap });
            broadcastAll("room_list", getRoomList());
            break;
          }
        }
      } catch (err) {
        console.error("[WS] parse error:", err);
      }
    });

    ws.on("close", () => {
      handleLeave(player);
      players.delete(playerId);
    });

    ws.on("error", (err) => console.error(`[WS] player ${playerId}:`, err));
  });

  const PORT = parseInt(process.env.PORT || "3000", 10);
  server.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});