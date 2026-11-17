import { useEffect, useRef, useState } from 'react';

type Step = { text: string; done: boolean };

interface RuntimeLogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
}

interface ThinkingBubbleProps {
  active: boolean;
  steps?: Step[];
  onCollapse?: () => void;
}

function relativeTime(ts: string): string {
  if (!ts) return '';
  try {
    // Format: "2026-05-19 14:23:01"
    const date = new Date(ts.replace(' ', 'T'));
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) return 'ora';
    if (diffSec < 60) return `${diffSec}s fa`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m fa`;
    return `${Math.floor(diffMin / 60)}h fa`;
  } catch {
    return '';
  }
}

function levelColor(level: string): string {
  switch (level) {
    case 'success': return 'rgba(74,222,128,0.75)';
    case 'error':   return 'rgba(248,113,113,0.75)';
    case 'warning': return 'rgba(251,191,36,0.75)';
    case 'process': return 'rgba(169,201,255,0.75)';
    default:        return 'rgba(255,255,255,0.38)';
  }
}

function levelDot(level: string): string {
  switch (level) {
    case 'success': return '✓';
    case 'error':   return '✗';
    case 'warning': return '⚠';
    case 'process': return '◈';
    default:        return '·';
  }
}

function isRecent(ts: string): boolean {
  if (!ts) return false;
  try {
    const date = new Date(ts.replace(' ', 'T'));
    return (Date.now() - date.getTime()) < 30_000;
  } catch { return false; }
}

export function ThinkingBubble({ active, steps = [], onCollapse }: ThinkingBubbleProps) {
  const [expanded, setExpanded] = useState(true);
  const [dots, setDots] = useState('');
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // Animated dots
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setDots((d) => d.length >= 3 ? '' : d + '.'), 480);
    return () => clearInterval(id);
  }, [active]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [steps, runtimeLogs]);

  // SSE: ricevi step events real-time dal loopController via /api/agents/jobs-events/stream
  // Fallback polling solo se SSE non disponibile.
  useEffect(() => {
    let es: EventSource | null = null;
    let pollId: number | null = null;

    const pushLog = (msg: string, level = 'info', timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)) => {
      setRuntimeLogs((prev) => [
        { timestamp, level, source: 'loop', message: msg },
        ...prev,
      ].slice(0, 5));
    };

    try {
      es = new EventSource('/api/agents/jobs-events/stream');
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { type: string; event?: { type?: string; jobId?: string; message?: string; status?: string }; events?: unknown[] };
          if (data.type === 'job-event' && data.event) {
            const e = data.event;
            const level = e.status === 'completed' ? 'success' : e.status === 'failed' ? 'error' : 'process';
            pushLog(e.message || `${e.type} ${e.jobId ? `(${e.jobId})` : ''}`.trim(), level);
          }
        } catch { /* skip */ }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        // Avvia polling come fallback
        if (!pollId) {
          const tick = () => fetch('/api/agents/runtime/logs').then((r) => r.ok ? r.json() : null).then((d: RuntimeLogEntry[] | null) => {
            if (Array.isArray(d)) setRuntimeLogs(d.slice(-5).reverse());
          }).catch(() => null);
          tick();
          pollId = window.setInterval(tick, 6000);
        }
      };
    } catch {
      // EventSource non supportato — polling diretto
      const tick = () => fetch('/api/agents/runtime/logs').then((r) => r.ok ? r.json() : null).then((d: RuntimeLogEntry[] | null) => {
        if (Array.isArray(d)) setRuntimeLogs(d.slice(-5).reverse());
      }).catch(() => null);
      tick();
      pollId = window.setInterval(tick, 6000);
    }

    return () => {
      if (es) es.close();
      if (pollId) window.clearInterval(pollId);
    };
  }, [active]);

  const allDone = steps.length > 0 && steps.every((s) => s.done);
  const lastStep = steps[steps.length - 1];
  // Ciclo 6 bonus: pulse when there are recent logs (< 30s)
  const hasRecentLog = runtimeLogs.length > 0 && isRecent(runtimeLogs[0].timestamp);

  // Determine what to show in header
  const headerText = (() => {
    if (allDone) return 'Elaborazione completata';
    if (lastStep) return lastStep.text;
    if (runtimeLogs.length > 0) return runtimeLogs[0].message.slice(0, 72);
    return `Kira${dots}`;
  })();

  // No content to show: hide
  if (!active && steps.length === 0 && runtimeLogs.length === 0) return null;

  // Merge: prefer explicit steps, fall back to runtime logs
  const showSteps = steps.length > 0;
  const showLogs = !showSteps && runtimeLogs.length > 0;

  return (
    <div className="k-thinking animate-float-up" style={{ marginBottom: 8 }}>
      {/* Header — collapsable */}
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition"
        onClick={() => setExpanded((e) => !e)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span style={{ fontSize: '0.85rem', flexShrink: 0, color: allDone ? 'rgba(74,222,128,0.8)' : 'rgba(169,201,255,0.8)' }}>
          {allDone ? '✓' : (
            <span style={{
              display: 'inline-block',
              animation: active ? 'spin 1.2s linear infinite' : 'none',
              filter: hasRecentLog ? 'drop-shadow(0 0 4px rgba(169,201,255,0.8))' : undefined,
            }}>⟳</span>
          )}
        </span>
        {/* Ciclo 6 bonus: pulse ring when recent log */}
        {hasRecentLog && !allDone && (
          <span style={{
            width: '0.5rem', height: '0.5rem', borderRadius: '50%', flexShrink: 0,
            background: 'rgba(169,201,255,0.7)',
            boxShadow: '0 0 8px rgba(169,201,255,0.6)',
            animation: 'k-log-pulse 1s ease-in-out infinite',
          }} />
        )}
        <span style={{
          fontSize: '0.72rem',
          fontFamily: '"JetBrains Mono","Fira Code",ui-monospace,monospace',
          color: allDone ? 'rgba(74,222,128,0.8)' : 'rgba(167,139,250,0.8)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {headerText}
        </span>
        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.22)', flexShrink: 0 }}>
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Collapsable log area */}
      {expanded && (showSteps || showLogs) && (
        <div
          ref={logRef}
          style={{
            maxHeight: 148,
            overflowY: 'auto',
            padding: '4px 12px 10px',
            borderTop: '1px solid rgba(255,255,255,0.045)',
            scrollbarWidth: 'none',
            transition: 'max-height 0.22s ease',
          }}
        >
          {showSteps && steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '2.5px 0',
                fontFamily: '"JetBrains Mono","Fira Code",ui-monospace,monospace',
                fontSize: '0.67rem',
                color: step.done ? 'rgba(74,222,128,0.72)' : 'rgba(255,255,255,0.42)',
              }}
            >
              <span style={{ flexShrink: 0, width: 12, textAlign: 'center' }}>{step.done ? '✓' : '·'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.text}</span>
            </div>
          ))}

          {showLogs && runtimeLogs.map((entry, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '2.5px 0',
                fontFamily: '"JetBrains Mono","Fira Code",ui-monospace,monospace',
                fontSize: '0.67rem',
              }}
            >
              <span style={{ flexShrink: 0, width: 12, textAlign: 'center', color: levelColor(entry.level) }}>
                {levelDot(entry.level)}
              </span>
              <span style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: levelColor(entry.level),
              }}>
                {entry.message.slice(0, 80)}
              </span>
              <span style={{ flexShrink: 0, fontSize: '0.59rem', color: 'rgba(255,255,255,0.18)' }}>
                {relativeTime(entry.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}

      {onCollapse && (
        <button
          onClick={onCollapse}
          style={{
            position: 'absolute', top: 4, right: 28,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)',
          }}
        >
          ✕
        </button>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes k-log-pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.5); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
