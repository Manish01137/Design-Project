import React from "react";
import { Activity, Cpu, Cloud, Wifi, WifiOff, Brain } from "lucide-react";

export default function Topbar({ connected, onTrain, trainingStatus }) {
  return (
    <header style={{
      background: "var(--bg-secondary)",
      borderBottom: "1px solid var(--border)",
      padding: "0 24px",
      height: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 32, height: 32,
          background: "linear-gradient(135deg, #00d4ff22, #00d4ff44)",
          border: "1px solid var(--accent-blue)",
          borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Activity size={16} color="var(--accent-blue)" />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--accent-blue)", letterSpacing: 1 }}>
            COLLISION·AV
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: 2 }}>
            HYBRID EDGE–CLOUD FRAMEWORK
          </div>
        </div>
      </div>

      {/* Center: Layer badges */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { icon: <Cpu size={12} />, label: "EDGE", color: "var(--accent-green)", desc: "Real-time ACC" },
          { icon: <Cloud size={12} />, label: "CLOUD", color: "var(--accent-blue)", desc: "AI Training" },
          { icon: <Brain size={12} />, label: "MODEL", color: "var(--accent-yellow)", desc: "Random Forest" },
        ].map(b => (
          <div key={b.label} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: `${b.color}11`,
            border: `1px solid ${b.color}33`,
            borderRadius: 6, padding: "4px 10px",
          }}>
            <span style={{ color: b.color }}>{b.icon}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: b.color }}>{b.label}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{b.desc}</span>
          </div>
        ))}
      </div>

      {/* Right: status + train button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {connected
            ? <Wifi size={14} color="var(--accent-green)" />
            : <WifiOff size={14} color="var(--accent-red)" />}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11,
            color: connected ? "var(--accent-green)" : "var(--accent-red)" }}>
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>

        <button onClick={onTrain} disabled={trainingStatus?.status === "running"} style={{
          background: trainingStatus?.status === "running"
            ? "var(--bg-card)" : "linear-gradient(135deg, #00d4ff22, #00d4ff33)",
          border: "1px solid var(--accent-blue)",
          borderRadius: 6,
          color: "var(--accent-blue)",
          fontFamily: "var(--font-mono)",
          fontSize: 11, fontWeight: 700,
          padding: "6px 14px",
          cursor: trainingStatus?.status === "running" ? "not-allowed" : "pointer",
          letterSpacing: 1,
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}>
          <Brain size={12} />
          {trainingStatus?.status === "running" ? "TRAINING…" : "TRAIN MODEL"}
        </button>
      </div>
    </header>
  );
}
