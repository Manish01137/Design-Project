"""
Cloud ML Service — Collision Avoidance Training Engine
========================================================
Flask API that:
  1. Receives telemetry from the backend
  2. Trains/retrains a collision risk model (RandomForest + Neural Net)
  3. Exposes optimized edge parameters back to the backend
  4. Provides model metrics and training history endpoints

Endpoints:
  POST /train          → trigger model training on latest data from MongoDB
  GET  /params         → return optimized edge parameters
  GET  /metrics        → return model accuracy, feature importances
  GET  /health         → health check
  POST /predict        → real-time prediction for a single sample
"""

import os
import json
import logging
import threading
from datetime import datetime, timedelta, timezone

import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import pymongo
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, mean_squared_error
import joblib

# ─── Config ───────────────────────────────────────────────────────────────────
MONGO_URI     = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME       = os.environ.get("DB_NAME", "collision_avoidance")
MODEL_DIR     = os.path.join(os.path.dirname(__file__), "saved_models")
PORT          = int(os.environ.get("CLOUD_PORT", 8000))
MIN_SAMPLES   = 100   # minimum records needed before training

os.makedirs(MODEL_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="[CLOUD] %(asctime)s %(message)s")
log = logging.getLogger("cloud")

app = Flask(__name__)
CORS(app)

# ─── Helper: timezone-aware UTC now ──────────────────────────────────────────
def utcnow():
    return datetime.now(timezone.utc)

# ─── Global State ─────────────────────────────────────────────────────────────
training_lock   = threading.Lock()
is_training     = False
last_trained_at = None
model_version   = 0

# Current optimized params (updated after each training run)
optimized_params = {
    "safe_gap_m":          10.0,
    "emergency_gap_m":      5.0,
    "target_time_headway":  2.0,
    "max_decel":            8.0,
    "emergency_decel":     15.0,
    "acc_gain":             0.5,
}

training_history = []  # list of {version, accuracy, mse, timestamp, samples}


# ══════════════════════════════════════════════════════════════════════════════
#  DATA LOADING
# ══════════════════════════════════════════════════════════════════════════════

def load_training_data():
    """
    Pull telemetry records from MongoDB and prepare feature matrix.
    Features: speed_ms, gap_m, rel_velocity, leader_speed, lane
    Targets:
      - risk_label (0=safe, 1=warning, 2=emergency) for classifier
      - safe_gap_needed for regressor
    """
    try:
        client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        db     = client[DB_NAME]
        col    = db["telemetry"]

        # Load last 24 hours of data
        since = utcnow() - timedelta(hours=24)
        docs  = list(col.find(
            {"timestamp": {"$gte": since.isoformat()}},
            {"_id": 0, "speed_ms": 1, "gap_m": 1, "rel_velocity": 1,
             "leader_speed": 1, "lane": 1, "action": 1, "risk_score": 1}
        ).limit(50000))
        client.close()

        if len(docs) < MIN_SAMPLES:
            return None, None, None, f"Only {len(docs)} records (need {MIN_SAMPLES})"

        X, y_class, y_gap = [], [], []
        for d in docs:
            feat = [
                d.get("speed_ms", 0),
                d.get("gap_m", 50),
                d.get("rel_velocity", 0),
                d.get("leader_speed", 0),
                d.get("lane", 0),
            ]
            action = d.get("action", "ACC_ADJUST")
            label  = 2 if action == "EMERGENCY_BRAKE" else (1 if action == "BRAKE" else 0)

            # Safe gap needed = speed * target_headway (simplified)
            safe_gap = d.get("speed_ms", 0) * 2.0 + 5.0

            X.append(feat)
            y_class.append(label)
            y_gap.append(safe_gap)

        return np.array(X), np.array(y_class), np.array(y_gap), None

    except Exception as e:
        log.warning(f"MongoDB unavailable, generating synthetic data: {e}")
        return generate_synthetic_data()


def generate_synthetic_data(n=2000):
    """Fallback: synthetic training data for demo."""
    import random
    X, y_class, y_gap = [], [], []
    for _ in range(n):
        speed      = random.uniform(0, 33)
        gap        = random.uniform(1, 100)
        leader_spd = random.uniform(0, 33)
        rel_vel    = speed - leader_spd
        lane       = random.randint(0, 2)

        feat = [speed, gap, rel_vel, leader_spd, lane]

        # Label logic
        if gap < 5 or (rel_vel > 0 and gap / max(rel_vel, 0.1) < 1.5):
            label = 2
        elif gap < 10:
            label = 1
        else:
            label = 0

        safe_gap = speed * 2.0 + 5.0

        X.append(feat)
        y_class.append(label)
        y_gap.append(safe_gap)

    log.info(f"Generated {n} synthetic samples")
    return np.array(X), np.array(y_class), np.array(y_gap), None


# ══════════════════════════════════════════════════════════════════════════════
#  MODEL TRAINING
# ══════════════════════════════════════════════════════════════════════════════

