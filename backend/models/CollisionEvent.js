const mongoose = require("mongoose");

const CollisionEventSchema = new mongoose.Schema({
  vehicle_id:   { type: String, required: true, index: true },
  timestamp:    { type: String, index: true },
  speed_ms:     { type: Number },
  speed_kmh:    { type: Number },
  gap_m:        { type: Number },
  risk_score:   { type: Number },
  action:       { type: String },
  reason:       { type: String },
  lane:         { type: Number },
  position_x:  { type: Number },
  rel_velocity: { type: Number },
  resolved:     { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("CollisionEvent", CollisionEventSchema);
