import React from 'react';
import { ShieldAlert, ShieldCheck, Zap } from 'lucide-react';

interface AIPredictionPanelProps {
  edgeInference?: {
    riskScore: number;
    flags: string[];
    latencyMs: number;
  };
}

export const AIPredictionPanel: React.FC<AIPredictionPanelProps> = ({
  edgeInference = { riskScore: 0, flags: [], latencyMs: 0 }
}) => {
  const isDanger  = edgeInference.riskScore > 0.8;
  const isWarning = edgeInference.riskScore > 0.4 && edgeInference.riskScore <= 0.8;

  const statusColor = isDanger
    ? 'text-red-500 border-red-500/30 bg-red-500/5'
    : isWarning
    ? 'text-amber-500 border-amber-500/30 bg-amber-500/5'
    : 'text-green-500 border-green-500/30 bg-green-500/5';

  const statusGlow = isDanger
    ? 'shadow-[0_0_20px_rgba(239,68,68,0.25)] border-red-500'
    : isWarning
    ? 'shadow-[0_0_20px_rgba(245,158,11,0.15)] border-amber-500'
    : 'shadow-[0_0_20px_rgba(34,197,94,0.1)] border-green-500';

  const overallStatus = isDanger ? 'danger' : isWarning ? 'warning' : 'safe';

  return (
    <div className={`cyber-card p-6 rounded-2xl border transition-all duration-500 ${statusGlow}`}>
      {/* Title */}
      <div className="flex items-center justify-between border-b border-cyber-border/40 pb-4 mb-4">
        <div className="flex items-center space-x-2">
          <Zap className="w-5 h-5 text-cyber-yellow" />
          <h3 className="font-outfit font-bold text-base tracking-wide text-white uppercase">
            Edge AI Safety Inference
          </h3>
        </div>
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono hidden sm:inline">
          On-Device NPU
        </span>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Overall Risk Assessment</span>
        <div className={`p-6 border rounded-xl flex flex-col items-center justify-center text-center ${statusColor}`}>
          {isDanger ? (
            <ShieldAlert className="w-12 h-12 mb-2 animate-bounce" />
          ) : (
            <ShieldCheck className="w-12 h-12 mb-2" />
          )}
          <span className="font-outfit font-extrabold text-2xl uppercase tracking-wider">
            {overallStatus}
          </span>
          <span className="text-xs text-slate-400 mt-1">
            Risk Score: {(edgeInference.riskScore * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
};
