"""
Edge Agent — Collision Avoidance System
========================================
Runs SUMO simulation via TraCI, applies real-time edge intelligence
(adaptive cruise control, emergency braking), collects telemetry,
and sends data to the backend API + triggers cloud model updates.

MERN Stack Integration:
  - POST /api/telemetry        → every step telemetry batch
  - POST /api/collision-event  → on collision/emergency brake
  - GET  /api/model/params     → fetch latest AI model params from cloud
"""

import os
import sys
import time
import math
import json
import logging
import threading
import subprocess
import requests
from datetime import datetime
from collections import deque

# ─── Configuration ────────────────────────────────────────────────────────────
SUMO_HOME = os.environ.get("SUMO_HOME", "/usr/share/sumo")
sys.path += [os.path.join(SUMO_HOME, "tools")]

BACKEND_URL  = os.environ.get("BACKEND_URL", "http://localhost:5000")
CLOUD_ML_URL = os.environ.get("CLOUD_ML_URL", "http://localhost:8000")
SUMO_CFG     = os.path.join(os.path.dirname(__file__), "sumo_config", "highway.sumocfg")
SUMO_BIN     = os.environ.get("SUMO_BIN", "sumo")          # use sumo-gui for visual
TRACI_PORT   = int(os.environ.get("TRACI_PORT", 8813))

# Edge logic thresholds (dynamically updated by cloud model)
PARAMS = {
    "safe_gap_m":          10.0,   # minimum safe following distance (meters)
    "emergency_gap_m":      5.0,   # emergency brake trigger distance
    "target_time_headway":  2.0,   # desired time headway (seconds)
    "max_decel":            8.0,   # max deceleration m/s²
    "emergency_decel":     15.0,   # emergency deceleration m/s²
    "acc_gain":             0.5,   # ACC proportional gain
}

# Telemetry buffer — sends in batches every N steps
BATCH_EVERY  = 10   # steps
SEND_TIMEOUT = 2    # seconds

