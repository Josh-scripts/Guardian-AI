import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, RefreshCw, BellRing, ShieldCheck, ShieldAlert, AlertTriangle, Zap, Power } from 'lucide-react';

// ─── Config ──────────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SCAN_INTERVAL_MS = 30000; // Re-analyse every 30 seconds

// ─── Types ───────────────────────────────────────────────────────────────────
interface AICommandCenterProps {
  workersList: any[];
  alertsFeed: any[];
  liveAtmosphere: { ch4: number; temp: number; pressure: number; status: string };
  summary: any;
  onBuzzerAll: () => void;
  onBuzzerWorker: (worker: { workerId: string; name: string }) => void;
}

type ScanStatus = 'idle' | 'scanning' | 'ok' | 'warning' | 'critical' | 'error';

// ─── Build prompt sent to AI ──────────────────────────────────────────────────
const buildPrompt = (
  workersList: any[],
  alertsFeed: any[],
  liveAtmosphere: any,
  summary: any
): string => {
  // Only feed workers with abnormal/borderline vitals or status issues to prevent LLM overload
  const abnormalWorkers = workersList.filter(w => {
    const hr = w.vitals?.heartRate ?? 0;
    const spo2 = w.vitals?.spo2 ?? 100;
    const ch4 = w.vitals?.ch4 ?? 0;
    const status = w.status ?? 'safe';

    return (
      status === 'danger' ||
      status === 'warning' ||
      hr > 100 ||
      hr < 50 ||
      spo2 < 95 ||
      ch4 > 5
    );
  });

  const workers = abnormalWorkers.length
    ? abnormalWorkers.map(w =>
      `${w.name}(${w.workerId}) status=${w.status} HR=${w.vitals?.heartRate ?? 0}bpm SpO2=${w.vitals?.spo2 ?? 0}% CH4=${w.vitals?.ch4 ?? 0}%LEL`
    ).join(' | ')
    : 'All online workers have nominal vitals';

  // Limit alerts feed to top 5 items to keep token length low
  const alerts = alertsFeed.length
    ? alertsFeed.slice(0, 5).map(a => `${a.workerName}:${a.type}`).join(', ')
    : 'none';

  return `You are GuardianAI, an industrial safety monitoring AI.

SITE DATA (${new Date().toLocaleTimeString()}):
Atmosphere: ${liveAtmosphere.status} | CH4=${liveAtmosphere.ch4.toFixed(2)}%LEL | Temp=${liveAtmosphere.temp.toFixed(1)}C | Pressure=${liveAtmosphere.pressure.toFixed(0)}hPa
Workers(${summary?.workers?.online ?? 0}/${summary?.workers?.total ?? 0} online): ${workers}
Active alerts: ${alerts}

RULES:
- If any worker is in DANGER status, or CH4>8%, or HR>130 or <45, or SpO2<92%: start with [BUZZ_ALL] or [BUZZ_WORKER:<workerId>:<name>]
- Keep response to 2 sentences max.
- End with STATUS:SAFE, STATUS:WARNING, or STATUS:CRITICAL on its own line.

Respond now with a concise site safety assessment.`;
};

// ─── Parse AI response ────────────────────────────────────────────────────────
interface ParsedResponse {
  summary: string;
  actions: string[];
  status: 'SAFE' | 'WARNING' | 'CRITICAL';
}

