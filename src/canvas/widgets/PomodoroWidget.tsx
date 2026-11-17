import { useCallback, useEffect, useRef, useState } from 'react';
import { playConfirm, playNotify } from '../../lib/soundManager';

type Phase = 'work' | 'break' | 'long_break';

const DURATIONS: Record<Phase, number> = {
  work:       25 * 60,
  break:       5 * 60,
  long_break: 15 * 60,
};

const PHASE_LABEL: Record<Phase, string> = {
  work:       'Lavoro',
  break:      'Pausa',
  long_break: 'Pausa lunga',
};

const PHASE_COLOR: Record<Phase, string> = {
  work:       '#a9c9ff',
  break:      '#4ade80',
  long_break: '#a78bfa',
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function PomodoroWidget() {
  const [phase, setPhase]         = useState<Phase>('work');
  const [remaining, setRemaining] = useState(DURATIONS.work);
  const [running, setRunning]     = useState(false);
  const [cycles, setCycles]       = useState(0);  // completed work cycles
  const [customWork, setCustomWork]   = useState(25);
  const [showSettings, setShowSettings] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const color = PHASE_COLOR[phase];
  const total = phase === 'work' ? customWork * 60 : DURATIONS[phase];
  const progress = ((total - remaining) / total) * 100;

  // Sync remaining when phase changes (or custom work duration changes)
  useEffect(() => {
    setRemaining(phase === 'work' ? customWork * 60 : DURATIONS[phase]);
    setRunning(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            // Cycle complete
            if (phase === 'work') {
              const newCycles = cycles + 1;
              setCycles(newCycles);
              playConfirm();
              const nextPhase: Phase = newCycles % 4 === 0 ? 'long_break' : 'break';
              setPhase(nextPhase);
            } else {
              playNotify();
              setPhase('work');
            }
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const toggle = useCallback(() => setRunning((r) => !r), []);
  const reset  = useCallback(() => {
    setRunning(false);
    setRemaining(phase === 'work' ? customWork * 60 : DURATIONS[phase]);
  }, [phase, customWork]);
  const skip   = useCallback(() => {
    setRunning(false);
    if (phase === 'work') {
      const newCycles = cycles + 1;
      setCycles(newCycles);
      setPhase(newCycles % 4 === 0 ? 'long_break' : 'break');
    } else {
      setPhase('work');
    }
  }, [phase, cycles]);

  const circumference = 2 * Math.PI * 54;
  const dash = circumference * (1 - progress / 100);

  return (
    <div className="kc-pom">
      {/* Phase selector */}
      <div className="kc-pom-phases">
        {(['work', 'break', 'long_break'] as Phase[]).map((p) => (
          <button
            key={p}
            className={`kc-pom-phase-btn${phase === p ? ' kc-pom-phase-active' : ''}`}
            style={phase === p ? { borderColor: `${PHASE_COLOR[p]}44`, color: PHASE_COLOR[p] } : {}}
            onClick={() => { setRunning(false); setPhase(p); }}
          >
            {PHASE_LABEL[p]}
          </button>
        ))}
      </div>

      {/* SVG ring timer */}
      <div className="kc-pom-ring-wrap">
        <svg width="140" height="140" viewBox="0 0 140 140" className="kc-pom-ring-svg">
          {/* Track */}
          <circle cx="70" cy="70" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          {/* Progress */}
          <circle
            cx="70" cy="70" r="54"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dash}
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dashoffset 0.9s linear', filter: `drop-shadow(0 0 6px ${color}66)` }}
          />
        </svg>
        <div className="kc-pom-ring-inner">
          <span className="kc-pom-time" style={{ color }}>{fmtTime(remaining)}</span>
          <span className="kc-pom-phase-label">{PHASE_LABEL[phase]}</span>
          {cycles > 0 && <span className="kc-pom-cycles">{cycles} {cycles === 1 ? 'ciclo' : 'cicli'}</span>}
        </div>
      </div>

      {/* Controls */}
      <div className="kc-pom-controls">
        <button className="kc-pom-btn kc-pom-btn-sm" onClick={reset} title="Reset">↺</button>
        <button
          className={`kc-pom-btn kc-pom-btn-main${running ? ' kc-pom-btn-pause' : ''}`}
          style={{ borderColor: `${color}44`, color }}
          onClick={toggle}
        >
          {running ? '⏸ Pausa' : '▶ Avvia'}
        </button>
        <button className="kc-pom-btn kc-pom-btn-sm" onClick={skip} title="Salta">⏭</button>
      </div>

      {/* Settings toggle */}
      <button className="kc-pom-settings-btn" onClick={() => setShowSettings((s) => !s)}>
        {showSettings ? '▲ chiudi' : '⚙ durata'}
      </button>
      {showSettings && (
        <div className="kc-pom-settings">
          <label className="kc-pom-setting-row">
            <span>Lavoro (min)</span>
            <input
              type="number"
              className="kc-pom-setting-input"
              value={customWork}
              min={1} max={90}
              onChange={(e) => {
                const v = Math.max(1, Math.min(90, Number(e.target.value)));
                setCustomWork(v);
                if (phase === 'work' && !running) setRemaining(v * 60);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
