"use client";

import { useLobby } from "@/context/LobbyContext";
import { LobbyRoom } from "@/components/LobbyRoom";
import dynamic from "next/dynamic";
import { useState, useRef, useEffect } from "react";

const SplatViewer = dynamic(
  () => import("@/components/SplatViewer"),
  { ssr: false, loading: () => <LoadingSpinner label="Loading arena…" /> }
);

// ─── Loading Spinner ──────────────────────────────────────────────────────────

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

// ─── Health Bar ───────────────────────────────────────────────────────────────

function HealthBar({ hp, maxHp, name, isSelf }: {
  hp: number; maxHp: number; name: string; isSelf?: boolean;
}) {
  const pct   = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const color = pct > 60 ? "#4ade80" : pct > 30 ? "#facc15" : "#f87171";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: isSelf ? 200 : 120 }}>
      {name && (
        <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{name}</span>
      )}
      <div style={{
        height: isSelf ? 10 : 6,
        background: "rgba(255,255,255,0.1)",
        borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: color, borderRadius: 99,
          transition: "width 0.15s ease, background 0.3s ease",
        }} />
      </div>
      {isSelf && (
        <span style={{ fontSize: 11, color, fontFamily: "monospace" }}>{hp} / {maxHp}</span>
      )}
    </div>
  );
}

// ─── Kill Feed ────────────────────────────────────────────────────────────────

function KillFeed({ entries }: {
  entries: Array<{ killerId: string; killerName: string; victimId: string; victimName: string; ts: number }>;
}) {
  if (!entries.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, pointerEvents: "none" }}>
      {entries.slice(0, 5).map((e, i) => (
        <div key={`${e.ts}-${i}`} style={{
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
          padding: "4px 10px", borderRadius: 6,
          fontSize: 12, fontFamily: "monospace", color: "#e2e8f0",
          opacity: Math.max(0.4, 1 - i * 0.15),
        }}>
          <span style={{ color: "#f87171" }}>{e.killerName}</span>
          <span style={{ color: "#64748b" }}> eliminated </span>
          <span style={{ color: "#94a3b8" }}>{e.victimName}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Chat Overlay ─────────────────────────────────────────────────────────────

function ChatOverlay({ log, onSend }: {
  log: Array<{ playerId: string; playerName: string; text: string; timestamp: number }>;
  onSend: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const bottomRef       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const submit = () => {
    const t = text.trim();
    if (t) { onSend(t); setText(""); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 280 }}>
      {open && (
        <div style={{
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
          borderRadius: 10, padding: "8px 10px",
          maxHeight: 180, overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {log.slice(-30).map((e, i) => (
            <div key={i} style={{ fontSize: 12, fontFamily: "monospace", color: "#e2e8f0", lineHeight: 1.4 }}>
              <span style={{ color: "#818cf8" }}>{e.playerName}: </span>
              <span style={{ color: "#cbd5e1" }}>{e.text}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            padding: "5px 10px", borderRadius: 7, border: "none",
            background: "rgba(0,0,0,0.55)", color: "#94a3b8",
            fontSize: 12, cursor: "pointer", backdropFilter: "blur(8px)",
          }}
        >
          💬 {open ? "hide" : "chat"}
        </button>
        {open && (
          <>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); e.stopPropagation(); }}
              placeholder="Say something…"
              style={{
                flex: 1, padding: "5px 10px", borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.55)", color: "#e2e8f0",
                fontSize: 12, fontFamily: "monospace", outline: "none",
              }}
            />
            <button
              onClick={submit}
              style={{
                padding: "5px 10px", borderRadius: 7, border: "none",
                background: "#818cf8", color: "#fff",
                fontSize: 12, cursor: "pointer",
              }}
            >
              Send
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Death Screen ─────────────────────────────────────────────────────────────

function DeathScreen({ onRespawn }: { onRespawn: () => void }) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(id); onRespawn(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onRespawn]);

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      pointerEvents: "none",
    }}>
      <p style={{ margin: 0, fontSize: 48, color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>
        YOU DIED
      </p>
      <p style={{ margin: 0, fontSize: 18, color: "#94a3b8", fontFamily: "monospace" }}>
        Respawning in {countdown}…
      </p>
    </div>
  );
}

// ─── Page styles ──────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #0f0f1a 0%, #1a0f2e 50%, #0f1a2e 100%)",
  color: "#e2e8f0",
  fontFamily: "'Inter', system-ui, sans-serif",
  position: "relative",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    remotePlayers,
    sendMove,
    localHp,
    localMaxHp,
    localIsDead,
    requestRespawn,
    chatLog,
    killFeed,
    sendChat,
  } = useLobby();

  // ── Connecting ─────────────────────────────────────────────────────────────
  if (connectionStatus === "connecting") {
    return <div style={pageStyle}><LoadingSpinner label="Connecting…" /></div>;
  }

  // ── Disconnected ───────────────────────────────────────────────────────────
  if (connectionStatus === "disconnected" || connectionStatus === "error") {
    return (
      <div style={{ ...pageStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <span style={{ fontSize: 48 }}>📡</span>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Connection lost</p>
        <p style={{ margin: 0, color: "#94a3b8" }}>Reconnecting automatically…</p>
      </div>
    );
  }

  // ── No room ────────────────────────────────────────────────────────────────
  if (!currentRoom) {
    return (
      <div style={{ ...pageStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <span style={{ fontSize: 48 }}>🚪</span>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Room not found</p>
        <p style={{ margin: 0, color: "#94a3b8" }}>This room may have closed, or you refreshed the page.</p>
        <a href="/lobby" style={{
          marginTop: 8, padding: "10px 24px", borderRadius: 10,
          background: "linear-gradient(135deg, #818cf8, #c084fc)",
          color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: 14,
        }}>
          ← Back to Lobby
        </a>
      </div>
    );
  }

  // ── Game in progress ───────────────────────────────────────────────────────
  if (currentRoom.status === "playing") {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000" }}>

        {/* Death overlay */}
        {localIsDead && <DeathScreen onRespawn={requestRespawn} />}

        {/* Top-left: leave + player count */}
        <div style={{
          position: "absolute", top: 16, left: 16, zIndex: 10,
          display: "flex", gap: 10, alignItems: "center",
        }}>
          <button onClick={leaveRoom} style={{
            padding: "6px 14px", borderRadius: 8, border: "none",
            background: "rgba(0,0,0,0.65)", color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}>
            ← Leave
          </button>
          <div style={{
            padding: "6px 14px", borderRadius: 8,
            background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
            fontSize: 12, color: "#94a3b8",
          }}>
            👥 {currentRoom.players.length} players
          </div>
        </div>

        {/* Top-right: kill feed */}
        <div style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
          <KillFeed entries={killFeed} />
        </div>

        {/* Bottom-left: health bars */}
        <div style={{
          position: "absolute", bottom: 16, left: 16, zIndex: 10,
          display: "flex", flexDirection: "column", gap: 10,
          pointerEvents: "none",
        }}>
          <HealthBar hp={localHp} maxHp={localMaxHp} name={playerName} isSelf />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Array.from(remotePlayers.values()).map((rp) => (
              <HealthBar key={rp.id} hp={rp.hp} maxHp={rp.maxHp} name={rp.name} />
            ))}
          </div>
        </div>

        {/* Bottom-right: chat */}
        <div style={{
          position: "absolute", bottom: 16, right: 16, zIndex: 10,
          display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end",
        }}>
          <ChatOverlay log={chatLog} onSend={sendChat} />
        </div>

        {/* 3D world */}
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