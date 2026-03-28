export interface Player {
  id: string;
  name: string;
}

export interface Arena {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  accentColor: string;
  tags: string[];
}

export type RoomStatus = "lobby" | "playing";

export interface RoomSnapshot {
  id: string;
  name: string;
  hostId: string;
  arena: string | null;
  status: RoomStatus;
  maxPlayers: number;
  createdAt: number;
  players: Player[];
}

export interface RoomListItem {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  arena: string | null;
  createdAt: number;
}

export interface WSMessage<T = unknown> {
  event: string;
  data: T;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface LobbyState {
  playerId: string | null;
  playerName: string;
  connectionStatus: ConnectionStatus;
  rooms: RoomListItem[];
  currentRoom: RoomSnapshot | null;
  error: string | null;
}