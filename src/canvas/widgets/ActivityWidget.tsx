import { useEffect, useState, useCallback } from 'react';
import { WidgetCardMenu, useCardMenu } from '../components/WidgetCardMenu';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';
import { cleanDisplayText, clipDisplayText } from '../../lib/displayText';

interface JobItem {
  id: string;
  title?: string;
  prompt?: string;
  originalRequest?: string;
  status?: string;
  agent?: string;
  assignedManagerName?: string;
  level?: number;
  priority?: string;
  createdAt?: number | string;
  updatedAt?: string;
  completedAt?: string;
  archived?: boolean;
}

interface GitFile {
  path: string;
  code: string;
  state: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
}

interface GitInfo {
  branch: string;
  lastCommit: string;
  lastCommitMessage: string;
  lastCommitDate?: string;
  workingTree: 'pulito' | 'modificato';
  modifiedFiles: number;
  available: boolean;
  files?: GitFile[];
}

interface RuntimeLogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error' | 'process';
  source: string;
  message: string;
}

interface HandoffItem {
  agent: string;
  id: string;
  title: string;
  preview: string;
  at: number;
}

interface JobsResponse {
  jobs?: JobItem[];
  total?: number;
  active?: number;
  pending?: number;
}

interface Ticket {
  id: string;
  capabilityId: string;
  description: string;
  mode: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  createdAt: string;
  resolvedAt?: string;
  error?: string;
}

type Tab = 'active' | 'live' | 'fix' | 'archive';
type PillVariant = 'running' | 'pending' | 'done' | 'error' | 'blocked' | 'default';

function pillVariant(status?: string): PillVariant {
  switch (status) {
    case 'running':   case 'in_progress':           return 'running';
    case 'pending':   case 'awaiting_approval':     return 'pending';
    case 'completed': case 'done': case 'success':  return 'done';
    case 'failed':    case 'error':                 return 'error';
    case 'blocked':                                 return 'blocked';
    default:                                        return 'default';
  }
}

function statusLabel(status?: string): string {
  switch (status) {
    case 'running':            return 'in corso';
    case 'in_progress':        return 'in corso';
    case 'pending':            return 'in attesa';
    case 'awaiting_approval':  return 'approvazione';
    case 'completed':          return 'fatto';
    case 'done':               return 'fatto';
    case 'success':            return 'fatto';
    case 'failed':             return 'fallito';
    case 'error':              return 'errore';
    case 'blocked':            return 'bloccato';
    default:                   return cleanDisplayText(status, '-');
  }
}

function relativeTime(ts?: string | number): string {
  if (!ts) return '';
  const d = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diff = Date.now() - d;
  if (diff < 60000) return 'ora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m fa`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h fa`;
  return `${Math.floor(diff / 86400000)}g fa`;
}

const TERMINAL_STATUSES = ['completed', 'failed', 'blocked', 'denied', 'paused'];

function jobTitle(job: JobItem, maxLength = 56): string {
  return clipDisplayText(job.title || job.prompt || job.id, maxLength, job.id);
}

function jobTooltip(job: JobItem): string {
  return cleanDisplayText(job.originalRequest || job.prompt || job.title || job.id, job.id);
}

function ticketText(ticket: Ticket): string {
  return cleanDisplayText(ticket.description, ticket.id);
}

function fileName(filePath: string): string {
  const clean = filePath.replace(/\\/g, '/');
  return clean.split('/').pop() || clean;
}

function fileDir(filePath: string): string {
  const clean = filePath.replace(/\\/g, '/');
  const idx = clean.lastIndexOf('/');
  return idx > 0 ? clean.slice(0, idx) : '';
}

function fileStateLabel(state: GitFile['state']): string {
  if (state === 'added') return 'A';
  if (state === 'deleted') return 'D';
  if (state === 'renamed') return 'R';
  if (state === 'untracked') return 'U';
  return 'M';
}

interface WatchdogStatus {
  running: boolean;
  lastRunAt: string | null;
  totalRecoveries: number;
  totalFailed: number;
}

