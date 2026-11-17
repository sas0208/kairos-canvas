// AgentFlowWidget — visualizzazione del flusso job/agent.
// Mostra i job raggruppati per stage (planned → in progress → waiting → done/failed)
// con frecce tra le card. Permette di vedere se/dove un agente si blocca.

import { useEffect, useState } from 'react';
import { WidgetSpinner } from '../components/WidgetStates';

interface JobItem {
  id: string;
  title?: string;
  prompt?: string;
  status?: string;
  agent?: string;
  assignedManagerName?: string;
  level?: number;
  updatedAt?: string;
  createdAt?: string;
  recoveryAttempts?: number;
}

interface Stage {
  key: string;
  label: string;
  statuses: string[];
  variant: 'pending' | 'running' | 'done' | 'failed' | 'blocked';
}

const STAGES: Stage[] = [
  { key: 'planned',      label: '① Pianificato',  statuses: ['planned', 'queued', 'pending'],                                     variant: 'pending' },
  { key: 'in-progress',  label: '② In Esecuzione', statuses: ['running', 'in_progress', 'executing', 'handoff_ready'],            variant: 'running' },
  { key: 'waiting',      label: '③ In Attesa',     statuses: ['waiting_opencode', 'waiting_patch', 'waiting_approval', 'waiting_human', 'plan_ready'], variant: 'blocked' },
  { key: 'needs-human',  label: '⚠ Richiede tuo intervento', statuses: ['needs_human'], variant: 'blocked' },
  { key: 'done',         label: '✓ Completato',    statuses: ['completed', 'done', 'success'],                                    variant: 'done' },
  { key: 'failed',       label: '✗ Fallito',       statuses: ['failed', 'error', 'aborted'],                                      variant: 'failed' },
];

function statusOf(j: JobItem): string {
  return (j.status || '').toLowerCase();
}

function stageOf(j: JobItem): Stage {
  const s = statusOf(j);
  return STAGES.find((st) => st.statuses.includes(s)) || STAGES[0];
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  const diffSec = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s fa`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m fa`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h fa`;
  return `${Math.floor(diffSec / 86400)}g fa`;
}

export function AgentFlowWidget() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchdog, setWatchdog] = useState<{ running?: boolean; totalRecoveries?: number; totalFailed?: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [jobsR, wdR] = await Promise.all([
          fetch('/api/agents/jobs?limit=50', { cache: 'no-store' }),
          fetch('/api/agents/watchdog/status', { cache: 'no-store' }).catch(() => null),
        ]);
        if (cancelled) return;
        if (jobsR.ok) {
          const d = await jobsR.json() as { jobs?: JobItem[] };
          setJobs(d.jobs || []);
        }
        if (wdR?.ok) {
          setWatchdog(await wdR.json());
        }
      } catch { /* */ }
      setLoading(false);
    }
    void load();
    const id = window.setInterval(load, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Raggruppa per stage
  const byStage = new Map<string, JobItem[]>();
  for (const j of jobs) {
    const s = stageOf(j);
    if (!byStage.has(s.key)) byStage.set(s.key, []);
    byStage.get(s.key)!.push(j);
  }

  // Ordina i job per updatedAt desc
  for (const arr of byStage.values()) {
    arr.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  }

  const totalActive = (byStage.get('planned')?.length || 0) + (byStage.get('in-progress')?.length || 0) + (byStage.get('waiting')?.length || 0);
  const totalDone = byStage.get('done')?.length || 0;
  const totalFail = byStage.get('failed')?.length || 0;

  return (
    <div className="kc-w-aflow">
      <header className="kc-w-aflow-head">
        <span>🔀 Agent Flow</span>
        <span className="kc-w-aflow-stats">
          {totalActive} attivi · {totalDone} ok · {totalFail} fail
          {watchdog?.running && ' · 🛡 watchdog'}
        </span>
      </header>

      <div className="kc-w-aflow-canvas">
        {loading ? (
          <WidgetSpinner label="Caricamento job…" fullHeight />
        ) : jobs.length === 0 ? (
          <div className="kc-w-aflow-empty">
            Nessun job. Chiedi a Kira di fare qualcosa di complesso e vedrai il flusso qui.
          </div>
        ) : (
          STAGES.map((stage, idx) => {
            const stageJobs = byStage.get(stage.key) || [];
            if (stageJobs.length === 0) return null;
            return (
              <div key={stage.key} className="kc-w-aflow-stage">
                <div className="kc-w-aflow-stage-label">{stage.label} ({stageJobs.length})</div>
                {stageJobs.map((j) => (
                  <div key={j.id} className={`kc-w-aflow-row kc-w-aflow-row-${stage.variant}`}>
                    <div className="kc-w-aflow-row-title">
                      {j.title || j.prompt?.slice(0, 70) || j.id}
                    </div>
                    <div className="kc-w-aflow-row-meta">
                      {j.assignedManagerName || j.agent || ''}
                      {j.recoveryAttempts && j.recoveryAttempts > 0 ? ` · ↺${j.recoveryAttempts}` : ''}
                      {(j.updatedAt || j.createdAt) ? ` · ${relativeTime(j.updatedAt || j.createdAt)}` : ''}
                    </div>
                  </div>
                ))}
                {idx < STAGES.length - 1 && (byStage.get(STAGES[idx + 1]?.key)?.length || 0) > 0 && (
                  <div className="kc-w-aflow-arrow">↓</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
