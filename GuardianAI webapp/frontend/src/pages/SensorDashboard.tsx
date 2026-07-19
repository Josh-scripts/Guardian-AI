import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gwrftduiylxjsapdfsbh.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const normaliseTelemetry = (t: any) => {
  if (!t) return {
    _id: 0,
    helmetId: 'HLM-001',
    workerId: 'EMP-1001',
    timestamp: '',
    temperature: 0,
    humidity: 0,
    pressure: 0,
    altitude: 0,
    heartRate: 0,
    spo2: 0,
    gas: { ch4: 0, co: 0, o2: 20.9 },
    motion: { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 },
    battery: 92,
    gps: { lat: 13.0827, lng: 80.2707, fix: true },
    helmetRemoved: false,
    sos: false,
    edgeInference: { riskScore: 0, flags: [], latencyMs: 12 },
    cloudInference: { status: 'safe', reason: 'Normal' },
    createdAt: ''
  };

  const id = t.id ?? t._id;
  const helmetId = t.helmet_id ?? t.helmetId ?? 1001;
  const workerId = t.worker_id ?? t.workerId ?? 'EMP-1001';
  
  const bpmVal = t.bpm ?? t.heart_rate ?? t.heartRate ?? 0;
  const spo2Val = t.spo2 ?? 0;
  
  const mq4Val = t.mq4_v ?? t.mq4V ?? (t.gas?.ch4) ?? 0;
  const mq7Val = t.mq7_v ?? t.mq7V ?? (t.gas?.co) ?? 0;
  const o2Val = t.o2 ?? (t.gas?.o2) ?? 20.9;
  
  const axVal = t.ax ?? (t.motion?.ax) ?? 0;
  const ayVal = t.ay ?? (t.motion?.ay) ?? 0;
  const azVal = t.az ?? (t.motion?.az) ?? 0;
  const gxVal = t.gx ?? (t.motion?.gx) ?? 0;
  const gyVal = t.gy ?? (t.motion?.gy) ?? 0;
  const gzVal = t.gz ?? (t.motion?.gz) ?? 0;
  
  const dhtTemp = t.dht_temp ?? t.temperature ?? 0;
  const bmpTemp = t.bmp_temp ?? t.temperature ?? 0;
  const tempVal = bmpTemp || dhtTemp || t.temperature || 0;
  
  const humidityVal = t.humidity ?? 0;
  const pressureVal = t.pressure_hpa ?? t.pressure ?? 1013;
  const altitudeVal = t.altitude_m ?? t.altitude ?? 0;
  
  const stateVal = t.state || 'off';
  const isSos = stateVal === 'sos' || t.sos === true;
  const isHelmetRemoved = stateVal === 'removed' || t.helmet_removed === true || t.helmetRemoved === true;
  
  const fallRisk = t.fall_risk_score ?? t.fallRiskScore ?? (t.edgeInference?.riskScore) ?? 0;

  return {
    _id: id,
    helmetId: typeof helmetId === 'number' ? `HLM-${String(helmetId).padStart(3, '0')}` : helmetId,
    workerId: workerId,
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
      o2: o2Val
    },
    motion: {
      ax: axVal,
      ay: ayVal,
      az: azVal,
      gx: gxVal,
      gy: gyVal,
      gz: gzVal
    },
    battery: t.battery ?? 92,
    gps: t.gps || { lat: 13.0827, lng: 80.2707, fix: true },
    helmetRemoved: isHelmetRemoved,
    sos: isSos,
    edgeInference: t.edgeInference || {
      riskScore: fallRisk,
      flags: (fallRisk > 0.6) ? ['fall_detected'] : [],
      latencyMs: 12
    },
    cloudInference: t.cloudInference || {
      status: (fallRisk > 0.6 || isSos) ? 'danger' : 'safe',
      reason: 'Telemetry processing normal.'
    },
    createdAt: t.created_at || t.createdAt
  };
};

const getPacketTime = (timestamp: any): number => {
  if (!timestamp) return Date.now();
  if (typeof timestamp === 'number') {
    return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  }
  const parsed = Date.parse(timestamp);
  return isNaN(parsed) ? Date.now() : parsed;
};
import {
  Thermometer,
  Gauge,
  Mountain,
  Activity,
  Cpu,
  Signal,
  RefreshCw,
  Wifi,
  WifiOff,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Layers,
  BarChart2,
  BellRing,
  X,
  ShieldAlert,
  WifiOff as SensorOfflineIcon,
  Clock
} from 'lucide-react';

