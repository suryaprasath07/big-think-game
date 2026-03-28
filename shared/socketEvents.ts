// ─── Client → Server ──────────────────────────────────────────────────────────
export const C = {
  SET_NAME:      "set_name",
  GET_ROOM_LIST: "get_room_list",
  CREATE_ROOM:   "create_room",
  JOIN_ROOM:     "join_room",
  LEAVE_ROOM:    "leave_room",
  SELECT_ARENA:  "select_arena",
  START_GAME:    "start_game",
} as const;

// ─── Server → Client ──────────────────────────────────────────────────────────
export const S = {
  CONNECTED:     "connected",
  ROOM_LIST:     "room_list",
  ROOM_JOINED:   "room_joined",
  ROOM_LEFT:     "room_left",
  ROOM_UPDATED:  "room_updated",
  PLAYER_JOINED: "player_joined",
  PLAYER_LEFT:   "player_left",
  HOST_CHANGED:  "host_changed",
  ARENA_SELECTED:"arena_selected",
  GAME_STARTED:  "game_started",
  ERROR:         "error",
} as const;