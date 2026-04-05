import React, { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const COLORS  = ["#00d4ff", "#00ff88", "#ffd700", "#ff8c00", "#ff3b3b", "#a78bfa"];
const MAX_PTS = 60;

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 14px", fontSize: 12,
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
        STEP {label}
      </div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontFamily: "var(--font-mono)", marginBottom: 2 }}>
          {p.dataKey}: <strong>{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function LiveChart({ telemetry, metric = "speed_kmh", label = "Speed (km/h)", safeRef }) {
  const [series, setSeries] = useState({});
  const stepRef = useRef(0);

  useEffect(() => {
    if (!telemetry.length) return;
    stepRef.current += 1;
    const step = stepRef.current;

    setSeries(prev => {
      const next = { ...prev };
      telemetry.forEach((v, i) => {
        const vid = v.vehicle_id;
        const arr = next[vid] ? [...next[vid]] : [];
        arr.push({ step, value: +(v[metric] || 0).toFixed(3) });
        if (arr.length > MAX_PTS) arr.shift();
        next[vid] = arr;
      });
      return next;
    });
  }, [telemetry, metric]);

  // Merge into recharts format
  const vehicleIds = Object.keys(series);
  const stepMap    = {};
  vehicleIds.forEach(vid => {
    series[vid].forEach(pt => {
      if (!stepMap[pt.step]) stepMap[pt.step] = { step: pt.step };
      stepMap[pt.step][vid] = pt.value;
    });
  });
  const chartData = Object.values(stepMap).sort((a, b) => a.step - b.step).slice(-MAX_PTS);

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 10, padding: "16px 20px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "var(--text-secondary)", letterSpacing: 1,
        marginBottom: 14, textTransform: "uppercase",
      }}>
        {label}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="step" tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "monospace" }} />
          <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "monospace" }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
          {safeRef && (
            <ReferenceLine y={safeRef} stroke="var(--accent-green)" strokeDasharray="4 4"
              label={{ value: "Safe", fill: "var(--accent-green)", fontSize: 10 }} />
          )}
          {vehicleIds.map((vid, i) => (
            <Line
              key={vid}
              type="monotone"
              dataKey={vid}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
