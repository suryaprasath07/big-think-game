"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { C, S } from "@/shared/socketEvents";
import { WS_URL } from "@/shared/constants";
import type {
  LobbyState,
  RoomSnapshot,
  RoomListItem,
  ConnectionStatus,
} from "@/shared/types";

// ─── Game state types ─────────────────────────────────────────────────────────

export interface Vec3 { x: number; y: number; z: number }

export interface RemotePlayer {
  id: string;
  name: string;
  pos: Vec3;
  rot: Vec3;
  hp: number;
  maxHp: number;
  isDead: boolean;
  anim: string;
}

export interface GameSnapshot {
  tick: number;
  players: RemotePlayer[];
}

export interface ChatEntry {
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

// ─── Context value ────────────────────────────────────────────────────────────

interface LobbyContextValue extends LobbyState {
  isHost: boolean;

  // Game state (populated once game starts)
  remotePlayers:  Map<string, RemotePlayer>;
  localHp:        number;
  localMaxHp:     number;
  localIsDead:    boolean;
  chatLog:        ChatEntry[];
  killFeed:       Array<{ killerId: string; killerName: string; victimId: string; victimName: string; ts: number }>;

  // Lobby actions
  send:         (event: string, data?: unknown) => void;
  setName:      (name: string) => void;
  refreshRooms: () => void;
  createRoom:   (name: string, maxPlayers?: number) => void;
  joinRoom:     (roomId: string) => void;
  leaveRoom:    () => void;
  selectArena:  (arenaId: string) => void;
  startGame:    () => void;

  // Game actions
  sendMove:     (payload: { seq: number; pos: Vec3; rot: Vec3; vel: Vec3; anim: string; t: number }) => void;
  sendAttack:   (targetId: string, damage: number, weaponId?: string) => void;
  sendEmote:    (emoteId: string) => void;
  sendChat:     (text: string) => void;
  requestRespawn: () => void;
}

const LobbyContext = createContext<LobbyContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function LobbyProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const ws          = useRef<WebSocket | null>(null);
  const queue       = useRef<string[]>([]);
  const reconnectTO = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted     = useRef(true);
  const playerIdRef = useRef<string | null>(null);

  const [state, setState] = useState<LobbyState>({
    playerId:         null,
    playerName:       "",
    connectionStatus: "connecting",
    rooms:            [],
    currentRoom:      null,
    error:            null,
  });

  // ── Game state (mutable refs for high-freq updates, React state for UI) ───
  const [remotePlayers, setRemotePlayers] = useState<Map<string, RemotePlayer>>(new Map());
  const [localHp,       setLocalHp]       = useState(100);
  const [localMaxHp,    setLocalMaxHp]    = useState(100);
  const [localIsDead,   setLocalIsDead]   = useState(false);
  const [chatLog,       setChatLog]       = useState<ChatEntry[]>([]);
  const [killFeed,      setKillFeed]      = useState<Array<{
    killerId: string; killerName: string; victimId: string; victimName: string; ts: number;
  }>>([]);

