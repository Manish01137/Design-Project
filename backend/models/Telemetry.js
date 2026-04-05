const mongoose = require("mongoose");

const TelemetrySchema = new mongoose.Schema({
  vehicle_id:    { type: String, required: true, index: true },
  step:          { type: Number },
  timestamp:     { type: String, index: true },
  speed_ms:      { type: Number },
  speed_kmh:     { type: Number },
  position_x:    { type: Number },
  position_y:    { type: Number },
  lane:          { type: Number },
  gap_m:         { type: Number },
  leader_speed:  { type: Number },
  acceleration:  { type: Number },
  action:        { type: String, enum: ["ACC_ADJUST", "BRAKE", "EMERGENCY_BRAKE", "NORMAL"], default: "NORMAL" },
  risk_score:    { type: Number, min: 0, max: 1 },
  rel_velocity:  { type: Number },
  edge_params:   { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

TelemetrySchema.index({ timestamp: -1, vehicle_id: 1 });
TelemetrySchema.index({ action: 1 });

module.exports = mongoose.model("Telemetry", TelemetrySchema);
