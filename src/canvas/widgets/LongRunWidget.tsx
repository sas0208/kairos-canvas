import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';
import { cleanDisplayText } from '../../lib/displayText';

interface LongRun {
  id: string;
  goal: string;
  sessionLabel: string;
  status: 'active' | 'paused' | 'completed' | 'failed' | 'waiting_resume';
  currentPhase: string;
  nextStep: string;
  buildStatus: 'ok' | 'failed' | 'unknown' | 'not_run';
  progressPct: number;
  createdAt: string;
  updatedAt: string;
  checkpointAt?: string;
  resumePrompt: string;
}

type WidgetStatus = 'loading' | 'ok' | 'empty' | 'error';

interface NotifyRunResponse {
  ok: boolean;
  discord?: boolean;
  whatsapp?: boolean;
  whatsappResult?: {
    skipped?: boolean;
    throttled?: boolean;
    message?: string;
  };
}

const STATUS_COLORS: Record<LongRun['status'], string> = {
  active: 'rgba(74,222,128,0.95)',
  paused: 'rgba(214,226,246,0.95)',
  completed: 'rgba(169,201,255,0.95)',
  failed: 'rgba(248,113,113,0.95)',
  waiting_resume: 'rgba(167,139,250,0.95)',
};

const BUILD_COLORS: Record<LongRun['buildStatus'], string> = {
  ok: 'rgba(74,222,128,0.95)',
  failed: 'rgba(248,113,113,0.95)',
  not_run: 'rgba(255,255,255,0.4)',
  unknown: 'rgba(255,255,255,0.4)',
};

export function LongRunWidget() {
  const [run, setRun] = useState<LongRun | null>(null);
  const [status, setStatus] = useState<WidgetStatus>('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const resp = await fetch('/api/runs/last');
      const json = await resp.json() as { ok: boolean; run?: LongRun; error?: string };
      if (json.ok && json.run) {
        setRun(json.run);
        setStatus('ok');
      } else {
        setStatus('empty');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore rete');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => { if (document.hidden) return; void load(); }, 8000);
    return () => window.clearInterval(refresh);
  }, [load]);

  const copyResume = useCallback(async () => {
    if (!run) return;
    try {
      const resp = await fetch(`/api/runs/${run.id}/resume-prompt`);
      const json = await resp.json() as { ok: boolean; resumePrompt?: string };
      if (json.ok && json.resumePrompt) {
        await navigator.clipboard.writeText(json.resumePrompt);
        toast.success('Resume prompt copiato');
      } else {
        toast.error('Nessun resume prompt');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Copia fallita');
    }
  }, [run, toast]);

  const notifyDiscord = useCallback(async () => {
    if (!run) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/runs/${run.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: ['discord'] }),
      });
      const json = await resp.json() as NotifyRunResponse;
      if (json.discord) toast.success('Notifica Discord inviata');
      else if (json.whatsappResult?.skipped) toast.error('Discord non disponibile');
      else if (json.whatsappResult?.throttled) toast.info(json.whatsappResult.message || 'WhatsApp in cooldown');
      else if (json.whatsapp) toast.success('Notifica WhatsApp inviata');
      else toast.error('Nessun canale di notifica disponibile');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Notifica fallita');
    } finally {
      setBusy(false);
    }
  }, [run, toast, load]);

  if (status === 'loading') return <WidgetSpinner label="Caricamento long run…" fullHeight />;
  if (status === 'empty') {
    return (
      <div className="kc-w-empty kc-w-empty-info">
        <div style={{ fontSize: '1.4rem' }}>🧭</div>
        <div>Nessun long run registrato</div>
        <div className="kc-w-empty-hint">POST /api/runs per crearne uno</div>
      </div>
    );
  }
  if (status === 'error' || !run) {
    return <WidgetError message={error || 'Long run offline'} onRetry={() => { setStatus('loading'); void load(); }} />;
  }

  const updated = new Date(run.updatedAt);
  const checkpoint = run.checkpointAt ? new Date(run.checkpointAt) : null;

  return (
    <div className="kc-w-run">
      <div className="kc-w-run-head">
        <span className="kc-w-run-dot" style={{ background: STATUS_COLORS[run.status], boxShadow: `0 0 10px ${STATUS_COLORS[run.status]}` }} />
        <div className="kc-w-run-head-text">
          <div className="kc-w-run-label">{run.status.toUpperCase()}</div>
          <div className="kc-w-run-goal" title={cleanDisplayText(run.goal)}>{cleanDisplayText(run.goal, 'Long run')}</div>
        </div>
      </div>

      <div className="kc-w-run-progress" data-status={run.status}>
        <div className="kc-w-run-progress-segments" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => {
            const segPct = (i + 1) * 10;
            const filled = run.progressPct >= segPct;
            const partial = !filled && run.progressPct > segPct - 10;
            return (
              <span
                key={i}
                className={`kc-w-run-seg ${filled ? 'kc-w-run-seg-on' : partial ? 'kc-w-run-seg-partial' : ''}`}
                style={{ ['--kc-run-color' as string]: STATUS_COLORS[run.status] }}
              />
            );
          })}
        </div>
        <div className="kc-w-run-progress-text">{run.progressPct}%</div>
      </div>

      <div className="kc-w-run-fields">
        <div className="kc-w-run-field">
          <span className="kc-w-run-field-label">FASE</span>
          <span className="kc-w-run-field-val">{cleanDisplayText(run.currentPhase, '-')}</span>
        </div>
        <div className="kc-w-run-field">
          <span className="kc-w-run-field-label">PROSSIMO</span>
          <span className="kc-w-run-field-val">{cleanDisplayText(run.nextStep, '-')}</span>
        </div>
        <div className="kc-w-run-field">
          <span className="kc-w-run-field-label">BUILD</span>
          <span className="kc-w-run-field-val" style={{ color: BUILD_COLORS[run.buildStatus] }}>{run.buildStatus}</span>
        </div>
        <div className="kc-w-run-field">
          <span className="kc-w-run-field-label">CHECKPOINT</span>
          <span className="kc-w-run-field-val">{checkpoint ? checkpoint.toLocaleString('it-IT') : updated.toLocaleString('it-IT')}</span>
        </div>
      </div>

      <div className="kc-w-run-actions">
        <button className="kc-w-run-btn" onClick={() => void copyResume()}>📋 copia resume</button>
        <button className="kc-w-run-btn" onClick={() => void notifyDiscord()} disabled={busy}>
          {busy ? '...' : 'notifica Discord'}
        </button>
      </div>
    </div>
  );
}
