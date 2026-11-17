import { useCallback, useEffect, useRef, useState } from 'react';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';
import { askKira } from '../../lib/askKira';

// Operations Center — IL posto unico dove l'utente vede TUTTO ciò che Kira sta facendo:
// operazioni in corso, completate, fallite e in attesa di una sua decisione.
// Ogni card risponde alle domande chiave: cosa fa, chi, a che punto, riuscita/fallita,
// perché, cosa fare dopo, dove vedo il risultato. Linguaggio umano; il log tecnico è
// nascosto sotto "Dettaglio tecnico".

type OpStatus = 'running' | 'waiting' | 'success' | 'error' | 'cancelled';
type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface HumanError {
  title: string; explanation: string; cause: string; impact: string; action: string;
  retryable: boolean; technical: string;
}
interface OpStep { label: string; status: StepStatus; at?: string }
interface OpOutput { kind: string; summary: string; widgetId?: string; path?: string }
interface OpInput { question: string; options?: string[] }
interface Operation {
  id: string; kind: string; title: string; summary: string; status: OpStatus;
  module: string; progress: number; steps: OpStep[];
  startedAt: string; updatedAt: string; finishedAt?: string; durationMs?: number;
  needsInput?: OpInput; output?: OpOutput; error?: HumanError; techLog: string[];
  userInitiated: boolean; source: string; canRetry: boolean;
}
type SystemState = 'ok' | 'running' | 'idle' | 'warn' | 'stale' | 'off';
interface SystemAction { label: string; endpoint?: string; method?: 'POST'; openUrl?: string; confirm?: string; danger?: boolean }
interface SystemStatus {
  id: string; label: string; icon: string; state: SystemState;
  summary: string; detail?: string; lastAt?: string; stale?: boolean; ageLabel?: string;
  actions?: SystemAction[]; widgetId?: string;
}
interface QuickAction { id: string; label: string; endpoint: string; body?: Record<string, unknown>; confirm?: string; danger?: boolean; available: boolean; note?: string }
interface OutputItem { key: string; label: string; description: string; publicName: string; path: string; updatedAt?: string; reachable: boolean; stale: boolean; ageLabel: string }
interface NotReadyEntry { name: string; reason: string; chatControllable: boolean }
interface OpsResponse {
  ok: boolean;
  summary: { running: number; waiting: number; success: number; error: number; needsAttention: number };
  operations: Operation[];
  systems?: SystemStatus[];
  quickActions?: QuickAction[];
  outputs?: OutputItem[];
  notReady?: NotReadyEntry[];
}

const C = {
  silver: 'rgba(255,255,255,.45)', text: '#e2e8f0', cyan: '#7dd3fc',
  green: '#4ade80', amber: '#fbbf24', red: '#fca5a5', dim: 'rgba(255,255,255,.35)',
};

const STATUS_META: Record<OpStatus, { label: string; color: string; icon: string }> = {
  running: { label: 'In corso', color: C.cyan, icon: '◐' },
  waiting: { label: 'Aspetta te', color: C.amber, icon: '⏸' },
  success: { label: 'Riuscita', color: C.green, icon: '✓' },
  error: { label: 'Fallita', color: C.red, icon: '✕' },
  cancelled: { label: 'Annullata', color: C.dim, icon: '⊘' },
};

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'ora';
  if (s < 3600) return `${Math.floor(s / 60)}m fa`;
  if (s < 86400) return `${Math.floor(s / 3600)}h fa`;
  return `${Math.floor(s / 86400)}g fa`;
}
function fmtDur(ms?: number): string {
  if (!ms || ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

const btn: React.CSSProperties = {
  background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)',
  borderRadius: '0.5rem', padding: '0.28rem 0.6rem', color: '#fff', fontSize: '0.68rem', cursor: 'pointer',
};
const monoBox: React.CSSProperties = {
  margin: '0.3rem 0 0', maxHeight: 140, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '0.5rem',
  padding: '0.45rem 0.55rem', color: 'rgba(255,255,255,.65)', fontSize: '0.64rem', lineHeight: 1.4,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

function openWidget(widgetId?: string) {
  if (!widgetId) return;
  window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId } }));
}
const SYS_STATE: Record<SystemState, { label: string; color: string; dot: string }> = {
  ok: { label: 'attivo', color: '#4ade80', dot: '●' },
  running: { label: 'in lavoro', color: '#7dd3fc', dot: '◐' },
  idle: { label: 'fermo', color: 'rgba(255,255,255,.4)', dot: '○' },
  warn: { label: 'attenzione', color: '#fbbf24', dot: '▲' },
  stale: { label: 'dato vecchio', color: '#fbbf24', dot: '◷' },
  off: { label: 'spento', color: 'rgba(255,255,255,.35)', dot: '○' },
};

