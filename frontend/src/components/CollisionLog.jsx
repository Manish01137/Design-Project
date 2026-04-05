import React from "react";
import { AlertTriangle, Zap, CheckCircle, Clock } from "lucide-react";

const ACTION_CONFIG = {
  EMERGENCY_BRAKE: { icon: <AlertTriangle size={12} />, color: "var(--emergency)", bg: "#ff3b3b12" },
  BRAKE:           { icon: <Zap size={12} />,           color: "var(--warning)",   bg: "#ffd70012" },
  ACC_ADJUST:      { icon: <CheckCircle size={12} />,   color: "var(--safe)",      bg: "#00ff8812" },
};

function formatTime(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false });
  } catch { return ts.slice(11, 19) || "—"; }
}

export default function CollisionLog({ events = [] }) {
  if (!events.length) {
    return (
      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "20px",
      }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 12 }}>
          COLLISION / BRAKE EVENT LOG
        </div>
        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "24px 0" }}>
          No events yet — simulation running normally
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "16px 20px",
      maxHeight: 360, display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", letterSpacing: 1 }}>
          COLLISION / BRAKE EVENT LOG
        </div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--accent-red)", background: "#ff3b3b11",
          border: "1px solid #ff3b3b33", borderRadius: 4, padding: "2px 8px",
        }}>
          {events.length} events
        </div>
      </div>

      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        {events.map((e, i) => {
          const cfg = ACTION_CONFIG[e.action] || ACTION_CONFIG.BRAKE;
          return (
            <div key={i} className="slide-in" style={{
              background: cfg.bg,
              border: `1px solid ${cfg.color}33`,
              borderRadius: 7, padding: "10px 12px",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center", gap: 10,
            }}>
              <span style={{ color: cfg.color }}>{cfg.icon}</span>
              <div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: cfg.color, fontWeight: 700, marginBottom: 2,
                }}>
                  {e.vehicle_id?.toUpperCase()} — {e.action?.replace(/_/g, " ")}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  Gap: <strong>{(e.gap_m || 0).toFixed(1)}m</strong>
                  {" · "}Speed: <strong>{(e.speed_kmh || (e.speed_ms || 0) * 3.6).toFixed(1)} km/h</strong>
                  {" · "}Risk: <strong>{((e.risk_score || 0) * 100).toFixed(0)}%</strong>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: 10 }}>
                <Clock size={10} />
                {formatTime(e.timestamp)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
