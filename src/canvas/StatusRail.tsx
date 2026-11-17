import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useVoiceState } from '../contexts/VoiceStateContext';
import { useCanvas } from './canvasStore';

type Glance = {
  weather?: { temp?: number; condition?: string; icon?: string };
  jobsActive?: number;
  capSat?: number;
  health?: { overall: 'ok' | 'degraded' | 'down' | 'unknown'; downCount: number; degradedCount: number };
};

const STATE_LABELS: Record<string, string> = {
  idle: 'pronto',
  listening: 'ascolto',
  thinking: 'elaboro',
  processing: 'elaboro',
  speaking: 'parlo',
  executing: 'eseguo',
  error: 'errore',
};

const STATE_COLORS: Record<string, string> = {
  idle: '#a9c9ff',
  listening: '#fb7185',
  thinking: '#a78bfa',
  speaking: '#4ade80',
  executing: '#f5d780',
  error: '#f87171',
};

const ICON_STROKE = 1.4;

function IconWeather({ condition, icon }: { condition?: string; icon?: string }) {
  const hint = `${condition || ''} ${icon || ''}`.toLowerCase();
  const rainy = /\b(rain|piogg|drizzle|shower)\b/.test(hint);
  const snowy = /\b(snow|neve)\b/.test(hint);
  const cloudy = /\b(cloud|nuvol|overcast|coperto)\b/.test(hint);
  const stormy = /\b(storm|thunder|temporale)\b/.test(hint);

  if (stormy) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 14h-1.26a8 8 0 1 0-11.62-9" />
        <path d="M13 11l-4 6h6l-4 6" />
      </svg>
    );
  }
  if (rainy) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3" />
        <path d="M20 16a4 4 0 0 0 0-7.5 6 6 0 0 0-11.5-2A5 5 0 0 0 4 16h16Z" />
      </svg>
    );
  }
  if (snowy) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 16a4 4 0 0 0 0-7.5 6 6 0 0 0-11.5-2A5 5 0 0 0 4 16h16Z" />
        <path d="M9 19l-1 1M13 19l-1 1M17 19l-1 1" />
      </svg>
    );
  }
  if (cloudy) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 17.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5-2A5 5 0 0 0 4 17.5h16Z" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function IconJobs() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h13M3 12h13M3 18h13" />
      <circle cx="20" cy="6" r="1.6" />
      <circle cx="20" cy="12" r="1.6" />
      <circle cx="20" cy="18" r="1.6" />
    </svg>
  );
}

function IconWidgets() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
    </svg>
  );
}

