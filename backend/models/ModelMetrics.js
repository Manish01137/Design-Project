const mongoose = require("mongoose");

const ModelMetricsSchema = new mongoose.Schema({
  version:      { type: Number },
  accuracy:     { type: Number },
  rmse_gap:     { type: Number },
  samples:      { type: Number },
  timestamp:    { type: String },
  params:       { type: mongoose.Schema.Types.Mixed },
  feature_importances: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

module.exports = mongoose.model("ModelMetrics", ModelMetricsSchema);
