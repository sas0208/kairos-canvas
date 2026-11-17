// Widget "Modelli" — gestione modelli Ollama:
//  - stato runtime (online/latency, modelli in VRAM) da /api/models/ollama/status
//  - copertura RUOLI (preferito vs fallback/mancante) da /api/models/roles/audit  [ciclo 26]
//  - azioni: warmup/unload (VRAM) e pull del preferito (con progresso)
// Stili inline auto-contenuti (la vecchia CSS kc-w-models non esisteva più).

import { useCallback, useEffect, useRef, useState } from 'react';

interface InstalledModel { name: string; sizeGb: number }
interface RunningModel { name: string; vramGb: number }
interface OllamaRuntime { ok: boolean; latencyMs?: number; keepAlive?: string; installed?: InstalledModel[]; running?: RunningModel[] }

interface RoleAudit { role: string; preferred: string; resolved: string | null; usingFallback: boolean; installed: boolean }
interface ModelAudit {
  ok: boolean; ollamaReachable: boolean; installedCount: number; totalSizeGB: number;
  roles: RoleAudit[]; missingRoles: string[]; fallbackRoles: string[];
  heavyInstalled: { name: string; sizeGB: number }[]; notes: string[];
}
interface PullStatus { pulling: boolean; done?: boolean; model?: string; progress?: number; lastLine?: string; error?: string }

const C = {
  panel: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)',
  text: '#cbd5e1', dim: '#8294ad', ok: '#7dd3fc', good: '#86efac', warn: '#fbbf24', bad: '#fca5a5',
};
const card: React.CSSProperties = { padding: '6px 8px', borderRadius: 8, background: C.panel, border: `1px solid ${C.border}` };

export function ModelsWidget() {
  const [runtime, setRuntime] = useState<OllamaRuntime | null>(null);
  const [audit, setAudit] = useState<ModelAudit | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [pull, setPull] = useState<PullStatus | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rRt, rAu] = await Promise.all([
        fetch('/api/models/ollama/status'),
        fetch('/api/models/roles/audit'),
      ]);
      if (rRt.ok) setRuntime(await rRt.json() as OllamaRuntime);
      if (rAu.ok) setAudit(await rAu.json() as ModelAudit);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Ollama offline'); }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { if (!document.hidden) void refresh(); }, 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await (await fetch('/api/models/pull/status')).json() as PullStatus;
        setPull(s);
        if (!s.pulling) {
          if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
          void refresh();
        }
      } catch { /* ignora */ }
    }, 1500);
  }, [refresh]);

  const doPull = useCallback(async (model: string) => {
    setPull({ pulling: true, model, progress: 0 });
    try {
      await fetch('/api/models/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
      startPolling();
    } catch { setPull({ pulling: false, error: 'pull fallito' }); }
  }, [startPolling]);

  const modelAction = useCallback(async (action: 'warmup' | 'unload', model: string) => {
    setActing(model + action);
    try {
      const ep = action === 'warmup' ? '/api/models/local/warmup' : '/api/models/ollama/unload';
      await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
      await refresh();
    } catch { /* ignora */ } finally { setActing(null); }
  }, [refresh]);

  return (
    <div style={{ padding: 14, color: C.text, fontSize: 13, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Modelli Ollama</span>
        {runtime && <span style={{ color: runtime.ok ? C.good : C.bad, fontSize: 12 }}>{runtime.ok ? `● ${runtime.latencyMs}ms` : '○ offline'}</span>}
        {audit && <span style={{ marginLeft: 'auto', color: C.dim, fontSize: 12 }}>{audit.installedCount} modelli · {audit.totalSizeGB} GB</span>}
        <button onClick={() => void refresh()} title="Aggiorna" style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 14 }}>↻</button>
      </div>

      {error && <div style={{ color: C.bad, marginBottom: 10, fontSize: 12 }}>⚠ {error}</div>}

      {runtime?.running && runtime.running.length > 0 && (
        <div style={{ ...card, marginBottom: 12, fontSize: 12, color: C.ok }}>
          In VRAM: {runtime.running.map((m) => `${m.name} ${m.vramGb}GB`).join(' · ')}
        </div>
      )}

      {pull && (pull.pulling || pull.error) && (
        <div style={{ ...card, marginBottom: 12 }}>
          {pull.error
            ? <span style={{ color: C.bad }}>Pull errore: {pull.error}</span>
            : <span style={{ color: C.ok }}>⬇ Pull {pull.model}… {typeof pull.progress === 'number' ? Math.round(pull.progress) + '%' : ''}{pull.lastLine ? ` · ${pull.lastLine}` : ''}</span>}
        </div>
      )}

      {/* Copertura ruoli — la parte che conta: ogni ruolo ha il modello giusto? */}
      <div style={{ fontSize: 12, color: C.dim, margin: '4px 0 6px' }}>Copertura ruoli</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(audit?.roles || []).map((r) => {
          const state = !r.installed ? 'mancante' : r.usingFallback ? 'fallback' : 'preferito';
          const color = state === 'preferito' ? C.good : state === 'fallback' ? C.warn : C.bad;
          return (
            <div key={r.role} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 92, color: C.dim, fontSize: 12 }}>{r.role}</span>
              <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}>{r.resolved || '—'}</span>
              <span style={{ color, fontSize: 11, textTransform: 'uppercase' }}>{state}</span>
              {state !== 'preferito' && (
                <button onClick={() => void doPull(r.preferred)} disabled={Boolean(pull?.pulling)} title={`Scarica ${r.preferred}`}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, cursor: pull?.pulling ? 'default' : 'pointer', background: 'rgba(125,211,252,0.12)', border: `1px solid ${C.border}`, color: C.ok, opacity: pull?.pulling ? 0.5 : 1 }}>
                  ⬇ {r.preferred.split(':')[0]}
                </button>
              )}
            </div>
          );
        })}
        {!audit && <div style={{ color: C.dim, fontSize: 12 }}>Carico audit…</div>}
      </div>

      {audit && audit.heavyInstalled.length > 0 && (
        <div style={{ marginTop: 12, color: C.warn, fontSize: 12 }}>
          ⚠ Non stanno in 8GB (lenti): {audit.heavyInstalled.map((h) => `${h.name} ${h.sizeGB}GB`).join(', ')}
        </div>
      )}

      {/* Modelli installati con warmup/unload */}
      {runtime?.installed && runtime.installed.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: C.dim, margin: '14px 0 6px' }}>Installati ({runtime.installed.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {runtime.installed.map((m) => {
              const isRunning = runtime.running?.some((r) => r.name === m.name);
              return (
                <div key={m.name} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}>{m.name}</span>
                  <span style={{ color: C.dim, fontSize: 11 }}>{m.sizeGb}GB</span>
                  <button onClick={() => void modelAction(isRunning ? 'unload' : 'warmup', m.name)} disabled={acting !== null}
                    title={isRunning ? 'Libera VRAM' : 'Carica in VRAM'}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, cursor: 'pointer', background: isRunning ? 'rgba(251,191,36,0.12)' : 'rgba(125,211,252,0.10)', border: `1px solid ${C.border}`, color: isRunning ? C.warn : C.ok, opacity: acting ? 0.5 : 1 }}>
                    {isRunning ? '↑ Unload' : '↻ Warmup'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {audit && audit.notes.length > 0 && (
        <div style={{ marginTop: 12, color: C.dim, fontSize: 11.5, lineHeight: 1.5 }}>
          {audit.notes.map((n, i) => <div key={i}>• {n}</div>)}
        </div>
      )}
    </div>
  );
}
