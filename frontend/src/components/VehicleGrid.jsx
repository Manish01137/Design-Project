import React from "react";
import { Car, AlertTriangle, CheckCircle, Zap } from "lucide-react";

const ACTION_STYLE = {
  EMERGENCY_BRAKE: { color: "var(--emergency)", bg: "#ff3b3b15", icon: <AlertTriangle size={11} />, label: "EMERGENCY" },
  BRAKE:           { color: "var(--warning)",   bg: "#ffd70015", icon: <Zap size={11} />,           label: "BRAKING"   },
  ACC_ADJUST:      { color: "var(--safe)",      bg: "#00ff8815", icon: <CheckCircle size={11} />,   label: "ACC"       },
  NORMAL:          { color: "var(--safe)",      bg: "#00ff8815", icon: <CheckCircle size={11} />,   label: "NORMAL"    },
};

function RiskBar({ score }) {
  const pct   = Math.round((score || 0) * 100);
  const color = pct > 70 ? "var(--emergency)" : pct > 40 ? "var(--warning)" : "var(--safe)";
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>RISK</span>
        <span style={{ fontSize: 10, color, fontFamily: "var(--font-mono)" }}>{pct}%</span>
      </div>
      <div style={{ height: 3, background: "var(--border)", borderRadius: 2 }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: 2, transition: "width 0.4s ease",
          boxShadow: `0 0 6px ${color}88`,
        }} />
      </div>
    </div>
  );
}

function VehicleCard({ v }) {
  const style = ACTION_STYLE[v.action] || ACTION_STYLE.NORMAL;
  return (
    <div style={{
      background: "var(--bg-card)",
      border: `1px solid ${style.color}44`,
      borderRadius: 10,
      padding: "14px 16px",
      transition: "border-color 0.3s, box-shadow 0.3s",
      boxShadow: v.action === "EMERGENCY_BRAKE" ? `0 0 16px ${style.color}44` : "none",
      animation: "fade-in 0.3s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28,
            background: `${style.color}22`,
            border: `1px solid ${style.color}55`,
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Car size={14} color={style.color} />
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
              {v.vehicle_id.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Lane {v.lane ?? "—"}</div>
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: style.bg,
          border: `1px solid ${style.color}44`,
          borderRadius: 4, padding: "3px 7px",
        }}>
          <span style={{ color: style.color }}>{style.icon}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: style.color, letterSpacing: 1 }}>
            {style.label}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
        {[
          { label: "Speed",    value: `${(v.speed_kmh || v.speed_ms * 3.6 || 0).toFixed(1)} km/h` },
          { label: "Gap",      value: `${(v.gap_m || 0).toFixed(1)} m` },
          { label: "Rel.Vel",  value: `${(v.rel_velocity || 0).toFixed(1)} m/s` },
          { label: "Accel",    value: `${(v.acceleration || 0).toFixed(2)} m/s²` },
        ].map(m => (
          <div key={m.label}>
            <div style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 1, fontFamily: "var(--font-mono)" }}>{m.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>{m.value}</div>
          </div>
        ))}
      </div>

      <RiskBar score={v.risk_score} />
    </div>
  );
}

export default function VehicleGrid({ vehicles }) {
  if (!vehicles.length) {
    return (
      <div style={{
        gridColumn: "1/-1",
        textAlign: "center", padding: "40px 0",
        color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 13,
      }}>
        ⌛ Waiting for edge agent to connect…
      </div>
    );
  }
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: 12,
    }}>
      {vehicles.map(v => <VehicleCard key={v.vehicle_id} v={v} />)}
    </div>
  );
}