export function ActivityWidget() {
  const [tab, setTab] = useState<Tab>('active');
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [archived, setArchived] = useState<JobItem[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [git, setGit] = useState<GitInfo | null>(null);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogEntry[]>([]);
  const [handoffs, setHandoffs] = useState<HandoffItem[]>([]);
  const cardMenu = useCardMenu();
  const [watchdog, setWatchdog] = useState<WatchdogStatus | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [busy, setBusy] = useState(false);

  const loadActive = useCallback(async () => {
    try {
      const resp = await fetch('/api/agents/jobs');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json() as JobsResponse | JobItem[];
      const list = Array.isArray(json) ? json : (json.jobs || []);
      setJobs(list.slice(0, 40));
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, []);

  const loadArchived = useCallback(async () => {
    try {
      const resp = await fetch('/api/agents/jobs/archived');
      if (!resp.ok) return;
      const list = await resp.json() as JobItem[];
      setArchived(Array.isArray(list) ? list.slice(0, 60) : []);
    } catch { /* skip */ }
  }, []);

  const loadTickets = useCallback(async () => {
    try {
      const resp = await fetch('/api/capability/tickets');
      if (!resp.ok) return;
      const json = await resp.json() as { ok?: boolean; tickets?: Ticket[] };
      setTickets(Array.isArray(json.tickets) ? json.tickets : []);
    } catch { /* skip */ }
  }, []);

  const loadLive = useCallback(async () => {
    try {
      const [gitR, logsR, handoffsR] = await Promise.all([
        fetch('/api/agents/git-status', { cache: 'no-store' }),
        fetch('/api/agents/runtime/logs', { cache: 'no-store' }),
        fetch('/api/agents/handoffs', { cache: 'no-store' }),
      ]);
      if (gitR.ok) setGit(await gitR.json() as GitInfo);
      if (logsR.ok) setRuntimeLogs(await logsR.json() as RuntimeLogEntry[]);
      if (handoffsR.ok) {
        const data = await handoffsR.json() as { handoffs?: HandoffItem[] };
        setHandoffs(data.handoffs || []);
      }
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    void loadActive();
    void loadTickets();
    void loadLive();
    const id = window.setInterval(() => { if (document.hidden) return; void loadActive(); void loadTickets(); void loadLive(); }, 4000);
    return () => window.clearInterval(id);
  }, [loadActive, loadTickets, loadLive]);

  useEffect(() => {
    let cancelled = false;
    async function loadWatchdog() {
      try {
        const r = await fetch('/api/agents/watchdog/status');
        if (!r.ok || cancelled) return;
        const d = await r.json() as WatchdogStatus;
        if (!cancelled) setWatchdog(d);
      } catch { /* silent */ }
    }
    void loadWatchdog();
    const id = window.setInterval(loadWatchdog, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    if (tab === 'archive') void loadArchived();
  }, [tab, loadArchived]);

  const deleteJob = async (id: string) => {
    await fetch(`/api/agents/jobs/${id}`, { method: 'DELETE' });
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const archiveOne = async (id: string) => {
    await fetch(`/api/agents/jobs/${id}/archive`, { method: 'POST' });
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (tab === 'archive') void loadArchived();
  };

  const deleteTicket = async (id: string) => {
    const r = await fetch(`/api/capability/tickets/${id}`, { method: 'DELETE' });
    if (r.ok) setTickets((prev) => prev.filter((t) => t.id !== id));
  };

  const clearDoneTickets = async () => {
    await fetch('/api/capability/tickets/clear-done', { method: 'POST' });
    await loadTickets();
  };

  const bulkArchive = async () => {
    setBusy(true);
    await fetch('/api/agents/jobs/bulk-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statuses: TERMINAL_STATUSES }),
    });
    await loadActive();
    if (tab === 'archive') await loadArchived();
    setBusy(false);
  };

  if (status === 'loading') return <WidgetSpinner label="Caricamento job…" fullHeight />;
  if (status === 'error')   return <WidgetError message="Engine Room offline" onRetry={() => { setStatus('loading'); void loadActive(); }} />;

  const activeCount   = jobs.filter((j) => ['running', 'in_progress'].includes(j.status || '')).length;
  const pendingCount  = jobs.filter((j) => ['pending', 'awaiting_approval'].includes(j.status || '')).length;
  const terminalCount = jobs.filter((j) => TERMINAL_STATUSES.includes(j.status || '')).length;
  const ticketsRunning = tickets.filter((t) => t.status === 'pending' || t.status === 'running').length;
  const ticketsDone    = tickets.filter((t) => t.status === 'done' || t.status === 'failed').length;
  const liveJobs = jobs.filter((j) => ['received', 'planned', 'running', 'reviewing', 'testing', 'reporting', 'waiting_opencode', 'handoff_ready', 'plan_ready', 'waiting_patch'].includes(j.status || '')).slice(0, 6);
  const changedFiles = git?.files || [];
  const recentLogs = runtimeLogs.slice(-10).reverse();

  return (
    <div className="kc-w-activity">
      <header className="kc-w-activity-header">
        <div className="kc-w-activity-tabs">
          <button
            className={`kc-w-act-tab${tab === 'active' ? ' kc-w-act-tab-active' : ''}`}
            onClick={() => setTab('active')}
          >
            Jobs {jobs.length > 0 ? <span className="kc-w-act-tab-badge">{jobs.length}</span> : null}
          </button>
          <button
            className={`kc-w-act-tab${tab === 'live' ? ' kc-w-act-tab-active' : ''}`}
            onClick={() => setTab('live')}
            title="File modificati, log runtime e handoff agenti"
          >
            Live {changedFiles.length > 0 ? <span className="kc-w-act-tab-badge">{changedFiles.length}</span> : null}
          </button>
          <button
            className={`kc-w-act-tab${tab === 'fix' ? ' kc-w-act-tab-active' : ''}`}
            onClick={() => setTab('fix')}
            title="Fix e capability delegati a Claude Code / Codex"
          >
            Fix {ticketsRunning > 0 ? <span className="kc-w-act-tab-badge">{ticketsRunning}</span> : tickets.length > 0 ? <span className="kc-w-act-tab-badge">{tickets.length}</span> : null}
          </button>
          <button
            className={`kc-w-act-tab${tab === 'archive' ? ' kc-w-act-tab-active' : ''}`}
            onClick={() => setTab('archive')}
          >
            Archivio {archived.length > 0 ? <span className="kc-w-act-tab-badge">{archived.length}</span> : null}
          </button>
        </div>
        {tab === 'active' && (
          <div className="kc-w-activity-summary">
            {activeCount > 0  && <span className="kc-job-pill kc-job-pill-running">{activeCount} attivi</span>}
            {pendingCount > 0 && <span className="kc-job-pill kc-job-pill-pending">{pendingCount} attesa</span>}
            {terminalCount > 0 && (
              <button
                className="kc-w-activity-clean-btn"
                onClick={() => void bulkArchive()}
                disabled={busy}
                title={`Archivia ${terminalCount} job terminati`}
              >
                {busy ? '…' : `📦 ${terminalCount}`}
              </button>
            )}
          </div>
        )}
      </header>

      {tab === 'active' && (
        <div className="kc-w-activity-list">
          {jobs.length === 0 ? (
            <div className="kc-w-empty-hint">Nessun job in coda</div>
          ) : null}
          {jobs.map((j, idx) => {
            const variant = pillVariant(j.status);
            const isActive = variant === 'running';
            const isLast = idx === jobs.length - 1;
            const isTerminal = TERMINAL_STATUSES.includes(j.status || '');
            return (
              <div
                key={j.id}
                className="kc-w-activity-row"
                title={jobTooltip(j)}
                onContextMenu={(ev) => cardMenu.open(ev, {
                  title: jobTitle(j, 80),
                  body: clipDisplayText(`[${statusLabel(j.status)}] ${jobTooltip(j)}`, 500),
                })}
              >
                <div className="kc-w-activity-rail" aria-hidden="true">
                  <span className={`kc-w-activity-node kc-w-activity-node-${variant}`} />
                  {isActive ? <span className={`kc-w-activity-node-pulse kc-w-activity-node-${variant}`} /> : null}
                  {!isLast ? <span className="kc-w-activity-connector" /> : null}
                </div>
                <div className="kc-w-activity-body">
                  <span className="kc-w-activity-title">{jobTitle(j)}</span>
                  <span className="kc-w-activity-meta">
                    <span className={`kc-job-pill kc-job-pill-${variant}`}>{statusLabel(j.status)}</span>
                    {j.assignedManagerName || j.agent ? <span className="kc-w-activity-agent">{cleanDisplayText(j.assignedManagerName || j.agent)}</span> : null}
                    <span className="kc-w-activity-time">{relativeTime(j.updatedAt || j.createdAt)}</span>
                  </span>
                </div>
                {isTerminal && (
                  <div className="kc-w-activity-job-actions">
                    <button
                      className="kc-w-activity-archive-btn"
                      onClick={() => void archiveOne(j.id)}
                      title="Archivia job"
                    >
                      📦
                    </button>
                    <button
                      className="kc-w-activity-delete-btn"
                      onClick={() => void deleteJob(j.id)}
                      title="Elimina job"
                      aria-label="Elimina"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'live' && (
        <div className="kc-w-activity-live">
          <section className="kc-w-activity-live-card">
            <div className="kc-w-activity-live-head">
              <span>File modificati</span>
              <span>{git?.available ? `${git.branch || '-'} - ${git.workingTree}` : 'git offline'}</span>
            </div>
            {changedFiles.length === 0 ? (
              <div className="kc-w-empty-hint">Nessun file modificato nel repo Kira.</div>
            ) : (
              <div className="kc-w-activity-file-list">
                {changedFiles.slice(0, 18).map((file) => (
                  <div key={`${file.code}-${file.path}`} className="kc-w-activity-file-row" title={cleanDisplayText(file.path)}>
                    <span className={`kc-w-activity-file-state kc-w-activity-file-state-${file.state}`}>{fileStateLabel(file.state)}</span>
                    <span className="kc-w-activity-file-main">
                      <span className="kc-w-activity-file-name">{cleanDisplayText(fileName(file.path))}</span>
                      <span className="kc-w-activity-file-dir">{cleanDisplayText(fileDir(file.path))}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="kc-w-activity-live-card">
            <div className="kc-w-activity-live-head">
              <span>Agenti e handoff</span>
              <button
                type="button"
                className="kc-w-activity-live-open"
                onClick={() => window.dispatchEvent(new CustomEvent('kira:setView', { detail: { view: 'forge' } }))}
              >
                Officina
              </button>
            </div>
            {liveJobs.length === 0 && handoffs.length === 0 ? (
              <div className="kc-w-empty-hint">Nessun agente operativo al momento.</div>
            ) : null}
            {liveJobs.map((job) => (
              <div key={job.id} className="kc-w-activity-live-line">
                <span className={`kc-job-pill kc-job-pill-${pillVariant(job.status)}`}>{statusLabel(job.status)}</span>
                <span className="kc-w-activity-live-title">{jobTitle(job, 64)}</span>
              </div>
            ))}
            {handoffs.slice(0, 5).map((handoff) => (
              <div key={`${handoff.agent}-${handoff.id}`} className="kc-w-activity-live-line" title={clipDisplayText(handoff.preview, 500)}>
                <span className="kc-w-activity-live-agent">{cleanDisplayText(handoff.agent)}</span>
                <span className="kc-w-activity-live-title">{clipDisplayText(handoff.title, 64)}</span>
                <span className="kc-w-activity-time">{relativeTime(handoff.at)}</span>
              </div>
            ))}
          </section>

          <section className="kc-w-activity-live-card">
            <div className="kc-w-activity-live-head">
              <span>Console runtime</span>
              <span>{recentLogs.length ? 'live' : 'vuota'}</span>
            </div>
            {recentLogs.length === 0 ? (
              <div className="kc-w-empty-hint">Quando Kira lancia build, render o agenti, i log compaiono qui.</div>
            ) : (
              <div className="kc-w-activity-log-list">
                {recentLogs.map((log, index) => (
                  <div key={`${log.timestamp}-${index}`} className={`kc-w-activity-log-row kc-w-activity-log-${log.level}`}>
                    <span className="kc-w-activity-log-source">{cleanDisplayText(log.source)}</span>
                    <span className="kc-w-activity-log-message">{clipDisplayText(log.message, 110)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'fix' && (
        <div className="kc-w-activity-list">
          {ticketsDone > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px 6px' }}>
              <button className="kc-w-activity-clean-btn" onClick={() => void clearDoneTickets()} title={`Rimuovi ${ticketsDone} ticket terminati`}>
                🧹 {ticketsDone}
              </button>
            </div>
          )}
          {tickets.length === 0 ? (
            <div className="kc-w-empty-hint">Nessun fix delegato. Chiedi a Kira "sistemami …" per avviarne uno.</div>
          ) : null}
          {tickets.map((t, idx) => {
            const variant = pillVariant(t.status);
            const isActive = variant === 'running' || t.status === 'pending';
            const isLast = idx === tickets.length - 1;
            const isTerminal = t.status === 'done' || t.status === 'failed';
            const label = t.capabilityId === 'project-fix' ? 'Fix progetto' : t.capabilityId;
            return (
              <div
                key={t.id}
                className="kc-w-activity-row"
                title={cleanDisplayText(t.error || t.description, t.id)}
                onContextMenu={(ev) => cardMenu.open(ev, {
                  title: label,
                  body: clipDisplayText(`[${statusLabel(t.status)}] ${ticketText(t)}${t.error ? `\n\nErrore: ${cleanDisplayText(t.error)}` : ''}`, 500),
                })}
              >
                <div className="kc-w-activity-rail" aria-hidden="true">
                  <span className={`kc-w-activity-node kc-w-activity-node-${variant}`} />
                  {isActive ? <span className={`kc-w-activity-node-pulse kc-w-activity-node-${variant}`} /> : null}
                  {!isLast ? <span className="kc-w-activity-connector" /> : null}
                </div>
                <div className="kc-w-activity-body">
                  <span className="kc-w-activity-title">{label}</span>
                  <span className="kc-w-activity-meta">
                    <span className={`kc-job-pill kc-job-pill-${variant}`}>{statusLabel(t.status)}</span>
                    <span className="kc-w-activity-agent">{cleanDisplayText(t.mode)}</span>
                    <span className="kc-w-activity-time">{relativeTime(t.resolvedAt || t.createdAt)}</span>
                  </span>
                  {t.status === 'failed' && t.error ? (
                    <span className="kc-w-activity-meta" style={{ color: '#f87171', fontSize: '0.62rem' }}>{clipDisplayText(t.error, 120)}</span>
                  ) : null}
                </div>
                {isTerminal && (
                  <div className="kc-w-activity-job-actions">
                    <button
                      className="kc-w-activity-delete-btn"
                      onClick={() => void deleteTicket(t.id)}
                      title="Rimuovi ticket"
                      aria-label="Rimuovi"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'archive' && (
        <div className="kc-w-activity-list">
          {archived.length === 0 ? (
            <div className="kc-w-empty-hint">Nessun job archiviato — usa 📦 dalla tab Jobs</div>
          ) : null}
          {archived.map((j) => {
            const variant = pillVariant(j.status);
            return (
              <div key={j.id} className="kc-w-activity-row kc-w-activity-row-archived" title={jobTooltip(j)}>
                <div className="kc-w-activity-body">
                  <span className="kc-w-activity-title">{jobTitle(j)}</span>
                  <span className="kc-w-activity-meta">
                    <span className={`kc-job-pill kc-job-pill-${variant}`}>{statusLabel(j.status)}</span>
                    {j.assignedManagerName || j.agent ? <span className="kc-w-activity-agent">{cleanDisplayText(j.assignedManagerName || j.agent)}</span> : null}
                    <span className="kc-w-activity-time">{relativeTime(j.completedAt || j.updatedAt || j.createdAt)}</span>
                  </span>
                </div>
                <button
                  className="kc-w-activity-delete-btn"
                  onClick={async () => {
                    await fetch(`/api/agents/jobs/${j.id}`, { method: 'DELETE' });
                    setArchived((prev) => prev.filter((a) => a.id !== j.id));
                  }}
                  title="Elimina definitivamente"
                  aria-label="Elimina"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {watchdog && (
        <footer className="kc-w-activity-footer" title={watchdog.lastRunAt ? `Ultimo check: ${new Date(watchdog.lastRunAt).toLocaleTimeString('it-IT')}` : 'Watchdog non ancora eseguito'}>
          <span className="kc-w-activity-footer-dot" style={{ background: watchdog.running ? '#4ade80' : '#f87171' }} />
          <span>Watchdog {watchdog.running ? 'attivo' : 'fermo'}</span>
          {watchdog.totalRecoveries > 0 && <span className="kc-w-activity-footer-stat">{watchdog.totalRecoveries} recovery</span>}
          {watchdog.totalFailed > 0 && <span className="kc-w-activity-footer-stat kc-w-activity-footer-stat-err">{watchdog.totalFailed} fail</span>}
        </footer>
      )}
      <WidgetCardMenu {...cardMenu.props} />
    </div>
  );
}
