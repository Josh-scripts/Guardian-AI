import json
import time
import threading
import subprocess
import re
import requests
import pickle
import os
import numpy as np

from arduino.app_utils import Bridge, App

# -------------------------------------------------------
# SUPABASE CONFIG
# -------------------------------------------------------
SUPABASE_URL = "https://gwrftduiylxjsapdfsbh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3cmZ0ZHVpeWx4anNhcGRmc2JoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDExOTUwNiwiZXhwIjoyMDk5Njk1NTA2fQ.fe2ApqZQuM5B2wI0SnVPVmtklAMyy2cPm_odcUrFp6U"
TABLE = "telemetry"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

# -------------------------------------------------------
# SOS COMMAND TABLE (NEW)
# -------------------------------------------------------
SOS_TABLE = "sos_commands"
HELMET_ID = 1001
_last_sos_command_id = None

# -------------------------------------------------------
# ML MODEL / RISK CALCULATOR CONFIG
# -------------------------------------------------------
FALL_MODEL_PATH = "fall_risk_model.pkl"
GAS_MODEL_PATH = "gas_risk_model.pkl"
SCALER_PATH = "scaler.pkl"

def load_ml_assets():
    assets = {"fall_model": None, "gas_model": None, "scaler": None}
    try:
        if os.path.exists(FALL_MODEL_PATH):
            with open(FALL_MODEL_PATH, "rb") as f:
                assets["fall_model"] = pickle.load(f)
        if os.path.exists(GAS_MODEL_PATH):
            with open(GAS_MODEL_PATH, "rb") as f:
                assets["gas_model"] = pickle.load(f)
        if os.path.exists(SCALER_PATH):
            with open(SCALER_PATH, "rb") as f:
                assets["scaler"] = pickle.load(f)
    except Exception as e:
        print(f"⚠️ Warning loading ML assets: {e}")
    return assets

ML_ASSETS = load_ml_assets()

def calculate_fall_risk(data):
    ax, ay, az = data.get("ax", 0.0), data.get("ay", 0.0), data.get("az", 1.0)
    gx, gy, gz = data.get("gx", 0.0), data.get("gy", 0.0), data.get("gz", 0.0)

    accel_mag = np.sqrt(ax**2 + ay**2 + az**2)
    gyro_mag = np.sqrt(gx**2 + gy**2 + gz**2)

    base_risk = 0.1
    if accel_mag < 0.5 or accel_mag > 2.5:
        base_risk += 0.5
    if gyro_mag > 1.5:
        base_risk += 0.4

    if ML_ASSETS["fall_model"] is not None:
        try:
            features = np.array([[ax, ay, az, gx, gy, gz]])
            if ML_ASSETS["scaler"] is not None:
                features = ML_ASSETS["scaler"].transform(features)
            if hasattr(ML_ASSETS["fall_model"], "predict_proba"):
                return float(ML_ASSETS["fall_model"].predict_proba(features)[0][1])
            return float(ML_ASSETS["fall_model"].predict(features)[0])
        except:
            pass

    return min(float(base_risk), 1.0)

def calculate_gas_risk(data):
    mq4_v = data.get("mq4_v", 0.0)
    mq7_v = data.get("mq7_v", 0.0)

    mq4_contribution = min(mq4_v / 2.5, 1.0) * 0.5
    mq7_contribution = min(mq7_v / 3.0, 1.0) * 0.5
    base_risk = mq4_contribution + mq7_contribution

    if ML_ASSETS["gas_model"] is not None:
        try:
            features = np.array([[mq4_v, mq7_v]])
            if hasattr(ML_ASSETS["gas_model"], "predict_proba"):
                return float(ML_ASSETS["gas_model"].predict_proba(features)[0][1])
            return float(ML_ASSETS["gas_model"].predict(features)[0])
        except:
            pass

    return min(float(base_risk), 1.0)

# -------------------------------------------------------

def upload_to_supabase(data):
    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/{TABLE}",
            headers=HEADERS,
            json=data,
            timeout=5
        )
        if r.status_code in (200, 201):
            print("✅ Uploaded")
        else:
            print("❌ Upload failed")
            print(r.status_code)
            print(r.text)
    except Exception as e:
        print("Supabase:", e)

# -------------------------------------------------------

def sos_triggered(mcu_timestamp):
    print("SOS button pressed")
    return True

def trigger_sos_from_python():
    Bridge.call("trigger_sos")

def clear_sos_from_python():
    Bridge.call("clear_sos")

def set_buzzer(state):
    Bridge.call("set_buzzer", state)

# -------------------------------------------------------
# SOS: web app -> Python -> Bridge (NEW)
# -------------------------------------------------------

def poll_sos_commands():
    global _last_sos_command_id
    while True:
        try:
            r = requests.get(
                f"{SUPABASE_URL}/rest/v1/{SOS_TABLE}",
                headers=HEADERS,
                params={
                    "helmet_id": f"eq.{HELMET_ID}",
                    "select": "id,command",
                    "order": "id.desc",
                    "limit": "1"
                },
                timeout=5
            )
            if r.status_code == 200 and r.json():
                row = r.json()[0]
                if row["id"] != _last_sos_command_id:
                    _last_sos_command_id = row["id"]
                    if row["command"] == "trigger":
                        print("🌐 Web app requested SOS trigger")
                        trigger_sos_from_python()
                    elif row["command"] == "clear":
                        print("🌐 Web app requested SOS clear")
                        clear_sos_from_python()
        except Exception as e:
            print("SOS poll error:", e)
        time.sleep(1)

# -------------------------------------------------------

def get_wifi_rssi():
    try:
        out = subprocess.check_output(
            ["nmcli", "-t", "-f", "ACTIVE,SIGNAL", "dev", "wifi"],
            text=True
        )
        for line in out.splitlines():
            if line.startswith("yes:"):
                signal = int(line.split(":")[1])
                return int(signal/2 - 100)
    except:
        pass
    return None

# -------------------------------------------------------

def poll_sensors():
    while True:
        try:
            raw = Bridge.call("get_sensor_data")
            data = json.loads(raw)

            data["timestamp"] = time.strftime(
                "%Y-%m-%dT%H:%M:%SZ",
                time.gmtime()
            )
            data["wifi_rssi_dbm"] = get_wifi_rssi()

            data["fall_risk_score"] = calculate_fall_risk(data)
            data["gas_risk_score"] = calculate_gas_risk(data)

            print("Telemetry payload generated:")
            print(json.dumps(data, indent=2))

            upload_to_supabase(data)

        except Exception as e:
            print("Telemetry loop error:", e)

        time.sleep(2)

# -------------------------------------------------------

if __name__ == "__main__":
    Bridge.provide("sos_triggered", sos_triggered)

    threading.Thread(target=poll_sensors, daemon=True).start()
    threading.Thread(target=poll_sos_commands, daemon=True).start()

    App.run()