  const patch = useCallback((partial: Partial<LobbyState>) => {
    if (!mounted.current) return;
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Raw send ───────────────────────────────────────────────────────────────
  const send = useCallback((event: string, data: unknown = {}) => {
    const msg = JSON.stringify({ event, data });
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(msg);
    } else {
      queue.current.push(msg);
    }
  }, []);

  // ── Message dispatcher ─────────────────────────────────────────────────────
  const handleMessage = useCallback((raw: string) => {
    let parsed: { event: string; data: unknown };
    try { parsed = JSON.parse(raw); } catch { return; }
    const { event, data } = parsed;

    switch (event) {

      // ── Lobby ──────────────────────────────────────────────────────────────

      case S.CONNECTED:
        playerIdRef.current = (data as any).playerId;
        patch({
          playerId:         (data as any).playerId,
          playerName:       (data as any).name,
          connectionStatus: "connected",
          error:            null,
        });
        break;

      case S.ROOM_LIST:
        patch({ rooms: data as RoomListItem[] });
        break;

      case S.ROOM_JOINED:
        patch({ currentRoom: data as RoomSnapshot, error: null });
        router.push(`/game/${(data as RoomSnapshot).id}`);
        break;

      case S.ROOM_LEFT:
        patch({ currentRoom: null });
        setRemotePlayers(new Map());
        setLocalHp(100); setLocalIsDead(false);
        setChatLog([]); setKillFeed([]);
        router.push("/lobby");
        break;

      case S.ROOM_UPDATED:
        patch({ currentRoom: data as RoomSnapshot });
        break;

      case S.PLAYER_JOINED:
        patch({ currentRoom: (data as any).room as RoomSnapshot });
        break;

      case S.PLAYER_LEFT:
        patch({ currentRoom: (data as any).room as RoomSnapshot });
        setRemotePlayers((prev) => {
          const next = new Map(prev);
          next.delete((data as any).playerId);
          return next;
        });
        break;

      case S.HOST_CHANGED:
        patch({ currentRoom: (data as any).room as RoomSnapshot });
        break;

      case S.ARENA_SELECTED:
        setState((prev) => {
          if (!prev.currentRoom) return prev;
          const room = (data as any).room as RoomSnapshot ?? {
            ...prev.currentRoom,
            arena: (data as any).arenaId,
          };
          return { ...prev, currentRoom: room };
        });
        break;

      case S.GAME_STARTED: {
        const { roomId } = data as { roomId: string };
        setState((prev) => {
          if (!prev.currentRoom) return prev;
          return { ...prev, currentRoom: { ...prev.currentRoom, status: "playing" } };
        });
        router.push(`/game/${roomId}`);
        break;
      }

      case S.ERROR:
        patch({ error: (data as any).message ?? "Unknown error" });
        break;

      // ── Game: full snapshot on join / reconnect ────────────────────────────

      case S.GAME_STATE_SNAPSHOT: {
        const snap = data as GameSnapshot;
        const myId = playerIdRef.current;
        const map  = new Map<string, RemotePlayer>();
        snap.players.forEach((p) => {
          if (p.id === myId) {
            setLocalHp(p.hp);
            setLocalMaxHp(p.maxHp);
            setLocalIsDead(p.isDead);
          } else {
            map.set(p.id, p);
          }
        });
        setRemotePlayers(map);
        break;
      }

      // ── Game: movement relay ───────────────────────────────────────────────

      case S.PLAYER_STATE: {
        const d = data as any;
        setRemotePlayers((prev) => {
          const next = new Map(prev);
          const existing = next.get(d.playerId);
          next.set(d.playerId, {
            id:      d.playerId,
            name:    existing?.name ?? d.playerId,
            pos:     d.pos,
            rot:     d.rot,
            hp:      existing?.hp     ?? 100,
            maxHp:   existing?.maxHp  ?? 100,
            isDead:  existing?.isDead ?? false,
            anim:    d.anim,
          });
          return next;
        });
        break;
      }

      // ── Game: health ───────────────────────────────────────────────────────

      case S.HEALTH_UPDATE: {
        const d = data as any;
        const myId = playerIdRef.current;
        if (d.playerId === myId) {
          setLocalHp(d.hp);
          setLocalMaxHp(d.maxHp);
        } else {
          setRemotePlayers((prev) => {
            const next = new Map(prev);
            const p = next.get(d.playerId);
            if (p) next.set(d.playerId, { ...p, hp: d.hp, maxHp: d.maxHp });
            return next;
          });
        }
        break;
      }

      // ── Game: death / respawn ──────────────────────────────────────────────

      case S.PLAYER_DIED: {
        const d = data as any;
        const myId = playerIdRef.current;

        if (d.playerId === myId) {
          setLocalIsDead(true);
          setLocalHp(0);
        } else {
          setRemotePlayers((prev) => {
            const next = new Map(prev);
            const p = next.get(d.playerId);
            if (p) next.set(d.playerId, { ...p, hp: 0, isDead: true, anim: "dead" });
            return next;
          });
        }

        // Add to kill feed
        setKillFeed((prev) => {
          const killerName = prev.find((e) => e.killerId === d.killerId)?.killerName
            ?? remotePlayers.get(d.killerId)?.name
            ?? (d.killerId === myId ? state.playerName : d.killerId);
          const victimName = remotePlayers.get(d.playerId)?.name
            ?? (d.playerId === myId ? state.playerName : d.playerId);
          return [
            { killerId: d.killerId, killerName, victimId: d.playerId, victimName, ts: Date.now() },
            ...prev.slice(0, 9),
          ];
        });
        break;
      }

      case S.PLAYER_RESPAWNED: {
        const d = data as any;
        const myId = playerIdRef.current;
        if (d.playerId === myId) {
          setLocalIsDead(false);
        } else {
          setRemotePlayers((prev) => {
            const next = new Map(prev);
            const p = next.get(d.playerId);
            if (p) next.set(d.playerId, { ...p, pos: d.pos, isDead: false, anim: "idle" });
            return next;
          });
        }
        break;
      }

      // ── Game: chat ─────────────────────────────────────────────────────────

      case S.CHAT_MESSAGE:
        setChatLog((prev) => [...prev.slice(-99), data as ChatEntry]);
        break;

      case S.PLAYER_EMOTE:
        // Forward to 3D layer via a custom event — SplatViewer can listen
        window.dispatchEvent(new CustomEvent("game:emote", { detail: data }));
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, router]);

  // ── WebSocket lifecycle ────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!mounted.current) return;
    if (ws.current?.readyState === WebSocket.OPEN ||
        ws.current?.readyState === WebSocket.CONNECTING) return;

    patch({ connectionStatus: "connecting" });

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      if (!mounted.current) return;
      patch({ connectionStatus: "connected" });
      queue.current.forEach((m) => socket.send(m));
      queue.current = [];
    };

    socket.onmessage = (e) => handleMessage(e.data);

    socket.onclose = () => {
      if (!mounted.current) return;
      patch({ connectionStatus: "disconnected" });
      reconnectTO.current = setTimeout(connect, 2000);
    };

    socket.onerror = () => {
      patch({ connectionStatus: "error" });
      socket.close();
    };
  }, [handleMessage, patch]);

  useEffect(() => {
    mounted.current = true;
    connect();
    return () => {
      mounted.current = false;
      reconnectTO.current && clearTimeout(reconnectTO.current);
      ws.current?.close();
      ws.current = null;
    };
  }, [connect]);

  // ── Lobby actions ──────────────────────────────────────────────────────────
  const setName      = useCallback((name: string) => { patch({ playerName: name }); send(C.SET_NAME, { name }); }, [send, patch]);
  const refreshRooms = useCallback(() => send(C.GET_ROOM_LIST), [send]);
  const createRoom   = useCallback((name: string, maxPlayers = 8) => send(C.CREATE_ROOM, { name, maxPlayers }), [send]);
  const joinRoom     = useCallback((roomId: string) => send(C.JOIN_ROOM, { roomId }), [send]);
  const leaveRoom    = useCallback(() => send(C.LEAVE_ROOM), [send]);
  const selectArena  = useCallback((arenaId: string) => send(C.SELECT_ARENA, { arenaId }), [send]);
  const startGame    = useCallback(() => send(C.START_GAME), [send]);

  // ── Game actions ───────────────────────────────────────────────────────────
  const sendMove = useCallback((payload: {
    seq: number; pos: Vec3; rot: Vec3; vel: Vec3; anim: string; t: number;
  }) => send(C.PLAYER_MOVE, payload), [send]);

  const sendAttack = useCallback((targetId: string, damage: number, weaponId = "default") =>
    send(C.PLAYER_ATTACK, { targetId, damage, weaponId }), [send]);

  const sendEmote     = useCallback((emoteId: string) => send(C.PLAYER_EMOTE, { emoteId }), [send]);
  const sendChat      = useCallback((text: string)    => send(C.CHAT_MESSAGE,  { text }),    [send]);
  const requestRespawn = useCallback(()               => send(C.PLAYER_RESPAWN_REQUEST),     [send]);

  const isHost = state.currentRoom?.hostId === state.playerId;

  const value: LobbyContextValue = {
    ...state,
    isHost,
    remotePlayers,
    localHp,
    localMaxHp,
    localIsDead,
    chatLog,
    killFeed,
    send,
    setName,
    refreshRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    selectArena,
    startGame,
    sendMove,
    sendAttack,
    sendEmote,
    sendChat,
    requestRespawn,
  };

  return <LobbyContext.Provider value={value}>{children}</LobbyContext.Provider>;
}

export function useLobby(): LobbyContextValue {
  const ctx = useContext(LobbyContext);
  if (!ctx) throw new Error("useLobby must be used inside <LobbyProvider>");
  return ctx;
}