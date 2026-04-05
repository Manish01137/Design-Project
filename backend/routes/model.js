const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const ModelMetrics = require("../models/ModelMetrics");

const CLOUD_ML_URL = process.env.CLOUD_ML_URL || "http://localhost:8000";

// Cached params — refreshed from cloud every 30s
let cachedParams   = {};
let lastParamFetch = 0;
const CACHE_TTL    = 30_000; // 30s

async function refreshParams() {
  try {
    const r  = await axios.get(`${CLOUD_ML_URL}/params`, { timeout: 3000 });
    cachedParams   = r.data.params || {};
    lastParamFetch = Date.now();
    return cachedParams;
  } catch {
    return cachedParams;
  }
}

// GET /api/model/params — edge agent fetches this
router.get("/params", async (req, res) => {
  if (Date.now() - lastParamFetch > CACHE_TTL) await refreshParams();
  res.json({ params: cachedParams });
});

// GET /api/model/metrics — dashboard
router.get("/metrics", async (req, res) => {
  try {
    const [cloudMetrics, dbHistory] = await Promise.all([
      axios.get(`${CLOUD_ML_URL}/metrics`, { timeout: 3000 }).then(r => r.data).catch(() => null),
      ModelMetrics.find().sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    res.json({ cloud: cloudMetrics, db_history: dbHistory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/model/train — trigger cloud training
router.post("/train", async (req, res) => {
  try {
    const r = await axios.post(`${CLOUD_ML_URL}/train`, {}, { timeout: 5000 });
    res.json(r.data);
  } catch (err) {
    res.status(503).json({ error: "Cloud ML service unreachable", detail: err.message });
  }
});

// POST /api/model/predict — proxy single prediction to cloud
router.post("/predict", async (req, res) => {
  try {
    const r = await axios.post(`${CLOUD_ML_URL}/predict`, req.body, { timeout: 3000 });
    res.json(r.data);
  } catch (err) {
    res.status(503).json({ error: "Prediction failed", detail: err.message });
  }
});

// Store model metrics from cloud (called internally)
router.post("/metrics/record", async (req, res) => {
  try {
    const doc = new ModelMetrics(req.body);
    await doc.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
