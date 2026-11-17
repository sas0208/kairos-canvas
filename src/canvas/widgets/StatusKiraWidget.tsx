import { useEffect, useState, useCallback } from 'react';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';

// Stato Kira — cruscotto a colpo d'occhio su tutti i sottosistemi.
// Consuma GET /api/system/overview (aggregatore kiraOverview.ts).

interface Overview {
  ok: boolean;
  at: string;
  uptimeSec: number;
  evolve: { running: boolean; patches: number };
  proposals: { open: number; total: number };
  models: { reachable: boolean; installed: number; missingRoles: string[]; fallbackRoles: string[] };
  warnings: string[];
}

// Palette argento/azzurro/vetro coerente con gli altri widget.
const SILVER = 'rgba(255,255,255,.45)';
const CYAN = '#7dd3fc';
const GREEN = '#4ade80';
const AMBER = '#fbbf24';
const RED = '#fca5a5';

function fmtUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const cardStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: '0.7rem',
  padding: '0.5rem 0.6rem',
  background: 'rgba(255,255,255,.03)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  minWidth: 0,
};
const labelStyle: React.CSSProperties = { color: SILVER, fontSize: '0.66rem' };
const valueStyle: React.CSSProperties = { fontSize: '1.05rem', fontWeight: 500, color: '#e2e8f0' };
const subStyle: React.CSSProperties = { fontSize: '0.62rem', color: 'rgba(255,255,255,.4)' };

function StatCard({
  label, value, sub, accent,
}: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; accent?: string }) {
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ ...valueStyle, color: accent || valueStyle.color }}>{value}</div>
      {sub != null && <div style={subStyle}>{sub}</div>}
    </div>
  );
}

export function StatusKiraWidget() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const r = await fetch('/api/system/overview');
      if (!r.ok) throw new Error('Overview non disponibile');
      const j = (await r.json()) as Overview;
      if (j.ok === false) throw new Error('Overview non disponibile');
      setData(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  if (error && !data) return <WidgetError message={error} onRetry={load} />;
  if (!data) return <WidgetSpinner fullHeight label="Stato Kira" />;

  const { evolve, proposals, models, warnings } = data;
  const modelsBad = !models.reachable || models.missingRoles.length > 0;

  return (
    <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.7rem', fontSize: '0.8rem', height: '100%', overflowY: 'auto' }}>
      {/* Banner warnings / tutto ok */}
      {warnings.length > 0 ? (
        <div style={{
          border: '1px solid rgba(251,191,36,.35)', borderRadius: '0.7rem',
          padding: '0.5rem 0.65rem', background: 'rgba(251,191,36,.08)',
          display: 'flex', flexDirection: 'column', gap: '0.25rem',
        }}>
          <div style={{ color: AMBER, fontSize: '0.72rem', fontWeight: 500 }}>
            ⚠ {warnings.length} avvis{warnings.length === 1 ? 'o' : 'i'}
          </div>
          {warnings.map((w, i) => (
            <div key={i} style={{ color: RED, fontSize: '0.7rem', lineHeight: 1.35 }}>• {w}</div>
          ))}
        </div>
      ) : (
        <div style={{
          border: '1px solid rgba(74,222,128,.3)', borderRadius: '0.7rem',
          padding: '0.45rem 0.65rem', background: 'rgba(74,222,128,.07)',
          color: GREEN, fontSize: '0.74rem', fontWeight: 500,
        }}>
          ✓ Tutto ok
        </div>
      )}

      {/* Griglia stat card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.5rem' }}>
        <StatCard
          label="Evolve"
          value={<><span style={{ color: evolve.running ? GREEN : SILVER }}>{evolve.running ? '●' : '○'}</span> {evolve.running ? 'attivo' : 'fermo'}</>}
          sub={`${evolve.patches} patch`}
        />
        <StatCard
          label="Proposte"
          value={`${proposals.open}`}
          sub={`aperte / ${proposals.total} totali`}
          accent={proposals.open > 0 ? CYAN : undefined}
        />
        <StatCard
          label="Modelli"
          value={<>{modelsBad && <span style={{ color: AMBER }}>⚠ </span>}{models.installed}</>}
          sub={
            !models.reachable
              ? <span style={{ color: RED }}>Ollama irraggiungibile</span>
              : models.missingRoles.length > 0
                ? <span style={{ color: AMBER }}>manca: {models.missingRoles.join(', ')}</span>
                : models.fallbackRoles.length > 0
                  ? <span style={{ color: AMBER }}>fallback: {models.fallbackRoles.join(', ')}</span>
                  : 'tutti i ruoli ok'
          }
          accent={modelsBad ? AMBER : undefined}
        />
        <StatCard
          label="Uptime"
          value={fmtUptime(data.uptimeSec)}
          sub={data.at ? new Date(data.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : undefined}
        />
      </div>
    </div>
  );
}
