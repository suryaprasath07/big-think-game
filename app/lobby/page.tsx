"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLobby } from "@/context/LobbyContext";
import { ARENAS, ARENA_MAP, MAX_PLAYERS_OPTIONS } from "@/shared/constants";

export default function LobbyPage() {
  const router = useRouter();
  const {
    playerId,
    playerName,
    connectionStatus,
    rooms,
    currentRoom,
    error,
    isHost,
    setName,
    refreshRooms,
    createRoom,
    joinRoom,
    leaveRoom,
  } = useLobby();

  const [nameInput,    setNameInput]    = useState("");
  const [nameSet,      setNameSet]      = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [roomName,     setRoomName]     = useState("");
  const [maxPlayers,   setMaxPlayers]   = useState(8);

  // Sync playerName from server into input
  useEffect(() => {
    if (playerName && !nameSet) setNameInput(playerName);
  }, [playerName, nameSet]);

  // If we're in a room, redirect to game room page
  useEffect(() => {
    if (currentRoom && currentRoom.status === "playing") {
        router.push(`/game/${currentRoom.id}`);
    }
  }, [currentRoom, router]);

  // Refresh room list every 5s
  useEffect(() => {
    refreshRooms();
    const id = setInterval(refreshRooms, 5000);
    return () => clearInterval(id);
  }, [refreshRooms]);

  const handleSetName = () => {
    if (!nameInput.trim()) return;
    setName(nameInput.trim());
    setNameSet(true);
  };

  const handleCreate = () => {
    if (!roomName.trim()) return;
    createRoom(roomName.trim(), maxPlayers);
    setShowCreate(false);
    setRoomName("");
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const s = {
    page: {
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f0f1a 0%, #1a0f2e 50%, #0f1a2e 100%)",
      color: "#e2e8f0",
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "0 16px",
    } as React.CSSProperties,

    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "24px 0 32px",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      maxWidth: 900,
      margin: "0 auto",
    } as React.CSSProperties,

    logo: {
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: "-0.5px",
      background: "linear-gradient(90deg, #818cf8, #c084fc)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    } as React.CSSProperties,

    pill: (color = "rgba(255,255,255,0.08)"): React.CSSProperties => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 12px",
      borderRadius: 999,
      background: color,
      fontSize: 12,
      fontWeight: 600,
    }),

    card: {
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: 20,
    } as React.CSSProperties,

    input: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      color: "#e2e8f0",
      fontSize: 14,
      outline: "none",
      boxSizing: "border-box",
    } as React.CSSProperties,

    btn: (variant: "primary" | "ghost" | "danger" = "primary"): React.CSSProperties => ({
      padding: "10px 20px",
      borderRadius: 10,
      border: "none",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 14,
      transition: "opacity 0.15s",
      background:
        variant === "primary" ? "linear-gradient(135deg, #818cf8, #c084fc)" :
        variant === "danger"  ? "rgba(239,68,68,0.2)" :
        "rgba(255,255,255,0.08)",
      color:
        variant === "danger" ? "#f87171" : "#fff",
    }),
  };

  const statusColor =
    connectionStatus === "connected"    ? "#4ade80" :
    connectionStatus === "disconnected" ? "#f87171" :
    connectionStatus === "connecting"   ? "#facc15" : "#94a3b8";

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <header style={s.header}>
        <span style={s.logo}>🧠 BigThink</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={s.pill()}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
            {connectionStatus}
          </span>
          {playerId && (
            <span style={{ ...s.pill(), color: "#94a3b8", fontSize: 11 }}>
              ID: {playerId.slice(0, 8)}
            </span>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 60 }}>

        {/* ── Name setup ── */}
        {!nameSet && (
          <div style={{ ...s.card, marginBottom: 32, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>👤</span>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder="Enter your display name…"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetName()}
              maxLength={24}
            />
            <button style={s.btn("primary")} onClick={handleSetName}>
              Set Name
            </button>
          </div>
        )}

        {/* ── Error banner ── */}
        {error && (
          <div style={{
            ...s.card,
            marginBottom: 16,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#f87171",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Top bar: Create room ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Open Rooms</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
              {rooms.length} room{rooms.length !== 1 ? "s" : ""} available
            </p>
          </div>
          <button
            style={s.btn("primary")}
            onClick={() => setShowCreate((v) => !v)}
            disabled={connectionStatus !== "connected"}
          >
            {showCreate ? "✕ Cancel" : "+ Create Room"}
          </button>
        </div>

        {/* ── Create room form ── */}
        {showCreate && (
          <div style={{ ...s.card, marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>New Room</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                style={s.input}
                placeholder="Room name…"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                maxLength={32}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>Max players:</label>
                <select
                  style={{ ...s.input, width: "auto" }}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                >
                  {MAX_PLAYERS_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <button style={s.btn("primary")} onClick={handleCreate}>
                 Create & Enter
              </button>
            </div>
          </div>
        )}

        {/* ── Room list ── */}
        {rooms.length === 0 ? (
          <div style={{
            ...s.card,
            textAlign: "center",
            padding: 60,
            color: "#475569",
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏜️</div>
            <p style={{ margin: 0, fontWeight: 600 }}>No open rooms. Create one!</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rooms.map((room) => {
              const arena = room.arena ? ARENA_MAP[room.arena] : null;
              const full  = room.playerCount >= room.maxPlayers;
              return (
                <div
                  key={room.id}
                  style={{
                    ...s.card,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    opacity: full ? 0.6 : 1,
                  }}
                >
                  {/* Arena thumbnail */}
                  <div style={{
                    width: 72,
                    height: 72,
                    borderRadius: 10,
                    overflow: "hidden",
                    flexShrink: 0,
                    background: "#1e293b",
                  }}>
                    {arena ? (
                      <img
                        src={arena.imageUrl}
                        alt={arena.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{
                        width: "100%", height: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 28, color: "#334155",
                      }}>
                        ❓
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                      {room.name}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={s.pill()}>
                        👥 {room.playerCount}/{room.maxPlayers}
                      </span>
                      {arena && (
                        <span style={s.pill(`${arena.accentColor}33`)}>
                          🗺 {arena.name}
                        </span>
                      )}
                      {full && <span style={s.pill("rgba(239,68,68,0.2)")}>🔒 Full</span>}
                    </div>
                  </div>

                  {/* Join */}
                  <button
                    style={s.btn(full ? "ghost" : "primary")}
                    disabled={full || connectionStatus !== "connected"}
                    onClick={() => joinRoom(room.id)}
                  >
                    {full ? "Full" : "Join →"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}