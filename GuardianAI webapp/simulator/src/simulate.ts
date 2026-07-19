import axios from 'axios';
import * as http from 'http';
import * as url from 'url';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:5001';
const EMIT_INTERVAL_MS = parseInt(process.env.EMIT_INTERVAL_MS || '1500', 10);
const PORT = parseInt(process.env.SIMULATOR_PORT || '5002', 10);

console.log(`Starting simulator pointing to Gateway at ${GATEWAY_URL}...`);

interface HelmetState {
  helmetId: string;
  workerId: string;
  workerName: string;
  state: 'NORMAL' | 'GAS_LEAK' | 'FALL' | 'SOS' | 'GEOFENCE_EXIT' | 'HELMET_REMOVED';
  battery: number;
  lat: number;
  lng: number;
  heartRate: number;
  spo2: number;
  ch4: number;
  co: number;
  o2: number;
  fallTicks: number; // to simulate temporary impact spike
}

// Pre-seeded helmets & workers corresponding to DB seeds
const helmets: Record<string, HelmetState> = {
  'HLM-001': {
    helmetId: 'HLM-001',
    workerId: 'EMP-1001',
    workerName: 'Marcus Vance',
    state: 'NORMAL',
    battery: 92,
    lat: 13.0827,
    lng: 80.2707,
    heartRate: 75,
    spo2: 98,
    ch4: 0,
    co: 1,
    o2: 20.9,
    fallTicks: 0
  },
  'HLM-002': {
    helmetId: 'HLM-002',
    workerId: 'EMP-1002',
    workerName: 'Elena Rostova',
    state: 'NORMAL',
    battery: 88,
    lat: 13.0840,
    lng: 80.2720,
    heartRate: 80,
    spo2: 97,
    ch4: 0,
    co: 2,
    o2: 20.9,
    fallTicks: 0
  },
  'HLM-003': {
    helmetId: 'HLM-003',
    workerId: 'EMP-1003',
    workerName: 'Kofi Mensah',
    state: 'NORMAL',
    battery: 85,
    lat: 13.0815,
    lng: 80.2690,
    heartRate: 72,
    spo2: 99,
    ch4: 0,
    co: 1,
    o2: 20.9,
    fallTicks: 0
  }
};

// Geofence baseline - Safe Zone is around lat 13.0827, lng 80.2707
// Danger zone center could be at 13.0860, 80.2750

function updateTelemetry(h: HelmetState) {
  // Slowly drain battery
  if (Math.random() < 0.05) {
    h.battery = Math.max(1, h.battery - 1);
  }

  // Motion physics variables
  let ax = 0.02 + (Math.random() - 0.5) * 0.05;
  let ay = -0.98 + (Math.random() - 0.5) * 0.05;
  let az = 0.05 + (Math.random() - 0.5) * 0.05;
  let gx = (Math.random() - 0.5) * 2.0;
  let gy = (Math.random() - 0.5) * 2.0;
  let gz = (Math.random() - 0.5) * 2.0;

  // Modify sensor outputs based on simulated state
  switch (h.state) {
    case 'NORMAL':
      // Random walk within safe limits
      h.heartRate = Math.round(75 + (Math.random() - 0.5) * 8);
      h.spo2 = Math.round(98 + (Math.random() - 0.5) * 2);
      
      h.ch4 = Math.max(0, h.ch4 + (Math.random() - 0.5) * 0.5);
      h.co = Math.max(0, h.co + (Math.random() - 0.5) * 0.5);
      h.o2 = parseFloat((20.9 + (Math.random() - 0.5) * 0.2).toFixed(1));
      
      // GPS small drift inside safe zone
      h.lat += (Math.random() - 0.5) * 0.0001;
      h.lng += (Math.random() - 0.5) * 0.0001;
      h.fallTicks = 0;
      break;

    case 'GAS_LEAK':
      // Rapid CH4, CO rise, O2 displacement
      h.ch4 = parseFloat((h.ch4 + 1.5 + Math.random() * 2).toFixed(1));
      h.co = parseFloat((h.co + 5 + Math.random() * 5).toFixed(1));
      h.o2 = parseFloat(Math.max(15, h.o2 - 0.4 - Math.random() * 0.3).toFixed(1));
      h.heartRate = Math.round(h.heartRate + 2); // panic heart rate rise
      
      h.lat += (Math.random() - 0.5) * 0.00005;
      h.lng += (Math.random() - 0.5) * 0.00005;
      break;

    case 'FALL':
      // Accel spike on first tick, then zero motion
      if (h.fallTicks === 0) {
        ax = 3.5;
        ay = 4.2;
        az = -2.8;
        gx = 120.0;
        gy = 85.0;
        gz = -95.0;
        h.heartRate = 110;
        h.spo2 = 96;
      } else {
        // Post fall: worker is unconscious / static on ground
        ax = 0.0;
        ay = 0.0;
        az = 0.0;
        gx = 0.0;
        gy = 0.0;
        gz = 0.0;
        h.heartRate = Math.round(55 - h.fallTicks * 0.5); // dropping pulse
        h.spo2 = Math.max(90, h.spo2 - 1);
      }
      h.fallTicks++;
      break;

    case 'SOS':
      // Large SOS signal, vital spikes
      h.heartRate = Math.round(115 + (Math.random() - 0.5) * 10);
      h.spo2 = Math.round(97 + (Math.random() - 0.5) * 1);
      
      h.lat += (Math.random() - 0.5) * 0.0001;
      h.lng += (Math.random() - 0.5) * 0.0001;
      break;

    case 'GEOFENCE_EXIT':
      // Forcefully walk worker far away from original center point
      // Safe Zone boundary limit is small, so we increment coordinate rapidly
      h.lat += 0.001;
      h.lng += 0.001;
      h.heartRate = Math.round(85 + (Math.random() - 0.5) * 5);
      break;

    case 'HELMET_REMOVED':
      // Values reflect ambient environment off-head
      h.heartRate = 0; // no pulse
      h.spo2 = 0;
      break;
  }

  // Cap gases to reasonable limits
  h.ch4 = parseFloat(Math.min(100, h.ch4).toFixed(1));
  h.co = parseFloat(Math.min(500, h.co).toFixed(1));
  h.heartRate = Math.max(0, Math.min(220, h.heartRate));
  h.spo2 = Math.max(0, Math.min(100, h.spo2));

  // Construct packet
  return {
    helmetId: h.helmetId,
    workerId: h.workerId,
    timestamp: Math.floor(Date.now() / 1000),
    temperature: parseFloat((32.5 + (Math.random() - 0.5) * 1.5).toFixed(1)),
    humidity: parseFloat((55.0 + (Math.random() - 0.5) * 5.0).toFixed(1)),
    pressure: parseFloat((1008.2 + (Math.random() - 0.5) * 1.0).toFixed(1)),
    altitude: parseFloat((102.5 + (Math.random() - 0.5) * 2.0).toFixed(1)),
    heartRate: h.heartRate,
    spo2: h.spo2,
    gas: {
      ch4: h.ch4,
      co: h.co,
      o2: h.o2
    },
    motion: {
      ax: parseFloat(ax.toFixed(3)),
      ay: parseFloat(ay.toFixed(3)),
      az: parseFloat(az.toFixed(3)),
      gx: parseFloat(gx.toFixed(1)),
      gy: parseFloat(gy.toFixed(1)),
      gz: parseFloat(gz.toFixed(1))
    },
    battery: h.battery,
    gps: {
      lat: parseFloat(h.lat.toFixed(6)),
      lng: parseFloat(h.lng.toFixed(6)),
      fix: h.state !== 'HELMET_REMOVED'
    },
    ir: h.state !== 'HELMET_REMOVED',
    sos: h.state === 'SOS'
  };
}

