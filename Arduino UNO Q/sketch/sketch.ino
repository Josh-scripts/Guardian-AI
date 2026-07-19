#include <Arduino_RouterBridge.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// ---------- Pins ----------
#define MQ4_PIN A0
#define MQ7_PIN A1
#define DHT_PIN 7
#define DHT_TYPE DHT22
#define BUZZER_PIN 9
#define LED_GREEN_PIN 6
#define LED_RED_PIN 5
#define SOS_BUTTON_PIN 4

// ---------- MAX30102 registers ----------
#define MAX30102_ADDR             0x57
#define MAX30102_REG_FIFO_WR_PTR  0x04
#define MAX30102_REG_OVF_COUNTER  0x05
#define MAX30102_REG_FIFO_RD_PTR  0x06
#define MAX30102_REG_FIFO_DATA    0x07
#define MAX30102_REG_FIFO_CONFIG  0x08
#define MAX30102_REG_MODE_CONFIG  0x09
#define MAX30102_REG_SPO2_CONFIG  0x0A
#define MAX30102_REG_LED1_PA      0x0C
#define MAX30102_REG_LED2_PA      0x0D
#define MAX30102_REG_PART_ID      0xFF

#define MODE_HR_ONLY  0x02
#define MODE_SPO2     0x03

// ---------- IR Contact Threshold — EDIT DIRECTLY ----------
#define IR_CONTACT_THRESHOLD  3000
#define IR_RELEASE_MARGIN     1000
#define HELMET_OFF_GRACE_MS   5000

// ---------- ADC config ----------
#define ADC_MAX_VALUE  1023.0
#define ADC_VREF       5.0

#define BMP_ADDR_PRIMARY   0x76
#define BMP_ADDR_FALLBACK  0x77

// ---------- BPM/SpO2 signal processing config ----------
#define HP_ALPHA                  0.97f
#define LP_ALPHA                  0.15f
#define PEAK_BLANKING_MS          250
#define NOISE_TRACK_ALPHA         0.01f
#define NOISE_MULTIPLIER          3.0f
#define MIN_PEAK_AMPLITUDE        3.0f
#define BPM_MEDIAN_WINDOW         7
#define BPM_READY_INTERVALS       3
#define RR_INTERVAL_MIN_MS        333
#define RR_INTERVAL_MAX_MS        1500
#define SPO2_MA_WINDOW            6
#define SPO2_DC_ALPHA             0.02f
#define SPO2_MIN                  70
#define SPO2_MAX                  100
#define SENSOR_SAMPLE_INTERVAL_MS 10

// ---------- SOS button hold config ----------
#define SOS_HOLD_MS 3000UL   // button must be held LOW for this long to trigger SOS

// ---------- Sensor objects ----------
DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_BMP280 bmp;
Adafruit_MPU6050 mpu;

bool bmpOk = false;
bool mpuOk = false;

// ---------- Contact / helmet state ----------
uint32_t rawIR = 0;
uint32_t rawRed = 0;
bool helmetOn = false;
unsigned long lastContactTime = 0;
unsigned long lastSensorSample = 0;
unsigned long contactMadeTime = 0;

// ---------- BPM/SpO2 signal state ----------
float hpPrevInput = 0, hpPrevOutput = 0, bpSignal = 0, prevBpSignal = 0;
float peakMaxVal = 0;
unsigned long peakMaxTime = 0;
bool inPeakRegion = false;
unsigned long lastBeatTime = 0, lastPeakTime = 0;
float noiseFloor = 5.0f, signalPeak = 10.0f;

float intervalBuffer[BPM_MEDIAN_WINDOW];
uint8_t intervalBufIdx = 0, intervalBufCount = 0;
float bpmMedian = 0;
bool bpmReady = false;

float spo2Smoothed = 97;
float spo2Buffer[SPO2_MA_WINDOW];
uint8_t spo2BufferIdx = 0, spo2BufferCount = 0;
float dcRed = 0, dcIR = 0, acRedPeak = 0, acIRPeak = 0;

// ---------- LED / buzzer state ----------
bool sosActive = false;
bool manualBuzzer = false;
unsigned long lastRedBlink = 0;
bool redBlinkState = false;
unsigned long lastOffBeep = 0;
unsigned long lastSosBeep = 0;

// ---------- SOS button debounce / hold-to-trigger ----------
bool lastButtonReading = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY = 50;
bool buttonStableState = HIGH;   // debounced logical state
bool sosPressInProgress = false; // true while button is held LOW, before the 3s trigger fires
unsigned long sosPressStartTime = 0;

