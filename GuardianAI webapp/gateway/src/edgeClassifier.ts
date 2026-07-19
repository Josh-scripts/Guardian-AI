export interface TelemetryPacket {
  helmetId: string;
  workerId: string;
  timestamp: number;
  temperature: number;
  humidity: number;
  pressure: number;
  altitude: number;
  heartRate: number;
  spo2: number;
  gas: {
    ch4: number;
    co: number;
    o2: number;
  };
  motion: {
    ax: number;
    ay: number;
    az: number;
    gx: number;
    gy: number;
    gz: number;
  };
  battery: number;
  gps: {
    lat: number;
    lng: number;
    fix: boolean;
  };
  ir: boolean;
  sos: boolean;
}

export interface EdgeInference {
  riskScore: number;
  flags: string[];
  latencyMs: number;
}

export function runEdgeInference(packet: TelemetryPacket): EdgeInference {
  const startTime = Date.now();
  const flags: string[] = [];
  let riskScore = 0.0;
  const helmetRemoved = !packet.ir;

  // 1. Fall detection from accelerometer
  const accMag = Math.sqrt(
    packet.motion.ax * packet.motion.ax +
    packet.motion.ay * packet.motion.ay +
    packet.motion.az * packet.motion.az
  );
  const gyroMag = Math.sqrt(
    packet.motion.gx * packet.motion.gx +
    packet.motion.gy * packet.motion.gy +
    packet.motion.gz * packet.motion.gz
  );

  // If a massive shock is detected or worker is lying flat (no gravity on Y axis, motionless)
  const isMotionless = accMag < 0.1 && gyroMag < 0.5;
  
  if (accMag > 2.5 || (isMotionless && !helmetRemoved)) {
    flags.push('fall_detected');
    riskScore = Math.max(riskScore, 0.9);
  }

  // 2. Gas spike / anomaly detection
  if (packet.gas.ch4 > 15 || packet.gas.co > 50 || packet.gas.o2 < 18.0) {
    flags.push('gas_spike');
    riskScore = Math.max(riskScore, 0.85);
  } else if (packet.gas.ch4 > 5 || packet.gas.co > 25 || packet.gas.o2 < 19.5) {
    flags.push('gas_anomaly');
    riskScore = Math.max(riskScore, 0.5);
  }

  // 3. Abnormal heart rate detection
  if (packet.heartRate > 0) { // If helmet is on head
    if (packet.heartRate > 130 || packet.heartRate < 45) {
      flags.push('abnormal_heart_rate');
      riskScore = Math.max(riskScore, 0.7);
    } else if (packet.spo2 < 92) {
      flags.push('low_oxygen');
      riskScore = Math.max(riskScore, 0.75);
    }
  }

  // 4. Worker inactivity detection
  // If accelerometer and gyro are completely flat but heart rate is present and helmet is not removed
  if (!helmetRemoved && isMotionless && packet.heartRate > 0) {
    flags.push('worker_inactivity');
    riskScore = Math.max(riskScore, 0.6);
  }

  // 5. SOS alarm override
  if (packet.sos) {
    flags.push('sos_trigger');
    riskScore = 1.0;
  }

  // Calculate simulated NPU processing latency (Snapdragon NPU runs ONNX in 5-15ms)
  const baseLatency = 4; // ms
  const randomJitter = Math.floor(Math.random() * 8);
  const latencyMs = baseLatency + randomJitter;

  return {
    riskScore: parseFloat(riskScore.toFixed(2)),
    flags,
    latencyMs
  };
}
