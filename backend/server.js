require("dotenv").config();
const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const mongoose   = require("mongoose");
const cors       = require("cors");
const morgan     = require("morgan");
const rateLimit  = require("express-rate-limit");

const telemetryRoutes = require("./routes/telemetry");
const eventsRoutes    = require("./routes/events");
const modelRoutes     = require("./routes/model");

// ─── App Setup ────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.set("io", io);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

const limiter = rateLimit({ windowMs: 60_000, max: 500 });
app.use("/api", limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/telemetry", telemetryRoutes);
app.use("/api/events",    eventsRoutes);
app.use("/api/model",     modelRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    status:   "ok",
    service:  "collision-avoidance-backend",
    mongo:    mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime:   process.uptime(),
  });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  socket.on("subscribe_vehicle", (vehicleId) => {
    socket.join(`vehicle_${vehicleId}`);
  });

  socket.on("trigger_training", async () => {
    const axios = require("axios");
    try {
      await axios.post(`${process.env.CLOUD_ML_URL || "http://localhost:8000"}/train`);
      io.emit("training_started", { timestamp: new Date().toISOString() });
    } catch (e) {
      socket.emit("error", { message: "Cloud ML service unreachable" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ─── MongoDB ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/collision_avoidance";

mongoose.connect(MONGO_URI)
  .then(() => console.log(`[DB] MongoDB connected: ${MONGO_URI}`))
  .catch(err => {
    console.warn(`[DB] MongoDB unavailable: ${err.message}`);
    console.warn("[DB] Running in memory-only mode (data won't persist)");
  });

mongoose.connection.on("disconnected", () => console.warn("[DB] MongoDB disconnected"));
mongoose.connection.on("reconnected",  () => console.log("[DB] MongoDB reconnected"));

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  Collision Avoidance Backend                         ║
║  API    → http://localhost:${PORT}                      ║
║  WS     → ws://localhost:${PORT}                        ║
║  Health → http://localhost:${PORT}/api/health           ║
╚══════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };
