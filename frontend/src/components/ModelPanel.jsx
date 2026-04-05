import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { Brain, TrendingUp, Layers, Target } from "lucide-react";

const FEAT_COLORS = {
  speed_ms:     "#00d4ff",
  gap_m:        "#00ff88",
  rel_velocity: "#ff3b3b",
  leader_speed: "#ffd700",
  lane:         "#a78bfa",
};

export default function ModelPanel({ metrics, onTrain, isTraining }) {
  const cloud   = metrics?.cloud;
  const history = cloud?.training_history || [];
  const params  = cloud?.current_params || {};
  const latest  = history[history.length - 1];
  const fi      = latest?.feature_importances || {};

  const fiData = Object.entries(fi).map(([k, v]) => ({
    name: k.replace(/_/g, " "),
    key: k,
    value: +(v * 100).toFixed(1),
  }));

  const accuracyData = history.slice(-10).map((h, i) => ({
    version: `v${h.version}`,
    accuracy: +(h.accuracy * 100).toFixed(1),
    rmse: +h.rmse_gap?.toFixed(2),
  }));

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "16px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Brain size={14} color="var(--accent-blue)" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", letterSpacing: 1 }}>
            CLOUD AI MODEL
          </span>
        </div>
        {latest && (
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: "var(--accent-green)", background: "#00ff8811",
            border: "1px solid #00ff8833", borderRadius: 4, padding: "2px 8px",
          }}>
            v{latest.version} · {(latest.accuracy * 100).toFixed(1)}% acc
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Model",    value: latest ? `v${latest.version}` : "—",              icon: <Layers size={11} />,    color: "var(--accent-blue)" },
          { label: "Accuracy", value: latest ? `${(latest.accuracy * 100).toFixed(1)}%` : "—", icon: <Target size={11} />,    color: "var(--accent-green)" },
          { label: "Gap RMSE", value: latest ? `${latest.rmse_gap?.toFixed(2)}m` : "—", icon: <TrendingUp size={11} />, color: "var(--accent-yellow)" },
          { label: "Samples",  value: latest?.samples?.toLocaleString() ?? "—",         icon: <Brain size={11} />,     color: "var(--accent-blue)" },
        ].map(s => (
          <div key={s.label} style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 8, padding: "10px 12px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <span style={{ color: s.color }}>{s.icon}</span>
              <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Feature importance chart */}
      {fiData.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
            FEATURE IMPORTANCES
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={fiData} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "monospace" }} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--text-secondary)", fontFamily: "monospace" }} width={90} />
              <Tooltip formatter={(v) => [`${v}%`, "Importance"]}
                contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {fiData.map((d) => (
                  <Cell key={d.key} fill={FEAT_COLORS[d.key] || "#7a9ab5"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Accuracy history */}
      {accuracyData.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
            TRAINING HISTORY — ACCURACY (%)
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={accuracyData}>
              <XAxis dataKey="version" tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "monospace" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "monospace" }} />
              <Tooltip contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="accuracy" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Optimized params */}
      {Object.keys(params).length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
            EDGE PARAMS FROM CLOUD
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {["safe_gap_m", "emergency_gap_m", "target_time_headway", "max_decel", "acc_gain", "model_version"].map(k => (
              params[k] !== undefined && (
                <div key={k} style={{
                  background: "var(--bg-secondary)", border: "1px solid var(--border)",
                  borderRadius: 6, padding: "7px 10px",
                }}>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{k}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent-yellow)", fontWeight: 700 }}>
                    {typeof params[k] === "number" ? params[k].toFixed(2) : params[k]}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {!latest && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 13 }}>
          No model trained yet — click <strong style={{ color: "var(--accent-blue)" }}>TRAIN MODEL</strong> in the top bar
        </div>
      )}
    </div>
  );
}