const parseResponse = (text: string): ParsedResponse => {
  const actions: string[] = [];

  // Extract action tags
  const buzzAll = /\[BUZZ_ALL\]/i.test(text);
  const buzzWorker = text.match(/\[BUZZ_WORKER:([^:\]]+):([^\]]+)\]/i);
  if (buzzAll) actions.push('BUZZ_ALL');
  if (buzzWorker) actions.push(`BUZZ_WORKER:${buzzWorker[1]}:${buzzWorker[2]}`);

  // Extract status
  let status: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
  if (/STATUS:CRITICAL/i.test(text)) status = 'CRITICAL';
  else if (/STATUS:WARNING/i.test(text)) status = 'WARNING';

  // Clean text — remove tags and status line
  const summary = text
    .replace(/\[BUZZ_(ALL|WORKER:[^\]]+)\]\n?/gi, '')
    .replace(/STATUS:(SAFE|WARNING|CRITICAL)\n?/gi, '')
    .trim();

  return { summary, actions, status };
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const AICommandCenter: React.FC<AICommandCenterProps> = ({
  workersList,
  alertsFeed,
  liveAtmosphere,
  summary,
  onBuzzerAll,
  onBuzzerWorker,
}) => {
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [insightText, setInsightText] = useState<string>('Initialising AI safety monitor…');
  const [aiStatus, setAiStatus] = useState<'SAFE' | 'WARNING' | 'CRITICAL'>('SAFE');
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [actionsLog, setActionsLog] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState<boolean>(true);

  const timerRef = useRef<any>(null);
  const prevDangerRef = useRef<string[]>([]);
  const isScanningRef = useRef<boolean>(false);

  // ── Run a scan using direct completions endpoint with streaming ───────────
  const runScan = useCallback(async () => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setScanStatus('scanning');
    setInsightText('');

    const prompt = buildPrompt(workersList, alertsFeed, liveAtmosphere, summary);

    try {
      const res = await fetch(`${API_URL}/api/openai/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'Phi-3.5-mini-instruct',
          messages: [{ role: 'user', content: prompt }],
          stream: true
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        setInsightText(`AI error ${res.status}: ${errText.slice(0, 120)}`);
        setScanStatus('error');
        isScanningRef.current = false;
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setInsightText('Error: Response body is not readable.');
        setScanStatus('error');
        isScanningRef.current = false;
        return;
      }

      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Save the last line if it's incomplete
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === 'data: [DONE]') break;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const content = data.choices?.[0]?.delta?.content ?? '';
              if (content) {
                fullText += content;
                const { summary: text } = parseResponse(fullText);
                setInsightText(text);
              }
            } catch (err) {
              // Ignore partial JSON
            }
          }
        }
      }

      // Handle remaining buffer content
      if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
        try {
          const data = JSON.parse(buffer.trim().slice(6));
          const content = data.choices?.[0]?.delta?.content ?? '';
          if (content) {
            fullText += content;
          }
        } catch (err) {
          // Ignore
        }
      }

      const { summary: text, actions, status } = parseResponse(fullText);
      setInsightText(text || fullText || 'Nominal');
      setAiStatus(status);
      setLastScan(new Date());
      setScanStatus(status === 'CRITICAL' ? 'critical' : status === 'WARNING' ? 'warning' : 'ok');

      // Execute autonomous actions
      for (const action of actions) {
        if (action === 'BUZZ_ALL') {
          onBuzzerAll();
          setActionsLog(prev => [`${new Date().toLocaleTimeString()} — Buzzed ALL workers`, ...prev].slice(0, 10));
        } else if (action.startsWith('BUZZ_WORKER:')) {
          const [, workerId, workerName] = action.split(':');
          onBuzzerWorker({ workerId, name: workerName });
          setActionsLog(prev => [`${new Date().toLocaleTimeString()} — Buzzed ${workerName}`, ...prev].slice(0, 10));
        }
      }
    } catch (err: any) {
      setInsightText(`Connection error: ${err.message}`);
      setScanStatus('error');
    } finally {
      isScanningRef.current = false;
    }
  }, [workersList, alertsFeed, liveAtmosphere, summary, onBuzzerAll, onBuzzerWorker]);

  // Start periodic scanning
  useEffect(() => {
    if (!isEnabled) {
      setInsightText('AI Safety Monitor is currently disabled.');
      setScanStatus('idle');
      return;
    }

    runScan();
    timerRef.current = setInterval(runScan, SCAN_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [isEnabled, runScan]);

  // Reactive: new worker enters danger
  useEffect(() => {
    const dangerIds = workersList.filter(w => w.status === 'danger').map(w => w.workerId);
    const newDanger = dangerIds.filter(id => !prevDangerRef.current.includes(id));
    if (newDanger.length > 0 && scanStatus !== 'scanning') runScan();
    prevDangerRef.current = dangerIds;
  }, [workersList]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Style helpers ─────────────────────────────────────────────────────────
  const borderColor =
    !isEnabled ? 'border-slate-800/80 opacity-70' :
    scanStatus === 'critical' ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' :
      scanStatus === 'warning' ? 'border-amber-500/40' :
        scanStatus === 'ok' ? 'border-green-500/30' :
          scanStatus === 'error' ? 'border-red-500/30' :
            'border-cyber-border';

  const statusIcon =
    !isEnabled ? <Bot className="w-4 h-4 text-slate-500" /> :
    scanStatus === 'critical' ? <ShieldAlert className="w-4 h-4 text-red-400 animate-bounce" /> :
      scanStatus === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-400" /> :
        scanStatus === 'ok' ? <ShieldCheck className="w-4 h-4 text-green-400" /> :
          scanStatus === 'scanning' ? <RefreshCw className="w-4 h-4 text-cyber-yellow animate-spin" /> :
            scanStatus === 'error' ? <AlertTriangle className="w-4 h-4 text-red-400" /> :
              <Bot className="w-4 h-4 text-slate-400" />;

  const dotColor =
    !isEnabled ? 'bg-slate-600' :
    scanStatus === 'critical' ? 'bg-red-500 animate-ping' :
      scanStatus === 'warning' ? 'bg-amber-400 animate-pulse' :
        scanStatus === 'ok' ? 'bg-green-400' :
          scanStatus === 'scanning' ? 'bg-cyber-yellow animate-pulse' :
            scanStatus === 'error' ? 'bg-red-500' :
              'bg-slate-500';

  const statusLabel =
    !isEnabled ? 'AI Disabled' :
    scanStatus === 'critical' ? 'CRITICAL — Autonomous alert sent' :
      scanStatus === 'warning' ? 'WARNING detected' :
        scanStatus === 'ok' ? 'Site Nominal' :
          scanStatus === 'scanning' ? 'Scanning…' :
            scanStatus === 'error' ? 'AI Offline' :
              'Standby';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`cyber-card rounded-2xl border transition-all duration-500 ${borderColor} overflow-hidden`}>
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-cyber-darker/60 border-b border-cyber-border/40">
        <div className="flex items-center space-x-3">
          {/* Pulsing dot */}
          <div className="relative flex items-center justify-center">
            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          </div>
          <div className="flex items-center space-x-2">
            {statusIcon}
            <span className="text-xs font-bold font-outfit uppercase tracking-wider text-white">AI Safety Insight</span>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono uppercase border ${scanStatus === 'critical' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
              scanStatus === 'warning' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                scanStatus === 'ok' ? 'bg-green-500/15 text-green-400 border-green-500/30' :
                  scanStatus === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                    'bg-slate-700 text-slate-400 border-slate-600'
            }`}>
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Toggle Switch Button */}
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold font-mono uppercase transition-all ${
              isEnabled
                ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                : 'bg-slate-800/60 border-cyber-border text-slate-500 hover:text-slate-400 hover:bg-slate-700'
            }`}
            title={isEnabled ? "Disable AI Safety Monitor" : "Enable AI Safety Monitor"}
          >
            <Power className="w-3 h-3" />
            <span>{isEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {lastScan && isEnabled && (
            <span className="text-[10px] text-slate-500 font-mono">
              {lastScan.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={runScan}
            disabled={scanStatus === 'scanning' || !isEnabled}
            title="Trigger manual scan"
            className="p-1.5 rounded-lg bg-slate-800/60 border border-cyber-border text-slate-400
                       hover:text-cyber-yellow hover:border-cyber-yellow/30 transition-all disabled:opacity-30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanStatus === 'scanning' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Insight body ── */}
      <div className="px-5 py-4 flex items-start space-x-3">
        <Zap className={`w-4 h-4 flex-shrink-0 mt-0.5 ${scanStatus === 'critical' ? 'text-red-400' :
            scanStatus === 'warning' ? 'text-amber-400' :
              scanStatus === 'ok' ? 'text-cyber-yellow' :
                'text-slate-500'
          }`} />
        <p className={`text-sm leading-relaxed flex-1 ${scanStatus === 'critical' ? 'text-red-300' :
            scanStatus === 'warning' ? 'text-amber-300' :
              scanStatus === 'error' ? 'text-red-400' :
                'text-slate-300'
          }`}>
          {scanStatus === 'scanning' && !insightText.includes('Initialising')
            ? <span>{insightText}<span className="inline-block w-1.5 h-4 bg-cyber-yellow/70 ml-1 animate-pulse rounded-sm align-middle" /></span>
            : insightText
          }
        </p>
      </div>

      {/* ── Autonomous actions taken (if any) ── */}
      {actionsLog.length > 0 && (
        <div className="border-t border-cyber-border/30 px-5 py-2 bg-red-500/5 flex items-center space-x-2 overflow-hidden">
          <BellRing className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <p className="text-[10px] text-red-400 font-mono truncate">{actionsLog[0]}</p>
        </div>
      )}
    </div>
  );
};
