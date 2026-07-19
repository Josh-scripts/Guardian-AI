import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Menu, Bell, X, AlertTriangle, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeaderProps {
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
}

export interface AlertNotification {
  _id: string;
  workerName: string;
  type: string;
  message: string;
  severity: 'warning' | 'critical';
  timestamp: string;
  status: 'active' | 'acknowledged' | 'resolved';
}

export const Header: React.FC<HeaderProps> = ({ collapsed, setCollapsed }) => {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const [time, setTime] = useState(new Date());
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Time Tick
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial active alerts & bind WebSockets
  useEffect(() => {
    const token = localStorage.getItem('guardian_token');
    if (!token) return;

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    
    const fetchActiveAlerts = async () => {
      try {
        const res = await fetch(`${API_URL}/api/alerts?status=active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(data);
        }
      } catch (err) {
        console.error('Failed to load active notifications', err);
      }
    };

    fetchActiveAlerts();

    if (socket) {
      const handleNewAlert = (alert: AlertNotification) => {
        // Only push to dropdown if active/warning/critical
        setNotifications(prev => [alert, ...prev].slice(0, 10)); // keep last 10
        // Play alert sound for critical events
        if (alert.severity === 'critical') {
          try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1000/1000-84.wav');
            audio.volume = 0.5;
            audio.play();
          } catch (e) {
            console.warn('Audio play blocked:', e);
          }
        }
      };

      const handleAlertUpdated = (updatedAlert: AlertNotification) => {
        if (updatedAlert.status === 'resolved') {
          // Remove from unread dropdown
          setNotifications(prev => prev.filter(n => n._id !== updatedAlert._id));
        } else {
          // Update details (acknowledged)
          setNotifications(prev => prev.map(n => n._id === updatedAlert._id ? updatedAlert : n));
        }
      };

      socket.on('new_alert', handleNewAlert);
      socket.on('alert_updated', handleAlertUpdated);

      return () => {
        socket.off('new_alert', handleNewAlert);
        socket.off('alert_updated', handleAlertUpdated);
      };
    }
  }, [socket]);

  const handleAcknowledge = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('guardian_token');
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    try {
      const res = await fetch(`${API_URL}/api/alerts/${id}/acknowledge`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n._id !== id));
      }
    } catch (err) {
      console.error('Acknowledge error:', err);
    }
  };

  const formattedTime = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const formattedDate = time.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <header className="h-16 border-b border-cyber-border bg-cyber-bg/50 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-6">
      {/* Left side: Hamburger + Site Info */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="hidden sm:block">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-outfit">
            Hazard Operations Site A
          </h2>
          <p className="text-xs text-slate-400">GuardianAI Gateway Monitor</p>
        </div>
      </div>

      {/* Center: Live Clock */}
      <div className="text-center font-outfit font-medium">
        <span className="text-cyber-yellow text-sm font-semibold tracking-wide mr-2 bg-cyber-yellow/10 px-2 py-0.5 rounded border border-cyber-yellow/20">
          LIVE
        </span>
        <span className="text-slate-300 font-mono text-sm">{formattedDate} {formattedTime}</span>
      </div>

      {/* Right side: Connection alert, Notification Tray */}
      <div className="flex items-center space-x-4">
        {/* Network status warning */}
        {!isConnected && (
          <div className="flex items-center text-red-400 text-xs px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full font-medium space-x-1.5 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Gateway Connection Lost</span>
          </div>
        )}

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg bg-slate-800/80 border border-cyber-border text-slate-300 hover:text-white transition-colors"
          >
            <Bell className="w-5 h-5" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-cyber-bg animate-bounce">
                {notifications.length}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-3 w-80 bg-cyber-card border border-cyber-border rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between bg-cyber-darker">
                <span className="font-outfit font-semibold text-sm">Active Threat Board</span>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-cyber-border">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-sm">
                    <Check className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-50" />
                    All worker nodes report nominal.
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n._id}
                      className={`p-4 transition-colors hover:bg-slate-800/40 relative ${
                        n.severity === 'critical' ? 'bg-red-500/5' : 'bg-amber-500/5'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              n.severity === 'critical'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {n.type.replace('_', ' ')}
                          </span>
                          <h4 className="text-xs font-semibold text-slate-200 mt-1">{n.workerName}</h4>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{n.message}</p>
                      
                      {user?.role === 'admin' && (
                        <div className="mt-2.5 flex items-center space-x-2">
                          <button
                            onClick={(e) => handleAcknowledge(n._id, e)}
                            className="px-2 py-1 bg-cyber-yellow text-black hover:bg-yellow-400 rounded text-[10px] font-semibold transition-colors flex items-center space-x-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Acknowledge</span>
                          </button>
                          <Link
                            to="/alerts"
                            onClick={() => setShowNotifications(false)}
                            className="px-2 py-1 border border-cyber-border text-slate-300 hover:text-white rounded text-[10px] font-medium transition-colors"
                          >
                            Investigate
                          </Link>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2 border-t border-cyber-border text-center bg-cyber-darker">
                <Link
                  to="/alerts"
                  onClick={() => setShowNotifications(false)}
                  className="text-xs text-cyber-yellow hover:underline"
                >
                  View Incident history
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
