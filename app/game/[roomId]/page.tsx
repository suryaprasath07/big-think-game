"use client";

import { useLobby } from "@/context/LobbyContext";
import { LobbyRoom } from "@/components/LobbyRoom";
import dynamic from "next/dynamic";

// SplatViewer is WebGL — no SSR
const SplatViewer = dynamic(
  () => import("@/components/SplatViewer"),
  {
    ssr: false,
    loading: () => <LoadingSpinner label="Loading arena…" />,
  }
);

function LoadingSpinner({ label }: { label: string }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#0f0f1a", color: "#e2e8f0", gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        border: "3px solid rgba(129,140,248,0.2)",
        borderTopColor: "#818cf8",
        animation: "spin 0.8s linear infinite",
      }} />
      <p style={{ margin: 0, fontWeight: 600, color: "#94a3b8" }}>{label}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #0f0f1a 0%, #1a0f2e 50%, #0f1a2e 100%)",
  color: "#e2e8f0",
  fontFamily: "'Inter', system-ui, sans-serif",
  position: "relative",
};

export default function GameRoomPage() {
  const {
    playerId,
    playerName,
    connectionStatus,
    currentRoom,
    error,
    isHost,
    leaveRoom,
    selectArena,
    startGame,
  } = useLobby();

  // ── Still connecting ───────────────────────────────────────────────────────
  if (connectionStatus === "connecting") {
    return (
      <div style={pageStyle}>
        <LoadingSpinner label="Connecting…" />
      </div>
    );
  }

  // ── Disconnected ───────────────────────────────────────────────────────────
  if (connectionStatus === "disconnected" || connectionStatus === "error") {
    return (
      <div style={{
        ...pageStyle,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
      }}>
        <span style={{ fontSize: 48 }}>📡</span>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Connection lost</p>
        <p style={{ margin: 0, color: "#94a3b8" }}>Reconnecting automatically…</p>
      </div>
    );
  }

  // ── No room in state (direct URL / page refresh) ───────────────────────────
  if (!currentRoom) {
    return (
      <div style={{
        ...pageStyle,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
      }}>
        <span style={{ fontSize: 48 }}>🚪</span>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Room not found</p>
        <p style={{ margin: 0, color: "#94a3b8" }}>
          This room may have closed, or you refreshed the page.
        </p>
        <a
          href="/lobby"
          style={{
            marginTop: 8, padding: "10px 24px",
            borderRadius: 10, background: "linear-gradient(135deg, #818cf8, #c084fc)",
            color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: 14,
          }}
        >
          ← Back to Lobby
        </a>
      </div>
    );
  }

  // ── Game in progress → fullscreen SplatViewer ──────────────────────────────
  if (currentRoom.status === "playing") {
    const {
      remotePlayers,
      sendMove,
      localHp,
      localMaxHp,
      localIsDead,
      requestRespawn,
    } = useLobby();

    return (
      <div style={{ position: "fixed", inset: 0, background: "#000" }}>
        <div style={{
          position: "absolute", top: 16, left: 16, zIndex: 10,
          display: "flex", gap: 10, alignItems: "center",
        }}>
          <button
            onClick={leaveRoom}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: "rgba(0,0,0,0.65)", color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              backdropFilter: "blur(8px)",
            }}
          >
            ← Leave
          </button>
          <div style={{
            padding: "6px 14px", borderRadius: 8,
            background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
            fontSize: 12, color: "#94a3b8",
          }}>
            👥 {currentRoom.players.length} players online
          </div>
        </div>
        <SplatViewer
          remotePlayers={remotePlayers}
          sendMove={sendMove}
          localHp={localHp}
          localMaxHp={localMaxHp}
          localIsDead={localIsDead}
          requestRespawn={requestRespawn}
        />
      </div>
    );
  }

  // ── Lobby UI ───────────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <LobbyRoom
        room={currentRoom}
        playerId={playerId!}
        isHost={isHost}
        playerName={playerName}
        error={error}
        onLeave={leaveRoom}
        onSelectArena={selectArena}
        onStartGame={startGame}
      />
    </div>
  );
}