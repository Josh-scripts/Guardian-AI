# ⛑️ Guardian AI

# GuardianAI — Smart Safety Helmet For Miners and Underground workers 

AI-powered smart safety helmet built on the Arduino UNO Q, combining on-device sensing, contact-gated power management, local alerting, and SOS handling — communicating with a Python app over Arduino's Router Bridge 

## Hardware

| Component | Interface | Purpose |
|---|---|---|
| Arduino UNO Q | — | Central controller (MCU + Linux compute) |
| MAX30102 | I2C (0x57) | Heart rate / SpO2 + skin-contact detection |
| MPU6050 | I2C | Accelerometer / gyroscope (motion) |
| BMP280 | I2C (0x76 / 0x77) | Pressure, temperature, altitude |
| DHT22 | Digital (D7) | Humidity, temperature |
| MQ4 | Analog (A0) | Methane detection |
| MQ7 | Analog (A1) | Carbon monoxide detection |
| Buzzer (5V) | Digital (D9) | Audible alerts |
| Green LED | Digital (D6) | Helmet-on status |
| Red LED | Digital (D5) | Helmet-off / SOS status |
| SOS Button | Digital (D4, `INPUT_PULLUP`) | Manual emergency trigger |

### Wiring

- **I2C bus (shared):** SDA/SCL → MAX30102, MPU6050, BMP280
- **MQ4** → A0, **MQ7** → A1 (5V heater supply)
- **DHT22** → D7
- **Buzzer** → D9 (direct 3.3V drive; use a transistor stage if louder output is needed)
- **Green LED** → D6, **Red LED** → D5
- **SOS button** → D4, other leg to GND

## Project Structure

```
guardian-ai/
├── sketch/
│   └── sketch.ino        # MCU-side: sensors, LEDs, buzzer, SOS, Bridge RPC
├── python/
│   ├── main.py            # Linux-side: polls Bridge, WiFi RSSI, SOS handling
│   └── requirements.txt
└── README.md
```

## How It Works

1. **Helmet on/off detection** — MAX30102 IR reading against `IR_CONTACT_THRESHOLD` (with hysteresis) determines skin contact. A grace period (`HELMET_OFF_GRACE_MS`) avoids false "helmet off" triggers from brief adjustments.
2. **Power-aware sensing** — while the helmet is off, only a low-power IR check runs (MAX30102 in HR-only mode, RED LED hardware-disabled). Full sensor suite (BPM/SpO2 signal processing, gas, environment, motion) only runs while worn.
3. **On-device BPM/SpO2** — bandpass filtering + peak detection computes heart rate; a red/IR AC/DC ratio computes SpO2, both smoothed over rolling windows.
4. **Bridge RPC** — the MCU exposes `get_sensor_data`, `set_buzzer`, `trigger_sos`, `clear_sos` to Python via `Arduino_RouterBridge`; Python exposes `sos_triggered` back to the MCU for button-press events.
5. **SOS handling** — button press or Python call sets `sosActive`, which overrides all other sensor reporting, blinks the red LED, and beeps the buzzer. Python is notified immediately for external API dispatch.
6. **WiFi RSSI** — read from the Linux side (`/proc/net/wireless`, `nmcli`, or `iw`/`iwconfig` fallback), included in every sensor payload for signal-strength-based positioning.

## API / Data Schema

`get_sensor_data()` returns a fixed-schema JSON string:

```json
// state: "off" or "sos"
{ "state": "off" }

// state: "on"
{
  "state": "on",
  "bpm": 72.5,
  "spo2": 97.3,
  "mq4_v": 0.42,
  "mq7_v": 0.31,
  "humidity": 55.2,
  "dht_temp": 28.4,
  "pressure_hpa": 1011.32,
  "bmp_temp": 27.8,
  "altitude_m": 142.6,
  "ax": 0.01, "ay": -0.02, "az": 0.98,
  "gx": 0.1, "gy": -0.05, "gz": 0.02
}
```
`-1` indicates a sensor is not initialized or a read failed. `bpm: -1` means the heart-rate buffer hasn't stabilized yet.

## Setup

### 1. Install libraries (via App Lab → Add Library)
- Arduino_RouterBridge
- DHT sensor library
- Adafruit BMP280 Library
- Adafruit MPU6050
- Adafruit Unified Sensor
- Adafruit BusIO

### 2. Connect UNO Q to WiFi
```bash
sudo nmcli dev wifi connect "YOUR_SSID" password "YOUR_PASSWORD"
hostname -I   # confirm IP for SSH / networking
```

### 3. Configure thresholds
Edit constants at the top of `sketch.ino` before flashing:
```cpp
#define IR_CONTACT_THRESHOLD  30000   // tune against your actual MAX30102 hardware
#define IR_RELEASE_MARGIN     10000
```

### 4. Deploy
Open the project in Arduino App Lab, flash the sketch, and run the app — App Lab handles both MCU flashing and starting the Python container.


## License

MIT License

Copyright (c) [year] [fullname]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


