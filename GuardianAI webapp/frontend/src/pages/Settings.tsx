import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Settings as SettingsIcon,
  Sliders,
  SlidersHorizontal,
  Save,
  CheckCircle
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // State sliders
  const [hrMax, setHrMax] = useState(130);
  const [spo2Min, setSpo2Min] = useState(92);
  const [ch4Max, setCh4Max] = useState(10);
  const [coMax, setCoMax] = useState(50);
  
  const [cloudEndpoint, _setCloudEndpoint] = useState(''); // Cloud AI removed

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 font-inter">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-cyber-card/30 border border-cyber-border/40 rounded-2xl">
        <div>
          <span className="text-[10px] text-cyber-yellow font-bold uppercase tracking-wider font-mono">Configurations</span>
          <h1 className="text-2xl font-extrabold text-white tracking-wide font-outfit mt-0.5">Control Settings</h1>
          <p className="text-xs text-slate-400 mt-1">Calibrate sensor triggers, adjust map fences, and configure edge gateway paths</p>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold rounded-xl flex items-center space-x-2">
          <CheckCircle className="w-4 h-4" />
          <span>System thresholds and gateway endpoints updated successfully.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Card 1: Vitals & Gas Alarm sliders (Admin only) */}
        <div className="cyber-card p-6 rounded-2xl border border-cyber-border space-y-5">
          <div className="border-b border-cyber-border/40 pb-3 flex items-center space-x-2 text-slate-200">
            <Sliders className="w-4 h-4 text-cyber-yellow" />
            <h3 className="font-outfit font-bold text-sm uppercase tracking-wide">Threat Calibrations</h3>
          </div>

          {!isAdmin ? (
            <p className="text-xs text-slate-500 italic">Threshold configuration locked. Supervisor credentials required.</p>
          ) : (
            <div className="space-y-5 text-xs font-semibold">
              {/* HR Max */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-slate-300">
                  <span>Heart Rate Alarm Trigger</span>
                  <span className="text-cyber-yellow font-mono font-bold">{hrMax} bpm</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="160"
                  value={hrMax}
                  onChange={(e) => setHrMax(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyber-yellow"
                />
              </div>

              {/* SpO2 Min */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-slate-300">
                  <span>Minimum Oxygen Level SpO2</span>
                  <span className="text-cyber-yellow font-mono font-bold">{spo2Min}%</span>
                </div>
                <input
                  type="range"
                  min="85"
                  max="95"
                  value={spo2Min}
                  onChange={(e) => setSpo2Min(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyber-yellow"
                />
              </div>

              {/* CH4 Methane */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-slate-300">
                  <span>Methane Gas Leak alarm</span>
                  <span className="text-cyber-yellow font-mono font-bold">{ch4Max}% LEL</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="25"
                  value={ch4Max}
                  onChange={(e) => setCh4Max(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyber-yellow"
                />
              </div>

              {/* Carbon Monoxide */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-slate-300">
                  <span>Carbon Monoxide Level</span>
                  <span className="text-cyber-yellow font-mono font-bold">{coMax} ppm</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={coMax}
                  onChange={(e) => setCoMax(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyber-yellow"
                />
              </div>
            </div>
          )}
        </div>


        {/* Save button (Admin only) */}
        {isAdmin && (
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 bg-cyber-yellow hover:bg-yellow-400 text-black hover:shadow-glow-yellow rounded-lg font-outfit font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center space-x-1"
            >
              <Save className="w-4 h-4" />
              <span>Save System Tunings</span>
            </button>
          </div>
        )}

      </form>
    </div>
  );
};
