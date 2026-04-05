import React from "react";

export default function StatCard({ icon, label, value, unit, color = "var(--accent-blue)", sub }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: `1px solid var(--border)`,
      borderTop: `2px solid ${color}`,
      borderRadius: 10,
      padding: "16px 20px",
      flex: 1,
      minWidth: 140,
      transition: "border-color 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
          {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "var(--font-mono)", lineHeight: 1 }}>
          {value ?? "—"}
        </span>
        {unit && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
