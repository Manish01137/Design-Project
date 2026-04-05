import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Axios instance ──────────────────────────────────────────────────────────
export const api = axios.create({ baseURL: API, timeout: 8000 });

// ── useSocket ───────────────────────────────────────────────────────────────
export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected]       = useState(false);
  const [telemetry, setTelemetry]       = useState([]);   // latest per vehicle
  const [collisions, setCollisions]     = useState([]);   // event log
  const [trainingStatus, setTraining]   = useState(null);

  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("telemetry_update", (records) => {
      setTelemetry(prev => {
        const map = {};
        prev.forEach(r => { map[r.vehicle_id] = r; });
        records.forEach(r => { map[r.vehicle_id] = r; });
        return Object.values(map);
      });
    });

    socket.on("collision_event", (event) => {
      setCollisions(prev => [event, ...prev].slice(0, 100));
    });

    socket.on("training_started", (data) => {
      setTraining({ status: "running", ...data });
    });

    return () => socket.disconnect();
  }, []);

  const triggerTraining = useCallback(() => {
    socketRef.current?.emit("trigger_training");
    setTraining({ status: "starting", timestamp: new Date().toISOString() });
  }, []);

  return { connected, telemetry, collisions, trainingStatus, triggerTraining, socket: socketRef };
}

// ── useStats ────────────────────────────────────────────────────────────────
export function useStats(refreshMs = 5000) {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const r = await api.get("/api/telemetry/stats");
      setStats(r.data);
    } catch { /* backend offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, refreshMs);
    return () => clearInterval(id);
  }, [fetch, refreshMs]);

  return { stats, loading, refetch: fetch };
}

// ── useModelMetrics ─────────────────────────────────────────────────────────
export function useModelMetrics(refreshMs = 10000) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const r = await api.get("/api/model/metrics");
        setMetrics(r.data);
      } catch { /* cloud offline */ }
    };
    fetch();
    const id = setInterval(fetch, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return metrics;
}

// ── useVehicleHistory ───────────────────────────────────────────────────────
export function useVehicleHistory(vehicleId) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!vehicleId) return;
    api.get(`/api/telemetry/history/${vehicleId}`)
      .then(r => setHistory(r.data))
      .catch(() => {});
  }, [vehicleId]);

  return history;
}

// ── useCollisionEvents ──────────────────────────────────────────────────────
export function useCollisionEvents() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    api.get("/api/events/collision?limit=50")
      .then(r => setEvents(r.data))
      .catch(() => {});
  }, []);

  return events;
}
