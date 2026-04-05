const express = require("express");
const router  = express.Router();
const Telemetry = require("../models/Telemetry");

// POST /api/telemetry/batch — receive batch from edge agent
router.post("/batch", async (req, res) => {
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ error: "records array required" });
    }

    // Bulk insert
    await Telemetry.insertMany(records, { ordered: false });

    // Emit to connected dashboard clients
    const io = req.app.get("io");
    if (io) {
      // Send latest snapshot per vehicle (last record each)
      const byVehicle = {};
      records.forEach(r => { byVehicle[r.vehicle_id] = r; });
      io.emit("telemetry_update", Object.values(byVehicle));
    }

    res.json({ ok: true, inserted: records.length });
  } catch (err) {
    // ignore duplicate key errors
    res.json({ ok: true, note: err.message });
  }
});

// GET /api/telemetry/latest — latest record per vehicle
router.get("/latest", async (req, res) => {
  try {
    const docs = await Telemetry.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$vehicle_id", latest: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$latest" } },
    ]);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/telemetry/history/:vehicleId — last 200 records for a vehicle
router.get("/history/:vehicleId", async (req, res) => {
  try {
    const docs = await Telemetry.find({ vehicle_id: req.params.vehicleId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(docs.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/telemetry/stats — aggregate stats for dashboard
router.get("/stats", async (req, res) => {
  try {
    const [total, emergencies, avg] = await Promise.all([
      Telemetry.countDocuments(),
      Telemetry.countDocuments({ action: "EMERGENCY_BRAKE" }),
      Telemetry.aggregate([
        { $group: {
          _id: null,
          avg_speed:    { $avg: "$speed_kmh" },
          avg_gap:      { $avg: "$gap_m" },
          avg_risk:     { $avg: "$risk_score" },
          max_speed:    { $max: "$speed_kmh" },
        }}
      ]),
    ]);

    res.json({
      total_records:   total,
      emergency_count: emergencies,
      avg_speed_kmh:   avg[0]?.avg_speed?.toFixed(1) ?? 0,
      avg_gap_m:       avg[0]?.avg_gap?.toFixed(1) ?? 0,
      avg_risk:        avg[0]?.avg_risk?.toFixed(3) ?? 0,
      max_speed_kmh:   avg[0]?.max_speed?.toFixed(1) ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
