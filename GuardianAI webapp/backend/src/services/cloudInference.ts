

export interface CloudInferenceResult {
  status: 'safe' | 'warning' | 'danger';
  confidence: number;
  reason: string;
  suggestedAction: string;
  riskZone: string;
}

export async function runCloudInference(
  currentPacket: any,
  recentActivePackets: any[]
): Promise<CloudInferenceResult> {
  let status: 'safe' | 'warning' | 'danger' = 'safe';
  let confidence = 0.95;
  let reason = 'Vitals and environmental parameters are nominal.';
  let suggestedAction = 'Proceed with scheduled tasks.';
  let riskZone = 'Zone A (Low Risk)';

  const hr = currentPacket.heartRate;
  const spo2 = currentPacket.spo2;
  const temp = currentPacket.temperature;
  const hum = currentPacket.humidity;
  const ch4 = currentPacket.gas.ch4;
  const co = currentPacket.gas.co;
  const o2 = currentPacket.gas.o2;
  const lat = currentPacket.gps.lat;
  const lng = currentPacket.gps.lng;

  // 1. Fatigue Prediction
  // Heat index approximation: high temp and humidity puts worker at heat stress risk
  const heatIndex = temp + 0.5 * (temp - 10) * (hum / 100);
  const elevatedHR = hr > 105;

  let fatigueRisk = false;
  if (heatIndex > 38 && elevatedHR) {
    fatigueRisk = true;
    status = 'warning';
    reason = 'High fatigue risk: elevated thermal stress and elevated heart rate.';
    suggestedAction = 'Take a 15-minute hydration break in the cooling zone.';
    confidence = 0.88;
  }

  // 2. Gas Trend Prediction
  if (ch4 > 8 || co > 35 || o2 < 19.5) {
    status = 'warning';
    reason = 'Hazardous gas or low oxygen levels detected in the immediate area.';
    suggestedAction = 'Prepare to evacuate and check personal respirator.';
    confidence = 0.91;
  }

  // 3. Multi-Worker Gas Correlation (Shared leak check)
  // Check if other workers within 100 meters also report elevated gas
  const neighbors = recentActivePackets.filter(p => {
    if (p.helmetId === currentPacket.helmetId) return false;
    const distLat = Math.abs(p.gps.lat - lat);
    const distLng = Math.abs(p.gps.lng - lng);
    const distanceThreshold = 0.0015; // ~150 meters
    return distLat < distanceThreshold && distLng < distanceThreshold;
  });

  const neighborElevatedGas = neighbors.some(n => n.gas.ch4 > 5 || n.gas.co > 20 || n.gas.o2 < 19.5);
  const highGasSelf = ch4 > 15 || co > 50 || o2 < 18.0;

  if (highGasSelf || (neighborElevatedGas && (ch4 > 5 || co > 20))) {
    status = 'danger';
    reason = `Critical shared threat: elevated gas levels correlated across ${neighbors.length + 1} nearby workers. Potential pipe leak!`;
    suggestedAction = 'IMMEDIATE EVACUATION: Sector leak alert activated. Sound alarms.';
    riskZone = 'Zone B (Critical Hazard)';
    confidence = 0.98;
  }

  // 4. Equipment/Sensor Failure Prediction
  // If gas sensor reports impossible value (e.g. extremely negative or oxygen < 5%) OR sudden drop to 0 hr
  if (currentPacket.gas.o2 < 12.0 && !currentPacket.helmetRemoved) {
    status = 'warning';
    reason = 'Potential equipment error: Oxygen sensor reading abnormally low. High probability of sensor cell degradation.';
    suggestedAction = 'Request helmet inspection and backup gas meter check.';
    confidence = 0.84;
  }

  // 5. Critical Overrides (SOS or Fall)
  if (currentPacket.sos) {
    status = 'danger';
    reason = 'Manual SOS panic button triggered by worker.';
    suggestedAction = 'Dispatch emergency response team immediately to GPS coordinates.';
    riskZone = 'Active Emergency Zone';
    confidence = 1.0;
  } else if (currentPacket.edgeInference?.flags?.includes('fall_detected')) {
    status = 'danger';
    reason = 'NPU Fall Detection triggered. Accelerometer impact followed by worker immobility.';
    suggestedAction = 'Dispatch nearby safety supervisors to verify worker vitals.';
    riskZone = 'Active Emergency Zone';
    confidence = 0.94;
  }

  return {
    status,
    confidence: parseFloat(confidence.toFixed(2)),
    reason,
    suggestedAction,
    riskZone
  };
}