unsigned long lastIdlePoll = 0;
const unsigned long IDLE_POLL_MS = 300;

// ---------- I2C helpers ----------
void i2cWriteReg(uint8_t addr, uint8_t reg, uint8_t val) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

uint8_t i2cReadReg(uint8_t addr, uint8_t reg) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(addr, (uint8_t)1);
  return Wire.available() ? Wire.read() : 0xFF;
}

void i2cReadBytes(uint8_t addr, uint8_t reg, uint8_t* buf, uint8_t len) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(addr, len);
  for (uint8_t i = 0; i < len && Wire.available(); i++) buf[i] = Wire.read();
}

// ---------- MAX30102 ----------
void clearFIFO() {
  i2cWriteReg(MAX30102_ADDR, MAX30102_REG_FIFO_WR_PTR, 0x00);
  i2cWriteReg(MAX30102_ADDR, MAX30102_REG_OVF_COUNTER, 0x00);
  i2cWriteReg(MAX30102_ADDR, MAX30102_REG_FIFO_RD_PTR, 0x00);
}

void setSensorMode(bool active) {
  if (active) {
    i2cWriteReg(MAX30102_ADDR, MAX30102_REG_MODE_CONFIG, MODE_SPO2);
    i2cWriteReg(MAX30102_ADDR, MAX30102_REG_LED1_PA, 0x24);
    i2cWriteReg(MAX30102_ADDR, MAX30102_REG_LED2_PA, 0x24);
  } else {
    i2cWriteReg(MAX30102_ADDR, MAX30102_REG_MODE_CONFIG, MODE_HR_ONLY);
    i2cWriteReg(MAX30102_ADDR, MAX30102_REG_LED1_PA, 0x0C);
    i2cWriteReg(MAX30102_ADDR, MAX30102_REG_LED2_PA, 0x00);
  }
  clearFIFO();
}

bool max30102_init() {
  uint8_t partId = i2cReadReg(MAX30102_ADDR, MAX30102_REG_PART_ID);
  Monitor.print("MAX3010x Part ID: 0x");
  Monitor.println(partId, HEX);

  i2cWriteReg(MAX30102_ADDR, MAX30102_REG_MODE_CONFIG, 0x40);
  delay(100);
  clearFIFO();
  i2cWriteReg(MAX30102_ADDR, MAX30102_REG_FIFO_CONFIG, 0x4F);
  i2cWriteReg(MAX30102_ADDR, MAX30102_REG_SPO2_CONFIG, 0x27);
  setSensorMode(false);

  return (partId == 0x15);
}

void max30102_readSample(uint32_t &ir, uint32_t &red, bool spo2Mode) {
  if (spo2Mode) {
    uint8_t buf[6] = {0};
    i2cReadBytes(MAX30102_ADDR, MAX30102_REG_FIFO_DATA, buf, 6);
    ir  = ((uint32_t)(buf[0] & 0x03) << 16) | ((uint32_t)buf[1] << 8) | buf[2];
    red = ((uint32_t)(buf[3] & 0x03) << 16) | ((uint32_t)buf[4] << 8) | buf[5];
  } else {
    uint8_t buf[3] = {0};
    i2cReadBytes(MAX30102_ADDR, MAX30102_REG_FIFO_DATA, buf, 3);
    ir  = ((uint32_t)(buf[0] & 0x03) << 16) | ((uint32_t)buf[1] << 8) | buf[2];
    red = 0;
  }
}

// ---------- BPM/SpO2 signal processing ----------
float applyBandpass(float rawSample) {
  float hpOut = HP_ALPHA * (hpPrevOutput + rawSample - hpPrevInput);
  hpPrevInput = rawSample;
  hpPrevOutput = hpOut;
  bpSignal = LP_ALPHA * hpOut + (1.0f - LP_ALPHA) * bpSignal;
  return bpSignal;
}

