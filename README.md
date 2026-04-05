# 🚗 Hybrid Edge–Cloud Collision Avoidance System

**MERN Stack + SUMO + Cloud AI + Edge Computing**
Built for: 5IT1990 Design Project-1 | University of Hertfordshire

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EDGE LAYER (Python)                      │
│  SUMO Simulation ──► TraCI Controller ──► Edge Intelligence │
│  • Adaptive Cruise Control (ACC)                            │
│  • Emergency Braking Logic                                  │
│  • Collision Risk Scoring                                   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP POST (telemetry batches)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               BACKEND (Node.js + Express)                   │
│  REST API  ──► MongoDB (Mongoose)                           │
│  Socket.io ──► Real-time broadcast to dashboard             │
│  Proxy     ──► Cloud ML service                             │
└────────────┬────────────────────────┬───────────────────────┘
             │                        │
             ▼                        ▼
┌─────────────────┐      ┌─────────────────────────────────────┐
│  React Frontend │      │      CLOUD ML (Flask + sklearn)     │
│  Live Dashboard │      │  • RandomForest risk classifier     │
│  Vehicle Map    │      │  • GBM gap regressor                │
│  Charts/Metrics │      │  • Optimized edge params → backend  │
│  Model Panel    │      │  • Training history & metrics       │
└─────────────────┘      └─────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Option A — Docker (Recommended, zero setup)

```bash
# Clone / unzip the project
cd collision-system

# Start everything
docker-compose up --build

# Open dashboard
open http://localhost:3000
```

All 4 services start automatically:
| Service   | URL                         |
|-----------|-----------------------------|
| Frontend  | http://localhost:3000       |
| Backend   | http://localhost:5000       |
| Cloud ML  | http://localhost:8000       |
| MongoDB   | mongodb://localhost:27017   |

---

### Option B — Manual (No Docker)

**Prerequisites:** Node.js 20+, Python 3.11+, MongoDB running

#### 1. Backend
```bash
cd backend
npm install
npm run dev        # → http://localhost:5000
```

#### 2. Cloud ML
```bash
cd cloud
pip install -r requirements.txt
python train_model.py   # → http://localhost:8000
```

#### 3. Edge Agent
```bash
cd edge
pip install -r requirements.txt

# Without SUMO (mock mode — works out of the box)
python edge_agent.py

# With SUMO installed (real simulation)
export SUMO_HOME=/usr/share/sumo
python edge_agent.py
```

#### 4. Frontend
```bash
cd frontend
npm install
npm run dev        # → http://localhost:3000
```

---

## 📂 Project Structure

```
collision-system/
├── backend/                  # Node.js / Express / Socket.io
│   ├── server.js             # Main server + WebSocket setup
│   ├── models/
│   │   ├── Telemetry.js      # Vehicle telemetry schema
│   │   ├── CollisionEvent.js # Collision/brake event schema
│   │   └── ModelMetrics.js   # ML training history schema
│   ├── routes/
│   │   ├── telemetry.js      # POST batch, GET latest/history/stats
│   │   ├── events.js         # Collision event logging
│   │   └── model.js          # Cloud ML proxy + param caching
│   └── Dockerfile
│
├── cloud/                    # Python Flask + scikit-learn
│   ├── train_model.py        # ML training + Flask API
│   ├── saved_models/         # Persisted .pkl model files
│   └── Dockerfile
│
├── edge/                     # Python edge agent
│   ├── edge_agent.py         # SUMO TraCI + ACC + braking logic
│   ├── sumo_config/
│   │   ├── highway.net.xml   # 3-lane highway network
│   │   ├── highway.rou.xml   # 10+ vehicles across lanes
│   │   └── highway.sumocfg   # Simulation config
│   └── Dockerfile
│
├── frontend/                 # React + Recharts + Socket.io
│   ├── src/
│   │   ├── App.jsx           # Main dashboard layout
│   │   ├── components/
│   │   │   ├── Topbar.jsx         # Header + status + train button
│   │   │   ├── StatCard.jsx       # KPI cards
│   │   │   ├── VehicleGrid.jsx    # Live vehicle status cards
│   │   │   ├── LiveChart.jsx      # Real-time Recharts line chart
│   │   │   ├── HighwayVisualizer.jsx # Canvas 2D lane view
│   │   │   ├── CollisionLog.jsx   # Collision event feed
│   │   │   └── ModelPanel.jsx     # AI model metrics + params
│   │   └── hooks/useData.js       # Socket + API hooks
│   └── Dockerfile
│
└── docker-compose.yml
```

