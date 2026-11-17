// ForgeScreen — "L'Officina di Kira".
// Vista a tutto schermo in stile editor di codice (VS Code-like) che mostra, in tempo
// reale, COSA Kira sta facendo fare ai suoi coder/agenti:
//  - sinistra: file modificati nel repo (explorer con stato git, colore per tipo modifica)
//  - centro:   stream live di cosa Kira dice/ordina (runtime log) + handoff verso Claude/Codex
//  - destra:   agenti e job attivi (chi sta lavorando, in che fase)
// Tutti i dati sono reali (endpoint /api/agents/*). Read-only: nessuna shell, nessun token.

import { useEffect, useRef, useState, useCallback } from 'react';
import { cleanDisplayText, clipDisplayText } from '../../lib/displayText';

interface GitFile { path: string; code: string; state: string; }
interface GitInfo {
  branch: string; lastCommit: string; lastCommitMessage: string;
  workingTree: string; modifiedFiles: number; available: boolean; files?: GitFile[];
}
interface LogEntry { timestamp: string; level: string; source: string; message: string; }
interface Handoff { agent: string; id: string; title: string; preview: string; at: number; }
interface JobItem {
  id: string; title?: string; prompt?: string; status?: string;
  agent?: string; assignedManagerName?: string; updatedAt?: string; createdAt?: string;
}
interface Bridge { name?: string; mode?: string; detail?: string; executable?: string; available?: boolean; }
interface DiffData { path: string; isNew: boolean; truncated: boolean; diff: string; }
interface EvolveInfo { running: boolean; stopRequested: boolean; patches: number; logTail: string; }

const STATE_COLOR: Record<string, string> = {
  added: '#4ade80', modified: '#fbbf24', deleted: '#f87171',
  renamed: '#a78bfa', untracked: '#a9c9ff',
};
const STATE_GLYPH: Record<string, string> = {
  added: 'A', modified: 'M', deleted: 'D', renamed: 'R', untracked: 'U',
};
const LEVEL_COLOR: Record<string, string> = {
  info: '#93c5fd', success: '#4ade80', warning: '#fbbf24',
  error: '#f87171', process: '#a78bfa',
};

const ACTIVE_STATUSES = ['received', 'running', 'in_progress', 'executing', 'handoff_ready', 'planned', 'queued', 'reviewing', 'testing', 'reporting', 'waiting_opencode', 'waiting_patch', 'plan_ready'];

function coerceJobs(data: { jobs?: JobItem[] } | JobItem[] | null): JobItem[] {
  if (Array.isArray(data)) return data;
  return data?.jobs || [];
}

function coerceBridges(data: Record<string, Bridge> | Bridge[] | null): Bridge[] {
  if (Array.isArray(data)) return data;
  if (!data) return [];
  return Object.entries(data).map(([name, value]) => ({ name, ...(value as Bridge) }));
}

function fileIcon(p: string): string {
  if (p.endsWith('.tsx') || p.endsWith('.ts')) return 'TS';
  if (p.endsWith('.css')) return 'CSS';
  if (p.endsWith('.json')) return '{}';
  if (p.endsWith('.md')) return 'MD';
  return '-';
}

function jobTitle(job: JobItem, maxLength = 80): string {
  return clipDisplayText(job.title || job.prompt || job.id, maxLength, job.id);
}

function jobAgent(job: JobItem): string {
  return cleanDisplayText(job.assignedManagerName || job.agent || 'agente', 'agente');
}

