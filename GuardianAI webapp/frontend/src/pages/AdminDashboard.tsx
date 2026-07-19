import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { AICommandCenter } from '../components/AICommandCenter';
import {
  Users,
  AlertTriangle,
  Activity,
  Search,
  Filter,
  CheckCircle,
  Eye,
  Heart,
  TrendingUp,
  MapPin,
  Clock,
  Zap,
  Bell,
  BellRing,
  X,
  Radio,
  History,
  Thermometer
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gwrftduiylxjsapdfsbh.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const normaliseTelemetry = (t: any) => {
  return {
    _id: t.id,
    helmetId: t.helmet_id || t.helmetId,
    workerId: t.worker_id || t.workerId,
    timestamp: t.timestamp,
    temperature: t.temperature ?? 0,
    humidity: t.humidity ?? 0,
    pressure: t.pressure ?? 0,
    altitude: t.altitude ?? 0,
    heartRate: t.heart_rate ?? t.heartRate ?? 0,
    spo2: t.spo2 ?? 0,
    gas: t.gas || { ch4: 0, co: 0, h2s: 0, o2: 0 },
    motion: t.motion || { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 },
    battery: t.battery ?? 0,
    gps: t.gps || { lat: 13.0827, lng: 80.2707, fix: false },
    helmetRemoved: t.helmet_removed ?? t.helmetRemoved ?? false,
    sos: t.sos ?? false,
    edgeInference: t.edge_inference || t.edgeInference || { riskScore: 0, flags: [], latencyMs: 0 },
    cloudInference: t.cloud_inference || t.cloudInference,
    status: t.workerStatus || t.worker_status || t.status || 'safe',
    createdAt: t.created_at || t.createdAt
  };
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface BuzzerLogEntry {
  id: string;
  target: 'all' | 'specific';
  workerName?: string;
  workerId?: string;
  sentBy: string;
  timestamp: Date;
}

interface ConfirmModal {
  open: boolean;
  target: 'all' | 'specific';
  worker?: { workerId: string; name: string };
}

// ─── Toast Component ──────────────────────────────────────────────────────────
const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed top-6 right-6 z-[200] flex items-center space-x-3 px-5 py-3.5
                    bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl shadow-2xl
                    border border-red-400/50 animate-slide-in-right">
      <BellRing className="w-5 h-5 shrink-0 animate-pulse" />
      <span className="text-sm font-semibold">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70 transition-opacity">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// ─── Confirmation Modal ───────────────────────────────────────────────────────
const ConfirmBuzzerModal: React.FC<{
  modal: ConfirmModal;
  onConfirm: () => void;
  onCancel: () => void;
  sending: boolean;
}> = ({ modal, onConfirm, onCancel, sending }) => {
  if (!modal.open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-red-500/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl
                      shadow-red-500/20 relative overflow-hidden">
        {/* Red top accent */}
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-600 via-orange-500 to-red-600" />

        <div className="flex flex-col items-center text-center space-y-4">
          {/* Pulsing icon */}
          <div className="relative">
            <div className="absolute inset-0 bg-red-500/30 rounded-full animate-ping" />
            <div className="relative p-4 bg-red-500/15 border border-red-500/30 rounded-full">
              <BellRing className="w-7 h-7 text-red-400" />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-white font-outfit">Confirm Buzzer Alert</h3>
            {modal.target === 'all' ? (
              <p className="text-sm text-slate-400 mt-1.5">
                This will trigger an <span className="text-red-400 font-semibold">emergency buzzer</span> on
                <span className="text-white font-bold"> ALL connected helmets</span>.
              </p>
            ) : (
              <p className="text-sm text-slate-400 mt-1.5">
                This will trigger a buzzer alert on{' '}
                <span className="text-white font-bold">{modal.worker?.name}</span>'s helmet
                ({modal.worker?.workerId}).
              </p>
            )}
          </div>

          <div className="flex w-full space-x-3 pt-2">
            <button
              onClick={onCancel}
              disabled={sending}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-cyber-border
                         rounded-xl text-sm text-slate-300 font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={sending}
              className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-red-500
                         hover:from-red-500 hover:to-orange-500 rounded-xl text-sm text-white
                         font-bold uppercase tracking-wider transition-all flex items-center
                         justify-center space-x-2 disabled:opacity-60"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  <span>{modal.target === 'all' ? 'Alert All' : 'Send Alert'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();

  // Summary Metrics States
  const [summary, setSummary] = useState<any>({
    workers: { total: 0, online: 0, offline: 0, danger: 0, warning: 0 },
    alerts: { activeSOS: 0, activeTotal: 0 },
    vitals: { avgHeartRate: 75, avgSpO2: 98 }
  });

  // Table Data
  const [workersList, setWorkersList] = useState<any[]>([]);
  const [alertsFeed, setAlertsFeed] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Selected worker details (drawer)
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [selectedHistory, setSelectedHistory] = useState<any[]>([]);

  // Live atmosphere tracker: highest CH4 across active workers
  const [liveAtmosphere, setLiveAtmosphere] = useState<{
    ch4: number; temp: number; pressure: number; status: 'NOMINAL' | 'WARNING' | 'CRITICAL'
  }>({ ch4: 0, temp: 32.4, pressure: 1008.2, status: 'NOMINAL' });

  // ── Buzzer state ────────────────────────────────────────────────────────────
  const [buzzerLog, setBuzzerLog] = useState<BuzzerLogEntry[]>([]);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>({ open: false, target: 'all' });
  const [buzzerSending, setBuzzerSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showAlertHistory, setShowAlertHistory] = useState(false);

  const token = localStorage.getItem('guardian_token');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const sumRes = await fetch(`${API_URL}/api/analytics/dashboard-summary`, { headers });
        if (sumRes.ok) setSummary(await sumRes.json());
        const workRes = await fetch(`${API_URL}/api/workers`, { headers });
        if (workRes.ok) setWorkersList(await workRes.json());
        const alertRes = await fetch(`${API_URL}/api/alerts?status=active`, { headers });
        if (alertRes.ok) setAlertsFeed(await alertRes.json());
      } catch (err) {
        console.error('Error fetching dashboard datasets', err);
      }
    };
    fetchDashboardData();
  }, []);

  // Socket and Supabase Realtime updates
  useEffect(() => {
    const handleTelemetry = (packet: any) => {
      const normalised = normaliseTelemetry(packet);
      setWorkersList(prev => prev.map(w => {
        if (w.workerId === normalised.workerId) {
          return {
            ...w,
            status: packet.workerStatus || normalised.status || 'safe',
            lastSeen: new Date(),
            vitals: { heartRate: normalised.heartRate, spo2: normalised.spo2, ch4: normalised.gas?.ch4 ?? 0 }
          };
        }
        return w;
      }));

      setLiveAtmosphere(prev => {
        const newCh4 = Math.max(prev.ch4, normalised.gas?.ch4 ?? 0);
        return {
          ch4: newCh4,
          temp: normalised.temperature ?? prev.temp,
          pressure: normalised.pressure ?? prev.pressure,
          status: newCh4 > 10 ? 'CRITICAL' : newCh4 > 5 ? 'WARNING' : 'NOMINAL'
        };
      });

      setSelectedWorker((current: any) => {
        if (current && current.workerId === normalised.workerId) {
          setSelectedHistory((prev: any[]) => {
            const updated = [...prev, normalised];
            if (updated.length > 20) updated.shift();
            return updated;
          });
          return {
            ...current,
            status: packet.workerStatus || normalised.status || 'safe',
            vitals: { heartRate: normalised.heartRate, spo2: normalised.spo2, ch4: normalised.gas?.ch4 ?? 0 }
          };
        }
        return current;
      });

      setSummary((prev: any) => {
        const list = workersList;
        const onlineCount = list.filter(w => w.status !== 'offline').length;
        const dangerCount = list.filter(w => w.status === 'danger').length;
        const warningCount = list.filter(w => w.status === 'warning').length;
        return {
          ...prev,
          workers: { total: list.length, online: onlineCount, offline: list.length - onlineCount, danger: dangerCount, warning: warningCount }
        };
      });
    };

    const handleNewAlert = (alert: any) => {
      setAlertsFeed(prev => [alert, ...prev].slice(0, 15));
      fetchSummaryOnly();
    };

    const handleAlertUpdated = (updatedAlert: any) => {
      if (updatedAlert.status === 'resolved') {
        setAlertsFeed(prev => prev.filter(a => a._id !== updatedAlert._id));
      } else {
        setAlertsFeed(prev => prev.map(a => a._id === updatedAlert._id ? updatedAlert : a));
      }
      fetchSummaryOnly();
    };

    if (socket) {
      socket.on('telemetry_update', handleTelemetry);
      socket.on('new_alert', handleNewAlert);
      socket.on('alert_updated', handleAlertUpdated);
    }

    // Supabase Realtime subscription for all telemetry
    const channel = supabaseClient
      .channel('telemetry_all')
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
        socket.off('new_alert', handleNewAlert);
        socket.off('alert_updated', handleAlertUpdated);
      }
      supabaseClient.removeChannel(channel);
    };
  }, [socket, workersList]);

  // Periodic staleness checker for the admin dashboard list
  useEffect(() => {
    const t = setInterval(() => {
      setWorkersList(prev => prev.map(w => {
        if (!w.lastSeen) {
          return {
            ...w,
            vitals: w.vitals || { heartRate: 0, spo2: 0, ch4: 0 }
          };
        }
        const diff = Date.now() - new Date(w.lastSeen).getTime();
        if (diff > 10000) {
          return {
            ...w,
            status: 'offline',
            vitals: { heartRate: 0, spo2: 0, ch4: 0 }
          };
        }
        return w;
      }));
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const fetchSummaryOnly = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const sumRes = await fetch(`${API_URL}/api/analytics/dashboard-summary`, { headers });
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch (e) { console.warn(e); }
  };

  const handleAcknowledgeAlert = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/alerts/${id}/acknowledge`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setAlertsFeed(prev => prev.filter(a => a._id !== id));
    } catch (e) { console.error(e); }
  };

  const selectWorkerForDetail = async (worker: any) => {
    setSelectedWorker(worker);
    setSelectedHistory([]);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${API_URL}/api/telemetry/history/${worker.workerId}?limit=20`, { headers });
      if (res.ok) setSelectedHistory(await res.json());
    } catch (err) { console.error(err); }
  };

  // ── Buzzer handlers ─────────────────────────────────────────────────────────
  const openBuzzerAll = () => {
    setConfirmModal({ open: true, target: 'all' });
  };

  const openBuzzerWorker = (worker: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({ open: true, target: 'specific', worker: { workerId: worker.workerId, name: worker.name } });
  };

  const sendBuzzerAlert = async () => {
    setBuzzerSending(true);
    const { target, worker } = confirmModal;
    try {
      const res = await fetch(`${API_URL}/api/alerts/buzzer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          target,
          workerId: worker?.workerId,
          workerName: worker?.name
        })
      });

      if (res.ok) {
        const entry: BuzzerLogEntry = {
          id: Date.now().toString(),
          target,
          workerName: worker?.name,
          workerId: worker?.workerId,
          sentBy: user?.name || 'Admin',
          timestamp: new Date()
        };
        setBuzzerLog(prev => [entry, ...prev].slice(0, 20));
        setToast(
          target === 'all'
            ? '🔔 Buzzer alert sent to ALL workers!'
            : `🔔 Buzzer alert sent to ${worker?.name}!`
        );
      } else {
        setToast('⚠️ Failed to send alert. Check connection.');
      }
    } catch (err) {
      setToast('⚠️ Network error while sending alert.');
    } finally {
      setBuzzerSending(false);
      setConfirmModal({ open: false, target: 'all' });
    }
  };

  const filteredWorkers = workersList.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          w.workerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          w.department.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || w.status === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-inter">

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Confirm Modal */}
      <ConfirmBuzzerModal
        modal={confirmModal}
        onConfirm={sendBuzzerAlert}
        onCancel={() => setConfirmModal({ open: false, target: 'all' })}
        sending={buzzerSending}
      />

      {/* Welcome Banner + Alert All Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6
                      bg-cyber-card/30 border border-cyber-border/40 rounded-2xl">
        <div>
          <span className="text-[10px] text-cyber-yellow font-bold uppercase tracking-wider font-mono">
            Supervisor Portal
          </span>
          <h1 className="text-2xl font-extrabold text-white tracking-wide font-outfit mt-0.5">
            Safety Operations Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Site command panel | Logged in as:{' '}
            <span className="text-slate-300 font-semibold">{user?.name} ({user?.department})</span>
          </p>
        </div>

        {/* Broadcast alert button + history toggle */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowAlertHistory(v => !v)}
            className={`flex items-center space-x-2 px-3 py-2.5 rounded-xl border text-xs font-semibold
                       transition-all ${showAlertHistory
                         ? 'bg-slate-700 border-slate-600 text-slate-200'
                         : 'bg-slate-800/60 border-cyber-border text-slate-400 hover:border-slate-500 hover:text-slate-300'}`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Alert Log ({buzzerLog.length})</span>
          </button>

          <button
            id="btn-alert-all"
            onClick={openBuzzerAll}
            className="relative flex items-center space-x-2.5 px-5 py-2.5 rounded-xl font-bold text-sm
                       bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-orange-500
                       text-white border border-red-500/50 shadow-lg shadow-red-500/30
                       transition-all hover:shadow-red-500/50 hover:scale-105 active:scale-100
                       uppercase tracking-wider"
          >
            {/* Pulse ring */}
            <span className="absolute -inset-px rounded-xl border border-red-500/40 animate-ping opacity-30 pointer-events-none" />
            <BellRing className="w-5 h-5 shrink-0" />
            <span>Alert All Workers</span>
          </button>
        </div>
      </div>

      {/* Alert History Panel */}
      {showAlertHistory && (
        <div className="cyber-card p-5 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Radio className="w-4 h-4 text-red-400" />
              <h3 className="font-outfit font-bold text-sm text-white uppercase tracking-wide">
                Buzzer Alert History
              </h3>
            </div>
            <button
              onClick={() => setBuzzerLog([])}
              className="text-[10px] text-slate-500 hover:text-red-400 font-mono uppercase tracking-wider transition-colors"
            >
              Clear
            </button>
          </div>

          {buzzerLog.length === 0 ? (
            <p className="text-xs text-slate-500 italic text-center py-4">No alerts sent this session.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {buzzerLog.map(entry => (
                <div key={entry.id}
                     className="flex items-center justify-between p-3 bg-slate-800/60 border
                                border-cyber-border/30 rounded-lg text-xs">
                  <div className="flex items-center space-x-2.5">
                    <div className={`p-1.5 rounded-lg border ${
                      entry.target === 'all'
                        ? 'bg-red-500/15 border-red-500/30 text-red-400'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    }`}>
                      <Bell className="w-3 h-3" />
                    </div>
                    <div>
                      <span className="font-semibold text-slate-200">
                        {entry.target === 'all' ? 'Broadcast — All Workers' : entry.workerName}
                      </span>
                      {entry.target === 'specific' && (
                        <span className="ml-1.5 text-slate-500 font-mono">({entry.workerId})</span>
                      )}
                      <span className="block text-[10px] text-slate-500">Sent by: {entry.sentBy}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                    {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* KPI 1: Active Alerts */}
        <div className="cyber-card p-4 rounded-xl border border-cyber-border flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Threat Indicators</span>
            <span className="text-2xl font-extrabold font-outfit text-red-500 mt-1 block">
              {summary.alerts.activeTotal}
            </span>
            <span className="text-[10px] text-slate-400">{summary.alerts.activeSOS} SOS triggers</span>
          </div>
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg shadow-glow-danger animate-pulse-fast">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Workers Online */}
        <div className="cyber-card p-4 rounded-xl border border-cyber-border flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Active Workers</span>
            <span className="text-2xl font-extrabold font-outfit text-cyber-yellow mt-1 block">
              {summary.workers.online} <span className="text-xs font-normal text-slate-400">/ {summary.workers.total}</span>
            </span>
            <span className="text-[10px] text-slate-400">{summary.workers.offline} offline</span>
          </div>
          <div className="p-3 bg-cyber-yellow/10 border border-cyber-yellow/20 text-cyber-yellow rounded-lg shadow-glow-yellow">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3: Temperature */}
        <div className={`cyber-card p-4 rounded-xl border flex items-center justify-between transition-all ${
          liveAtmosphere.status === 'CRITICAL' ? 'border-red-500/40 shadow-glow-danger' :
          liveAtmosphere.status === 'WARNING'  ? 'border-amber-500/40' : 'border-cyber-border'
        }`}>
          <div>
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Temperature</span>
            <span className={`text-2xl font-extrabold font-outfit mt-1 block ${
              liveAtmosphere.status === 'CRITICAL' ? 'text-red-400' :
              liveAtmosphere.status === 'WARNING'  ? 'text-amber-400' : 'text-green-400'
            }`}>
              {liveAtmosphere.temp.toFixed(1)}°C
            </span>
            <span className="text-[10px] text-slate-400">
              CH4: {liveAtmosphere.ch4.toFixed(1)}% LEL &nbsp;|&nbsp; Status: {liveAtmosphere.status}
            </span>
          </div>
          <div className={`p-3 rounded-lg border ${
            liveAtmosphere.status === 'CRITICAL' ? 'bg-red-500/10 border-red-500/20 text-red-400 shadow-glow-danger' :
            liveAtmosphere.status === 'WARNING'  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
            'bg-green-500/10 border-green-500/20 text-green-400 shadow-glow-success'
          }`}>
            <Thermometer className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── AI Command Center ── */}
      <AICommandCenter
        workersList={workersList}
        alertsFeed={alertsFeed}
        liveAtmosphere={liveAtmosphere}
        summary={summary}
        onBuzzerAll={openBuzzerAll}
        onBuzzerWorker={(worker) =>
          setConfirmModal({ open: true, target: 'specific', worker })
        }
      />

      {/* Main Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Side: Worker Directory */}
        <div className="lg:col-span-2 space-y-4">
          <div className="cyber-card p-6 rounded-2xl border border-cyber-border space-y-4">

            {/* Search Controls */}
            <div className="flex flex-col sm:flex-row justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search workers, IDs, or departments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-cyber-darker border border-cyber-border rounded-lg pl-10 pr-4 py-2
                             text-sm text-white placeholder-slate-500 focus:outline-none
                             focus:border-cyber-yellow transition-colors"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-cyber-darker border border-cyber-border rounded-lg px-3 py-2
                             text-xs text-slate-300 focus:outline-none focus:border-cyber-yellow transition-colors"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SAFE">Safe</option>
                  <option value="WARNING">Warning</option>
                  <option value="DANGER">Danger</option>
                  <option value="OFFLINE">Offline</option>
                </select>
              </div>
            </div>

            {/* Workers Directory Table */}
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-cyber-border text-slate-400 uppercase font-mono tracking-wider">
                    <th className="pb-3 pt-1">Worker</th>
                    <th className="pb-3 pt-1">Employee ID</th>
                    <th className="pb-3 pt-1">Department</th>
                    <th className="pb-3 pt-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyber-border/40 font-medium">
                  {filteredWorkers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-10 text-slate-500 italic">
                        No telemetry nodes found.
                      </td>
                    </tr>
                  ) : (
                    filteredWorkers.map(w => (
                      <tr key={w.workerId} className="hover:bg-slate-800/25 transition-colors group">
                        <td className="py-4">
                          <span className="font-outfit font-bold text-sm text-slate-200">{w.name}</span>
                        </td>
                        <td className="py-4 font-mono text-slate-400">{w.workerId}</td>
                        <td className="py-4 text-slate-300">{w.department}</td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            {/* Per-worker buzzer button */}
                            <button
                              id={`btn-buzzer-${w.workerId}`}
                              onClick={(e) => openBuzzerWorker(w, e)}
                              title={`Alert ${w.name}`}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400
                                         hover:text-red-300 rounded border border-red-500/20
                                         hover:border-red-500/50 transition-all flex items-center
                                         space-x-1 opacity-60 group-hover:opacity-100"
                            >
                              <Bell className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-semibold hidden sm:inline">Buzz</span>
                            </button>

                            {/* Inspect button */}
                            <button
                              onClick={() => selectWorkerForDetail(w)}
                              className="p-1.5 bg-slate-800/80 hover:bg-cyber-yellow/20
                                         hover:text-cyber-yellow text-slate-400 rounded border
                                         border-cyber-border transition-all flex items-center space-x-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-semibold">Inspect</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Active Site Alerts Feed */}
        <div className="space-y-4">
          <div className="cyber-card p-6 rounded-2xl border border-cyber-border flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-cyber-border/40 pb-4 mb-4">
                <h3 className="font-outfit font-bold text-sm uppercase tracking-wider text-white">
                  Active Site Alerts
                </h3>
                <span className="px-2 py-0.5 bg-red-500/15 text-red-400 text-[10px] font-bold rounded-full font-mono uppercase">
                  UNRESOLVED
                </span>
              </div>

              <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                {alertsFeed.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs italic">
                    <CheckCircle className="w-8 h-8 text-green-500/50 mx-auto mb-2" />
                    Zero safety violations active.
                  </div>
                ) : (
                  alertsFeed.map(alert => (
                    <div
                      key={alert._id}
                      className={`p-3.5 border rounded-xl space-y-2 relative transition-all ${
                        alert.severity === 'critical'
                          ? 'bg-red-500/5 border-red-500/25 hover:border-red-500/50 shadow-glow-danger'
                          : 'bg-amber-500/5 border-amber-500/25 hover:border-amber-500/50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase ${
                            alert.severity === 'critical' ? 'bg-red-500/25 text-red-400' : 'bg-amber-500/25 text-amber-400'
                          }`}>
                            {alert.type.replace('_', ' ')}
                          </span>
                          <h4 className="text-xs font-bold text-white mt-1">{alert.workerName}</h4>
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono">
                          {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{alert.message}</p>
                      <button
                        onClick={() => handleAcknowledgeAlert(alert._id)}
                        className="w-full mt-2.5 py-1.5 bg-slate-800 hover:bg-cyber-yellow hover:text-black
                                   border border-cyber-border rounded text-[10px] font-bold uppercase
                                   transition-all flex items-center justify-center space-x-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Acknowledge Hazard</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Worker Detail Drawer */}
      {selectedWorker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end transition-opacity duration-300">
          <div className="w-full max-w-lg bg-cyber-card border-l border-cyber-border h-full flex flex-col shadow-2xl p-6 overflow-y-auto">

            {/* Drawer Header */}
            <div className="flex justify-between items-start border-b border-cyber-border pb-4 mb-6">
              <div>
                <span className="text-[10px] text-cyber-yellow font-bold uppercase tracking-wider font-mono">
                  Telemetry Inspection Card
                </span>
                <h2 className="text-xl font-bold font-outfit text-white mt-0.5">{selectedWorker.name}</h2>
                <p className="text-xs text-slate-400">ID: {selectedWorker.workerId} | Department: {selectedWorker.department}</p>
              </div>
              <button
                onClick={() => setSelectedWorker(null)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                Close Panel
              </button>
            </div>

            {/* Drawer Content */}
            <div className="space-y-6 flex-1">

              {/* Emergency Contacts */}
              <div className="bg-cyber-darker p-4 rounded-xl border border-cyber-border/40 space-y-2">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Emergency Contact Info</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-mono">Contact Name</span>
                    <span className="text-slate-200 font-bold">{selectedWorker.emergencyContact?.name}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-mono">Relationship</span>
                    <span className="text-slate-200 font-bold">{selectedWorker.emergencyContact?.relationship}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[10px] text-slate-500 uppercase font-mono">Phone Number</span>
                    <span className="text-cyber-yellow font-bold font-mono">{selectedWorker.emergencyContact?.phone}</span>
                  </div>
                </div>
              </div>

              {/* Vitals Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/40 p-3 rounded-lg border border-cyber-border/20 text-center">
                  <Heart className="w-4 h-4 text-red-400 mx-auto mb-1 animate-pulse" />
                  <span className="block text-[9px] text-slate-500 uppercase font-mono">Heart Rate</span>
                  <span className="text-lg font-bold font-mono text-slate-200">
                    {selectedWorker.vitals?.heartRate ?? 0} bpm
                  </span>
                </div>
                <div className="bg-slate-800/40 p-3 rounded-lg border border-cyber-border/20 text-center">
                  <Activity className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                  <span className="block text-[9px] text-slate-500 uppercase font-mono">SpO2 Oxygen</span>
                  <span className="text-lg font-bold font-mono text-slate-200">
                    {selectedWorker.vitals?.spo2 ?? 0}%
                  </span>
                </div>
                <div className="bg-slate-800/40 p-3 rounded-lg border border-cyber-border/20 text-center">
                  <Zap className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                  <span className="block text-[9px] text-slate-500 uppercase font-mono">Gas CH4</span>
                  <span className="text-lg font-bold font-mono text-slate-200">
                    {selectedWorker.vitals?.ch4 ?? 0}% LEL
                  </span>
                </div>
              </div>

              {/* Environmental sensor row */}
              {selectedHistory.length > 0 && (() => {
                const last = selectedHistory[selectedHistory.length - 1];
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-sky-500/5 p-3 rounded-lg border border-sky-500/20 text-center">
                      <span className="block text-[9px] text-slate-500 uppercase font-mono">Temperature</span>
                      <span className="text-base font-bold font-mono text-sky-300">{last.temperature?.toFixed(1) ?? '--'}°C</span>
                    </div>
                    <div className="bg-sky-500/5 p-3 rounded-lg border border-sky-500/20 text-center">
                      <span className="block text-[9px] text-slate-500 uppercase font-mono">Pressure</span>
                      <span className="text-base font-bold font-mono text-sky-300">{last.pressure?.toFixed(1) ?? '--'} hPa</span>
                    </div>
                    <div className="bg-sky-500/5 p-3 rounded-lg border border-sky-500/20 text-center">
                      <span className="block text-[9px] text-slate-500 uppercase font-mono">Altitude</span>
                      <span className="text-base font-bold font-mono text-sky-300">{last.altitude?.toFixed(1) ?? '--'} m</span>
                    </div>
                  </div>
                );
              })()}

              {/* Sparkline chart */}
              <div className="bg-cyber-darker p-4 rounded-xl border border-cyber-border/40">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide flex items-center">
                    <TrendingUp className="w-3.5 h-3.5 text-cyber-yellow mr-1" />
                    Heart Rate Trend Log
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">Last 20 ticks</span>
                </div>
                <div className="h-40">
                  {selectedHistory.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500 italic">
                      Gathering active telemetry records...
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedHistory}>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#1E293B' }}
                          labelFormatter={(l) => new Date(l).toLocaleTimeString()}
                        />
                        <Line type="monotone" name="Pulse" dataKey="heartRate" stroke="#ef4444" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => {
                    setSelectedWorker(null);
                    openBuzzerWorker(selectedWorker, { stopPropagation: () => {} } as any);
                  }}
                  className="flex-1 py-2.5 bg-gradient-to-r from-red-700 to-red-600
                             hover:from-red-600 hover:to-red-500 text-white rounded-lg text-xs
                             font-bold uppercase transition-all flex items-center justify-center space-x-1.5 border border-red-500/30"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Send Buzzer Alert</span>
                </button>
                <button
                  onClick={() => alert(`Intercom call initiated to Worker ${selectedWorker.workerId}`)}
                  className="flex-1 py-2.5 bg-cyber-yellow text-black hover:bg-yellow-400
                             rounded-lg text-xs font-bold uppercase transition-all"
                >
                  Initiate Intercom Call
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
