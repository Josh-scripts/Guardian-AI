import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  Save,
  Plus
} from 'lucide-react';

export const Workers: React.FC = () => {
  const { token } = useAuth();
  
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    workerId: '',
    name: '',
    email: '',
    role: 'worker',
    department: '',
    password: '',
    emergencyName: '',
    emergencyPhone: '',
    emergencyRelationship: ''
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const authToken = token || '';

  const fetchWorkersList = async () => {
    try {
      const res = await fetch(`${API_URL}/api/workers`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        setWorkers(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkersList();
  }, []);

  const handleEdit = (w: any) => {
    setEditingId(w.workerId);
    setForm({
      workerId: w.workerId,
      name: w.name,
      email: w.email,
      role: w.role,
      department: w.department,
      password: '',
      emergencyName: w.emergencyContact?.name || '',
      emergencyPhone: w.emergencyContact?.phone || '',
      emergencyRelationship: w.emergencyContact?.relationship || ''
    });
    setShowAddForm(true);
  };

  const handleDelete = async (workerId: string) => {
    if (!window.confirm(`Delete worker ${workerId}? This will unassign all linked helmet devices.`)) return;
    try {
      const res = await fetch(`${API_URL}/api/workers/${workerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: 'Worker profile deleted.' });
        fetchWorkersList();
      } else {
        const err = await res.json();
        setStatusMsg({ type: 'error', text: err.error || 'Failed to delete worker.' });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'Network error.' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const payload = {
      workerId: form.workerId,
      name: form.name,
      email: form.email,
      role: form.role,
      department: form.department,
      password: form.password || undefined,
      emergencyContact: {
        name: form.emergencyName,
        phone: form.emergencyPhone,
        relationship: form.emergencyRelationship
      }
    };

    try {
      const url = editingId ? `${API_URL}/api/workers/${editingId}` : `${API_URL}/api/workers`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMsg({
          type: 'success',
          text: editingId ? 'Worker profile updated successfully.' : 'New worker registered.'
        });
        setShowAddForm(false);
        setEditingId(null);
        resetForm();
        fetchWorkersList();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Operation failed.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Gateway network timeout.' });
    }
  };

  const resetForm = () => {
    setForm({
      workerId: '',
      name: '',
      email: '',
      role: 'worker',
      department: '',
      password: '',
      emergencyName: '',
      emergencyPhone: '',
      emergencyRelationship: ''
    });
    setEditingId(null);
  };

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
          <span className="text-[10px] text-cyber-yellow font-bold uppercase tracking-wider font-mono">System Directory</span>
          <h1 className="text-2xl font-extrabold text-white tracking-wide font-outfit mt-0.5">Worker Management</h1>
          <p className="text-xs text-slate-400 mt-1">Register safety workers, configure emergency lines, and manage system assignments</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddForm(!showAddForm);
          }}
          className="px-4 py-2 bg-cyber-yellow hover:bg-yellow-400 text-black rounded-lg text-xs font-bold uppercase transition-all flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>{showAddForm ? 'Hide Form' : 'Register Worker'}</span>
        </button>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-xl border flex items-center space-x-2 text-xs font-semibold ${
          statusMsg.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CRUD registration form */}
        {showAddForm && (
          <div className="cyber-card p-6 rounded-2xl border border-cyber-border space-y-4 h-fit">
            <h3 className="font-outfit font-bold text-sm text-slate-200 uppercase tracking-wider border-b border-cyber-border/40 pb-2 mb-3">
              {editingId ? `Edit Details: ${editingId}` : 'Register New Node User'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-slate-400 uppercase tracking-wide">Employee ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. EMP-1004"
                  value={form.workerId}
                  onChange={(e) => setForm({ ...form, workerId: e.target.value })}
                  disabled={!!editingId}
                  className="w-full bg-cyber-darker border border-cyber-border rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyber-yellow"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 uppercase tracking-wide">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marcus Vance"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-cyber-darker border border-cyber-border rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyber-yellow"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 uppercase tracking-wide">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. name@guardian.ai"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-cyber-darker border border-cyber-border rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyber-yellow"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 uppercase tracking-wide">Department</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pipeline Ops"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full bg-cyber-darker border border-cyber-border rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyber-yellow"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 uppercase tracking-wide">Password</label>
                <input
                  type="password"
                  placeholder={editingId ? 'Leave blank to keep current' : '••••••••'}
                  required={!editingId}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-cyber-darker border border-cyber-border rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyber-yellow"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 uppercase tracking-wide">Site Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full bg-cyber-darker border border-cyber-border rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  <option value="worker">Worker Node</option>
                  <option value="admin">Supervisor Command</option>
                </select>
              </div>

              <div className="pt-2 border-t border-cyber-border/40 space-y-3">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">Emergency Contact Card</span>
                
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Contact Name"
                    value={form.emergencyName}
                    onChange={(e) => setForm({ ...form, emergencyName: e.target.value })}
                    className="bg-cyber-darker border border-cyber-border rounded px-2 py-1.5 text-white placeholder-slate-500"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Relationship"
                    value={form.emergencyRelationship}
                    onChange={(e) => setForm({ ...form, emergencyRelationship: e.target.value })}
                    className="bg-cyber-darker border border-cyber-border rounded px-2 py-1.5 text-white placeholder-slate-500"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Phone Line (e.g. +1-555-0100)"
                  value={form.emergencyPhone}
                  onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
                  className="w-full bg-cyber-darker border border-cyber-border rounded px-3 py-1.5 text-white placeholder-slate-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-cyber-yellow hover:bg-yellow-400 text-black rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center space-x-1"
              >
                <Save className="w-4 h-4" />
                <span>Save Registry</span>
              </button>
            </form>
          </div>
        )}

        {/* Workers table list */}
        <div className={`${showAddForm ? 'lg:col-span-2' : 'lg:col-span-3'} cyber-card p-6 rounded-2xl border border-cyber-border`}>
          <h3 className="font-outfit font-bold text-sm text-slate-200 uppercase tracking-wider mb-4 border-b border-cyber-border/40 pb-2">
            Active Registry directory
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-cyber-border text-slate-400 uppercase font-mono tracking-wider">
                  <th className="pb-3">Employee Name</th>
                  <th className="pb-3">ID</th>
                  <th className="pb-3">Department</th>
                  <th className="pb-3">System Role</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyber-border/30 font-medium">
                {workers.map(w => (
                  <tr key={w.workerId} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-3.5">
                      <span className="font-outfit font-bold text-sm text-slate-200 block">{w.name}</span>
                      <span className="text-[10px] text-slate-500">{w.email}</span>
                    </td>
                    <td className="py-3.5 font-mono text-slate-400">{w.workerId}</td>
                    <td className="py-3.5 text-slate-300">{w.department}</td>
                    <td className="py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        w.role === 'admin'
                          ? 'bg-cyber-yellow/15 text-cyber-yellow border border-cyber-yellow/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {w.role}
                      </span>
                    </td>
                    <td className="py-3.5 text-right space-x-1">
                      <button
                        onClick={() => handleEdit(w)}
                        className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded border border-cyber-border hover:border-slate-600 transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(w.workerId)}
                        className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded border border-red-500/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
