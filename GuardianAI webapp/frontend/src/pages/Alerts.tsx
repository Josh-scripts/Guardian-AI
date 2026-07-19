import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  Bell,
  Check,
  RotateCcw,
  AlertOctagon,
  Shield,
  FileText,
  User,
  Clock,
  MapPin,
  Filter
} from 'lucide-react';

export const Alerts: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter variables
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // Resolve modal state
  const [resolvingAlert, setResolvingAlert] = useState<any>(null);
  const [resolveActionNotes, setResolveActionNotes] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const authToken = localStorage.getItem('guardian_token');
  const isAdmin = user?.role === 'admin';

  const fetchAlerts = async () => {
    try {
      let url = `${API_URL}/api/alerts`;
      if (statusFilter !== 'ALL') {
        url += `?status=${statusFilter.toLowerCase()}`;
      }
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        let data = await res.json();
        if (severityFilter !== 'ALL') {
          data = data.filter((a: any) => a.severity === severityFilter.toLowerCase());
        }
        setAlerts(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter, severityFilter]);

  // Hook alerts in real time over sockets
  useEffect(() => {
    if (!socket) return;

    const handleNewAlert = (alert: any) => {
      // Add if matching filters
      setAlerts(prev => {
        const matchesStatus = statusFilter === 'ALL' || alert.status === statusFilter.toLowerCase();
        const matchesSeverity = severityFilter === 'ALL' || alert.severity === severityFilter.toLowerCase();
        
        if (matchesStatus && matchesSeverity) {
          return [alert, ...prev];
        }
        return prev;
      });
    };

    const handleAlertUpdated = (updatedAlert: any) => {
      setAlerts(prev => prev.map(a => a._id === updatedAlert._id ? updatedAlert : a));
    };

    socket.on('new_alert', handleNewAlert);
    socket.on('alert_updated', handleAlertUpdated);

    return () => {
      socket.off('new_alert', handleNewAlert);
      socket.off('alert_updated', handleAlertUpdated);
    };
  }, [socket, statusFilter, severityFilter]);

  const handleAcknowledge = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/alerts/${id}/acknowledge`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        fetchAlerts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const submitResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingAlert || !resolveActionNotes) return;

    try {
      const res = await fetch(`${API_URL}/api/alerts/${resolvingAlert._id}/resolve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ actionTaken: resolveActionNotes })
      });

      if (res.ok) {
        setResolvingAlert(null);
        setResolveActionNotes('');
        fetchAlerts();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-inter">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-cyber-card/30 border border-cyber-border/40 rounded-2xl">
        <div>
          <span className="text-[10px] text-cyber-yellow font-bold uppercase tracking-wider font-mono">Incident Control</span>
          <h1 className="text-2xl font-extrabold text-white tracking-wide font-outfit mt-0.5">Threat Board Feed</h1>
          <p className="text-xs text-slate-400 mt-1">Audit active emergency calls, vital drops, and resolve worker hazard conditions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-cyber-card p-4 rounded-xl border border-cyber-border text-xs font-semibold">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300">Filter Board:</span>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-cyber-darker border border-cyber-border rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-cyber-yellow"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active Hazards</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="RESOLVED">Resolved / Cleared</option>
        </select>

        {/* Severity Filter */}
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-cyber-darker border border-cyber-border rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-cyber-yellow"
        >
          <option value="ALL">All Severities</option>
          <option value="CRITICAL">Critical Alarms</option>
          <option value="WARNING">Warnings</option>
        </select>
      </div>

      {/* Main Alert List Cards */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyber-yellow mx-auto"></div>
          </div>
        ) : alerts.length === 0 ? (
          <div className="cyber-card p-12 text-center text-slate-500 italic rounded-2xl border border-cyber-border">
            <Check className="w-10 h-10 text-green-500 mx-auto mb-2 opacity-50" />
            No incidents match active filtering criteria.
          </div>
        ) : (
          alerts.map(a => {
            const isCritical = a.severity === 'critical';
            const isResolved = a.status === 'resolved';
            const isAcknowledged = a.status === 'acknowledged';

            const cardBorder = isResolved
              ? 'border-cyber-border/40 opacity-70'
              : isCritical
              ? 'border-red-500/50 shadow-glow-danger'
              : 'border-amber-500/50 shadow-glow-warning';

            return (
              <div
                key={a._id}
                className={`cyber-card p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-300 ${cardBorder}`}
              >
                {/* Left side: details */}
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isCritical
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {a.type.replace('_', ' ')}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isResolved
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : isAcknowledged
                        ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse'
                    }`}>
                      {a.status}
                    </span>
                    <span className="text-xs text-slate-500 font-mono flex items-center">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      {new Date(a.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-outfit font-bold text-base text-slate-200">{a.workerName} ({a.workerId})</h3>
                    <p className="text-sm text-slate-400 mt-1">{a.message}</p>
                  </div>

                  {/* Actions metadata */}
                  {(isAcknowledged || isResolved) && (
                    <div className="text-xs bg-cyber-darker p-3 rounded-lg border border-cyber-border/30 space-y-1">
                      <div className="flex items-center text-slate-400">
                        <User className="w-3.5 h-3.5 text-cyber-yellow mr-1" />
                        <span className="font-semibold text-slate-300">Action supervisor:</span>
                        <span className="ml-1 text-white">{a.assignedSupervisor}</span>
                      </div>
                      <div className="flex items-start text-slate-400">
                        <FileText className="w-3.5 h-3.5 text-cyber-yellow mr-1 mt-0.5" />
                        <div>
                          <span className="font-semibold text-slate-300">Operations notes:</span>
                          <p className="text-slate-200 font-mono mt-0.5 leading-relaxed">{a.actionTaken}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right side: Location coordinates & action buttons */}
                <div className="flex flex-col space-y-3 justify-center md:items-end flex-shrink-0">
                  <div className="flex items-center space-x-1 text-xs text-slate-400 font-mono">
                    <MapPin className="w-4 h-4 text-cyber-yellow" />
                    <span>Location Tracked</span>
                  </div>

                  {/* Acknowledge resolves button group */}
                  {isAdmin && !isResolved && (
                    <div className="flex items-center space-x-2">
                      {!isAcknowledged && (
                        <button
                          onClick={() => handleAcknowledge(a._id)}
                          className="px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-bold uppercase transition-all flex items-center space-x-1"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Acknowledge</span>
                        </button>
                      )}
                      <button
                        onClick={() => setResolvingAlert(a)}
                        className="px-3 py-2 bg-cyber-yellow text-black hover:bg-yellow-400 rounded-lg text-xs font-bold uppercase transition-all flex items-center space-x-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Resolve Hazard</span>
                      </button>
                    </div>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Resolution Action Modal */}
      {resolvingAlert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-cyber-card border border-cyber-border rounded-2xl shadow-2xl p-6 relative">
            <h3 className="text-lg font-bold font-outfit text-white mb-2">Resolve Site Incident</h3>
            <p className="text-xs text-slate-400 mb-4">
              Identify corrective actions taken to resolve safety hazard for worker <span className="text-slate-200 font-semibold">{resolvingAlert.workerName}</span>.
            </p>

            <form onSubmit={submitResolution} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-slate-400 uppercase tracking-wide">Supervisor Resolution Notes</label>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g. Sent safety team. Gas levels dropped to normal. Worksite declared clear."
                  value={resolveActionNotes}
                  onChange={(e) => setResolveActionNotes(e.target.value)}
                  className="w-full bg-cyber-darker border border-cyber-border rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyber-yellow font-mono"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResolvingAlert(null)}
                  className="px-4 py-2 border border-cyber-border rounded-lg text-xs text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyber-yellow text-black hover:bg-yellow-400 rounded-lg text-xs font-bold uppercase transition-colors"
                >
                  Clear Alarm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
