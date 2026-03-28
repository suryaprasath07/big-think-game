// ─── Client → Server ──────────────────────────────────────────────────────────
export const C = {
  SET_NAME:      "set_name",
  GET_ROOM_LIST: "get_room_list",
  CREATE_ROOM:   "create_room",
  JOIN_ROOM:     "join_room",
  LEAVE_ROOM:    "leave_room",
  SELECT_ARENA:  "select_arena",
  START_GAME:    "start_game",

  // Movement — send at ~20hz, server broadcasts to room
  PLAYER_MOVE:   "player_move",

  // Combat
  PLAYER_ATTACK: "player_attack",   // targetId, damage, weaponId
  PLAYER_HIT:    "player_hit",      // confirm a hit on self (anti-cheat: server decides)

  // Lifecycle
  PLAYER_RESPAWN_REQUEST: "player_respawn_request",

  // Chat / emotes
  PLAYER_EMOTE:  "player_emote",    // emoteId
  CHAT_MESSAGE:  "chat_message",    // text (in-game)
} as const;

// ─── Server → Client ──────────────────────────────────────────────────────────
export const S = {
  CONNECTED:      "connected",
  ROOM_LIST:      "room_list",
  ROOM_JOINED:    "room_joined",
  ROOM_LEFT:      "room_left",
  ROOM_UPDATED:   "room_updated",
  PLAYER_JOINED:  "player_joined",
  PLAYER_LEFT:    "player_left",
  HOST_CHANGED:   "host_changed",
  ARENA_SELECTED: "arena_selected",
  GAME_STARTED:   "game_started",
  ERROR:          "error",

  // Movement — relayed from other players, apply via interpolation
  PLAYER_STATE:   "player_state",   // playerId + transform + animation state

  // Authoritative health updates (server owns HP, not clients)
  HEALTH_UPDATE:  "health_update",  // playerId, hp, maxHp, delta, attackerId?

  // Kill feed / death cycle
  PLAYER_DIED:    "player_died",    // playerId, killerId, respawnIn (ms)
  PLAYER_RESPAWNED: "player_respawned", // playerId, spawnPos

  // Full state on join or reconnect
  GAME_STATE_SNAPSHOT: "game_state_snapshot",

  // Chat / emotes
  PLAYER_EMOTE:   "player_emote",   // playerId, emoteId
  CHAT_MESSAGE:   "chat_message",   // playerId, playerName, text, timestamp
} as const;

// ─── Payload types ─────────────────────────────────────────────────────────────
export interface Vec3 { x: number; y: number; z: number }

export interface PlayerMovePayload {
  seq: number;        // client sequence number for reconciliation
  pos: Vec3;
  rot: Vec3;          // euler yaw/pitch/roll
  vel: Vec3;
  anim: string;       // "idle" | "walk" | "run" | "jump" | "dead"
  t: number;          // client timestamp (performance.now())
}

export interface PlayerStatePayload extends PlayerMovePayload {
  playerId: string;
}

export interface PlayerAttackPayload {
  targetId: string;
  damage: number;
  weaponId: string;
  pos: Vec3;          // attack origin, server can sanity-check distance
}

export interface HealthUpdatePayload {
  playerId: string;
  hp: number;
  maxHp: number;
  delta: number;      // negative = damage, positive = heal
  attackerId?: string;
}

export interface PlayerDiedPayload {
  playerId: string;
  killerId: string;
  respawnIn: number;  // ms until auto-respawn
}

export interface PlayerRespawnedPayload {
  playerId: string;
  pos: Vec3;
}

export interface GameStateSnapshot {
  players: Array<{
    id: string;
    name: string;
    pos: Vec3;
    rot: Vec3;
    hp: number;
    maxHp: number;
    isDead: boolean;
  }>;
  tick: number;
}

export interface ChatMessagePayload {
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}