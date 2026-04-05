import React, { useState } from "react";
import {
  Activity, Database, AlertTriangle,
  Gauge, Car, TrendingUp, Layers,
} from "lucide-react";

import Topbar           from "./components/Topbar.jsx";
import StatCard         from "./components/StatCard.jsx";
import VehicleGrid      from "./components/VehicleGrid.jsx";
import LiveChart        from "./components/LiveChart.jsx";
import CollisionLog     from "./components/CollisionLog.jsx";
import ModelPanel       from "./components/ModelPanel.jsx";
import HighwayVisualizer from "./components/HighwayVisualizer.jsx";

import {
  useSocket, useStats, useModelMetrics, useCollisionEvents,
} from "./hooks/useData.js";

// ── Demo data when nothing is connected ─────────────────────────────────────
const DEMO_VEHICLES = [
  { vehicle_id: "leader_0",   lane: 0, speed_ms: 25,   speed_kmh: 90,  gap_m: 42, rel_velocity: -2.1, acceleration: 0,    risk_score: 0.08, action: "ACC_ADJUST"   },
  { vehicle_id: "follower_0", lane: 0, speed_ms: 28,   speed_kmh: 100, gap_m: 12, rel_velocity:  3.2, acceleration: -1.2, risk_score: 0.55, action: "BRAKE"        },
  { vehicle_id: "leader_1",   lane: 1, speed_ms: 18,   speed_kmh: 65,  gap_m: 55, rel_velocity: -1.0, acceleration: 0,    risk_score: 0.05, action: "ACC_ADJUST"   },
  { vehicle_id: "vehicle_3",  lane: 0, speed_ms: 30,   speed_kmh: 108, gap_m:  4, rel_velocity:  5.1, acceleration: -8.5, risk_score: 0.95, action: "EMERGENCY_BRAKE" },
  { vehicle_id: "follower_1", lane: 1, speed_ms: 22,   speed_kmh: 79,  gap_m: 28, rel_velocity:  0.5, acceleration: 0.2,  risk_score: 0.12, action: "ACC_ADJUST"   },
  { vehicle_id: "vehicle_4",  lane: 2, speed_ms: 26.5, speed_kmh: 95,  gap_m: 18, rel_velocity:  1.8, acceleration: -0.6, risk_score: 0.32, action: "BRAKE"        },
];

const DEMO_COLLISIONS = [
  { vehicle_id: "vehicle_3", action: "EMERGENCY_BRAKE", gap_m: 3.8, speed_kmh: 108, speed_ms: 30, risk_score: 0.95, timestamp: new Date(Date.now() - 12000).toISOString(), reason: "Gap 3.8m < emergency 5m" },
  { vehicle_id: "follower_0", action: "BRAKE", gap_m: 9.2, speed_kmh: 100, speed_ms: 28, risk_score: 0.55, timestamp: new Date(Date.now() - 45000).toISOString(), reason: "Gap 9.2m < safe 10m" },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const { connected, telemetry, collisions: liveCollisions, trainingStatus, triggerTraining } = useSocket();
  const { stats }    = useStats();
  const modelMetrics = useModelMetrics();
  const dbCollisions = useCollisionEvents();

  // Use live data if connected, else demo
  const vehicles  = telemetry.length > 0 ? telemetry : DEMO_VEHICLES;
  const allCollisions = liveCollisions.length > 0
    ? liveCollisions : dbCollisions.length > 0 ? dbCollisions : DEMO_COLLISIONS;

  const emergencyCount = vehicles.filter(v => v.action === "EMERGENCY_BRAKE").length;
  const avgRisk = vehicles.length
    ? (vehicles.reduce((s, v) => s + (v.risk_score || 0), 0) / vehicles.length).toFixed(2)
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Topbar connected={connected} onTrain={triggerTraining} trainingStatus={trainingStatus} />

      <main style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── Demo banner ── */}
        {!connected && (
          <div style={{
            background: "#ffd70011", border: "1px solid #ffd70033",
            borderRadius: 8, padding: "10px 16px", marginBottom: 16,
            fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-yellow)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            ⚡ DEMO MODE — Start the edge agent and backend to go live
          </div>
        )}

        {/* ── Stats Row ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <StatCard icon={<Car size={14} />}          label="Active Vehicles"  value={vehicles.length}                           color="var(--accent-blue)"   />
          <StatCard icon={<Gauge size={14} />}        label="Avg Speed"        value={stats?.avg_speed_kmh ?? "90.4"}  unit="km/h" color="var(--accent-green)"  />
          <StatCard icon={<Layers size={14} />}       label="Avg Gap"          value={stats?.avg_gap_m ?? "22.4"}      unit="m"    color="var(--accent-yellow)" />
          <StatCard icon={<Activity size={14} />}     label="Avg Risk"         value={avgRisk}                                   color="var(--accent-orange)" sub="0 = safe · 1 = collision" />
          <StatCard icon={<AlertTriangle size={14} />} label="Emergencies"     value={emergencyCount}                            color="var(--emergency)"     />
          <StatCard icon={<Database size={14} />}     label="Records Stored"   value={stats?.total_records?.toLocaleString() ?? "—"} color="var(--accent-blue)" />
          <StatCard icon={<TrendingUp size={14} />}   label="Total Events"     value={stats?.emergency_count ?? allCollisions.length} color="var(--emergency)" />
        </div>

        {/* ── Highway Visualizer ── */}
        <div style={{ marginBottom: 20 }}>
          <HighwayVisualizer vehicles={vehicles} />
        </div>

        {/* ── Vehicle Grid ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 12 }}>
            VEHICLE STATUS — EDGE LAYER
          </div>
          <VehicleGrid vehicles={vehicles} />
        </div>

        {/* ── Charts Row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <LiveChart
            telemetry={vehicles}
            metric="speed_kmh"
            label="Live Speed (km/h)"
          />
          <LiveChart
            telemetry={vehicles}
            metric="risk_score"
            label="Live Risk Score [0–1]"
            safeRef={0.3}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <LiveChart
            telemetry={vehicles}
            metric="gap_m"
            label="Following Gap (m)"
            safeRef={10}
          />
          <LiveChart
            telemetry={vehicles}
            metric="acceleration"
            label="Acceleration (m/s²)"
          />
        </div>

        {/* ── Bottom: Collision Log + Model Panel ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <CollisionLog events={allCollisions} />
          <ModelPanel metrics={modelMetrics} onTrain={triggerTraining} isTraining={trainingStatus?.status === "running"} />
        </div>

      </main>
    </div>
  );
}