---

## 🧠 How the AI Learning Loop Works

```
1. SUMO generates vehicle telemetry (speed, gap, rel_velocity…)
2. Edge agent applies real-time ACC + emergency braking
3. Telemetry + decisions stored in MongoDB via backend
4. "TRAIN MODEL" button (or API call) triggers cloud training:
   ├── RandomForest classifier → predicts risk level (safe/warn/emergency)
   └── Gradient Boosting regressor → predicts safe following gap
5. Cloud derives optimized edge params from model output
6. Edge agent fetches new params every 50 simulation steps
7. Dashboard shows training history, feature importances, accuracy
8. Loop continues → model improves as more data accumulates
```

---

## 📡 API Reference

### Backend (port 5000)

| Method | Endpoint                     | Description                        |
|--------|------------------------------|------------------------------------|
| POST   | /api/telemetry/batch         | Receive telemetry from edge        |
| GET    | /api/telemetry/latest        | Latest snapshot per vehicle        |
| GET    | /api/telemetry/history/:id   | 200 records for a vehicle          |
| GET    | /api/telemetry/stats         | Aggregate statistics               |
| POST   | /api/events/collision        | Log a collision/brake event        |
| GET    | /api/events/collision        | List recent events                 |
| GET    | /api/model/params            | Get optimized edge params          |
| POST   | /api/model/train             | Trigger cloud training             |
| GET    | /api/model/metrics           | Training history + metrics         |
| POST   | /api/model/predict           | Real-time risk prediction          |
| GET    | /api/health                  | Service health check               |

### Cloud ML (port 8000)

| Method | Endpoint   | Description                  |
|--------|------------|------------------------------|
| GET    | /health    | Service status               |
| GET    | /params    | Current optimized edge params|
| GET    | /metrics   | Training history             |
| POST   | /train     | Start training job           |
| POST   | /predict   | Single-sample prediction     |

### Socket.io Events

| Event              | Direction       | Payload                    |
|--------------------|-----------------|----------------------------|
| telemetry_update   | server → client | Latest vehicles array      |
| collision_event    | server → client | Single collision event     |
| training_started   | server → client | Training started timestamp |
| trigger_training   | client → server | Trigger ML training        |

---

## 🔧 Environment Variables

**Backend `.env`:**
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/collision_avoidance
CLOUD_ML_URL=http://localhost:8000
```

**Edge (env vars):**
```
BACKEND_URL=http://localhost:5000
CLOUD_ML_URL=http://localhost:8000
SUMO_HOME=/usr/share/sumo        # optional if SUMO installed
SUMO_BIN=sumo                    # or sumo-gui for visual
```

---

## 📊 Dashboard Features

- **Live vehicle cards** — speed, gap, risk score, action badge (ACC / BRAKE / EMERGENCY)
- **2D Highway Visualizer** — Canvas-rendered lane view with real-time vehicle positions
- **4 Live Charts** — Speed, Risk Score, Gap, Acceleration (per vehicle, streaming)
- **Collision Event Log** — timestamped feed of braking/emergency events
- **AI Model Panel** — accuracy, RMSE, feature importances, training history, optimized params
- **One-click model training** — click "TRAIN MODEL" in the top bar

---

## ⚡ With SUMO Installed

If SUMO is installed (`sudo apt install sumo` on Ubuntu):
```bash
export SUMO_HOME=/usr/share/sumo
export SUMO_BIN=sumo-gui   # for visual window
python edge/edge_agent.py
```

The edge agent will use real TraCI-based simulation with full vehicle control.
Without SUMO it falls back to a realistic mock simulation automatically.

---

*Built with: React, Node.js, Express, MongoDB, Flask, scikit-learn, SUMO, Socket.io, Recharts*
# Design-Project