function IconCoach() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v2" />
      <path d="M9 4h6" />
      <path d="M7 6c-2 0-3 1-3 3v5c0 4 3 7 8 7s8-3 8-7V9c0-2-1-3-3-3" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function StatusRail() {
  const { voiceState } = useVoiceState();
  const canvas = useCanvas();
  const [glance, setGlance] = useState<Glance>({});
  const [now, setNow] = useState(new Date());
  const [wakeWordOn, setWakeWordOn] = useState(false);
  const [wakeFlash, setWakeFlash] = useState(false);

  useEffect(() => {
    const onWake = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      setWakeWordOn(Boolean(detail?.active));
    };
    const onWakeHeard = () => {
      setWakeFlash(true);
      window.setTimeout(() => setWakeFlash(false), 1500);
    };
    window.addEventListener('kira:wakeword', onWake as EventListener);
    window.addEventListener('kira:wakeheard', onWakeHeard);
    return () => {
      window.removeEventListener('kira:wakeword', onWake as EventListener);
      window.removeEventListener('kira:wakeheard', onWakeHeard);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [weather, jobsResp, cap, health] = await Promise.allSettled([
          fetch('/api/assistant/weather').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/agents/jobs').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/capability/status').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/system/integrations-health').then((r) => (r.ok ? r.json() : null)),
        ]);
        if (cancelled) return;

        const wOk = weather.status === 'fulfilled' && weather.value?.status === 'ok' ? weather.value.data : null;
        const jobsValue: unknown = jobsResp.status === 'fulfilled' ? jobsResp.value : null;
        const jobs: Array<{ status?: string }> = Array.isArray(jobsValue)
          ? jobsValue
          : (jobsValue && typeof jobsValue === 'object' && 'jobs' in jobsValue
              ? ((jobsValue as { jobs?: Array<{ status?: string }> }).jobs || [])
              : []);
        const activeJobs = jobs.filter((it) =>
          ['running', 'in_progress', 'pending', 'awaiting_approval'].includes(it.status || '')).length;

        const capValue: unknown = cap.status === 'fulfilled' ? cap.value : null;
        const capSat = capValue && typeof capValue === 'object' && 'summary' in capValue
          ? (capValue as { summary: { saturationPct?: number } }).summary.saturationPct
          : undefined;

        const healthValue: unknown = health.status === 'fulfilled' ? health.value : null;
        const healthData = healthValue && typeof healthValue === 'object' && 'overall' in healthValue
          ? (healthValue as { overall: 'ok' | 'degraded' | 'down' | 'unknown'; downCount: number; degradedCount: number })
          : undefined;

        setGlance({
          weather: wOk ? { temp: wOk.temp, condition: wOk.condition, icon: wOk.icon } : undefined,
          jobsActive: activeJobs,
          capSat,
          health: healthData,
        });
      } catch { /* silent */ }
    }
    void load();
    const id = window.setInterval(() => { if (document.hidden) return; void load(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const visibleWidgets = canvas.widgets.filter((w) => w.state !== 'minimized').length;
  const minimizedWidgets = canvas.widgets.filter((w) => w.state === 'minimized').length;
  const stateLabel = STATE_LABELS[voiceState] || voiceState;
  const stateColor = STATE_COLORS[voiceState] || '#a9c9ff';
  const isActive = voiceState !== 'idle';

  return (
    <div
      className="kc-statusrail"
      aria-label="Status rail"
      style={{ '--kc-sr-state-color': stateColor } as CSSProperties}
    >
      <div className="kc-sr-cell">
        <span
          className={`kc-sr-dot ${isActive ? '' : 'kc-sr-dot-idle'}`}
          style={{ background: stateColor, boxShadow: isActive ? `0 0 7px ${stateColor}` : 'none' }}
        />
        <span className="kc-sr-val" style={{ color: stateColor }}>{stateLabel}</span>
      </div>

      <RailSep />
      <div className="kc-sr-cell" title="Ora locale">
        <span className="kc-sr-ico kc-sr-ico-dim"><IconClock /></span>
        <span className="kc-sr-val kc-sr-val-mono">{now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      {glance.weather && (glance.weather.temp !== undefined || glance.weather.condition) ? (
        <>
          <RailSep />
          <button
            type="button"
            className="kc-sr-cell kc-sr-clickable"
            onClick={() => canvas.openWidget('weather')}
            title={glance.weather.condition ? `Meteo - ${glance.weather.condition}` : 'Apri meteo'}
          >
            <span className="kc-sr-ico kc-sr-ico-cyan"><IconWeather condition={glance.weather.condition} icon={glance.weather.icon} /></span>
            {glance.weather.temp !== undefined ? <span className="kc-sr-val kc-sr-val-mono">{Math.round(glance.weather.temp)}C</span> : null}
          </button>
        </>
      ) : null}

      <RailSep />
      <button
        type="button"
        className="kc-sr-cell kc-sr-clickable"
        onClick={() => canvas.openWidget('activity')}
        title="Apri attivita"
      >
        <span className={`kc-sr-ico ${(glance.jobsActive || 0) > 0 ? 'kc-sr-ico-cyan kc-sr-ico-pulse' : 'kc-sr-ico-dim'}`}>
          <IconJobs />
        </span>
        <span className="kc-sr-val kc-sr-val-mono" style={{ color: (glance.jobsActive || 0) > 0 ? '#a9c9ff' : 'rgba(255,255,255,0.55)' }}>
          {glance.jobsActive ?? 0}
        </span>
      </button>

      <RailSep />
      <div className="kc-sr-cell" title={`${visibleWidgets} aperti - ${minimizedWidgets} minimizzati`}>
        <span className="kc-sr-ico kc-sr-ico-cyan"><IconWidgets /></span>
        <span className="kc-sr-val kc-sr-val-mono">{visibleWidgets}{minimizedWidgets > 0 ? `-${minimizedWidgets}` : ''}</span>
      </div>

      {glance.health && (glance.health.downCount > 0 || glance.health.degradedCount > 0) && (
        <>
          <RailSep />
          <button
            type="button"
            className="kc-sr-cell kc-sr-clickable kc-sr-health-alert"
            onClick={() => window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: 'settings' } }))}
            title={`${glance.health.downCount} down - ${glance.health.degradedCount} degradati - apri impostazioni`}
          >
            <span className="kc-sr-ico" style={{ color: glance.health.overall === 'down' ? '#f87171' : '#fbbf24' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </span>
            <span className="kc-sr-val kc-sr-val-mono" style={{ color: glance.health.overall === 'down' ? '#f87171' : '#fbbf24' }}>
              {glance.health.downCount + glance.health.degradedCount}
            </span>
          </button>
        </>
      )}

      {glance.capSat !== undefined && (
        <>
          <RailSep />
          <div
            className="kc-sr-cell kc-sat-chip"
            title={`Copertura capacita: ${glance.capSat}%`}
            style={{ '--kc-sat': `${glance.capSat}%` } as CSSProperties}
          >
            <span className="kc-sat-chip-bar" />
            <span className="kc-sr-val kc-sr-val-mono" style={{ color: glance.capSat >= 80 ? '#4ade80' : glance.capSat >= 50 ? '#fbbf24' : '#f87171' }}>
              {glance.capSat}%
            </span>
          </div>
        </>
      )}

      <div className="kc-sr-spacer" />

      {wakeWordOn && (
        <>
          <div className={`kc-sr-cell kc-sr-wake-cell${wakeFlash ? ' kc-sr-wake-flash' : ''}`} title="Wake word attivo: dì «Kira» per parlare">
            <span className="kc-sr-ico kc-sr-wake-ico">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </span>
            <span className="kc-sr-val kc-sr-val-mono">listen</span>
          </div>
          <RailSep />
        </>
      )}

      <NetworkBadge />
      <RailSep />
      <OllamaBadge />
      <RailSep />
      <button
        type="button"
        className="kc-sr-cell kc-sr-clickable"
        onClick={() => window.dispatchEvent(new CustomEvent('kira:openCommandPalette'))}
        title="Command Palette (Ctrl+K)"
      >
        <span className="kc-sr-ico kc-sr-ico-dim" style={{ fontSize: '0.62rem', lineHeight: 1 }}>cmd</span>
        <span className="kc-sr-val kc-sr-val-mono kc-sr-val-dim">K</span>
      </button>
      <RailSep />
      <div className="kc-sr-cell">
        <span className="kc-sr-brand-text">KIRA - AI OS</span>
      </div>
    </div>
  );
}

function RailSep() {
  return <div className="kc-sr-sep" />;
}

function OllamaBadge() {
  const [status, setStatus] = useState<'ok' | 'warn' | 'error' | 'checking'>('checking');
  const [modelCount, setModelCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const r = await fetch('/api/diagnostics');
        if (cancelled) return;
        if (!r.ok) { setStatus('error'); return; }
        const d = await r.json() as { ollama?: { ok?: boolean; modelCount?: number; latencyMs?: number } };
        if (d.ollama?.ok) {
          setModelCount(d.ollama.modelCount ?? 0);
          setStatus(d.ollama.latencyMs && d.ollama.latencyMs > 3000 ? 'warn' : 'ok');
        } else {
          setStatus('error');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }
    void check();
    const id = window.setInterval(() => { if (document.hidden) return; void check(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const color = status === 'ok' ? 'rgba(74,222,128,0.85)' : status === 'warn' ? 'rgba(214,226,246,0.85)' : status === 'error' ? 'rgba(248,113,113,0.85)' : 'rgba(255,255,255,0.3)';
  const label = status === 'ok' ? `${modelCount}M` : status === 'warn' ? 'lento' : status === 'error' ? 'off' : '...';
  const title = status === 'ok' ? `Ollama - ${modelCount} modelli` : status === 'warn' ? 'Ollama lento (>3s)' : status === 'error' ? 'Ollama non raggiungibile' : 'Verifica Ollama...';

  return (
    <div className="kc-sr-cell" title={title}>
      <span className="kc-sr-ico" style={{ color }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
        </svg>
      </span>
      <span className="kc-sr-val kc-sr-val-mono" style={{ color }}>{label}</span>
    </div>
  );
}

function NetworkBadge() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const onChange = () => setOnline(navigator.onLine);
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, []);

  return (
    <div className="kc-sr-cell" title={online ? 'Rete attiva' : 'Offline'}>
      <span className={`kc-sr-ico ${online ? 'kc-sr-ico-cyan' : 'kc-sr-ico-dim'}`}>
        {online ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5a10 10 0 0 1 14 0" />
            <path d="M8 16a6 6 0 0 1 8 0" />
            <path d="M11 19.5h2" />
            <path d="M2 9a14 14 0 0 1 20 0" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="3" x2="21" y2="21" />
            <path d="M5 12.5a10 10 0 0 1 5-3" />
            <path d="M11 19.5h2" />
          </svg>
        )}
      </span>
      <span className="kc-sr-val kc-sr-val-mono" style={{ color: online ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.85)' }}>
        {online ? 'ONLINE' : 'OFF'}
      </span>
    </div>
  );
}
