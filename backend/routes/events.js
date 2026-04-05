const express = require("express");
const router  = express.Router();
const CollisionEvent = require("../models/CollisionEvent");

// POST /api/events/collision — log a collision/emergency event
router.post("/collision", async (req, res) => {
  try {
    const event = new CollisionEvent(req.body);
    await event.save();

    const io = req.app.get("io");
    if (io) io.emit("collision_event", event.toObject());

    res.json({ ok: true, id: event._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/collision — list recent events
router.get("/collision", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const docs  = await CollisionEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/summary — counts by action type
router.get("/summary", async (req, res) => {
  try {
    const summary = await CollisionEvent.aggregate([
      { $group: { _id: "$action", count: { $sum: 1 }, avg_risk: { $avg: "$risk_score" } } },
    ]);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
