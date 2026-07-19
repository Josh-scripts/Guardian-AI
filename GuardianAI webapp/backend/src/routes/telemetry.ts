import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { checkGeofence } from '../services/geofence';
import { runCloudInference } from '../services/cloudInference';
import { authenticateJWT } from './middleware';

const router = Router();

// Store active telemetry cache in memory for real-time Cloud AI spatial indexing
const telemetryCache = new Map<string, any>();

// ── INGEST (called by Gateway) ────────────────────────────────────────────────
router.post('/ingest', async (req: Request, res: Response) => {
  const telemetryData = req.body;

  if (!telemetryData || !telemetryData.helmetId || !telemetryData.workerId) {
    res.status(400).json({ error: 'Missing core telemetry properties' });
    return;
  }

  try {
    const { helmetId, workerId, gps, gas, heartRate, spo2, helmetRemoved, sos, edgeInference } = telemetryData;

    // 1. Fetch worker profile
    const { data: workerRows, error: workerErr } = await supabase
      .from('workers')
      .select('*')
      .eq('worker_id', workerId)
      .limit(1);

    if (workerErr) throw workerErr;
    const worker = workerRows?.[0];
    if (!worker) {
      res.status(404).json({ error: `Worker ${workerId} not found` });
      return;
    }

    // 2. Geofence check
    let geofenceAlertTriggered = false;
    let geofenceMessage = '';
    let isDangerZone = false;

    if (gps && gps.fix) {
      const geoResult = checkGeofence(gps.lat, gps.lng);
      if (geoResult.inDangerZone || !geoResult.inSafeZone) {
        geofenceAlertTriggered = true;
        geofenceMessage = geoResult.message || 'Geofence Boundary Violated';
        isDangerZone = geoResult.inDangerZone;
      }
    }

    // Update helmet battery & lastSeen
    await supabase
      .from('helmets')
      .update({ battery: telemetryData.battery, last_seen: new Date().toISOString(), status: 'assigned' })
      .eq('helmet_id', helmetId);

    // 3. Cache neighbours for multi-worker correlation
    const now = Date.now();
    for (const [key, value] of telemetryCache.entries()) {
      if (now - value.cachedAt > 30000) telemetryCache.delete(key);
    }
    const recentActivePackets = Array.from(telemetryCache.values()).map(v => v.packet);

    // 4. Cloud AI inference
    const cloudInference = await runCloudInference(telemetryData, recentActivePackets);
    telemetryCache.set(helmetId, { cachedAt: now, packet: { ...telemetryData, edgeInference, cloudInference } });

    // 5. Alert trigger evaluation
    let alertType: string | null = null;
    let severity: 'warning' | 'critical' = 'warning';
    let alertMessage = '';

    if (sos) {
      alertType = 'sos'; severity = 'critical'; alertMessage = 'SOS panic button activated by worker.';
    } else if (edgeInference?.flags?.includes('fall_detected')) {
      alertType = 'fall'; severity = 'critical'; alertMessage = 'Worker fall detected by helmet accelerometer.';
    } else if (geofenceAlertTriggered) {
      alertType = 'geofence_exit';
      severity = isDangerZone ? 'critical' : 'warning';
      alertMessage = geofenceMessage;
    } else if (edgeInference?.flags?.includes('gas_spike') || cloudInference.status === 'danger') {
      alertType = 'gas_leak'; severity = 'critical'; alertMessage = cloudInference.reason;
    } else if (edgeInference?.flags?.includes('gas_anomaly')) {
      alertType = 'gas_anomaly'; severity = 'warning'; alertMessage = 'Minor environmental gas anomaly detected.';
    } else if (edgeInference?.flags?.includes('abnormal_heart_rate') || edgeInference?.flags?.includes('low_oxygen')) {
      alertType = 'vitals_warning'; severity = 'critical';
      alertMessage = `Vitals anomaly: Heart Rate ${heartRate} bpm, SpO2 ${spo2}%.`;
    } else if (helmetRemoved) {
      alertType = 'helmet_removed'; severity = 'warning'; alertMessage = 'Smart safety helmet removed from head.';
    }

    let activeAlertCreated = false;
    if (alertType) {
      // Prevent duplicate active alerts of same type
      const { data: existingAlerts } = await supabase
        .from('alerts')
        .select('id')
        .eq('worker_id', workerId)
        .eq('type', alertType)
        .in('status', ['active', 'acknowledged'])
        .limit(1);

      if (!existingAlerts || existingAlerts.length === 0) {
        const { data: newAlert, error: alertErr } = await supabase
          .from('alerts')
          .insert({
            worker_id: workerId,
            worker_name: worker.name,
            helmet_id: helmetId,
            type: alertType,
            severity,
            message: alertMessage,
            location_lat: gps?.lat ?? 0,
            location_lng: gps?.lng ?? 0,
            status: 'active'
          })
          .select()
          .single();

        if (alertErr) throw alertErr;
        activeAlertCreated = true;

        const io = req.app.get('socketio');
        if (io && newAlert) io.emit('new_alert', normaliseAlert(newAlert));
      }
    }

    // 6. Determine worker status
    let finalWorkerStatus: 'safe' | 'warning' | 'danger' = 'safe';
    if (sos || alertType === 'fall' || cloudInference.status === 'danger') {
      finalWorkerStatus = 'danger';
    } else if (cloudInference.status === 'warning' || alertType) {
      finalWorkerStatus = 'warning';
    }

    const { count: criticalCount } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .in('status', ['active', 'acknowledged'])
      .eq('severity', 'critical');

    if ((criticalCount ?? 0) > 0) {
      finalWorkerStatus = 'danger';
    } else {
      const { count: warningCount } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('worker_id', workerId)
        .in('status', ['active', 'acknowledged'])
        .eq('severity', 'warning');
      if ((warningCount ?? 0) > 0) finalWorkerStatus = 'warning';
    }

    await supabase
      .from('workers')
      .update({ status: finalWorkerStatus, updated_at: new Date().toISOString() })
      .eq('worker_id', workerId);

    // 7. Save telemetry point using the user's specific SQL schema columns
    const parsedHelmetId = typeof helmetId === 'number' ? helmetId : (parseInt(String(helmetId).replace(/[^\d]/g, '')) || 1001);

    const { error: telErr } = await supabase.from('telemetry').insert({
      timestamp: new Date((telemetryData.timestamp || Date.now() / 1000) * 1000).toISOString(),
      mq4_v: gas?.ch4 ?? 0,
      mq7_v: gas?.co ?? 0,
      ax: telemetryData.motion?.ax ?? 0,
      ay: telemetryData.motion?.ay ?? 0,
      az: telemetryData.motion?.az ?? 0,
      gx: telemetryData.motion?.gx ?? 0,
      gy: telemetryData.motion?.gy ?? 0,
      gz: telemetryData.motion?.gz ?? 0,
      wifi_rssi_dbm: telemetryData.wifi_rssi_dbm ?? telemetryData.rssi ?? null,
      fall_risk_score: edgeInference?.riskScore ?? 0,
      gas_risk_score: edgeInference?.gasRiskScore ?? 0,
      helmet_id: parsedHelmetId,
      state: sos ? 'sos' : (helmetRemoved ? 'removed' : 'on'),
      bpm: heartRate,
      spo2: spo2,
      humidity: telemetryData.humidity ?? 0,
      dht_temp: telemetryData.temperature ?? 0,
      bmp_temp: telemetryData.temperature ?? 0,
      pressure_hpa: telemetryData.pressure ?? 0,
      altitude_m: telemetryData.altitude ?? 0
    });
    if (telErr) throw telErr;

    // 8. Broadcast live telemetry via Socket.IO
    const io = req.app.get('socketio');
    if (io) {
      io.emit('telemetry_update', {
        ...telemetryData,
        workerName: worker.name,
        department: worker.department,
        workerStatus: finalWorkerStatus,
        edgeInference,
        cloudInference
      });
    }

    res.json({ success: true, alertCreated: activeAlertCreated, cloudInference });
  } catch (error: any) {
    console.error('Ingest error:', error);
    res.status(500).json({ error: 'Internal backend ingestion error' });
  }
});

