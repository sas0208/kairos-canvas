import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { OpenSettingsLink } from './OpenSettingsLink';
import { WidgetSpinner } from '../components/WidgetStates';

interface N8nStatus {
  configured: boolean;
  baseUrl: string;
  reachable: boolean | null;
  hasApiKey: boolean;
  detail: string;
}
interface N8nWorkflow { id: string; name: string; active: boolean }

export function AutomationWidget() {
  const toast = useToast();
  const [status, setStatus] = useState<N8nStatus | null>(null);
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [wfError, setWfError] = useState('');
  const [loading, setLoading] = useState(true);
  const [hook, setHook] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetch('/api/integrations/n8n/status').then((r) => r.json()).catch(() => null) as N8nStatus | null;
      setStatus(s);
      if (s?.configured && s.reachable && s.hasApiKey) {
        const w = await fetch('/api/integrations/n8n/workflows').then((r) => r.json()).catch(() => null) as { ok: boolean; workflows: N8nWorkflow[]; error?: string } | null;
        if (w?.ok) { setWorkflows(w.workflows); setWfError(''); }
        else { setWorkflows([]); setWfError(w?.error || 'workflow non disponibili'); }
      } else { setWorkflows([]); setWfError(''); }
    } catch { setStatus(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);

  const trigger = useCallback(async () => {
    const path = hook.trim();
    if (!path || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/integrations/n8n/trigger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webhookPath: path }),
      });
      const d = await r.json().catch(() => null) as { ok?: boolean; status?: number; error?: string } | null;
      if (d?.ok) { toast.success(`Workflow avviato (${path})`); setHook(''); }
      else toast.error(d?.error || `Trigger fallito${d?.status ? ` (${d.status})` : ''}`);
    } catch { toast.error('Errore n8n'); }
    finally { setBusy(false); }
  }, [hook, busy, toast]);

  if (loading && !status) return <WidgetSpinner label="Stato automazioni…" fullHeight />;

  const dotClass = !status?.configured ? 'kc-w-auto-dot-off'
    : status.reachable ? 'kc-w-auto-dot-on' : 'kc-w-auto-dot-warn';
  const stateLabel = !status?.configured ? 'non configurato'
    : status.reachable ? 'attivo' : 'offline';

  return (
    <div className="kc-w-auto">
      <div className="kc-w-auto-head">
        <span className={`kc-w-auto-dot ${dotClass}`} aria-hidden />
        <span className="kc-w-auto-title">n8n · {stateLabel}</span>
        <button type="button" className="kc-w-auto-refresh" onClick={() => void load()} title="Aggiorna" aria-label="Aggiorna">↻</button>
      </div>

      {status?.detail && <div className="kc-w-auto-detail">{status.detail}</div>}

      {!status?.configured && (
        <OpenSettingsLink hint="Imposta N8N_BASE_URL (solo rete locale) + N8N_API_KEY:" />
      )}

      {status?.configured && status.reachable && (
        <>
          <div className="kc-w-auto-section">Workflow {workflows.length > 0 ? `(${workflows.length})` : ''}</div>
          {wfError && <div className="kc-w-auto-empty">{wfError}</div>}
          {!wfError && workflows.length === 0 && <div className="kc-w-auto-empty">Nessun workflow. Creane uno in n8n e comparirà qui.</div>}
          {workflows.map((w) => (
            <div key={w.id} className="kc-w-auto-wf">
              <span className={`kc-w-auto-wf-state ${w.active ? 'kc-w-auto-wf-on' : ''}`}>{w.active ? 'ON' : 'off'}</span>
              <span className="kc-w-auto-wf-name">{w.name}</span>
            </div>
          ))}

          <div className="kc-w-auto-section">Avvia via webhook</div>
          <div className="kc-w-auto-trigger">
            <input
              className="kc-w-auto-input"
              type="text"
              placeholder="path webhook (es. backup-notion)"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void trigger(); }}
              disabled={busy}
            />
            <button type="button" className="kc-w-auto-go" onClick={() => void trigger()} disabled={busy || !hook.trim()}>
              {busy ? '…' : '▶'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