float computeMedianBPM() {
  if (intervalBufCount == 0) return 0;
  float temp[BPM_MEDIAN_WINDOW];
  uint8_t n = min(intervalBufCount, (uint8_t)BPM_MEDIAN_WINDOW);
  for (uint8_t i = 0; i < n; i++) {
    uint8_t idx = (intervalBufIdx - n + i + BPM_MEDIAN_WINDOW) % BPM_MEDIAN_WINDOW;
    temp[i] = intervalBuffer[idx];
  }
  for (uint8_t i = 1; i < n; i++) {
    float key = temp[i];
    int8_t j = i - 1;
    while (j >= 0 && temp[j] > key) { temp[j+1] = temp[j]; j--; }
    temp[j+1] = key;
  }
  float medianInterval = (n % 2 == 1) ? temp[n/2] : (temp[n/2-1] + temp[n/2]) / 2.0f;
  if (medianInterval < RR_INTERVAL_MIN_MS || medianInterval > RR_INTERVAL_MAX_MS) return 0;
  return 60000.0f / medianInterval;
}

void pushInterval(float intervalMs) {
  intervalBuffer[intervalBufIdx] = intervalMs;
  intervalBufIdx = (intervalBufIdx + 1) % BPM_MEDIAN_WINDOW;
  if (intervalBufCount < BPM_MEDIAN_WINDOW) intervalBufCount++;
}

float pushSpO2(float spo2) {
  if (spo2 < SPO2_MIN || spo2 > SPO2_MAX) return spo2Smoothed;
  spo2Buffer[spo2BufferIdx] = spo2;
  spo2BufferIdx = (spo2BufferIdx + 1) % SPO2_MA_WINDOW;
  if (spo2BufferCount < SPO2_MA_WINDOW) spo2BufferCount++;
  float sum = 0;
  for (uint8_t i = 0; i < spo2BufferCount; i++) sum += spo2Buffer[i];
  return sum / spo2BufferCount;
}

void detectPeaks(unsigned long now) {
  if ((now - contactMadeTime) < 700) return;

  float absBp = fabsf(bpSignal);
  if (absBp < noiseFloor) noiseFloor = NOISE_TRACK_ALPHA * absBp + (1.0f - NOISE_TRACK_ALPHA) * noiseFloor;
  else noiseFloor *= 1.0001f;
  float minAmplitude = fmaxf(noiseFloor * NOISE_MULTIPLIER, MIN_PEAK_AMPLITUDE);

  if (absBp > signalPeak) signalPeak = absBp;
  else signalPeak *= 0.999f;

  if (lastBeatTime > 0 && (now - lastBeatTime) > 4000) {
    inPeakRegion = false;
    peakMaxVal = 0;
    noiseFloor *= 0.5f;
    lastBeatTime = now;
  }

  float slope = bpSignal - prevBpSignal;

  if (bpSignal > minAmplitude) {
    if (!inPeakRegion) {
      inPeakRegion = true;
      peakMaxVal = bpSignal;
      peakMaxTime = now;
    } else if (bpSignal > peakMaxVal) {
      peakMaxVal = bpSignal;
      peakMaxTime = now;
    }

    if (slope <= 0 && prevBpSignal > bpSignal && peakMaxVal > minAmplitude) {
      if (lastBeatTime == 0 || (now - lastBeatTime) >= PEAK_BLANKING_MS) {
        unsigned long interval = peakMaxTime - lastPeakTime;
        if (lastPeakTime > 0 && interval >= RR_INTERVAL_MIN_MS && interval <= RR_INTERVAL_MAX_MS) {
          pushInterval((float)interval);
          bpmMedian = computeMedianBPM();
          if (intervalBufCount >= BPM_READY_INTERVALS && bpmMedian > 0) bpmReady = true;
        }
        lastPeakTime = peakMaxTime;
        lastBeatTime = now;
        inPeakRegion = false;
        peakMaxVal = 0;
      }
    }
  } else {
    inPeakRegion = false;
    peakMaxVal = 0;
  }
  prevBpSignal = bpSignal;
}

void updateSpO2() {
  dcRed = SPO2_DC_ALPHA * (float)rawRed + (1.0f - SPO2_DC_ALPHA) * dcRed;
  dcIR  = SPO2_DC_ALPHA * (float)rawIR  + (1.0f - SPO2_DC_ALPHA) * dcIR;

  float acRed = fabsf((float)rawRed - dcRed);
  float acIR  = fabsf((float)rawIR  - dcIR);
  acRedPeak = fmaxf(acRed, acRedPeak * 0.995f);
  acIRPeak  = fmaxf(acIR,  acIRPeak  * 0.995f);

  if (dcRed < 1000 || dcIR < 1000 || acIRPeak < 100) return;

  float R = (acRedPeak / dcRed) / (acIRPeak / dcIR);
  float spo2Raw = constrain(110.0f - 25.0f * R, (float)SPO2_MIN, (float)SPO2_MAX);
  spo2Smoothed = pushSpO2(spo2Raw);
}

