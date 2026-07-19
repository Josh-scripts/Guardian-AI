import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import {
  Heart,
  Activity,
  Wind,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Eye,
  Thermometer,
  ShieldAlert as AlertIcon,
  Phone
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gwrftduiylxjsapdfsbh.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const ZERO_VITALS = { heartRate: 0, spo2: 0, ch4: 0, temp: 0, helmetRemoved: false, sos: false };

const getPacketTime = (timestamp: any): number => {
  if (!timestamp) return Date.now();
  if (typeof timestamp === 'number') {
    return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  }
  const parsed = Date.parse(timestamp);
  return isNaN(parsed) ? Date.now() : parsed;
};

export const LiveMonitoring: React.FC = () => {
  const { socket } = useSocket();
  const { token } = useAuth();
  
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInspection, setSelectedInspection] = useState<any>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const authToken = localStorage.getItem('guardian_token');

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const res = await fetch(`${API_URL}/api/workers`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          // Initialize worker vitals mapping to ZERO_VITALS by default
          setWorkers(data.map((w: any) => ({
            ...w,
            status: 'offline',
            lastSeen: null,
            vitals: ZERO_VITALS
          })));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkers();
  }, []);

  // Listen to Socket.io and Supabase Realtime telemetry updates
  useEffect(() => {
    const handleTelemetry = (packet: any) => {
      const isHelmetRemoved = packet.helmet_removed ?? packet.helmetRemoved ?? false;
      const isSos = packet.sos ?? false;
      const heartRateVal = packet.heart_rate ?? packet.heartRate ?? 0;
      const spo2Val = packet.spo2 ?? 0;
      const ch4Val = packet.gas?.ch4 ?? 0;
      const tempVal = packet.temperature ?? 0;

      setWorkers(prev => prev.map(w => {
        if (w.workerId === packet.workerId || w.workerId === packet.worker_id) {
          return {
            ...w,
            status: packet.workerStatus || 'safe',
            lastSeen: new Date(getPacketTime(packet.timestamp)),
            vitals: {
              heartRate: heartRateVal,
              spo2: spo2Val,
              ch4: ch4Val,
              temp: tempVal,
              helmetRemoved: isHelmetRemoved,
              sos: isSos,
              edgeInference: packet.edge_inference || packet.edgeInference
            }
          };
        }
        return w;
      }));
    };

    if (socket) {
      socket.on('telemetry_update', handleTelemetry);
    }

    // Subscribe to Supabase Realtime inserts for telemetry
    const channel = supabaseClient
      .channel('telemetry_live_monitoring')
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
      }
      supabaseClient.removeChannel(channel);
    };
  }, [socket]);

  // Periodic checker to mark offline and zero out workers if no telemetry in 10s
  useEffect(() => {
    const interval = setInterval(() => {
      setWorkers(prev => prev.map(w => {
        if (!w.lastSeen) return w;
        const diff = Date.now() - new Date(w.lastSeen).getTime();
        if (diff > 10000) {
          return {
            ...w,
            status: 'offline',
            vitals: ZERO_VITALS
          };
        }
        return w;
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyber-yellow"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-inter">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-cyber-card/30 border border-cyber-border/40 rounded-2xl">
        <div>
          <span className="text-[10px] text-cyber-yellow font-bold uppercase tracking-wider font-mono">Live Feeds</span>
          <h1 className="text-2xl font-extrabold text-white tracking-wide font-outfit mt-0.5">Worker Vitals Grid</h1>
          <p className="text-xs text-slate-400 mt-1">Real-time smart sensor array readings across all monitored helmets</p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workers.filter(w => w.role === 'worker').map(w => {
          const vitals = w.vitals;
          const isDanger = w.status === 'danger' || vitals.sos;
          const isWarning = w.status === 'warning';
          const isOffline = w.status === 'offline';

          const cardBorder = isDanger
            ? 'border-red-500 shadow-glow-danger'
            : isWarning
            ? 'border-amber-500 shadow-glow-warning'
            : isOffline
            ? 'border-slate-800'
            : 'border-cyber-border';

          const badgeColor = isDanger
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : isWarning
            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            : isOffline
            ? 'bg-slate-800 text-slate-500'
            : 'bg-green-500/10 text-green-400 border border-green-500/20';

          return (
            <div
              key={w.workerId}
              className={`cyber-card rounded-2xl border p-5 flex flex-col justify-between space-y-4 transition-all duration-300 ${cardBorder}`}
            >
              {/* Card Header */}
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-outfit font-bold text-base text-slate-200 tracking-wide">{w.name}</h3>
                  <span className="text-[10px] text-slate-500 font-mono block">ID: {w.workerId} | {w.department}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Signal Strength */}
                  {!isOffline && (
                    <Signal className="w-4 h-4 text-green-400" />
                  )}
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${badgeColor}`}>
                    {w.status}
                  </span>
                </div>
              </div>

              {/* Vitals Quadrant Grid */}
              <div className="grid grid-cols-3 gap-2 text-center bg-cyber-darker/60 p-3.5 rounded-xl border border-cyber-border/30">
                {/* Heart Rate */}
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">Heart</span>
                  <div className="flex items-center justify-center space-x-1">
                    <Heart className={`w-3.5 h-3.5 text-red-500 ${!isOffline && vitals.heartRate > 0 ? 'animate-pulse' : ''}`} />
                    <span className="font-mono text-sm font-bold text-slate-200">
                      {isOffline ? '0' : (vitals.heartRate ?? 0)}
                    </span>
                  </div>
                </div>

                {/* Oxygen */}
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">SpO2</span>
                  <div className="flex items-center justify-center space-x-1">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-mono text-sm font-bold text-slate-200">
                      {isOffline ? '0%' : `${vitals.spo2 ?? 0}%`}
                    </span>
                  </div>
                </div>

                {/* Combustible Gas */}
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">Gas LEL</span>
                  <div className="flex items-center justify-center space-x-1">
                    <Wind className="w-3.5 h-3.5 text-amber-500" />
                    <span className={`font-mono text-sm font-bold ${!isOffline && vitals.ch4 > 10 ? 'text-red-400' : 'text-slate-200'}`}>
                      {isOffline ? '0%' : `${vitals.ch4 ?? 0}%`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Auxiliary Sensor Info (Amb Temperature, Helmet removal status) */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span className="flex items-center">
                  <Thermometer className="w-3.5 h-3.5 text-orange-400 mr-1" />
                  {isOffline ? '0°C' : `${vitals.temp ?? 0}°C`}
                </span>
                <span>
                  {isOffline ? 'Offline' : vitals.helmetRemoved ? 'REMOVED' : 'ON-HEAD'}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-cyber-border/40 flex items-center space-x-2">
                <button
                  onClick={() => {
                    setSelectedInspection(w);
                  }}
                  className="flex-1 py-2 bg-slate-800 hover:bg-cyber-yellow hover:text-black border border-cyber-border rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center space-x-1 text-slate-300"
                >
                  <Eye className="w-4 h-4" />
                  <span>Inspect Vitals</span>
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Selected Inspection Panel Modal overlay */}
      {selectedInspection && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-cyber-card border border-cyber-border rounded-2xl shadow-2xl p-6 relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-[3px] ${
              selectedInspection.status === 'danger' ? 'bg-red-500' :
              selectedInspection.status === 'warning' ? 'bg-amber-500' : 'bg-green-500'
            }`}></div>

            <div className="flex justify-between items-start border-b border-cyber-border pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold font-outfit text-white">{selectedInspection.name}</h3>
                <p className="text-xs text-slate-400">Worker Node: {selectedInspection.workerId}</p>
              </div>
              <button
                onClick={() => setSelectedInspection(null)}
                className="text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {/* Vitals details */}
            <div className="space-y-4">
              <div className="bg-cyber-darker p-4 rounded-xl border border-cyber-border/30 space-y-2">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Emergency Call Info</h4>
                <div className="text-xs text-slate-400 space-y-1.5 font-medium">
                  <div className="flex justify-between">
                    <span>Contact Name:</span>
                    <span className="text-slate-200">{selectedInspection.emergencyContact?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Relationship:</span>
                    <span className="text-slate-200">{selectedInspection.emergencyContact?.relationship}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Phone Number:</span>
                    <span className="text-cyber-yellow font-mono">{selectedInspection.emergencyContact?.phone}</span>
                  </div>
                </div>
              </div>

              {/* Edge AI flags (if any active) */}
              {selectedInspection.vitals?.edgeInference?.flags?.length > 0 && (
                <div className="border border-red-500/20 bg-red-500/5 p-4 rounded-xl space-y-2">
                  <div className="text-[10px] text-slate-500 font-mono uppercase">Edge AI Active Flags</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedInspection.vitals.edgeInference.flags.map((f: string) => (
                      <span key={f} className="text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase">
                        {f.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-400">
                    Risk Score: <span className="font-mono font-bold text-cyber-yellow">{selectedInspection.vitals.edgeInference.riskScore?.toFixed(3)}</span>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  alert(`Voice intercom channel established to Worker ${selectedInspection.workerId}`);
                }}
                className="w-full py-2.5 bg-cyber-yellow text-black hover:bg-yellow-400 rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center space-x-1"
              >
                <Phone className="w-4 h-4" />
                <span>Establish Voice Connection</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
