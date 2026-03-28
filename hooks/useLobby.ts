"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";
import { C, S } from "@/shared/socketEvents";
import type {
  LobbyState,
  RoomSnapshot,
  RoomListItem,
  ConnectionStatus,
} from "@/shared/types";

const DEFAULT_STATE: LobbyState = {
  playerId: null,
  playerName: "",
  connectionStatus: "connecting",
  rooms: [],
  currentRoom: null,
  error: null,
};

export function useLobby() {
  const router            = useRouter();
  const { send, on }      = useSocket();
  const [state, setState] = useState<LobbyState>(DEFAULT_STATE);
  const nameRef           = useRef<string>("");

  // ── Helpers ───────────────────────────────────────────────────────────────

  const patch = useCallback((partial: Partial<LobbyState>) => {
    setState((prev) => ({ ...prev, ...partial, error: partial.error ?? null }));
  }, []);

  // ── Socket event listeners ─────────────────────────────────────────────────

  useEffect(() => {
    const unsubs = [
      on("__open",  () => patch({ connectionStatus: "connected" })),
      on("__close", () => patch({ connectionStatus: "disconnected" })),
      on("__error", () => patch({ connectionStatus: "error" })),

      on(S.CONNECTED, (data: any) => {
        patch({ playerId: data.playerId, playerName: data.name, connectionStatus: "connected" });
        nameRef.current = data.name;
      }),

      on(S.ROOM_LIST, (data: any) => {
        patch({ rooms: data as RoomListItem[] });
      }),

      on(S.ROOM_JOINED, (data: any) => {
        patch({ currentRoom: data as RoomSnapshot, error: null });
      }),

      on(S.ROOM_LEFT, () => {
        patch({ currentRoom: null });
      }),

      on(S.ROOM_UPDATED, (data: any) => {
        patch({ currentRoom: data as RoomSnapshot });
      }),

      on(S.PLAYER_JOINED, (data: any) => {
        patch({ currentRoom: (data as any).room });
      }),

      on(S.PLAYER_LEFT, (data: any) => {
        patch({ currentRoom: (data as any).room });
      }),

      on(S.HOST_CHANGED, (data: any) => {
        patch({ currentRoom: (data as any).room });
      }),

      on(S.ARENA_SELECTED, (data: any) => {
        patch({
          currentRoom: (data as any).room
            ? (data as any).room
            : null,
        });
        // Partial update if full room not returned
        setState((prev) => {
          if (!prev.currentRoom) return prev;
          return {
            ...prev,
            currentRoom: { ...prev.currentRoom, arena: (data as any).arenaId },
          };
        });
      }),

      on(S.GAME_STARTED, (data: any) => {
        const { roomId } = data as { roomId: string; arenaId: string };
        setState((prev) => {
          if (!prev.currentRoom) return prev;
          return { ...prev, currentRoom: { ...prev.currentRoom, status: "playing" } };
        });
        router.push(`/game/${roomId}`);
      }),

      on(S.ERROR, (data: any) => {
        patch({ error: (data as any).message ?? "Unknown error" });
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [on, patch, router]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const setName = useCallback(
    (name: string) => {
      nameRef.current = name;
      patch({ playerName: name });
      send(C.SET_NAME, { name });
    },
    [send, patch]
  );

  const refreshRooms = useCallback(() => {
    send(C.GET_ROOM_LIST);
  }, [send]);

  const createRoom = useCallback(
    (name: string, maxPlayers = 8) => {
      send(C.CREATE_ROOM, { name, maxPlayers });
    },
    [send]
  );

  const joinRoom = useCallback(
    (roomId: string) => {
      send(C.JOIN_ROOM, { roomId });
    },
    [send]
  );

  const leaveRoom = useCallback(() => {
    send(C.LEAVE_ROOM);
  }, [send]);

  const selectArena = useCallback(
    (arenaId: string) => {
      send(C.SELECT_ARENA, { arenaId });
    },
    [send]
  );

  const startGame = useCallback(() => {
    send(C.START_GAME);
  }, [send]);

  const isHost = state.currentRoom?.hostId === state.playerId;

  return {
    ...state,
    isHost,
    setName,
    refreshRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    selectArena,
    startGame,
  };
}