function SystemCard({ sys, onRun }: { sys: SystemStatus; onRun: (a: SystemAction) => void }) {
  const m = SYS_STATE[sys.state];
  return (
    <div style={{
      border: `1px solid ${sys.state === 'warn' || sys.state === 'stale' ? 'rgba(251,191,36,.3)' : 'rgba(255,255,255,.08)'}`,
      borderRadius: '0.6rem', padding: '0.45rem 0.55rem', background: 'rgba(255,255,255,.03)',
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.85rem' }}>{sys.icon}</span>
        <span style={{ flex: 1, minWidth: 0, color: C.text, fontSize: '0.74rem', fontWeight: 500 }}>{sys.label}</span>
        <span style={{ color: m.color, fontSize: '0.62rem' }}>{m.dot} {m.label}{sys.stale && sys.ageLabel ? ` · ${sys.ageLabel}` : ''}</span>
      </div>
      <div style={{ color: 'rgba(255,255,255,.62)', fontSize: '0.68rem', lineHeight: 1.3 }}>{sys.summary}</div>
      {sys.detail && <div style={{ color: C.silver, fontSize: '0.63rem', lineHeight: 1.3 }}>{sys.detail}</div>}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {(sys.actions || []).map((a, i) => (
          <button key={i} style={{ ...btn, fontSize: '0.63rem', color: a.danger ? C.amber : '#fff', borderColor: a.danger ? 'rgba(251,191,36,.4)' : undefined }} onClick={() => onRun(a)}>{a.label}</button>
        ))}
        {sys.widgetId && <button style={{ ...btn, fontSize: '0.63rem' }} onClick={() => openWidget(sys.widgetId)}>Apri dettaglio →</button>}
      </div>
    </div>
  );
}

function OutputCard({ item }: { item: OutputItem }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const load = async () => {
    setOpen((v) => !v);
    if (summary === null) {
      try {
        const r = await fetch(`/api/ops-stack/output?key=${encodeURIComponent(item.key)}`);
        const j = await r.json() as { ok: boolean; summary?: string; raw?: string; error?: string };
        setSummary(j.ok ? (j.summary || '') : (j.error || 'Non leggibile'));
        setRaw(j.raw || '');
      } catch { setSummary('Non leggibile in questo momento.'); }
    }
  };
  return (
    <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: '0.55rem', padding: '0.4rem 0.5rem', background: 'rgba(255,255,255,.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ flex: 1, minWidth: 0, color: C.text, fontSize: '0.7rem' }}>{item.label}</span>
        {item.stale && <span style={{ color: C.amber, fontSize: '0.58rem' }}>vecchio · {item.ageLabel}</span>}
        <button style={{ ...btn, fontSize: '0.6rem' }} onClick={load}>{open ? 'Chiudi' : 'Sintesi per me'}</button>
      </div>
      {open && (
        <div style={{ marginTop: '0.35rem' }}>
          <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.66rem', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{summary ?? 'Carico…'}</div>
          {raw && (
            <>
              <button style={{ ...btn, fontSize: '0.58rem', marginTop: '0.3rem' }} onClick={() => setShowRaw((v) => !v)}>{showRaw ? '▾' : '▸'} testo completo</button>
              {showRaw && <pre style={monoBox}>{raw.slice(0, 6000)}</pre>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OperationCard({ op, onAction }: { op: Operation; onAction: (id: string, action: 'retry' | 'cancel' | 'approve' | 'deny') => void }) {
  const [showTech, setShowTech] = useState(false);
  const [showSteps, setShowSteps] = useState(op.status === 'running');
  const meta = STATUS_META[op.status];
  const visibleSteps = op.steps.filter(Boolean);
  const activeStep = visibleSteps.find((s) => s.status === 'active');

  return (
    <div style={{
      border: `1px solid ${op.status === 'error' ? 'rgba(252,165,165,.3)' : op.status === 'waiting' ? 'rgba(251,191,36,.3)' : 'rgba(255,255,255,.08)'}`,
      borderRadius: '0.7rem', padding: '0.6rem 0.7rem', background: 'rgba(255,255,255,.03)',
      display: 'flex', flexDirection: 'column', gap: '0.4rem',
    }}>
      {/* Header: titolo + stato */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.25 }}>{op.title}</div>
          <div style={{ color: C.silver, fontSize: '0.66rem', marginTop: '0.12rem' }}>
            {op.module} · {timeAgo(op.updatedAt)}{op.durationMs ? ` · ${fmtDur(op.durationMs)}` : ''}
          </div>
        </div>
        <span style={{
          flex: '0 0 auto', fontSize: '0.62rem', fontWeight: 600, color: meta.color,
          border: `1px solid ${meta.color}55`, borderRadius: '0.4rem', padding: '0.12rem 0.4rem',
        }}>{meta.icon} {meta.label}</span>
      </div>

      {/* Cosa fa / perché (sempre visibile, umano) */}
      <div style={{ color: 'rgba(255,255,255,.6)', fontSize: '0.7rem', lineHeight: 1.35 }}>{op.summary}</div>

      {/* Barra di avanzamento per operazioni in corso */}
      {op.status === 'running' && (
        <div>
          {activeStep && <div style={{ color: C.cyan, fontSize: '0.68rem', marginBottom: '0.25rem' }}>▸ {activeStep.label}…</div>}
          <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${op.progress}%`, background: C.cyan, transition: 'width .4s' }} />
          </div>
        </div>
      )}

      {/* Richiesta di input / approvazione — in evidenza */}
      {op.status === 'waiting' && op.needsInput && (
        <div style={{ border: '1px solid rgba(251,191,36,.35)', background: 'rgba(251,191,36,.08)', borderRadius: '0.5rem', padding: '0.45rem 0.55rem' }}>
          <div style={{ color: C.amber, fontSize: '0.7rem', fontWeight: 500 }}>Serve una tua decisione</div>
          <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.7rem', margin: '0.2rem 0 0.4rem' }}>{op.needsInput.question}</div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {op.kind === 'agent-job' && (op.needsInput.options || []).some((o) => /approv/i.test(o)) ? (
              <>
                <button style={{ ...btn, color: C.green }} onClick={() => onAction(op.id, 'approve')}>Approva</button>
                <button style={{ ...btn, color: C.red }} onClick={() => onAction(op.id, 'deny')}>Rifiuta</button>
                <button style={btn} onClick={() => openWidget('activity')}>Dettagli →</button>
              </>
            ) : (
              <button style={btn} onClick={() => openWidget('activity')}>Apri per decidere →</button>
            )}
          </div>
        </div>
      )}

      {/* Errore tradotto in umano */}
      {op.status === 'error' && op.error && (
        <div style={{ border: '1px solid rgba(252,165,165,.3)', background: 'rgba(252,165,165,.07)', borderRadius: '0.5rem', padding: '0.45rem 0.55rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ color: C.red, fontSize: '0.74rem', fontWeight: 600 }}>{op.error.title}</div>
          <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '0.7rem', lineHeight: 1.35 }}>{op.error.explanation}</div>
          <div style={{ color: C.silver, fontSize: '0.66rem' }}><b style={{ color: 'rgba(255,255,255,.55)' }}>Causa probabile:</b> {op.error.cause}</div>
          <div style={{ color: C.silver, fontSize: '0.66rem' }}><b style={{ color: 'rgba(255,255,255,.55)' }}>Cosa fare:</b> {op.error.action}</div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
            {op.canRetry && <button style={{ ...btn, color: C.green }} onClick={() => onAction(op.id, 'retry')}>↻ Riprova</button>}
            <button style={btn} onClick={() => { void navigator.clipboard?.writeText(op.error?.technical || op.error?.title || ''); }}>Copia errore</button>
            <button style={btn} onClick={() => askKira(`Kira, l'operazione "${op.title}" è fallita: ${op.error?.title}. Cosa è successo e come lo risolvo?`)}>Segnala a Kira</button>
          </div>
        </div>
      )}

      {/* Output prodotto */}
      {op.status === 'success' && op.output && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ color: C.green, fontSize: '0.7rem' }}>✓ {op.output.summary}</span>
          {op.output.widgetId && <button style={btn} onClick={() => openWidget(op.output?.widgetId)}>Apri risultato →</button>}
        </div>
      )}

      {/* Azioni di base */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {op.status === 'running' && op.kind !== 'agent-job' && (
          <button style={btn} onClick={() => onAction(op.id, 'cancel')}>Annulla</button>
        )}
        {visibleSteps.length > 0 && (
          <button style={{ ...btn, fontSize: '0.62rem' }} onClick={() => setShowSteps((v) => !v)}>{showSteps ? '▾' : '▸'} passi ({visibleSteps.length})</button>
        )}
        {op.techLog.length > 0 && (
          <button style={{ ...btn, fontSize: '0.62rem', color: C.silver }} onClick={() => setShowTech((v) => !v)}>{showTech ? '▾' : '▸'} dettaglio tecnico</button>
        )}
      </div>

      {/* Timeline passi */}
      {showSteps && visibleSteps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', paddingLeft: '0.2rem' }}>
          {visibleSteps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.66rem' }}>
              <span style={{ color: s.status === 'done' ? C.green : s.status === 'active' ? C.cyan : s.status === 'error' ? C.red : C.dim }}>
                {s.status === 'done' ? '✓' : s.status === 'active' ? '◐' : s.status === 'error' ? '✕' : '○'}
              </span>
              <span style={{ color: s.status === 'pending' ? C.dim : 'rgba(255,255,255,.7)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Log tecnico (sezione avanzata) */}
      {showTech && op.techLog.length > 0 && (
        <pre style={monoBox}>{op.techLog.join('\n')}</pre>
      )}
    </div>
  );
}

const FILTERS: Array<{ key: 'attention' | 'running' | 'done' | 'all'; label: string }> = [
  { key: 'attention', label: 'Da gestire' },
  { key: 'running', label: 'In corso' },
  { key: 'done', label: 'Concluse' },
  { key: 'all', label: 'Tutte' },
];

export function OperationsWidget() {
  const [data, setData] = useState<OpsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'attention' | 'running' | 'done' | 'all'>('attention');
  const [actionMsg, setActionMsg] = useState<{ kind: 'info' | 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const r = await fetch('/api/operations?limit=80');
      if (!r.ok) throw new Error('Operazioni non disponibili');
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 1500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  const action = useCallback(async (id: string, act: 'retry' | 'cancel' | 'approve' | 'deny') => {
    try {
      // Approva/Rifiuta agiscono sul job dell'orchestratore; retry/cancel sull'operazione.
      const url = act === 'approve' || act === 'deny'
        ? `/api/agents/jobs/${encodeURIComponent(id)}/${act}`
        : `/api/operations/${encodeURIComponent(id)}/${act}`;
      await fetch(url, { method: 'POST' });
      await load();
    } catch { /* ignore */ }
  }, [load]);

  // Esegue un endpoint e NON resta mai silenzioso: legge status+JSON e mostra esito umano.
  const callEndpoint = useCallback(async (label: string, endpoint: string, method = 'POST', body?: Record<string, unknown>) => {
    setActionMsg({ kind: 'info', text: `${label}: avvio…` });
    try {
      const r = await fetch(endpoint, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
      const d = await r.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string; blocked?: boolean };
      if (r.ok && d.ok !== false) {
        setActionMsg({ kind: 'ok', text: `${label}: ${d.message || 'fatto'}.` });
      } else if (d.blocked || r.status === 409) {
        setActionMsg({ kind: 'warn', text: `${label}: ${d.error || 'in attesa'}. Vedi sotto come procedere.` });
      } else {
        setActionMsg({ kind: 'err', text: `${label}: ${d.error || `errore (HTTP ${r.status})`}.` });
      }
    } catch {
      setActionMsg({ kind: 'err', text: `${label}: non riesco a contattare il backend. Riprova.` });
    }
    await load();
  }, [load]);

  const runSystemAction = useCallback(async (a: SystemAction) => {
    if (a.openUrl) { try { window.open(a.openUrl, '_blank'); } catch { /* popup blocked */ } return; }
    if (!a.endpoint) return;
    if (a.confirm && typeof window !== 'undefined' && !window.confirm(a.confirm)) return;
    await callEndpoint(a.label, a.endpoint, a.method || 'POST');
  }, [callEndpoint]);

  const runQuick = useCallback(async (q: QuickAction) => {
    if (!q.available) { setActionMsg({ kind: 'warn', text: `${q.label}: ${q.note || 'non disponibile su questa macchina'}.` }); return; }
    if (q.confirm && typeof window !== 'undefined' && !window.confirm(q.confirm)) return;
    await callEndpoint(q.label, q.endpoint, 'POST', q.body);
  }, [callEndpoint]);

  if (error && !data) return <WidgetError message={error} onRetry={load} />;
  if (!data) return <WidgetSpinner fullHeight label="Operazioni" />;

  const s = data.summary;
  const all = data.operations;
  const systems = data.systems || [];
  const quickActions = data.quickActions || [];
  const outputs = data.outputs || [];
  const notReady = data.notReady || [];
  const list = all.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'attention') return o.status === 'waiting' || o.status === 'error';
    if (filter === 'running') return o.status === 'running';
    return o.status === 'success' || o.status === 'cancelled';
  });

  return (
    <div style={{ padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', height: '100%', fontSize: '0.8rem' }}>
      {/* Microcopy: cosa è e cosa puoi farci */}
      <div style={{ color: C.silver, fontSize: '0.66rem', lineHeight: 1.35 }}>
        <b style={{ color: 'rgba(255,255,255,.7)' }}>Centro Operazioni.</b> Vedi cosa fa Kira <i>e</i> agisci da qui:
        aggiorna, avvia il worker, cura la memoria, apri gli output. Le cose da sistemare sono in cima.
      </div>

      {/* Azioni disponibili — CTA operative dirette */}
      {quickActions.length > 0 && (
        <div>
          <div style={{ color: C.silver, fontSize: '0.6rem', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Azioni disponibili</div>
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {quickActions.map((q) => (
              <button
                key={q.id}
                onClick={() => runQuick(q)}
                disabled={!q.available}
                title={q.note || q.label}
                style={{ ...btn, fontSize: '0.64rem', opacity: q.available ? 1 : 0.4, cursor: q.available ? 'pointer' : 'not-allowed' }}
              >{q.label}{!q.available ? ' (n/d)' : ''}</button>
            ))}
          </div>
        </div>
      )}

      {/* Esito ultima azione — non resta mai silenzioso */}
      {actionMsg && (
        <div
          onClick={() => setActionMsg(null)}
          title="Tocca per nascondere"
          style={{
            fontSize: '0.66rem', lineHeight: 1.3, padding: '0.4rem 0.55rem', borderRadius: 8, cursor: 'pointer',
            color: actionMsg.kind === 'ok' ? C.green : actionMsg.kind === 'warn' ? C.amber : actionMsg.kind === 'err' ? C.red : C.cyan,
            background: 'rgba(255,255,255,.04)',
            border: `1px solid ${actionMsg.kind === 'ok' ? C.green : actionMsg.kind === 'warn' ? C.amber : actionMsg.kind === 'err' ? C.red : C.cyan}33`,
          }}
        >{actionMsg.text}</div>
      )}

      {/* Riepilogo a colpo d'occhio */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <Stat n={s.running} label="in corso" color={C.cyan} />
        <Stat n={s.needsAttention} label="da gestire" color={s.needsAttention > 0 ? C.amber : C.dim} />
        <Stat n={s.error} label="fallite" color={s.error > 0 ? C.red : C.dim} />
        <Stat n={s.success} label="riuscite" color={C.green} />
      </div>

      {/* Filtri */}
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            ...btn, fontSize: '0.66rem',
            background: filter === f.key ? 'rgba(125,211,252,.18)' : 'rgba(255,255,255,.06)',
            borderColor: filter === f.key ? `${C.cyan}66` : 'rgba(255,255,255,.12)',
            color: filter === f.key ? C.cyan : '#fff',
          }}>{f.label}</button>
        ))}
      </div>

      {/* Stato sistemi (sempre visibile) + lista operazioni — scroll unico */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', flex: 1, paddingRight: '0.2rem' }}>
        {systems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ color: C.silver, fontSize: '0.62rem', letterSpacing: '.04em', textTransform: 'uppercase' }}>Stato Kira</div>
            {systems.map((sys) => <SystemCard key={sys.id} sys={sys} onRun={runSystemAction} />)}
          </div>
        )}

        {outputs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.2rem' }}>
            <div style={{ color: C.silver, fontSize: '0.62rem', letterSpacing: '.04em', textTransform: 'uppercase' }}>Output prodotti</div>
            {outputs.map((o) => <OutputCard key={o.key} item={o} />)}
          </div>
        )}

        {list.length > 0 && (
          <div style={{ color: C.silver, fontSize: '0.62rem', letterSpacing: '.04em', textTransform: 'uppercase', marginTop: '0.2rem' }}>
            {filter === 'attention' ? 'Cose da sistemare' : filter === 'running' ? 'In corso' : filter === 'done' ? 'Concluse' : 'Attività'}
          </div>
        )}
        {list.length === 0 && (
          <div style={{ color: C.dim, fontSize: '0.72rem', padding: '1rem 0', textAlign: 'center' }}>
            {filter === 'attention' ? 'Niente che richieda la tua attenzione. Tutto sotto controllo.' : 'Nessuna operazione qui.'}
          </div>
        )}
        {list.map((op) => <OperationCard key={op.id} op={op} onAction={action} />)}

        {notReady.length > 0 && (
          <details style={{ marginTop: '0.4rem' }}>
            <summary style={{ color: C.silver, fontSize: '0.64rem', cursor: 'pointer', listStyle: 'none' }}>
              ⓘ Funzioni non ancora controllabili da qui ({notReady.length})
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.35rem' }}>
              {notReady.map((n, i) => (
                <div key={i} style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: '0.5rem', padding: '0.4rem 0.5rem', background: 'rgba(255,255,255,.02)' }}>
                  <div style={{ color: 'rgba(255,255,255,.65)', fontSize: '0.66rem', fontWeight: 500 }}>
                    {n.name} {n.chatControllable && <span style={{ color: C.cyan, fontSize: '0.58rem' }}>· chiedibile in chat</span>}
                  </div>
                  <div style={{ color: C.dim, fontSize: '0.62rem', lineHeight: 1.3 }}>{n.reason}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 64, border: '1px solid rgba(255,255,255,.08)', borderRadius: '0.6rem',
      padding: '0.35rem 0.4rem', background: 'rgba(255,255,255,.03)', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 600, color }}>{n}</div>
      <div style={{ fontSize: '0.6rem', color: C.silver }}>{label}</div>
    </div>
  );
}