void resetSignalState() {
  memset(intervalBuffer, 0, sizeof(intervalBuffer));
  intervalBufIdx = 0; intervalBufCount = 0;
  memset(spo2Buffer, 0, sizeof(spo2Buffer));
  spo2BufferIdx = 0; spo2BufferCount = 0;
  bpmMedian = 0; bpmReady = false;
  hpPrevInput = 0; hpPrevOutput = 0; bpSignal = 0; prevBpSignal = 0;
  inPeakRegion = false; peakMaxVal = 0; lastPeakTime = 0; lastBeatTime = 0;
  noiseFloor = 5.0f; signalPeak = 10.0f;
  dcRed = 0; dcIR = 0; acRedPeak = 0; acIRPeak = 0;
}

// ---------- Analog sensors ----------
float readMQ4Voltage() { return (analogRead(MQ4_PIN) / ADC_MAX_VALUE) * ADC_VREF; }
float readMQ7Voltage() { return (analogRead(MQ7_PIN) / ADC_MAX_VALUE) * ADC_VREF; }

// ---------- LEDs ----------
void updateLEDs() {
  unsigned long now = millis();
  if (sosActive) {
    digitalWrite(LED_GREEN_PIN, LOW);
    if (now - lastRedBlink >= 150) {
      redBlinkState = !redBlinkState;
      digitalWrite(LED_RED_PIN, redBlinkState);
      lastRedBlink = now;
    }
    return;
  }
  if (helmetOn) {
    digitalWrite(LED_GREEN_PIN, HIGH);
    digitalWrite(LED_RED_PIN, LOW);
  } else {
    digitalWrite(LED_GREEN_PIN, LOW);
    digitalWrite(LED_RED_PIN, HIGH);
  }
}

// ---------- Buzzer ----------
void updateBuzzer() {
  unsigned long now = millis();
  if (sosActive) {
    if (now - lastSosBeep >= 300) {
      tone(BUZZER_PIN, 2000, 150);
      lastSosBeep = now;
    }
    return;
  }
  if (!helmetOn) {
    if (now - lastOffBeep >= 3000) {
      tone(BUZZER_PIN, 800, 100);
      lastOffBeep = now;
    }
    return;
  }
  digitalWrite(BUZZER_PIN, manualBuzzer ? HIGH : LOW);
}

// ---------- RPC functions ----------
bool set_buzzer(bool state) { manualBuzzer = state; return manualBuzzer; }

bool trigger_sos() {
  sosActive = true;
  return true;
}

bool clear_sos() {
  sosActive = false;
  sosPressInProgress = false; // also cancel any in-progress hold so releasing/re-pressing starts clean
  digitalWrite(LED_RED_PIN, LOW);
  noTone(BUZZER_PIN);
  return true;
}

// ---------- SOS button: debounce + 3s hold-to-trigger ----------
void checkSOSButton() {
  bool reading = digitalRead(SOS_BUTTON_PIN);
  unsigned long now = millis();

  if (reading != lastButtonReading) lastDebounceTime = now;

  if ((now - lastDebounceTime) > DEBOUNCE_DELAY) {
    // reading has been stable past the debounce window
    if (reading != buttonStableState) {
      buttonStableState = reading;

      if (buttonStableState == LOW) {
        // button just pressed — start the 3s hold timer
        if (!sosActive) {
          sosPressInProgress = true;
          sosPressStartTime = now;
        }
      } else {
        // button released before reaching 3s — cancel, no SOS
        sosPressInProgress = false;
      }
    }

    // still holding LOW — check if we've reached the hold duration
    if (buttonStableState == LOW && sosPressInProgress && !sosActive) {
      if (now - sosPressStartTime >= SOS_HOLD_MS) {
        sosActive = true;
        sosPressInProgress = false;
        Bridge.call("sos_triggered", (double)now);
      }
    }
  }

  lastButtonReading = reading;
}

