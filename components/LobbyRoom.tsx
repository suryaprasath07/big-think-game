"use client";

import { useState } from "react";
import { ARENAS, ARENA_MAP } from "@/shared/constants";
import type { RoomSnapshot, Player } from "@/shared/types";

interface Props {
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  playerName: string;
  error: string | null;
  onLeave: () => void;
  onSelectArena: (arenaId: string) => void;
  onStartGame: () => void;
}

export function LobbyRoom({
  room,
  playerId,
  isHost,
  playerName,
  error,
  onLeave,
  onSelectArena,
  onStartGame,
}: Props) {
  const [showArenas, setShowArenas] = useState(false);
  const selectedArena = room.arena ? ARENA_MAP[room.arena] : null;

  const s = {
    root: {
      display: "flex",
      flexDirection: "column" as const,
      gap: 20,
      maxWidth: 860,
      margin: "0 auto",
      padding: "32px 16px",
    },

    card: (accent?: string): React.CSSProperties => ({
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${accent ? `${accent}44` : "rgba(255,255,255,0.08)"}`,
      borderRadius: 16,
      padding: 20,
    }),

    pill: (bg = "rgba(255,255,255,0.08)"): React.CSSProperties => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 10px",
      borderRadius: 999,
      background: bg,
      fontSize: 12,
      fontWeight: 600,
    }),

    btn: (variant: "primary" | "ghost" | "danger" = "primary", disabled = false): React.CSSProperties => ({
      padding: "12px 24px",
      borderRadius: 12,
      border: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      fontWeight: 700,
      fontSize: 14,
      opacity: disabled ? 0.5 : 1,
      transition: "opacity 0.15s, transform 0.1s",
      background:
        variant === "primary" ? "linear-gradient(135deg, #818cf8, #c084fc)" :
        variant === "danger"  ? "rgba(239,68,68,0.2)" :
        "rgba(255,255,255,0.08)",
      color: variant === "danger" ? "#f87171" : "#fff",
    }),

    playerBadge: (isCurrentPlayer: boolean): React.CSSProperties => ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 14px",
      borderRadius: 10,
      background: isCurrentPlayer
        ? "rgba(129,140,248,0.12)"
        : "rgba(255,255,255,0.04)",
      border: isCurrentPlayer
        ? "1px solid rgba(129,140,248,0.3)"
        : "1px solid rgba(255,255,255,0.06)",
    }),
  };

  const emptySlots = room.maxPlayers - room.players.length;
  const canStart   = isHost && !!room.arena && room.players.length >= 1;

  return (
    <div style={s.root}>

      {/* ── Room Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800 }}>{room.name}</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={s.pill()}>
              👥 {room.players.length}/{room.maxPlayers} players
            </span>
            {isHost && <span style={s.pill("rgba(250,204,21,0.2)")}>👑 You are host</span>}
            <span style={s.pill()}>🆔 {room.id.slice(0, 8)}</span>
          </div>
        </div>
        <button style={s.btn("danger")} onClick={onLeave}>
          ← Leave Room
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          ...s.card(),
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.3)",
          color: "#f87171",
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── Player List ── */}
        <div style={s.card()}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
            Players
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {room.players.map((p: Player) => (
              <div key={p.id} style={s.playerBadge(p.id === playerId)}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: `hsl(${parseInt(p.id.slice(0,6), 16) % 360}, 60%, 50%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0,
                }}>
                  {p.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                    {p.id === playerId && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: "#818cf8", fontWeight: 700 }}>(you)</span>
                    )}
                  </div>
                </div>
                {room.hostId === p.id && <span style={{ fontSize: 16 }} title="Host">👑</span>}
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                ...s.playerBadge(false),
                opacity: 0.3,
                border: "1px dashed rgba(255,255,255,0.12)",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  border: "2px dashed rgba(255,255,255,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, flexShrink: 0,
                }}>
                  +
                </div>
                <span style={{ color: "#475569", fontSize: 13 }}>Waiting for player…</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Arena Panel ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Selected arena preview */}
          <div style={{
            ...s.card(selectedArena?.accentColor),
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
              Arena
            </h3>

            {selectedArena ? (
              <>
                <div style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  height: 140,
                  position: "relative",
                }}>
                  <img
                    src={selectedArena.imageUrl}
                    alt={selectedArena.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)",
                    display: "flex", alignItems: "flex-end", padding: 12,
                  }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{selectedArena.name}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                        {selectedArena.description}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {selectedArena.tags.map(tag => (
                    <span key={tag} style={s.pill(`${selectedArena.accentColor}33`)}>#{tag}</span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{
                flex: 1,
                borderRadius: 12,
                border: "2px dashed rgba(255,255,255,0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 24,
                color: "#475569",
                minHeight: 120,
              }}>
                <span style={{ fontSize: 32 }}>🗺️</span>
                <span style={{ fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                  {isHost ? "Select an arena below" : "Host is choosing an arena…"}
                </span>
              </div>
            )}

            {isHost && (
              <button
                style={s.btn("ghost")}
                onClick={() => setShowArenas((v) => !v)}
              >
                {showArenas ? "▲ Hide Arenas" : "▼ Choose Arena"}
              </button>
            )}
          </div>

          {/* ── Play Button ── */}
          <button
            style={{
              ...s.btn("primary", !canStart),
              padding: "16px 24px",
              fontSize: 18,
              letterSpacing: 0.5,
              boxShadow: canStart ? "0 0 32px rgba(129,140,248,0.35)" : "none",
              transition: "box-shadow 0.3s",
            }}
            disabled={!canStart}
            onClick={onStartGame}
          >
            {!isHost ? "⏳ Waiting for host…" :
             !room.arena ? "🗺️ Pick an arena first" :
             "🚀 Start Game!"}
          </button>
          {isHost && !room.arena && (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", textAlign: "center" }}>
              Select an arena to unlock the start button
            </p>
          )}
        </div>
      </div>

      {/* ── Arena Selector Grid ── */}
      {showArenas && isHost && (
        <div style={s.card()}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
            Choose Arena
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}>
            {ARENAS.map((arena) => {
              const selected = room.arena === arena.id;
              return (
                <div
                  key={arena.id}
                  onClick={() => { onSelectArena(arena.id); setShowArenas(false); }}
                  style={{
                    borderRadius: 12,
                    overflow: "hidden",
                    cursor: "pointer",
                    border: selected
                      ? `2px solid ${arena.accentColor}`
                      : "2px solid transparent",
                    transform: selected ? "scale(1.02)" : "scale(1)",
                    transition: "all 0.15s",
                    position: "relative",
                  }}
                >
                  <img
                    src={arena.imageUrl}
                    alt={arena.name}
                    style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }}
                  />
                  <div style={{
                    position: "absolute", inset: 0,
                    background: selected
                      ? `linear-gradient(to top, ${arena.accentColor}cc, transparent 60%)`
                      : "linear-gradient(to top, rgba(0,0,0,0.75), transparent 60%)",
                    display: "flex", alignItems: "flex-end", padding: 10,
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {selected && "✓ "}{arena.name}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                        {arena.description}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}