// ─── Buzzer Alert Overlay ─────────────────────────────────────────────────────
interface BuzzerAlertOverlayProps {
  alert: { target: string; sentBy: string; workerName?: string | null; timestamp: Date } | null;
  onDismiss: () => void;
}

const BuzzerAlertOverlay: React.FC<BuzzerAlertOverlayProps> = ({ alert, onDismiss }) => {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!alert) return;
    setCountdown(10);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); onDismiss(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [alert]);

  if (!alert) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.88)',
        animation: 'buzzerFlash 0.6s ease-in-out infinite alternate'
      }}
    >
      {/* Flashing border frame */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 80px 20px rgba(239,68,68,0.55)', animation: 'buzzerFlash 0.6s ease-in-out infinite alternate' }}
      />

      <div className="relative max-w-lg w-full mx-4 text-center space-y-6">
        {/* Siren icon */}
        <div className="flex justify-center">
          <div
            className="p-6 rounded-full border-4 border-red-500"
            style={{ background: 'rgba(239,68,68,0.15)', animation: 'buzzerPulse 0.6s ease-in-out infinite alternate' }}
          >
            <ShieldAlert className="w-16 h-16 text-red-400" />
          </div>
        </div>

        {/* Message */}
        <div>
          <div className="text-[11px] text-red-400 font-bold uppercase tracking-widest font-mono mb-2">
            ⚠ EMERGENCY BUZZER ALERT ⚠
          </div>
          <h2 className="text-3xl font-extrabold text-white font-outfit leading-tight">
            {alert.target === 'all'
              ? 'SITE-WIDE EMERGENCY ALERT'
              : 'PERSONAL SAFETY ALERT'}
          </h2>
          <p className="mt-3 text-slate-300 text-base">
            {alert.target === 'all'
              ? 'Administrator has issued an emergency buzzer to all workers. Please follow emergency protocols immediately.'
              : `Supervisor has sent you a direct safety alert. Please report to your safety officer.`}
          </p>
          <p className="mt-2 text-sm text-slate-400 font-mono">
            Issued by: <span className="text-red-300 font-bold">{alert.sentBy}</span>
          </p>
        </div>

        {/* Auto-dismiss countdown */}
        <div className="flex flex-col items-center space-y-2">
          <div
            className="w-16 h-16 rounded-full border-4 border-red-500/50 flex items-center justify-center"
            style={{ boxShadow: '0 0 20px rgba(239,68,68,0.4)' }}
          >
            <span className="text-2xl font-bold font-mono text-red-400">{countdown}</span>
          </div>
          <span className="text-xs text-slate-500 font-mono uppercase tracking-wider">auto-dismiss</span>
        </div>

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="inline-flex items-center space-x-2 px-8 py-3 bg-slate-800 hover:bg-slate-700
                     border border-red-500/30 hover:border-red-500/60 rounded-xl text-white
                     font-bold text-sm uppercase tracking-wider transition-all"
        >
          <X className="w-4 h-4" />
          <span>Dismiss Alert</span>
        </button>
      </div>

      <style>{`
        @keyframes buzzerFlash {
          0%   { background: rgba(0,0,0,0.88); }
          100% { background: rgba(100,0,0,0.55); }
        }
        @keyframes buzzerPulse {
          0%   { transform: scale(1);    box-shadow: 0 0 20px rgba(239,68,68,0.4); }
          100% { transform: scale(1.08); box-shadow: 0 0 50px rgba(239,68,68,0.8); }
        }
      `}</style>
    </div>
  );
};
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface SensorPoint {
  timestamp: string | number;
  temperature?: number;
  pressure?: number;
  altitude?: number;
  heartRate?: number;
  spo2?: number;
  battery?: number; // kept in type but not displayed
  motion?: {
    ax?: number; ay?: number; az?: number;
    gx?: number; gy?: number; gz?: number;
  };
}

