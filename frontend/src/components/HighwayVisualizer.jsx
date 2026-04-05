import React, { useRef, useEffect } from "react";

const LANE_COLORS = ["#00d4ff", "#00ff88", "#ffd700"];
const ACTION_COLOR = {
  EMERGENCY_BRAKE: "#ff3b3b",
  BRAKE:           "#ffd700",
  ACC_ADJUST:      "#00ff88",
  NORMAL:          "#00d4ff",
};

export default function HighwayVisualizer({ vehicles }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx    = canvas.getContext("2d");
    const W      = canvas.width;
    const H      = canvas.height;

    // Background
    ctx.fillStyle = "#080c14";
    ctx.fillRect(0, 0, W, H);

    // Lanes
    const numLanes  = 3;
    const laneH     = H / numLanes;
    const roadStart = 40;
    const roadEnd   = W - 40;
    const roadW     = roadEnd - roadStart;

    for (let i = 0; i < numLanes; i++) {
      const y = i * laneH;

      // Lane bg
      ctx.fillStyle = i % 2 === 0 ? "#0d1424" : "#0a1020";
      ctx.fillRect(roadStart, y, roadW, laneH);

      // Dashed lane lines
      if (i < numLanes - 1) {
        ctx.strokeStyle = "#1e3a5f";
        ctx.lineWidth   = 1;
        ctx.setLineDash([20, 15]);
        ctx.beginPath();
        ctx.moveTo(roadStart, y + laneH);
        ctx.lineTo(roadEnd,   y + laneH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Lane label
      ctx.fillStyle   = "#3d5a73";
      ctx.font        = "10px Space Mono, monospace";
      ctx.fillText(`L${i}`, 10, y + laneH / 2 + 4);
    }

    // Road border
    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(roadStart, 0, roadW, H);

    // Group vehicles by lane
    const byLane = {};
    vehicles.forEach(v => {
      const lane = v.lane ?? 0;
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push(v);
    });

    // Find position range
    const allX = vehicles.map(v => v.position_x || 0);
    const minX = Math.min(0, ...allX);
    const maxX = Math.max(100, ...allX);
    const range = maxX - minX || 100;

    // Draw vehicles
    vehicles.forEach(v => {
      const lane   = v.lane ?? 0;
      const px     = roadStart + ((v.position_x || 0) - minX) / range * roadW;
      const py     = lane * laneH + laneH / 2;
      const color  = ACTION_COLOR[v.action] || "#00d4ff";
      const isEmerg = v.action === "EMERGENCY_BRAKE";

      // Glow for emergency
      if (isEmerg) {
        const grd = ctx.createRadialGradient(px, py, 0, px, py, 28);
        grd.addColorStop(0, "#ff3b3b33");
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(px, py, 28, 0, Math.PI * 2);
        ctx.fill();
      }

      // Car body
      ctx.save();
      ctx.shadowBlur  = 8;
      ctx.shadowColor = color;
      ctx.fillStyle   = color;
      const carW = 22, carH = 10;
      ctx.beginPath();
      ctx.roundRect(px - carW / 2, py - carH / 2, carW, carH, 3);
      ctx.fill();
      ctx.restore();

      // Vehicle ID label
      ctx.fillStyle = "#e8f4fd";
      ctx.font      = "8px Space Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(v.vehicle_id?.split("_").pop() ?? "?", px, py - carH / 2 - 4);

      // Speed badge
      const spd = ((v.speed_kmh || (v.speed_ms || 0) * 3.6) || 0).toFixed(0);
      ctx.fillStyle = "#7a9ab5";
      ctx.font      = "7px Space Mono, monospace";
      ctx.fillText(`${spd}km/h`, px, py + carH / 2 + 9);

      ctx.textAlign = "left";
    });

    // Direction arrow
    ctx.fillStyle   = "#1e3a5f";
    ctx.font        = "11px monospace";
    ctx.textAlign   = "right";
    ctx.fillText("→ DIRECTION OF TRAVEL", roadEnd - 4, H - 4);
    ctx.textAlign   = "left";

  }, [vehicles]);

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "16px 20px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "var(--text-secondary)", letterSpacing: 1, marginBottom: 12,
      }}>
        HIGHWAY — 2D VEHICLE POSITIONS
      </div>
      <canvas
        ref={canvasRef}
        width={820} height={160}
        style={{ width: "100%", height: "auto", borderRadius: 6, display: "block" }}
      />
    </div>
  );
}
