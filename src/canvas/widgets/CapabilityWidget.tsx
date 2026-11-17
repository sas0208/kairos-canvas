import { useEffect, useState } from 'react';
import { WidgetSpinner } from '../components/WidgetStates';

interface Capability {
  id: string;
  name: string;
  status: 'implemented' | 'partial' | 'missing' | 'broken';
  aliases?: string[];
  gaps?: string[];
  widget?: string | null;
}

interface CapSummary {
  total: number;
  implemented: number;
  partial: number;
  missing: number;
  broken: number;
  saturationPct: number;
}

type Filter = 'all' | 'gaps' | 'ok';

const STATUS_COLOR: Record<string, string> = {
  implemented: '#4ade80',
  partial:     '#fbbf24',
  missing:     '#f87171',
  broken:      '#fb923c',
};
const STATUS_LABEL: Record<string, string> = {
  implemented: 'ok',
  partial:     'parziale',
  missing:     'mancante',
  broken:      'rotto',
};

export function CapabilityWidget() {
  const [caps, setCaps] = useState<Capability[]>([]);
  const [summary, setSummary] = useState<CapSummary | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [listResp, statusResp] = await Promise.all([
          fetch('/api/capability/list'),
          fetch('/api/capability/status'),
        ]);
        if (cancelled) return;
        const listJson = await listResp.json() as { capabilities?: Capability[] };
        const statusJson = await statusResp.json() as { summary?: CapSummary };
        setCaps(listJson.capabilities || []);
        setSummary(statusJson.summary || null);
      } catch { /* noop */ } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const visible = caps.filter((c) => {
    if (filter === 'gaps') return c.status !== 'implemented';
    if (filter === 'ok')   return c.status === 'implemented';
    return true;
  });

  const satPct = summary?.saturationPct ?? 0;

  return (
    <div className="kc-w-cap">
      {/* Header saturation bar */}
      <div className="kc-w-cap-top">
        <div className="kc-w-cap-sat-label">
          <span>Copertura</span>
          <span className="kc-w-cap-sat-pct" style={{ color: satPct >= 80 ? '#4ade80' : satPct >= 50 ? '#fbbf24' : '#f87171' }}>
            {satPct}%
          </span>
        </div>
        <div className="kc-sat-bar-wrap" style={{ marginBottom: 8 }}>
          <div className="kc-sat-bar-fill" style={{ width: `${satPct}%` }} />
        </div>
        {summary && (
          <div className="kc-w-cap-chips">
            <span className="kc-job-pill kc-job-pill-done">{summary.implemented} ok</span>
            {summary.partial > 0  && <span className="kc-job-pill kc-job-pill-pending">{summary.partial} parziali</span>}
            {summary.missing > 0  && <span className="kc-job-pill kc-job-pill-error">{summary.missing} mancanti</span>}
            {summary.broken > 0   && <span className="kc-job-pill kc-job-pill-blocked">{summary.broken} rotti</span>}
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="kc-w-cap-tabs">
        {(['all', 'gaps', 'ok'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`kc-w-cap-tab ${filter === f ? 'kc-w-cap-tab-active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Tutto' : f === 'gaps' ? 'Gap' : 'Completati'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <WidgetSpinner label="Caricamento capability…" fullHeight />
      ) : visible.length === 0 ? (
        <div className="kc-w-empty-hint">Nessuna voce</div>
      ) : (
        <ul className="kc-w-cap-list">
          {visible.map((c) => (
            <li key={c.id} className="kc-w-cap-row">
              <span
                className="kc-w-cap-dot"
                style={{ background: STATUS_COLOR[c.status] ?? '#555', boxShadow: `0 0 6px ${STATUS_COLOR[c.status] ?? '#555'}50` }}
              />
              <div className="kc-w-cap-body">
                <div className="kc-w-cap-name">{c.name}</div>
                {c.gaps && c.gaps.length > 0 && (
                  <ul className="kc-w-cap-gaps">
                    {c.gaps.map((g, i) => <li key={i} className="kc-w-cap-gap">↳ {g}</li>)}
                  </ul>
                )}
              </div>
              <span
                className="kc-job-pill"
                style={{
                  background: `${STATUS_COLOR[c.status]}12`,
                  borderColor: `${STATUS_COLOR[c.status]}30`,
                  color: STATUS_COLOR[c.status],
                  flexShrink: 0,
                }}
              >
                {STATUS_LABEL[c.status] ?? c.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