// Background packet emission loop
setInterval(async () => {
  for (const hId of Object.keys(helmets)) {
    const packet = updateTelemetry(helmets[hId]);
    try {
      await axios.post(`${GATEWAY_URL}/api/telemetry`, packet);
      // console.log(`[Simulator] Telemetry sent for ${packet.helmetId}: State=${helmets[hId].state}`);
    } catch (error: any) {
      console.warn(`[Simulator] Failed to send telemetry for ${packet.helmetId} to Gateway: ${error.message}`);
    }
  }
}, EMIT_INTERVAL_MS);

// Create control HTTP server for Demo Mode triggers
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || '', true);

  if (req.method === 'POST' && parsedUrl.pathname === '/api/simulator/scenario') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { helmetId, state } = data;

        if (!helmetId || !helmets[helmetId]) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid or missing helmetId' }));
          return;
        }

        const validStates = ['NORMAL', 'GAS_LEAK', 'FALL', 'SOS', 'GEOFENCE_EXIT', 'HELMET_REMOVED'];
        if (!validStates.includes(state)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Invalid state. Must be one of: ${validStates.join(', ')}` }));
          return;
        }

        console.log(`[Simulator] Transitioning ${helmetId} state to: ${state}`);
        helmets[helmetId].state = state;
        
        // Reset specific parameters when returning to normal
        if (state === 'NORMAL') {
          helmets[helmetId].ch4 = 0;
          helmets[helmetId].co = 1;
          helmets[helmetId].o2 = 20.9;
          helmets[helmetId].heartRate = 75;
          helmets[helmetId].spo2 = 98;
          helmets[helmetId].fallTicks = 0;
          
          // Reset coordinate back to starting grid points
          if (helmetId === 'HLM-001') { helmets[helmetId].lat = 13.0827; helmets[helmetId].lng = 80.2707; }
          if (helmetId === 'HLM-002') { helmets[helmetId].lat = 13.0840; helmets[helmetId].lng = 80.2720; }
          if (helmetId === 'HLM-003') { helmets[helmetId].lat = 13.0815; helmets[helmetId].lng = 80.2690; }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Helmet ${helmetId} state set to ${state}` }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error parsing JSON' }));
      }
    });
  } else if (req.method === 'GET' && parsedUrl.pathname === '/api/simulator/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'running', helmets }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Simulator control server listening on port ${PORT}...`);
});