interface DeviceOption {
  workerId: string;
  name: string;
  helmetId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const fmt = (n: number | undefined, decimals = 1) =>
  n !== undefined && !isNaN(n) ? n.toFixed(decimals) : '0';

const magnitude = (ax = 0, ay = 0, az = 0) =>
  Math.sqrt(ax * ax + ay * ay + az * az);

const trend = (history: SensorPoint[], key: keyof SensorPoint): 'up' | 'down' | 'flat' => {
  if (history.length < 3) return 'flat';
  const vals = history.slice(-5).map(h => Number(h[key] ?? 0));
  const delta = vals[vals.length - 1] - vals[0];
  if (Math.abs(delta) < 0.3) return 'flat';
  return delta > 0 ? 'up' : 'down';
};

const TrendIcon: React.FC<{ dir: 'up' | 'down' | 'flat'; className?: string }> = ({ dir, className = '' }) => {
  if (dir === 'up') return <TrendingUp className={`w-3.5 h-3.5 ${className}`} />;
  if (dir === 'down') return <TrendingDown className={`w-3.5 h-3.5 ${className}`} />;
  return <Minus className={`w-3.5 h-3.5 ${className}`} />;
};

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

/** Animated gauge bar */
const GaugeBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="gauge-bar-track mt-2">
      <div className="gauge-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
};

/** Single metric sensor card */
const MetricCard: React.FC<{
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  accentColor: string;
  glowClass: string;
  trend?: 'up' | 'down' | 'flat';
  trendColor?: string;
  gauge?: { value: number; max: number; color: string };
  pulse?: boolean;
}> = ({ label, value, unit, icon, accentColor, glowClass, trend: dir, trendColor, gauge, pulse }) => (
  <div className={`cyber-card rounded-xl border p-4 flex flex-col justify-between h-36 relative overflow-hidden transition-all duration-300 ${glowClass}`}>
    {/* Top accent line */}
    <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: accentColor }} />

    <div className="flex justify-between items-start">
      <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">{label}</span>
      <span className={pulse ? 'animate-pulse' : ''}>{icon}</span>
    </div>

    <div className="flex items-end justify-between">
      <div>
        <span className="text-2xl font-bold font-mono tracking-tight text-white">{value}</span>
        <span className="text-[11px] text-slate-400 ml-1">{unit}</span>
      </div>
      {dir && (
        <div className={`flex items-center space-x-0.5 text-[10px] font-semibold ${trendColor}`}>
          <TrendIcon dir={dir} className={trendColor ?? ''} />
        </div>
      )}
    </div>

    {gauge && <GaugeBar value={gauge.value} max={gauge.max} color={gauge.color} />}
  </div>
);