def train_models():
    global is_training, last_trained_at, model_version, optimized_params

    with training_lock:
        is_training = True

    try:
        log.info("Loading training data…")
        X, y_class, y_gap, err = load_training_data()
        if err:
            log.warning(err)
            X, y_class, y_gap, _ = generate_synthetic_data()

        # Scale features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        X_train, X_test, yc_train, yc_test, yg_train, yg_test = train_test_split(
            X_scaled, y_class, y_gap, test_size=0.2, random_state=42
        )

        # ── 1. Classifier: predict collision risk level ──────────────────────
        log.info("Training RandomForest classifier…")
        clf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42, n_jobs=-1)
        clf.fit(X_train, yc_train)
        y_pred = clf.predict(X_test)
        acc    = accuracy_score(yc_test, y_pred)
        log.info(f"Classifier accuracy: {acc:.4f}")

        # ── 2. Regressor: predict safe following gap ─────────────────────────
        log.info("Training GBM regressor for safe gap…")
        reg = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
        reg.fit(X_train, yg_train)
        yg_pred = reg.predict(X_test)
        # FIX: squared param removed in sklearn 1.5+ — use ** 0.5 instead
        rmse    = mean_squared_error(yg_test, yg_pred) ** 0.5
        log.info(f"Gap regressor RMSE: {rmse:.4f}m")

        # ── Save models ──────────────────────────────────────────────────────
        model_version += 1
        joblib.dump(clf,    os.path.join(MODEL_DIR, "risk_classifier.pkl"))
        joblib.dump(reg,    os.path.join(MODEL_DIR, "gap_regressor.pkl"))
        joblib.dump(scaler, os.path.join(MODEL_DIR, "scaler.pkl"))

        # ── Derive optimized edge params from model ──────────────────────────
        # Use mean prediction on a representative sample
        sample_speeds = np.linspace(5, 30, 20)
        sample_gaps   = reg.predict(scaler.transform([
            [s, 15, 0, s * 0.9, 0] for s in sample_speeds
        ]))
        mean_safe_gap = float(np.mean(sample_gaps))

        fi = clf.feature_importances_  # [speed, gap, rel_vel, leader_spd, lane]
        # Higher rel_velocity importance → tighten emergency gap
        rel_vel_importance = fi[2]
        new_emergency_gap  = max(4.0, 5.0 + rel_vel_importance * 5)

        optimized_params.update({
            "safe_gap_m":          round(mean_safe_gap, 2),
            "emergency_gap_m":     round(new_emergency_gap, 2),
            "target_time_headway": 2.0,
            "model_version":       model_version,
            "trained_at":          utcnow().isoformat(),
        })

        # ── Record history ───────────────────────────────────────────────────
        training_history.append({
            "version":   model_version,
            "accuracy":  round(acc, 4),
            "rmse_gap":  round(rmse, 4),
            "samples":   len(X),
            "timestamp": utcnow().isoformat(),
            "params":    optimized_params.copy(),
            "feature_importances": {
                "speed_ms":     round(fi[0], 4),
                "gap_m":        round(fi[1], 4),
                "rel_velocity": round(fi[2], 4),
                "leader_speed": round(fi[3], 4),
                "lane":         round(fi[4], 4),
            }
        })

        last_trained_at = utcnow()
        log.info(f"Training complete. v{model_version} | acc={acc:.4f} | rmse={rmse:.4f}m")
        log.info(f"Optimized params: {optimized_params}")
        return True, acc, rmse

    except Exception as e:
        log.error(f"Training failed: {e}")
        return False, 0, 0

    finally:
        with training_lock:
            is_training = False


# ══════════════════════════════════════════════════════════════════════════════
#  FLASK ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/health")
def health():
    return jsonify({
        "status":        "ok",
        "model_version": model_version,
        "last_trained":  last_trained_at.isoformat() if last_trained_at else None,
    })


@app.route("/params")
def get_params():
    return jsonify({"params": optimized_params, "version": model_version})


@app.route("/metrics")
def get_metrics():
    return jsonify({
        "model_version":    model_version,
        "training_history": training_history[-20:],
        "is_training":      is_training,
        "current_params":   optimized_params,
    })


@app.route("/train", methods=["POST"])
def trigger_training():
    if is_training:
        return jsonify({"message": "Training already in progress"}), 202

    thread = threading.Thread(target=train_models, daemon=True)
    thread.start()
    return jsonify({"message": "Training started", "version": model_version + 1})


@app.route("/predict", methods=["POST"])
def predict():
    """Real-time prediction for a single vehicle reading."""
    data = request.json or {}
    try:
        scaler_path = os.path.join(MODEL_DIR, "scaler.pkl")
        clf_path    = os.path.join(MODEL_DIR, "risk_classifier.pkl")

        if not os.path.exists(clf_path):
            # No model yet — use heuristic
            gap      = data.get("gap_m", 50)
            risk_map = {0: "SAFE", 1: "WARNING", 2: "EMERGENCY"}
            label    = 2 if gap < 5 else (1 if gap < 10 else 0)
            return jsonify({
                "risk_level": label,
                "label":      risk_map[label],
                "note":       "heuristic (no model trained yet)",
            })

        scaler   = joblib.load(scaler_path)
        clf      = joblib.load(clf_path)
        feat     = [[
            data.get("speed_ms", 0),
            data.get("gap_m", 50),
            data.get("rel_velocity", 0),
            data.get("leader_speed", 0),
            data.get("lane", 0),
        ]]
        X_scaled = scaler.transform(feat)
        label    = int(clf.predict(X_scaled)[0])
        proba    = clf.predict_proba(X_scaled)[0].tolist()
        risk_map = {0: "SAFE", 1: "WARNING", 2: "EMERGENCY"}

        return jsonify({
            "risk_level":    label,
            "label":         risk_map[label],
            "probabilities": proba,
            "model_version": model_version,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Auto-train on startup if models don't exist ───────────────────────────────
if __name__ == "__main__":
    if not os.path.exists(os.path.join(MODEL_DIR, "risk_classifier.pkl")):
        log.info("No saved model found — running initial training…")
        threading.Thread(target=train_models, daemon=True).start()

    app.run(host="0.0.0.0", port=PORT, debug=False)