// ---------- RPC: main sensor data getter (API-ready, consistent schema) ----------
String get_sensor_data() {
  String state = sosActive ? "sos" : (helmetOn ? "on" : "off");

 String json = "{";
json += "\"helmet_id\":1001";
json += ",\"state\":\"" + state + "\"";

  if (state == "sos" || state == "off") {
    json += "}";
    return json;
  }

  // state == "on" — full sensor payload, fixed schema every time
  json += ",\"bpm\":" + String(bpmReady ? bpmMedian : -1, 1);
  json += ",\"spo2\":" + String(spo2Smoothed, 1);

  json += ",\"mq4_v\":" + String(readMQ4Voltage(), 4);
  json += ",\"mq7_v\":" + String(readMQ7Voltage(), 4);

  float h = dht.readHumidity();
  float t = dht.readTemperature();
  json += ",\"humidity\":" + String(isnan(h) ? -1 : h, 1);
  json += ",\"dht_temp\":" + String(isnan(t) ? -1 : t, 1);

  if (bmpOk) {
    json += ",\"pressure_hpa\":" + String(bmp.readPressure() / 100.0, 2);
    json += ",\"bmp_temp\":" + String(bmp.readTemperature(), 2);
    json += ",\"altitude_m\":" + String(bmp.readAltitude(1013.25), 2);
  } else {
    json += ",\"pressure_hpa\":-1,\"bmp_temp\":-1,\"altitude_m\":-1";
  }

  if (mpuOk) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    json += ",\"ax\":" + String(a.acceleration.x / 9.80665, 4);
    json += ",\"ay\":" + String(a.acceleration.y / 9.80665, 4);
    json += ",\"az\":" + String(a.acceleration.z / 9.80665, 4);
    json += ",\"gx\":" + String(g.gyro.x, 4);
    json += ",\"gy\":" + String(g.gyro.y, 4);
    json += ",\"gz\":" + String(g.gyro.z, 4);
  } else {
    json += ",\"ax\":-1,\"ay\":-1,\"az\":-1,\"gx\":-1,\"gy\":-1,\"gz\":-1";
  }

  json += "}";
  return json;
}

void setup() {
  Bridge.begin();
  Monitor.begin(115200);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(SOS_BUTTON_PIN, INPUT_PULLUP);

  Wire.begin();
  Wire.setClock(400000);
  dht.begin();

  bmpOk = bmp.begin(BMP_ADDR_PRIMARY);
  if (!bmpOk) bmpOk = bmp.begin(BMP_ADDR_FALLBACK);
  if (bmpOk) {
    bmp.setSampling(Adafruit_BMP280::MODE_NORMAL, Adafruit_BMP280::SAMPLING_X2,
                     Adafruit_BMP280::SAMPLING_X16, Adafruit_BMP280::FILTER_X16,
                     Adafruit_BMP280::STANDBY_MS_500);
  } else {
    Monitor.println("BMP280 not found");
  }

  mpuOk = mpu.begin();
  if (mpuOk) {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  } else {
    Monitor.println("MPU6050 not found");
  }

  bool maxOk = max30102_init();
  if (!maxOk) Monitor.println("MAX30102 not confirmed");

  resetSignalState();
  digitalWrite(LED_RED_PIN, HIGH);
  tone(BUZZER_PIN, 1500, 200);

  Bridge.provide("get_sensor_data", get_sensor_data);
  Bridge.provide("set_buzzer", set_buzzer);
  Bridge.provide("trigger_sos", trigger_sos);
  Bridge.provide("clear_sos", clear_sos);
}

void loop() {
  unsigned long now = millis();
  checkSOSButton();

  if (helmetOn) {
    if (now - lastSensorSample >= SENSOR_SAMPLE_INTERVAL_MS) {
      lastSensorSample = now;
      max30102_readSample(rawIR, rawRed, true);
      applyBandpass((float)rawIR);
      detectPeaks(now);
      updateSpO2();

      if (rawIR > (IR_CONTACT_THRESHOLD - IR_RELEASE_MARGIN)) {
        lastContactTime = now;
      } else if (now - lastContactTime > HELMET_OFF_GRACE_MS) {
        helmetOn = false;
        setSensorMode(false);
        Monitor.println("Helmet OFF");
      }
    }
  } else {
    if (now - lastIdlePoll >= IDLE_POLL_MS) {
      lastIdlePoll = now;
      max30102_readSample(rawIR, rawRed, false);
      if (rawIR > IR_CONTACT_THRESHOLD) {
        helmetOn = true;
        setSensorMode(true);
        resetSignalState();
        contactMadeTime = now;
        dcRed = (float)rawRed;
        dcIR = (float)rawIR;
        Monitor.println("Helmet ON");
      }
    }
  }

  updateLEDs();
  updateBuzzer();
  delay(2);
}