function relTime(iso?: string | number): string {
  if (!iso) return '';
  const dt = typeof iso === 'number' ? new Date(iso) : new Date(iso.replace(' ', 'T'));
  if (isNaN(dt.getTime())) return '';
  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}g`;
}

export function ForgeScreen() {
  const [git, setGit] = useState<GitInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [openHandoff, setOpenHandoff] = useState<Handoff | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [evolve, setEvolve] = useState<EvolveInfo | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const load = useCallback(async () => {
    const safe = async <T,>(url: string): Promise<T | null> => {
      try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? (await r.json() as T) : null; }
      catch { return null; }
    };
    const [g, l, h, j, b, e] = await Promise.all([
      safe<GitInfo>('/api/agents/git-status'),
      safe<LogEntry[]>('/api/agents/runtime/logs'),
      safe<{ handoffs: Handoff[] }>('/api/agents/handoffs'),
      safe<{ jobs?: JobItem[] } | JobItem[]>('/api/agents/jobs?limit=50'),
      safe<Record<string, Bridge> | Bridge[]>('/api/agents/bridges'),
      safe<EvolveInfo>('/api/evolve/status'),
    ]);
    if (g) setGit(g);
    if (l) setLogs(l);
    if (h) setHandoffs(h.handoffs || []);
    if (j) setJobs(coerceJobs(j));
    if (b) setBridges(coerceBridges(b));
    if (e) setEvolve(e);
  }, []);

  const closeDiff = useCallback(() => { setSelectedFile(null); setDiff(null); }, []);

  const openDiff = useCallback(async (p: string) => {
    if (p === selectedFile) { closeDiff(); return; }
    setSelectedFile(p);
    setDiff(null);
    setDiffLoading(true);
    try {
      const r = await fetch(`/api/agents/git-diff?path=${encodeURIComponent(p)}`, { cache: 'no-store' });
      const d = await r.json() as DiffData & { ok?: boolean; error?: string };
      setDiff(d.ok ? d : { path: p, isNew: false, truncated: false, diff: d.error || 'Diff non disponibile' });
    } catch {
      setDiff({ path: p, isNew: false, truncated: false, diff: 'Diff non disponibile (server irraggiungibile?)' });
    } finally {
      setDiffLoading(false);
    }
  }, [selectedFile, closeDiff]);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 3500);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (autoScrollRef.current) logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs]);

  const files = git?.files || [];
  const activeJobs = jobs.filter((x) => ACTIVE_STATUSES.includes((x.status || '').toLowerCase()));
  const doneJobs = jobs.filter((x) => ['completed', 'done', 'success'].includes((x.status || '').toLowerCase()));
  const coderBridges = bridges.filter((b) => ['claude', 'openCode', 'opencode', 'chatGpt', 'openClaw', 'ollama'].some((k) => (b.name || '').toLowerCase().includes(k.toLowerCase())));

  return (
    <div className="kc-forge">
      {/* Title bar stile editor */}
      <div className="kc-forge-titlebar">
        <span className="kc-forge-dot" style={{ background: '#f87171' }} />
        <span className="kc-forge-dot" style={{ background: '#fbbf24' }} />
        <span className="kc-forge-dot" style={{ background: '#4ade80' }} />
        <span className="kc-forge-title">officina · kira</span>
        <span className="kc-forge-branch">
          git {cleanDisplayText(git?.branch, '-')}
          {git?.available && (
            <span className={`kc-forge-tree ${git.workingTree === 'modificato' ? 'dirty' : 'clean'}`}>
              {git.workingTree === 'modificato' ? `${git.modifiedFiles} modificati` : 'pulito'}
            </span>
          )}
        </span>
        <span className="kc-forge-live"><span className="kc-forge-live-dot" />LIVE</span>
      </div>

      <div className="kc-forge-body">
        {/* ── EXPLORER: file modificati ── */}
        <aside className="kc-forge-explorer">
          <div className="kc-forge-pane-head">EXPLORER · modifiche</div>
          <div className="kc-forge-files">
            {files.length === 0 ? (
              <div className="kc-forge-empty">{git?.available === false ? 'Repo git non disponibile' : 'Working tree pulito'}</div>
            ) : (
              files.map((f) => (
                <button
                  key={f.path}
                  className={`kc-forge-file ${selectedFile === f.path ? 'sel' : ''}`}
                  onClick={() => void openDiff(f.path)}
                  title={cleanDisplayText(f.path)}
                >
                  <span className="kc-forge-file-icon">{fileIcon(f.path)}</span>
                  <span className="kc-forge-file-path">{cleanDisplayText(f.path.split('/').pop())}</span>
                  <span className="kc-forge-file-dir">{f.path.includes('/') ? cleanDisplayText(f.path.slice(0, f.path.lastIndexOf('/'))) : ''}</span>
                  <span className="kc-forge-file-state" style={{ color: STATE_COLOR[f.state] || '#94a3b8' }}>
                    {STATE_GLYPH[f.state] || '-'}
                  </span>
                </button>
              ))
            )}
          </div>
          {git?.lastCommitMessage && (
            <div className="kc-forge-commit">
              <div className="kc-forge-commit-head">ULTIMO COMMIT</div>
              <div className="kc-forge-commit-msg">{cleanDisplayText(git.lastCommitMessage)}</div>
              <div className="kc-forge-commit-hash">{git.lastCommit}</div>
            </div>
          )}
        </aside>

        {/* ── CENTRO: editor a tab (console live / diff file) + handoff ── */}
        <main className="kc-forge-center">
          <div className="kc-forge-tabs">
            <button className={`kc-forge-tab ${!selectedFile ? 'act' : ''}`} onClick={closeDiff}>
              console
            </button>
            {selectedFile && (
              <button className="kc-forge-tab act" onClick={closeDiff} title={selectedFile}>
                <span className="kc-forge-file-icon">{fileIcon(selectedFile)}</span>
                {cleanDisplayText(selectedFile.split('/').pop())}
                <span className="kc-forge-tab-x">✕</span>
              </button>
            )}
            <span className="kc-forge-tabs-spacer" />
            {!selectedFile && (
              <button
                className="kc-forge-scroll-toggle"
                onClick={() => { autoScrollRef.current = !autoScrollRef.current; }}
                title="Auto-scroll on/off"
              >⇩</button>
            )}
          </div>
          {selectedFile ? (
            <div className="kc-forge-diff">
              {diffLoading ? (
                <div className="kc-forge-empty">Leggo il diff…</div>
              ) : (
                <>
                  {diff?.isNew && <div className="kc-forge-diff-newtag">file nuovo · non ancora tracciato da git</div>}
                  {(diff?.diff || '').split('\n').map((ln, i) => {
                    const cls = ln.startsWith('+++') || ln.startsWith('---') || ln.startsWith('diff ') || ln.startsWith('index ') ? 'meta'
                      : ln.startsWith('@@') ? 'hunk'
                      : ln.startsWith('+') ? 'add'
                      : ln.startsWith('-') ? 'del' : '';
                    return <div key={i} className={`kc-forge-diffline ${cls}`}>{ln || ' '}</div>;
                  })}
                  {diff?.truncated && <div className="kc-forge-empty">… diff troncato per dimensione</div>}
                </>
              )}
            </div>
          ) : (
            <div
              className="kc-forge-console"
              onScroll={(e) => {
                const el = e.currentTarget;
                autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              }}
            >
              {logs.length === 0 ? (
                <div className="kc-forge-empty">Nessuna attività runtime. Quando Kira lancia build, audit, git o handoff agli agenti, compare qui.</div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className="kc-forge-logline">
                    <span className="kc-forge-log-ts">{l.timestamp?.slice(11) || ''}</span>
                    <span className="kc-forge-log-src">{cleanDisplayText(l.source)}</span>
                    <span className="kc-forge-log-msg" style={{ color: LEVEL_COLOR[l.level] || '#cbd5e1' }}>{cleanDisplayText(l.message)}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          )}

          {/* Handoff verso i coder */}
          <div className="kc-forge-pane-head">HANDOFF · ordini ai coder (Claude / Codex)</div>
          <div className="kc-forge-handoffs">
            {handoffs.length === 0 ? (
              <div className="kc-forge-empty">Nessun handoff generato. Quando Kira passa un lavoro a Claude o Codex, l'ordine appare qui.</div>
            ) : (
              handoffs.map((h) => (
                <button key={h.agent + h.id} className="kc-forge-handoff" onClick={() => setOpenHandoff(h)}>
                  <span className={`kc-forge-handoff-agent agent-${h.agent}`}>{cleanDisplayText(h.agent)}</span>
                  <span className="kc-forge-handoff-title">{cleanDisplayText(h.title, h.id)}</span>
                  <span className="kc-forge-handoff-time">{relTime(h.at)} fa</span>
                </button>
              ))
            )}
          </div>
        </main>

        {/* ── DESTRA: agenti & job ── */}
        <aside className="kc-forge-agents">
          <div className="kc-forge-pane-head">AGENTI · {activeJobs.length} attivi</div>
          <div className="kc-forge-jobs">
            {activeJobs.length === 0 && doneJobs.length === 0 ? (
              <div className="kc-forge-empty">Nessun job. Chiedi a Kira un lavoro complesso e vedrai gli agenti muoversi.</div>
            ) : (
              <>
                {activeJobs.map((j) => (
                  <div key={j.id} className="kc-forge-job running">
                    <div className="kc-forge-job-top">
                      <span className="kc-forge-job-pulse" />
                      <span className="kc-forge-job-agent">{jobAgent(j)}</span>
                      <span className="kc-forge-job-status">{cleanDisplayText((j.status || '').replace(/_/g, ' '), '-')}</span>
                    </div>
                    <div className="kc-forge-job-title">{jobTitle(j)}</div>
                    <div className="kc-forge-job-time">{relTime(j.updatedAt || j.createdAt)} fa</div>
                  </div>
                ))}
                {doneJobs.slice(0, 6).map((j) => (
                  <div key={j.id} className="kc-forge-job done">
                    <div className="kc-forge-job-top">
                      <span className="kc-forge-job-check">✓</span>
                      <span className="kc-forge-job-agent">{jobAgent(j)}</span>
                    </div>
                    <div className="kc-forge-job-title">{jobTitle(j)}</div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="kc-forge-pane-head">EVOLVE · auto-miglioramento</div>
          <div className="kc-forge-evolve">
            <div className="kc-forge-evolve-row">
              <span className={`kc-forge-evolve-dot ${evolve?.running ? 'on' : ''}`} />
              <span className="kc-forge-evolve-state">
                {evolve?.running ? (evolve.stopRequested ? 'in arresto a fine ciclo' : 'in evoluzione') : 'ferma'}
              </span>
              <span className="kc-forge-evolve-patches">{evolve?.patches ?? 0} proposte</span>
            </div>
            {evolve?.logTail && (
              <pre className="kc-forge-evolve-log">{evolve.logTail.split('\n').slice(-4).join('\n')}</pre>
            )}
          </div>

          <div className="kc-forge-pane-head">PONTI · coder & modelli</div>
          <div className="kc-forge-bridges">
            {coderBridges.map((b) => (
              <div key={b.name} className="kc-forge-bridge">
                <span className={`kc-forge-bridge-mode mode-${b.mode || 'off'}`} />
                <span className="kc-forge-bridge-name">{cleanDisplayText(b.name, 'bridge')}</span>
                <span className="kc-forge-bridge-detail">{cleanDisplayText(b.mode, '-')}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Modale handoff */}
      {openHandoff && (
        <div className="kc-forge-modal" onClick={(e) => { if (e.target === e.currentTarget) setOpenHandoff(null); }}>
          <div className="kc-forge-modal-card">
            <div className="kc-forge-modal-head">
              <span className={`kc-forge-handoff-agent agent-${openHandoff.agent}`}>{cleanDisplayText(openHandoff.agent)}</span>
              <span className="kc-forge-modal-title">{cleanDisplayText(openHandoff.title, openHandoff.id)}</span>
              <button className="kc-forge-modal-close" onClick={() => setOpenHandoff(null)}>✕</button>
            </div>
            <pre className="kc-forge-modal-body">{cleanDisplayText(openHandoff.preview)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