// ────────────────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────────────────
export const SensorDashboard: React.FC = () => {
  const { token, user } = useAuth();
  const { socket, isConnected } = useSocket();

  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [history, setHistory] = useState<SensorPoint[]>([]);
  const [latest, setLatest] = useState<SensorPoint | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'env' | 'motion' | 'charts'>('env');
  const [dataPulse, setDataPulse] = useState(false);

  // ── Buzzer alert state ────────────────────────────────────────────────────
  const [buzzerAlert, setBuzzerAlert] = useState<{
    target: string; sentBy: string; workerName?: string | null; timestamp: Date;
  } | null>(null);

  const authToken = token || localStorage.getItem('guardian_token');

  // ── Fetch device list ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/workers`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          const workers: DeviceOption[] = data
            .filter((w: any) => w.role === 'worker')
            .map((w: any) => ({ workerId: w.workerId, name: w.name, helmetId: w.helmetId }));
          setDevices(workers);
          if (workers.length > 0) setSelectedId(workers[0].workerId);
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  // ── Fetch history when device changes ──────────────────────────────────
  const fetchHistory = useCallback(async (workerId: string) => {
    if (!workerId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/telemetry/history/${workerId}?limit=60`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data: SensorPoint[] = await res.json();
        setHistory(data.map(normaliseTelemetry));
        if (data.length > 0) {
          const latestPacket = normaliseTelemetry(data[data.length - 1]);
          setLatest(latestPacket);
          setLastUpdateTime(getPacketTime(latestPacket.timestamp));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (selectedId) fetchHistory(selectedId);
  }, [selectedId, fetchHistory]);

  // Handle live WebSockets and Supabase Realtime updates
  useEffect(() => {
    if (!selectedId) return;

    const handleTelemetry = (packet: any) => {
      const normalised = normaliseTelemetry(packet);
      setLatest(normalised);
      setLastUpdateTime(getPacketTime(normalised.timestamp));
      setHistory(prev => {
        const next = [...prev, normalised];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });

      // Trigger pulse animation
      setDataPulse(true);
      setTimeout(() => setDataPulse(false), 500);
    };

    const handleBuzzer = (payload: any) => {
      const myWorkerId = user?.workerId || selectedId;
      if (payload.target === 'all' || payload.workerId === myWorkerId) {
        setBuzzerAlert({
          target: payload.target,
          sentBy: payload.sentBy,
          workerName: payload.workerName,
          timestamp: new Date(payload.timestamp)
        });
      }
    };

    if (socket) {
      socket.on('telemetry_update', handleTelemetry);
      socket.on('buzzer_alert', handleBuzzer);
    }

    // Subscribe to Supabase Realtime for this selected worker
    const channel = supabaseClient
      .channel(`telemetry_sensor_lab_${selectedId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'telemetry'
        },
        (payload) => {
          handleTelemetry(payload.new);
        }
      )
      .subscribe();

    return () => {
      if (socket) {
        socket.off('telemetry_update', handleTelemetry);
        socket.off('buzzer_alert', handleBuzzer);
      }
      supabaseClient.removeChannel(channel);
    };
  }, [socket, selectedId, user]);

  // Periodic staleness checker: forces re-renders to check if ESP went offline
  const [nowState, setNowState] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowState(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  // ── Derived sensor values ───────────────────────────────────────────────
  // isStale = sensor has not sent data for >10s, but we KEEP last known values visible.
  // Only the UI shows an offline warning banner — values are never zeroed.
  const isStale = lastUpdateTime > 0 && (nowState - lastUpdateTime) > 10000;
  const hasEverReceived = lastUpdateTime > 0;

  // Always use last received value (freeze at last reading when stale)
  const temp = latest?.temperature;
  const pressure = latest?.pressure;
  const altitude = latest?.altitude;
  const heartRate = latest?.heartRate ?? 0;
  const spo2 = latest?.spo2 ?? 0;
  const ax = latest?.motion?.ax ?? 0;
  const ay = latest?.motion?.ay ?? 0;
  const az = latest?.motion?.az ?? 0;
  const gx = latest?.motion?.gx ?? 0;
  const gy = latest?.motion?.gy ?? 0;
  const gz = latest?.motion?.gz ?? 0;
  const accelMag = magnitude(ax, ay, az);
  const gyroMag = magnitude(gx, gy, gz);
  const isMotion = accelMag > 1.2;

  const envTrend = (key: keyof SensorPoint) => trend(history, key);
  const chartData = history.slice(-50).map(h => ({
    ...h,
    time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }));

  const selectedDevice = devices.find(d => d.workerId === selectedId);

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-inter">

      {/* ── Buzzer Alert Overlay ── */}
      <BuzzerAlertOverlay alert={buzzerAlert} onDismiss={() => setBuzzerAlert(null)} />

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-cyber-card/30 border border-cyber-border/40 rounded-2xl">
        <div>
          <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider font-mono">Sensor Lab</span>
          <h1 className="text-2xl font-extrabold text-white tracking-wide font-outfit mt-0.5">
            Sensor <span className="text-sky-400">Dashboard</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time BMP280 environmental & MPU6050 motion telemetry per helmet node
          </p>
        </div>

        {/* Device selector + connection indicator */}
        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${isConnected ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isConnected ? 'Live' : 'Offline'}</span>
          </div>

          <div className="relative">
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="bg-cyber-darker border border-cyber-border rounded-lg pl-3 pr-8 py-2 text-xs text-slate-300 focus:outline-none focus:border-sky-400 transition-colors appearance-none cursor-pointer"
            >
              {devices.map(d => (
                <option key={d.workerId} value={d.workerId}>{d.name} ({d.workerId})</option>
              ))}
              {devices.length === 0 && <option value="">No devices</option>}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          <button
            onClick={() => selectedId && fetchHistory(selectedId)}
            className="p-2 bg-slate-800 hover:bg-sky-500/20 hover:text-sky-400 text-slate-400 border border-cyber-border rounded-lg transition-all"
            title="Refresh history"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Device info strip ── */}
      {selectedDevice && (
        <div className="flex flex-wrap gap-3 px-1">
          {[
            { label: 'Worker ID', val: selectedDevice.workerId, icon: <Cpu className="w-3 h-3" /> },
            { label: 'Helmet Node', val: selectedDevice.helmetId || 'HLM-???', icon: <Layers className="w-3 h-3" /> },
            { label: 'Data Points', val: `${history.length} / 60`, icon: <BarChart2 className="w-3 h-3" /> },
            { label: 'Last Update', val: latest ? new Date(latest.timestamp).toLocaleTimeString() : '--', icon: <Signal className="w-3 h-3" /> },
          ].map(item => (
            <div key={item.label} className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800/40 border border-cyber-border/30 rounded-lg text-[11px] font-mono text-slate-400">
              <span className="text-sky-400">{item.icon}</span>
              <span className="text-slate-500">{item.label}:</span>
              <span className="text-slate-200">{item.val}</span>
            </div>
          ))}
          {/* Live / Stale / Pulse indicator */}
          {isStale ? (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 border border-amber-500/40 bg-amber-500/5 rounded-lg text-[11px] font-mono text-amber-400">
              <Clock className="w-3 h-3 animate-pulse" />
              <span>Sensor offline — frozen at last value</span>
            </div>
          ) : (
            <div className={`flex items-center space-x-1.5 px-3 py-1.5 border rounded-lg text-[11px] font-mono transition-all ${dataPulse ? 'border-cyber-yellow/50 text-cyber-yellow bg-cyber-yellow/5 data-pulse' : 'border-cyber-border/30 text-slate-400 bg-slate-800/40'}`}>
              <span className={`w-2 h-2 rounded-full ${dataPulse ? 'bg-cyber-yellow animate-ping' : 'bg-slate-600'}`} />
              <span>{dataPulse ? 'New data received' : hasEverReceived ? 'Awaiting update' : 'Waiting for first packet'}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex items-center space-x-1 border-b border-cyber-border/40">
        {([
          { id: 'env', label: 'Environmental (BMP280)', icon: <Thermometer className="w-3.5 h-3.5" /> },
          { id: 'motion', label: 'Motion (MPU6050)', icon: <Activity className="w-3.5 h-3.5" /> },
          { id: 'charts', label: 'Trend Charts', icon: <TrendingUp className="w-3.5 h-3.5" /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-1.5 px-4 py-2.5 text-xs font-semibold font-outfit uppercase tracking-wide border-b-2 transition-all duration-200 ${activeTab === tab.id
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Sensor Offline Banner ── */}
      {isStale && hasEverReceived && (
        <div className="flex items-center space-x-3 px-5 py-3.5 rounded-xl border border-amber-500/40 bg-amber-500/8"
          style={{ background: 'rgba(245,158,11,0.06)' }}>
          <div className="p-2 rounded-lg bg-amber-500/15 flex-shrink-0">
            <SensorOfflineIcon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wide font-outfit">
              ⚠ Sensor Offline — Displaying Last Known Values
            </p>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              No telemetry received in the last{' '}
              {Math.floor((nowState - lastUpdateTime) / 1000)}s. Values below are frozen from the final packet received at{' '}
              {latest ? new Date(latest.timestamp).toLocaleTimeString() : '--'}.
              Readings will resume automatically when the sensor reconnects.
            </p>
          </div>
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border border-amber-500/30 text-amber-400 bg-amber-500/10 flex-shrink-0 uppercase tracking-wider">
            Last Known
          </span>
        </div>
      )}

      {/* ── No data yet banner ── */}
      {!hasEverReceived && !loading && (
        <div className="flex items-center space-x-3 px-5 py-3.5 rounded-xl border border-slate-700/60 bg-slate-800/20">
          <div className="p-2 rounded-lg bg-slate-700/40 flex-shrink-0">
            <Signal className="w-4 h-4 text-slate-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide font-outfit">Awaiting First Packet</p>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              No telemetry data has been received yet for {selectedDevice?.name ?? 'this worker'}. Start the simulator or check sensor connectivity.
            </p>
          </div>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ══ ENVIRONMENTAL TAB ══════════════════════════════════════════════ */}
          {activeTab === 'env' && (
            <div className="space-y-6">
              <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity duration-500 ${isStale ? 'opacity-75' : 'opacity-100'}`}>
                {/* Temperature */}
                <MetricCard
                  label={isStale ? 'Temperature [LAST KNOWN]' : 'Temperature'}
                  value={fmt(temp)}
                  unit="°C"
                  icon={<Thermometer className={`w-4 h-4 ${isStale ? 'text-amber-400' : 'text-orange-400'}`} />}
                  accentColor={isStale ? '#f59e0b' : '#f97316'}
                  glowClass="cyber-card-env"
                  trend={isStale ? 'flat' : envTrend('temperature')}
                  trendColor={envTrend('temperature') === 'up' ? 'text-red-400' : 'text-sky-400'}
                  gauge={{ value: (temp ?? 25) + 40, max: 125, color: isStale ? '#f59e0b' : '#f97316' }}
                />

                {/* Pressure */}
                <MetricCard
                  label={isStale ? 'Barometric Pressure [LAST KNOWN]' : 'Barometric Pressure'}
                  value={fmt(pressure)}
                  unit="hPa"
                  icon={<Gauge className={`w-4 h-4 ${isStale ? 'text-amber-400' : 'text-sky-400'}`} />}
                  accentColor={isStale ? '#f59e0b' : '#38bdf8'}
                  glowClass="cyber-card-env"
                  trend={isStale ? 'flat' : envTrend('pressure')}
                  trendColor={envTrend('pressure') === 'up' ? 'text-sky-400' : 'text-amber-400'}
                  gauge={{ value: (pressure ?? 1013) - 300, max: 800, color: isStale ? '#f59e0b' : '#38bdf8' }}
                />

                {/* Altitude */}
                <MetricCard
                  label={isStale ? 'Altitude [LAST KNOWN]' : 'Altitude'}
                  value={fmt(altitude)}
                  unit="m"
                  icon={<Mountain className={`w-4 h-4 ${isStale ? 'text-amber-400' : 'text-emerald-400'}`} />}
                  accentColor={isStale ? '#f59e0b' : '#34d399'}
                  glowClass="cyber-card-env"
                  trend={isStale ? 'flat' : envTrend('altitude')}
                  trendColor={envTrend('altitude') === 'up' ? 'text-emerald-400' : 'text-slate-400'}
                  gauge={{ value: Math.max(0, (altitude ?? 100) + 500), max: 3500, color: isStale ? '#f59e0b' : '#34d399' }}
                />

                {/* Heart Rate */}
                <MetricCard
                  label={isStale ? 'Heart Rate [LAST KNOWN]' : 'Heart Rate'}
                  value={fmt(heartRate, 0)}
                  unit="bpm"
                  icon={<Activity className={`w-4 h-4 ${isStale ? 'text-amber-400' : 'text-red-400'}`} />}
                  accentColor={isStale ? '#f59e0b' : '#ef4444'}
                  glowClass="cyber-card"
                  trend={isStale ? 'flat' : envTrend('heartRate')}
                  trendColor={envTrend('heartRate') === 'up' ? 'text-red-400' : 'text-sky-400'}
                  gauge={{ value: heartRate, max: 180, color: isStale ? '#f59e0b' : '#ef4444' }}
                  pulse={!isStale}
                />

                {/* SpO2 */}
                <MetricCard
                  label={isStale ? 'Oxygen SpO2 [LAST KNOWN]' : 'Oxygen SpO2'}
                  value={fmt(spo2, 0)}
                  unit="%"
                  icon={<Zap className={`w-4 h-4 ${isStale ? 'text-amber-400' : 'text-cyan-400'}`} />}
                  accentColor={isStale ? '#f59e0b' : '#22d3ee'}
                  glowClass="cyber-card"
                  trend={isStale ? 'flat' : envTrend('spo2')}
                  trendColor={envTrend('spo2') === 'down' ? 'text-red-400' : 'text-cyan-400'}
                  gauge={{ value: spo2, max: 100, color: isStale ? '#f59e0b' : '#22d3ee' }}
                />
              </div>

              {/* Environmental Summary strip */}
              <div className="cyber-card p-5 rounded-2xl border border-cyber-border grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                {[
                  { label: 'Min Temp', val: history.length ? Math.min(...history.map(h => h.temperature ?? 99)).toFixed(1) + ' °C' : '--' },
                  { label: 'Max Temp', val: history.length ? Math.max(...history.map(h => h.temperature ?? -99)).toFixed(1) + ' °C' : '--' },
                  { label: 'Avg Pressure', val: history.length ? (history.reduce((s, h) => s + (h.pressure ?? 0), 0) / history.length).toFixed(1) + ' hPa' : '--' },
                  { label: 'Avg Altitude', val: history.length ? (history.reduce((s, h) => s + (h.altitude ?? 0), 0) / history.length).toFixed(1) + ' m' : '--' },
                ].map(stat => (
                  <div key={stat.label}>
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wide block">{stat.label}</span>
                    <span className="text-base font-bold font-mono text-slate-200 mt-0.5 block">{stat.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ MOTION TAB ═════════════════════════════════════════════════════ */}
          {activeTab === 'motion' && (
            <div className={`space-y-6 transition-opacity duration-500 ${isStale ? 'opacity-75' : 'opacity-100'}`}>
              {/* Motion intensity indicator */}
              <div className={`p-4 rounded-xl border flex items-center space-x-4 transition-all ${isStale ? 'border-amber-500/30 bg-amber-500/5' : isMotion ? 'border-purple-500/40 bg-purple-500/5' : 'border-cyber-border/40 bg-slate-800/20'}`}>
                <div className={`p-3 rounded-lg ${isMotion ? 'bg-purple-500/20 text-purple-400 motion-active' : 'bg-slate-800 text-slate-500'}`}>
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-white uppercase tracking-wide">
                    Motion Status: <span className={isMotion ? 'text-purple-400' : 'text-slate-400'}>{isMotion ? 'ACTIVE' : 'STATIC'}</span>
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    |a| = {accelMag.toFixed(3)} g &nbsp;|&nbsp; |ω| = {gyroMag.toFixed(2)} °/s
                  </p>
                </div>
                {/* Motion bar */}
                <div className="flex-1">
                  <GaugeBar value={Math.min(accelMag, 5)} max={5} color={isMotion ? '#a78bfa' : '#475569'} />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1">
                    <span>0g</span><span>5g</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Accelerometer card */}
                <div className="cyber-card cyber-card-motion rounded-2xl border p-6 space-y-4">
                  <div className="flex items-center space-x-2 border-b border-cyber-border/40 pb-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20 shadow-glow-purple">
                      <Activity className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold font-outfit text-white uppercase tracking-wide">Accelerometer</h3>
                      <p className="text-[10px] text-slate-500 font-mono">MPU6050 – Linear acceleration (g)</p>
                    </div>
                  </div>
                  {[
                    { axis: 'X', val: ax, color: '#ef4444' },
                    { axis: 'Y', val: ay, color: '#38bdf8' },
                    { axis: 'Z', val: az, color: '#a78bfa' },
                  ].map(({ axis, val, color }) => (
                    <div key={axis} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono text-slate-400">Axis {axis}</span>
                        <span className="font-bold font-mono text-white">{val.toFixed(3)} <span className="text-slate-500 font-normal">g</span></span>
                      </div>
                      <div className="gauge-bar-track">
                        <div className="gauge-bar-fill" style={{ width: `${Math.min(100, ((val + 5) / 10) * 100)}%`, background: color }} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-1 flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>-5g</span><span>0</span><span>+5g</span>
                  </div>
                </div>

                {/* Gyroscope card */}
                <div className="cyber-card cyber-card-motion rounded-2xl border p-6 space-y-4">
                  <div className="flex items-center space-x-2 border-b border-cyber-border/40 pb-3">
                    <div className="p-2 bg-sky-500/10 rounded-lg border border-sky-500/20 shadow-glow-blue">
                      <Cpu className="w-4 h-4 text-sky-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold font-outfit text-white uppercase tracking-wide">Gyroscope</h3>
                      <p className="text-[10px] text-slate-500 font-mono">MPU6050 – Angular velocity (°/s)</p>
                    </div>
                  </div>
                  {[
                    { axis: 'Roll  (X)', val: gx, color: '#ef4444' },
                    { axis: 'Pitch (Y)', val: gy, color: '#38bdf8' },
                    { axis: 'Yaw   (Z)', val: gz, color: '#a78bfa' },
                  ].map(({ axis, val, color }) => (
                    <div key={axis} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono text-slate-400">{axis}</span>
                        <span className="font-bold font-mono text-white">{val.toFixed(2)} <span className="text-slate-500 font-normal">°/s</span></span>
                      </div>
                      <div className="gauge-bar-track">
                        <div className="gauge-bar-fill" style={{ width: `${Math.min(100, ((val + 250) / 500) * 100)}%`, background: color }} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-1 flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>-250°/s</span><span>0</span><span>+250°/s</span>
                  </div>
                </div>
              </div>

              {/* Motion statistics */}
              <div className="cyber-card p-5 rounded-2xl border border-cyber-border grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                {[
                  { label: 'Accel Magnitude', val: `${accelMag.toFixed(3)} g` },
                  { label: 'Gyro Magnitude', val: `${gyroMag.toFixed(2)} °/s` },
                  { label: 'Roll (X)', val: `${gx.toFixed(2)} °/s` },
                  { label: 'Pitch (Y)', val: `${gy.toFixed(2)} °/s` },
                ].map(stat => (
                  <div key={stat.label}>
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wide block">{stat.label}</span>
                    <span className="text-base font-bold font-mono text-slate-200 mt-0.5 block">{stat.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ CHARTS TAB ═════════════════════════════════════════════════════ */}
          {activeTab === 'charts' && (
            <div className="space-y-6">

              {/* Temperature + Pressure Area chart */}
              <div className="cyber-card p-6 rounded-2xl border border-cyber-border">
                <h3 className="font-outfit font-bold text-sm text-white uppercase tracking-wide mb-5">
                  Environmental Trends — Temperature & Pressure
                </h3>
                <div className="h-72">
                  {chartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">No history data yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gTemp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gPress" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="time" stroke="#475569" fontSize={9} interval="preserveStartEnd" />
                        <YAxis yAxisId="temp" stroke="#f97316" fontSize={9} width={38} />
                        <YAxis yAxisId="press" stroke="#38bdf8" fontSize={9} width={50} orientation="right" />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: 8, color: '#f8fafc', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Area yAxisId="temp" type="monotone" name="Temp (°C)" dataKey="temperature" stroke="#f97316" fill="url(#gTemp)" strokeWidth={2} dot={false} />
                        <Area yAxisId="press" type="monotone" name="Pressure (hPa)" dataKey="pressure" stroke="#38bdf8" fill="url(#gPress)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Altitude & Heart Rate Line chart */}
              <div className="cyber-card p-6 rounded-2xl border border-cyber-border">
                <h3 className="font-outfit font-bold text-sm text-white uppercase tracking-wide mb-5">
                  Altitude & Vitals — Heart Rate & SpO2
                </h3>
                <div className="h-64">
                  {chartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">No history data yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="time" stroke="#475569" fontSize={9} interval="preserveStartEnd" />
                        <YAxis yAxisId="alt" stroke="#34d399" fontSize={9} width={42} />
                        <YAxis yAxisId="hr" stroke="#ef4444" fontSize={9} width={36} orientation="right" />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: 8, color: '#f8fafc', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line yAxisId="alt" type="monotone" name="Altitude (m)" dataKey="altitude" stroke="#34d399" strokeWidth={2} dot={false} />
                        <Line yAxisId="hr" type="monotone" name="Heart Rate (bpm)" dataKey="heartRate" stroke="#ef4444" strokeWidth={2} dot={false} />
                        <Line yAxisId="hr" type="monotone" name="SpO2 (%)" dataKey="spo2" stroke="#22d3ee" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Accelerometer magnitude chart */}
              <div className="cyber-card p-6 rounded-2xl border border-cyber-border">
                <h3 className="font-outfit font-bold text-sm text-white uppercase tracking-wide mb-5">
                  Motion Intensity — Accelerometer Axes (g)
                </h3>
                <div className="h-56">
                  {chartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">No motion data yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData.map(d => ({
                        time: d.time,
                        ax: d.motion?.ax ?? 0,
                        ay: d.motion?.ay ?? 0,
                        az: d.motion?.az ?? 0,
                      }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="time" stroke="#475569" fontSize={9} interval="preserveStartEnd" />
                        <YAxis stroke="#475569" fontSize={9} width={38} domain={[-5, 5]} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: 8, color: '#f8fafc', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line type="monotone" name="aX (g)" dataKey="ax" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" name="aY (g)" dataKey="ay" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" name="aZ (g)" dataKey="az" stroke="#a78bfa" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
};