logging.basicConfig(level=logging.INFO, format="[EDGE] %(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("edge")

# ─── Try importing TraCI ───────────────────────────────────────────────────────
try:
    import traci
    import traci.constants as tc
    TRACI_AVAILABLE = True
except ImportError:
    TRACI_AVAILABLE = False
    log.warning("TraCI not found — running in MOCK simulation mode")


# ══════════════════════════════════════════════════════════════════════════════
#  EDGE INTELLIGENCE
# ══════════════════════════════════════════════════════════════════════════════

class EdgeController:
    """
    Real-time edge logic:
      - Adaptive Cruise Control (ACC)
      - Emergency braking
      - Collision risk scoring
    """

    def __init__(self, params: dict):
        self.params = params
        self.collision_events = []

    def update_params(self, new_params: dict):
        """Receive updated model params from cloud."""
        self.params.update(new_params)
        log.info(f"Edge params updated from cloud: {new_params}")

    def compute_risk_score(self, gap: float, speed: float, rel_velocity: float) -> float:
        """
        Heuristic collision risk score [0-1].
        Will be replaced by cloud-trained model predictions over time.
        """
        if gap <= 0:
            return 1.0
        ttc = gap / max(rel_velocity, 0.01) if rel_velocity > 0 else 999
        thw = gap / max(speed, 0.01)
        risk = 0.0
        if ttc < 3.0:
            risk += (3.0 - ttc) / 3.0 * 0.5
        if thw < self.params["target_time_headway"]:
            risk += (self.params["target_time_headway"] - thw) / self.params["target_time_headway"] * 0.5
        return min(1.0, risk)

    def acc_control(self, ego_speed: float, leader_speed: float, gap: float) -> float:
        """
        Adaptive Cruise Control: compute target speed adjustment.
        Returns delta_speed (positive = accelerate, negative = decelerate).
        """
        desired_gap = max(
            self.params["safe_gap_m"],
            ego_speed * self.params["target_time_headway"]
        )
        gap_error    = gap - desired_gap
        speed_error  = leader_speed - ego_speed
        delta_speed  = self.params["acc_gain"] * (gap_error + speed_error)
        return delta_speed

    def decide_action(self, vehicle_id: str, ego_speed: float, leader_speed: float,
                      gap: float) -> dict:
        """
        Returns: { action, decel, risk_score, reason }
        """
        rel_velocity  = ego_speed - leader_speed
        risk_score    = self.compute_risk_score(gap, ego_speed, rel_velocity)

        if gap < self.params["emergency_gap_m"] or (rel_velocity > 0 and gap / rel_velocity < 1.5):
            action = "EMERGENCY_BRAKE"
            decel  = self.params["emergency_decel"]
            reason = f"Gap {gap:.1f}m < emergency threshold {self.params['emergency_gap_m']}m"
            self.collision_events.append({
                "vehicle_id": vehicle_id,
                "gap": gap,
                "speed": ego_speed,
                "risk": risk_score,
                "timestamp": datetime.utcnow().isoformat(),
            })

        elif gap < self.params["safe_gap_m"]:
            action = "BRAKE"
            decel  = self.params["max_decel"] * (1 - gap / self.params["safe_gap_m"])
            reason = f"Gap {gap:.1f}m < safe gap {self.params['safe_gap_m']}m"

        else:
            delta    = self.acc_control(ego_speed, leader_speed, gap)
            action   = "ACC_ADJUST"
            decel    = max(0, -delta)
            reason   = f"ACC delta={delta:.2f} m/s"

        return {
            "action":      action,
            "decel":       decel,
            "risk_score":  risk_score,
            "reason":      reason,
            "rel_velocity": rel_velocity,
        }


# ══════════════════════════════════════════════════════════════════════════════
#  MOCK SIMULATION (when SUMO not installed)
# ══════════════════════════════════════════════════════════════════════════════

class MockSimulation:
    """Generates realistic synthetic telemetry without SUMO."""

    CAR_LENGTH = 5.0  # metres — minimum physical gap

    def __init__(self):
        self.step  = 0
        # pos = front bumper position; vehicles spread out with realistic gaps
        self.vehicles = {
            "leader_0":   {"speed": 25.0, "pos": 200.0, "lane": 0, "accel": 0.0},
            "leader_1":   {"speed": 18.0, "pos": 200.0, "lane": 1, "accel": 0.0},
            "follower_0": {"speed": 25.0, "pos": 170.0, "lane": 0, "accel": 0.0},
            "follower_1": {"speed": 18.0, "pos": 165.0, "lane": 1, "accel": 0.0},
            "vehicle_3":  {"speed": 23.0, "pos": 140.0, "lane": 0, "accel": 0.0},
            "vehicle_4":  {"speed": 17.0, "pos": 135.0, "lane": 1, "accel": 0.0},
        }
        # Track which vehicles are under edge braking control this step
        self._braking_cmd = {}   # vid → decel to apply

    def apply_braking(self, vehicle_id: str, decel: float):
        """Called by the simulation loop to apply edge decisions."""
        self._braking_cmd[vehicle_id] = decel

    def step_simulation(self, dt=0.1):
        self.step += 1
        import random

        # ── Leader slowdown scenario: steps 150-220 ──────────────────────────
        if 150 <= self.step <= 220:
            for lid in ("leader_0", "leader_1"):
                self.vehicles[lid]["speed"] = max(
                    0, self.vehicles[lid]["speed"] - 2.5 * dt
                )
        elif self.step > 220:
            # Leaders resume normal speed gradually
            for lid in ("leader_0", "leader_1"):
                self.vehicles[lid]["speed"] = min(
                    25.0, self.vehicles[lid]["speed"] + 1.0 * dt
                )

        # ── Update each vehicle ───────────────────────────────────────────────
        for vid, v in self.vehicles.items():
            prev_speed = v["speed"]

            if vid in self._braking_cmd:
                # Apply edge-commanded deceleration
                decel = self._braking_cmd.pop(vid)
                v["speed"] = max(0.0, v["speed"] - decel * dt)
            else:
                # Normal cruise with small noise
                noise = random.gauss(0, 0.1)
                v["speed"] = max(0.0, min(33.33, v["speed"] + noise * dt))

            v["accel"] = (v["speed"] - prev_speed) / dt
            v["pos"]  += v["speed"] * dt

        # ── Hard collision guard: never let vehicles overlap ─────────────────
        # Process per lane, back-to-front
        lanes = {}
        for vid, v in self.vehicles.items():
            lanes.setdefault(v["lane"], []).append((vid, v))

        for lane_vehicles in lanes.values():
            # Sort front-to-back (descending position = leading first)
            sorted_v = sorted(lane_vehicles, key=lambda x: x[1]["pos"], reverse=True)
            for i in range(1, len(sorted_v)):
                front_vid, front_v = sorted_v[i - 1]
                back_vid,  back_v  = sorted_v[i]
                min_gap = self.CAR_LENGTH + 0.5  # 0.5m buffer
                actual_gap = front_v["pos"] - back_v["pos"]
                if actual_gap < min_gap:
                    # Push follower back — hard stop
                    back_v["pos"]   = front_v["pos"] - min_gap
                    back_v["speed"] = min(back_v["speed"], front_v["speed"])
                    back_v["accel"] = -8.0  # hard decel marker

    def get_vehicle_data(self) -> list:
        data  = []
        lanes = {}
        for vid, v in self.vehicles.items():
            lanes.setdefault(v["lane"], []).append((vid, v))

        for lane, vlist in lanes.items():
            # front-to-back
            vlist.sort(key=lambda x: x[1]["pos"], reverse=True)
            for i, (vid, v) in enumerate(vlist):
                if i == 0:
                    # Front vehicle — no leader
                    leader_speed = v["speed"]
                    gap          = 80.0
                else:
                    front_vid, front_v = vlist[i - 1]
                    leader_speed = front_v["speed"]
                    gap          = max(0.0, front_v["pos"] - v["pos"] - self.CAR_LENGTH)

                data.append({
                    "vehicle_id":   vid,
                    "lane":         lane,
                    "speed_ms":     round(v["speed"], 3),
                    "speed_kmh":    round(v["speed"] * 3.6, 2),
                    "position_x":   round(v["pos"], 2),
                    "leader_speed": round(leader_speed, 3),
                    "gap_m":        round(gap, 2),
                    "acceleration": round(v.get("accel", 0.0), 3),
                })
        return data

    def get_step(self): return self.step
    def is_running(self): return self.step < 3000
    def close(self): pass


# ══════════════════════════════════════════════════════════════════════════════
#  BACKEND COMMUNICATION
# ══════════════════════════════════════════════════════════════════════════════

class BackendClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session  = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def send_telemetry_batch(self, records: list) -> bool:
        try:
            r = self.session.post(
                f"{self.base_url}/api/telemetry/batch",
                json={"records": records},
                timeout=SEND_TIMEOUT,
            )
            return r.ok
        except Exception as e:
            log.debug(f"Telemetry send failed: {e}")
            return False

    def send_collision_event(self, event: dict) -> bool:
        try:
            r = self.session.post(
                f"{self.base_url}/api/events/collision",
                json=event,
                timeout=SEND_TIMEOUT,
            )
            return r.ok
        except Exception as e:
            log.debug(f"Collision event send failed: {e}")
            return False

    def fetch_model_params(self) -> dict:
        try:
            r = self.session.get(
                f"{self.base_url}/api/model/params",
                timeout=SEND_TIMEOUT,
            )
            if r.ok:
                return r.json().get("params", {})
        except Exception:
            pass
        return {}


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN SIMULATION LOOP
# ══════════════════════════════════════════════════════════════════════════════

def get_leader_info(vehicle_id: str):
    """Get leader vehicle gap and speed via TraCI."""
    leader = traci.vehicle.getLeader(vehicle_id, 100)
    if leader:
        lid, gap = leader
        return gap, traci.vehicle.getSpeed(lid)
    return None, None


def run_traci_simulation(edge_ctrl: EdgeController, backend: BackendClient):
    """Full SUMO/TraCI simulation loop."""
    import traci

    sumo_cmd = [SUMO_BIN, "-c", SUMO_CFG, "--remote-port", str(TRACI_PORT),
                "--collision.action", "warn", "--no-step-log", "--verbose", "false"]

    traci.start(sumo_cmd, port=TRACI_PORT)
    log.info("SUMO TraCI started")

    batch          = []
    param_refresh  = 0

    try:
        while traci.simulation.getMinExpectedNumber() > 0:
            traci.simulationStep()
            step      = traci.simulation.getTime()
            vehicles  = traci.vehicle.getIDList()

            step_records = []
            for vid in vehicles:
                speed  = traci.vehicle.getSpeed(vid)
                pos    = traci.vehicle.getPosition(vid)
                accel  = traci.vehicle.getAcceleration(vid)
                lane   = traci.vehicle.getLaneIndex(vid)

                gap, leader_speed = get_leader_info(vid)
                if gap is None:
                    gap, leader_speed = 50.0, speed

                # Edge decision
                decision = edge_ctrl.decide_action(vid, speed, leader_speed, gap)

                # Apply TraCI control
                if decision["action"] in ("EMERGENCY_BRAKE", "BRAKE"):
                    new_speed = max(0, speed - decision["decel"] * 0.1)
                    traci.vehicle.setSpeed(vid, new_speed)
                else:
                    traci.vehicle.setSpeedMode(vid, 31)  # restore normal

                record = {
                    "vehicle_id":  vid,
                    "step":        step,
                    "timestamp":   datetime.utcnow().isoformat(),
                    "speed_ms":    round(speed, 3),
                    "speed_kmh":   round(speed * 3.6, 2),
                    "position_x":  round(pos[0], 2),
                    "position_y":  round(pos[1], 2),
                    "lane":        lane,
                    "gap_m":       round(gap, 2),
                    "leader_speed": round(leader_speed, 3),
                    "acceleration": round(accel, 3),
                    "action":      decision["action"],
                    "risk_score":  round(decision["risk_score"], 4),
                    "rel_velocity": round(decision["rel_velocity"], 3),
                    "edge_params": edge_ctrl.params.copy(),
                }
                step_records.append(record)

                # Send collision events immediately
                if decision["action"] == "EMERGENCY_BRAKE":
                    backend.send_collision_event({
                        **record,
                        "reason": decision["reason"],
                    })

            batch.extend(step_records)

            # Flush batch
            if len(batch) >= BATCH_EVERY * len(vehicles):
                backend.send_telemetry_batch(batch)
                batch.clear()

            # Refresh cloud params every 50 steps
            param_refresh += 1
            if param_refresh >= 50:
                new_params = backend.fetch_model_params()
                if new_params:
                    edge_ctrl.update_params(new_params)
                param_refresh = 0

    finally:
        if batch:
            backend.send_telemetry_batch(batch)
        traci.close()
        log.info("SUMO simulation ended")


def run_mock_simulation(edge_ctrl: EdgeController, backend: BackendClient):
    """Mock simulation loop (no SUMO required)."""
    sim    = MockSimulation()
    batch  = []
    step_n = 0

    # ── Dedup state ──────────────────────────────────────────────────────────
    # Track which vehicles are currently in emergency state so we:
    #  1. Only log once per incident (not every step)
    #  2. Only send one collision event per incident to the backend
    emergency_state   = {}  # vid → True/False
    last_event_step   = {}  # vid → step when last event was sent
    EVENT_COOLDOWN    = 30  # steps — min gap between repeated event sends

    log.info("Starting MOCK simulation (SUMO not detected)")
    while sim.is_running():
        # ── Step sim ─────────────────────────────────────────────────────────
        sim.step_simulation(dt=0.1)
        step_n += 1
        vehicles = sim.get_vehicle_data()

        step_records = []
        for v in vehicles:
            vid      = v["vehicle_id"]
            decision = edge_ctrl.decide_action(
                vid, v["speed_ms"], v["leader_speed"], v["gap_m"]
            )

            # ── Feed braking command back into physics ────────────────────
            if decision["action"] in ("EMERGENCY_BRAKE", "BRAKE") and decision["decel"] > 0:
                sim.apply_braking(vid, decision["decel"])

            record = {
                **v,
                "step":         step_n,
                "timestamp":    datetime.utcnow().isoformat(),
                "action":       decision["action"],
                "risk_score":   round(decision["risk_score"], 4),
                "rel_velocity": round(decision["rel_velocity"], 3),
                "acceleration": v.get("acceleration", 0.0),
            }
            step_records.append(record)

            # ── Throttled logging + event sending ────────────────────────
            is_emergency = decision["action"] == "EMERGENCY_BRAKE"
            was_emergency = emergency_state.get(vid, False)

            if is_emergency:
                # Log only on first entry into emergency state
                if not was_emergency:
                    log.warning(
                        f"[{vid}] ⚠ EMERGENCY BRAKE started — "
                        f"Gap {v['gap_m']:.1f}m | Speed {v['speed_kmh']:.1f} km/h | "
                        f"Risk {decision['risk_score']*100:.0f}%"
                    )

                # Send event to backend with cooldown (not every single step)
                since_last = step_n - last_event_step.get(vid, -EVENT_COOLDOWN)
                if since_last >= EVENT_COOLDOWN:
                    backend.send_collision_event({**record, "reason": decision["reason"]})
                    last_event_step[vid] = step_n

            elif was_emergency:
                # Just recovered from emergency
                log.info(
                    f"[{vid}] ✓ Recovered — "
                    f"Gap {v['gap_m']:.1f}m | Speed {v['speed_kmh']:.1f} km/h"
                )

            emergency_state[vid] = is_emergency

        batch.extend(step_records)

        if step_n % BATCH_EVERY == 0:
            if backend.send_telemetry_batch(batch):
                # Summarise emergency vehicles instead of spamming
                emerg = [v["vehicle_id"] for v in vehicles
                         if emergency_state.get(v["vehicle_id"])]
                status = f" | ⚠ EMERGENCY: {emerg}" if emerg else ""
                log.info(f"Step {step_n}: sent {len(batch)} records{status}")
            batch.clear()

            # Refresh cloud params
            new_params = backend.fetch_model_params()
            if new_params:
                edge_ctrl.update_params(new_params)

        time.sleep(0.05)  # ~20 sim steps/sec


def main():
    log.info("═══ Edge Agent Starting ═══")
    edge_ctrl = EdgeController(PARAMS)
    backend   = BackendClient(BACKEND_URL)

    if TRACI_AVAILABLE:
        try:
            run_traci_simulation(edge_ctrl, backend)
        except Exception as e:
            log.error(f"TraCI failed ({e}), falling back to mock")
            run_mock_simulation(edge_ctrl, backend)
    else:
        run_mock_simulation(edge_ctrl, backend)


if __name__ == "__main__":
    main()