import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  LayoutDashboard,
  Activity,
  Map,
  Users,
  BellRing,
  Settings,
  LogOut,
  Shield,
  User as UserIcon,
  Radio,
  FlaskConical
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, setCollapsed }) => {
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin';

  // Navigation Links
  const navItems = isAdmin
    ? [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/live', label: 'Monitoring Grid', icon: Activity },
        { path: '/map', label: 'Live Map', icon: Map },
        { path: '/workers', label: 'Workers', icon: Users },
        { path: '/alerts', label: 'Alerts Feed', icon: BellRing },
        { path: '/sensors', label: 'Sensor Lab', icon: FlaskConical },
        { path: '/settings', label: 'System Settings', icon: Settings }
      ]
    : [
        { path: '/', label: 'My Dashboard', icon: LayoutDashboard },
        { path: '/alerts', label: 'My Alerts', icon: BellRing },
        { path: '/settings', label: 'Settings', icon: Settings }
      ];

  return (
    <>
      {/* Mobile Sidebar Overlay Backdrop */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setCollapsed(true)}
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 h-screen bg-cyber-darker border-r border-cyber-border flex flex-col transition-all duration-300 z-50 ${
          collapsed ? '-translate-x-full md:translate-x-0 md:w-20' : 'translate-x-0 w-64'
        }`}
      >
      {/* Brand Logo */}
      <div className="h-16 flex items-center px-6 border-b border-cyber-border justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="bg-cyber-yellow text-black p-1.5 rounded-lg flex-shrink-0 animate-pulse-fast">
            <Shield className="w-5 h-5" />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg tracking-wider text-white font-outfit uppercase">
              Guardian<span className="text-cyber-yellow">AI</span>
            </span>
          )}
        </div>
      </div>

      {/* User Widget */}
      <div className="p-4 border-b border-cyber-border bg-cyber-bg/30">
        <div className={`flex items-center space-x-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 rounded-full border border-cyber-yellow bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden text-cyber-yellow shadow-glow-yellow">
            {isAdmin ? <Shield className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h4 className="text-sm font-medium text-white truncate">{user?.name}</h4>
              <p className="text-xs text-slate-400 capitalize flex items-center space-x-1">
                <span>{user?.role}</span>
                <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                <span className="truncate">{user?.department}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-cyber-yellow/10 text-cyber-yellow border-l-2 border-cyber-yellow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              } ${item.highlight ? 'border border-dashed border-cyber-yellow/50 bg-cyber-yellow/5 hover:bg-cyber-yellow/15' : ''}`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="ml-3 font-outfit truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer Connection & Logout */}
      <div className="p-4 border-t border-cyber-border space-y-3 bg-cyber-bg/20">
        {/* Connection Widget */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} text-xs`}>
          {!collapsed && (
            <span className="text-slate-500 flex items-center space-x-1">
              <Radio className="w-3.5 h-3.5" />
              <span>NPU Telemetry:</span>
            </span>
          )}
          <span
            className={`px-2 py-0.5 rounded-full font-semibold flex items-center space-x-1 ${
              isConnected
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400 animate-ping' : 'bg-red-400'} mr-1`}></span>
            {collapsed ? '' : isConnected ? 'Connected' : 'Offline'}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className={`w-full flex items-center px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="ml-3 font-outfit">Logout</span>}
        </button>
      </div>
    </aside>
    </>
  );
};