// ── GET history ───────────────────────────────────────────────────────────────
router.get('/history/:workerId', authenticateJWT, async (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '50', 10);

  try {
    const { data, error } = await supabase
      .from('telemetry')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Return in chronological order and map column names
    const history = (data || []).reverse().map(normaliseTelemetry);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Helper: normalise Supabase telemetry row → shape frontend expects ─────────
function normaliseTelemetry(t: any) {
  const helmetId = t.helmet_id ?? 1001;
  const bpmVal = t.bpm ?? -1;
  const spo2Val = t.spo2 ?? 0;
  
  const mq4Val = t.mq4_v ?? 0;
  const mq7Val = t.mq7_v ?? 0;
  
  const axVal = t.ax ?? 0;
  const ayVal = t.ay ?? 0;
  const azVal = t.az ?? 0;
  const gxVal = t.gx ?? 0;
  const gyVal = t.gy ?? 0;
  const gzVal = t.gz ?? 0;
  
  const dhtTemp = t.dht_temp ?? 0;
  const bmpTemp = t.bmp_temp ?? 0;
  const tempVal = bmpTemp || dhtTemp || 0;
  
  const humidityVal = t.humidity ?? 0;
  const pressureVal = t.pressure_hpa ?? 0;
  const altitudeVal = t.altitude_m ?? 0;
  
  const stateVal = t.state || 'off';
  const isSos = stateVal === 'sos';
  const isHelmetRemoved = stateVal === 'removed';
  
  const fallRisk = t.fall_risk_score ?? 0;
  const gasRisk = t.gas_risk_score ?? 0;

  return {
    _id: t.id,
    helmetId: `HLM-${String(helmetId).padStart(3, '0')}`,
    workerId: 'EMP-1001',
    timestamp: t.timestamp,
    temperature: tempVal,
    humidity: humidityVal,
    pressure: pressureVal,
    altitude: altitudeVal,
    heartRate: bpmVal,
    spo2: spo2Val,
    gas: {
      ch4: mq4Val,
      co: mq7Val,
      o2: 20.9
    },
    motion: {
      ax: axVal,
      ay: ayVal,
      az: azVal,
      gx: gxVal,
      gy: gyVal,
      gz: gzVal
    },
    battery: 92,
    gps: { lat: 13.0827, lng: 80.2707, fix: true },
    helmetRemoved: isHelmetRemoved,
    sos: isSos,
    edgeInference: {
      riskScore: fallRisk,
      flags: (fallRisk > 0.6) ? ['fall_detected'] : [],
      latencyMs: 12
    },
    cloudInference: {
      status: (fallRisk > 0.6 || isSos) ? 'danger' : 'safe',
      reason: 'Telemetry processing normal.'
    },
    createdAt: t.created_at
  };
}

function normaliseAlert(a: any) {
  return {
    _id: a.id,
    workerId: a.worker_id,
    workerName: a.worker_name,
    helmetId: a.helmet_id,
    type: a.type,
    severity: a.severity,
    message: a.message,
    location: { lat: a.location_lat, lng: a.location_lng },
    status: a.status,
    timestamp: a.timestamp
  };
}

export default router;
