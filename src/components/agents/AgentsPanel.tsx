import { useCallback, useEffect, useMemo, useState } from 'react';

type AgentStatus = {
  opencode: string;
  openclaw: string;
  discordReport: string;
  ollama: string;
  tasks: { queued: number; running: number; completed: number; failed: number; blocked: number; archived: number };
  agentOs?: { agents: number; opencode: string; discord: string; qwen: string };
};

type AgentJob = {
  id: string;
  title: string;
  originalRequest: string;
  status: string;
  priority: string;
  createdBy: string;
  assignedManagerId: string;
  assignedManagerName: string;
  involvedAgentIds: string[];
  mainAgentId?: string;
  mainAgentName?: string;
  activeAgentId?: string;
  activeAgentName?: string;
  subtasks: Array<{ id: string; title: string; agentId: string; agentName: string; status: string; progress: number; output?: string }>;
  approvalStatus: string;
  approvalMode?: string;
  approvalReason?: string;
  approvalChannel?: string;
  approvalScope?: string[];
  approvedForJob?: boolean;
  planOnly?: boolean;
  risk?: string;
  filesInvolved?: string[];
  estimatedDuration?: string;
  partialOutputs: Array<{ at: string; agentId: string; title: string; content: string }>;
  errors: Array<{ at: string; agentId: string; message: string }>;
  recoveryAttempts: number;
  discordReportsSent: number;
  discordApprovalSentAt?: string;
  memoryUpdated: boolean;
  progress: number;
  result?: string;
  nextAction?: string;
  handoffPath?: string;
  bridgeMode?: string;
  longRunning?: boolean;
  createdAt: string;
  updatedAt: string;
};

type HierarchyAgent = {
  id: string;
  humanName: string;
  role: string;
  description: string;
  type: string;
  supervisorId?: string;
  subordinateIds: string[];
  capabilities: string[];
  limits: string[];
  maxPermission: string;
  preferredModel: string;
  preferredRuntime: string;
  canExecuteCode: boolean;
  canModifyFiles: boolean;
  requiresApproval: boolean;
  status: string;
  lastTask?: string;
  health: string;
};

type BridgeStatus = { id: string; name: string; mode: string; automatic: boolean; handoff: boolean; requiresHuman: boolean; detail: string };
type RuntimeLogEntry = { timestamp?: string; level?: string; source?: string; message?: string };
type JobEvent = { id: string; at: string; jobId?: string; level: string; title: string; detail: string };
type GitInfo = { branch: string; lastCommit: string; lastCommitMessage: string; workingTree: string; modifiedFiles: number; available: boolean };
type LoopSnapshot = { state: { running: boolean; paused: boolean; activeJobId: string; stoppedReason?: string }; queue: { queue: string[] } };

type MainTab = 'command' | 'jobs' | 'approvals' | 'team' | 'log';

const TABS: Array<{ id: MainTab; label: string }> = [
  { id: 'command', label: 'Comando' },
  { id: 'jobs', label: 'Lavori' },
  { id: 'approvals', label: 'Approvazioni' },
  { id: 'team', label: 'Team' },
  { id: 'log', label: 'Log' },
];

const STATUS_TEXT: Record<string, string> = {
  received: 'ricevuto',
  planned: 'pianificato',
  waiting_approval: 'in attesa di approvazione',
  running: 'in corso',
  reviewing: 'revisione in corso',
  testing: 'test in corso',
  reporting: 'report in corso',
  completed: 'completato',
  failed: 'fallito',
  blocked: 'bloccato',
  needs_human: 'serve intervento umano',
  waiting_opencode: 'attende OpenCode',
  handoff_ready: 'pronto per intervento assistito',
  plan_ready: 'piano pronto',
  patch_applied: 'modifica applicata',
  waiting_patch: 'attende applicazione modifica',
  waiting_human: 'serve intervento umano',
  paused: 'in pausa',
  recovered: 'recuperato',
  pending: 'in attesa',
};

const STATUS_COLOR: Record<string, string> = {
  received: '#94a3b8',
  planned: '#38bdf8',
  waiting_approval: '#f59e0b',
  running: '#60a5fa',
  reviewing: '#a78bfa',
  testing: '#a9c9ff',
  reporting: '#fb923c',
  completed: '#22c55e',
  failed: '#ef4444',
  blocked: '#f59e0b',
  needs_human: '#f59e0b',
  waiting_opencode: '#38bdf8',
  handoff_ready: '#60a5fa',
  plan_ready: '#a78bfa',
  waiting_patch: '#a9c9ff',
  waiting_human: '#f59e0b',
  recovered: '#84cc16',
};

const TEAM_GROUPS = [
  { title: 'Coding', ids: ['coding-manager', 'patch-runner', 'qwen-coding-agent', 'deepseek-runner', 'openclaw-runner', 'opencode-agent'] },
  { title: 'Memoria', ids: ['memory-manager'] },
  { title: 'Voce', ids: ['voice-manager'] },
  { title: 'Sicurezza', ids: ['security-manager'] },
  { title: 'Test', ids: ['tester-agent', 'reviewer-agent'] },
  { title: 'Report', ids: ['reporting-manager', 'discord-bridge-agent'] },
  { title: 'Recovery', ids: ['recovery-agent', 'scheduler-agent'] },
];

const NIGHT_WORK_COMMAND = 'Kira, avvia un lavoro lungo per migliorare la UI grafica. Vai avanti finche puoi, correggi gli errori, salva i progressi e avvisami solo se serve davvero.';

function statusText(status: string) {
  return STATUS_TEXT[status] || status.replace(/_/g, ' ');
}

function elapsed(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'ora';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m fa`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h fa`;
  return new Date(iso).toLocaleDateString('it');
}

function humanLog(entry: RuntimeLogEntry | JobEvent) {
  const raw = 'detail' in entry ? `${entry.title}: ${entry.detail}` : entry.message || '';
  const lower = raw.toLowerCase();
  if (lower.includes('approval') || lower.includes('approvazione')) return 'Kira sta aspettando una conferma prima di procedere.';
  if (lower.includes('handoff')) return 'Kira ha preparato un handoff. Non lo segna come eseguito automaticamente.';
  if (lower.includes('build')) return 'Kira ha controllato che tutto funzioni.';
  if (lower.includes('patch applicata')) return 'Patch Runner ha applicato una modifica reale.';
  if (lower.includes('job completed')) return 'Lavoro completato.';
  if (lower.includes('audit')) return 'Kira ha controllato la sicurezza delle dipendenze.';
  if (lower.includes('secret')) return 'Kira ha controllato che non ci siano dati sensibili nelle modifiche.';
  if (lower.includes('discord')) return 'Reporting Manager ha gestito un messaggio Discord.';
  if (lower.includes('recovery')) return 'Recovery Agent ha tentato un recupero controllato.';
  return raw || 'Evento agentico registrato.';
}

function directionFor(job?: AgentJob) {
  if (!job) return 'Nessun job selezionato.';
  const agents = job.subtasks.map((item) => item.agentName).filter((name, index, arr) => arr.indexOf(name) === index);
  return ['Kira Core', 'Chief Orchestrator', job.assignedManagerName, ...agents.filter((name) => !['Kira Core', 'Chief Orchestrator', job.assignedManagerName].includes(name))].join(' -> ');
}

function lastJobOutput(job: AgentJob) {
  return job.partialOutputs[job.partialOutputs.length - 1]?.content || '';
}

function shortFileName(value: string) {
  return value.replace(/\\/g, '/').split('/').filter(Boolean).pop() || value;
}

function patchApplied(job: AgentJob) {
  const text = `${job.result || ''}\n${job.partialOutputs.map((output) => `${output.title}\n${output.content}`).join('\n')}`;
  return /Patch applicata/i.test(text);
}

function modifiedFiles(job: AgentJob) {
  const text = `${job.result || ''}\n${job.partialOutputs.map((output) => output.content).join('\n')}`;
  const match = text.match(/(?:Patch applicata:|File:)\s*([^\n]+)/i);
  const files = match ? match[1].split(',').map((item) => item.trim()).filter((item) => item && !/nessuno/i.test(item)) : job.filesInvolved || [];
  return files.map(shortFileName).filter((name, index, all) => name && all.indexOf(name) === index);
}

function projectCheck(job: AgentJob) {
  const text = job.partialOutputs.map((output) => `${output.title}\n${output.content}`).join('\n');
  if (/Controllo funzionamento(?: Kira)?\s+OK|built in|build completat/i.test(text)) return 'Kira funziona correttamente';
  if (/Build fallita|FAILED/i.test(text)) return 'controllo fallito';
  return 'non eseguito';
}

function workersFor(job: AgentJob) {
  if (patchApplied(job)) return 'Qwen + Patch Runner';
  if (job.status === 'handoff_ready' || job.status === 'waiting_opencode') return 'Qwen + OpenCode assistito';
  return involvedAgents(job);
}

function resultSummary(job: AgentJob) {
  if (/Modifica gia presente/i.test(job.result || '')) return 'gia applicato';
  if (patchApplied(job)) return 'modifica applicata';
  if (job.status === 'completed') return 'completato';
  return statusText(job.status);
}

function nextHumanAction(job: AgentJob) {
  const files = modifiedFiles(job).join(' ').toLowerCase();
  if (patchApplied(job) && /voicepanel/.test(files)) return 'prova voce da UI';
  if (patchApplied(job) && /particle|agentspanel|tsx/.test(files)) return 'verifica visiva';
  return job.nextAction || actionHint(job);
}

function activitySummary(job: AgentJob) {
  if (job.status === 'running') return 'Sto lavorando';
  if (job.status === 'testing') return 'Sto controllando Kira';
  if (job.status === 'waiting_approval' || job.status === 'needs_human' || job.status === 'waiting_human') return 'Serve il tuo intervento';
  if (job.status === 'handoff_ready' || job.status === 'waiting_opencode') return 'Pronto per intervento assistito';
  if (job.status === 'completed' && patchApplied(job)) return 'Ho completato la modifica';
  if (job.status === 'completed') return 'Ho completato';
  return statusText(job.status);
}

function primaryAgent(job: AgentJob) {
  return job.mainAgentName || job.activeAgentName || job.assignedManagerName;
}

function actionHint(job: AgentJob) {
  if (job.status === 'handoff_ready' || job.status === 'waiting_opencode') return 'Apri OpenCode dal launcher o usa il prompt handoff generato.';
  if (job.status === 'waiting_patch') return 'Applica la patch con OpenCode, poi fai controllare Kira al Tester.';
  if (job.status === 'waiting_approval') return 'Approva il lavoro o scegli solo piano.';
  return job.result || job.nextAction || 'In corso';
}

function involvedAgents(job: AgentJob) {
  return job.subtasks.map((item) => item.agentName).filter((name, index, all) => all.indexOf(name) === index).slice(0, 4).join(', ') || primaryAgent(job);
}

function fileScopeSummary(job: AgentJob) {
  if (job.approvalMode === 'single_job') return 'scope Kira consentito';
  const count = job.filesInvolved?.length || 0;
  if (!count) return 'non ancora definito';
  return count === 1 ? '1 area del progetto' : `${count} aree del progetto`;
}

function bridgeModeLabel(mode: string) {
  const labels: Record<string, string> = { automatic: 'automatico', assisted: 'assistito', handoff: 'solo handoff', unavailable: 'non disponibile' };
  return labels[mode] || mode;
}

export function AgentsPanel() {
  const [tab, setTab] = useState<MainTab>('command');
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [agents, setAgents] = useState<HierarchyAgent[]>([]);
  const [bridges, setBridges] = useState<BridgeStatus[]>([]);
  const [logs, setLogs] = useState<RuntimeLogEntry[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [git, setGit] = useState<GitInfo | null>(null);
  const [loop, setLoop] = useState<LoopSnapshot | null>(null);
  const [selectedJob, setSelectedJob] = useState<AgentJob | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [request, setRequest] = useState('');
  const [autoStart, setAutoStart] = useState(true);

  const load = useCallback(async () => {
    try {
      const [statusResponse, jobsResponse, hierarchyResponse, logsResponse, gitResponse, loopResponse] = await Promise.all([
        fetch('/api/agents/status'),
        fetch('/api/agents/jobs'),
        fetch('/api/agents/hierarchy'),
        fetch('/api/agents/runtime/logs'),
        fetch('/api/agents/git-status'),
        fetch('/api/agents/loop/status'),
      ]);
      if (statusResponse.ok) setStatus(await statusResponse.json());
      if (jobsResponse.ok) {
        const nextJobs = await jobsResponse.json();
        setJobs(nextJobs);
        setSelectedJob((current) => current ? nextJobs.find((job: AgentJob) => job.id === current.id) || current : current);
      }
      if (hierarchyResponse.ok) {
        const data = await hierarchyResponse.json();
        setAgents(data.runtime?.agents || data.agents || []);
        setBridges(data.bridges || []);
      }
      if (logsResponse.ok) setLogs(await logsResponse.json());
      if (gitResponse.ok) setGit(await gitResponse.json());
      if (loopResponse.ok) setLoop(await loopResponse.json());
    } catch {
      setMessage('Action Center non raggiungibile. Controlla il server Kira.');
    }
  }, []);

  useEffect(() => {
    void load();
    // 1.5s è il ritmo "live" quando guardi il pannello; con finestra nascosta non pollare
    const id = window.setInterval(() => { if (!document.hidden) void load(); }, 1500);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const stream = new EventSource('/api/agents/jobs-events/stream');
    stream.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'snapshot') setEvents(data.events || []);
        if (data.type === 'job-event' && data.event) {
          setEvents((current) => [...current, data.event].slice(-120));
          void load();
        }
      } catch {
        // Ignora eventi corrotti senza rompere l Action Center.
      }
    };
    stream.onerror = () => stream.close();
    return () => stream.close();
  }, []);

  const visibleJobs = useMemo(() => jobs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [jobs]);
  const activeJob = selectedJob || visibleJobs.find((job) => job.id === loop?.state.activeJobId) || visibleJobs[0];
  const approvals = visibleJobs.filter((job) => job.approvalStatus === 'pending' || job.status === 'waiting_approval');
  const humanEvents = [...events.slice(-10).reverse(), ...logs.slice(-8).reverse()].slice(0, 12);

  async function createJob() {
    const text = request.trim();
    if (!text) {
      setMessage('Scrivi cosa vuoi far fare a Kira.');
      return;
    }
    setBusy('Creo job agentico...');
    try {
      const response = await fetch('/api/agents/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: text, source: 'Action Center', autoStart }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Creazione job fallita');
      const job = data.job as AgentJob;
      setSelectedJob(job);
      setRequest('');
      setTab(job.approvalStatus === 'pending' ? 'approvals' : 'jobs');
      setMessage(job.approvalStatus === 'pending' ? 'Lavoro creato. Serve la tua conferma prima di modificare file.' : 'Lavoro creato. Kira lo prende in carico.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Errore Action Center');
    } finally {
      setBusy('');
    }
  }

  async function jobAction(jobId: string, action: 'enqueue' | 'approve' | 'deny' | 'discord-approval' | 'skip' | 'pause' | 'plan-only') {
    setBusy(action === 'approve' ? 'Approvo e avvio...' : 'Aggiorno job...');
    try {
      const response = await fetch(`/api/agents/jobs/${jobId}/${action}`, { method: 'POST' });
      const data = await response.json();
      setMessage(data.message || 'Job aggiornato.');
      await load();
    } catch {
      setMessage('Azione job non riuscita.');
    } finally {
      setBusy('');
    }
  }

  async function runtimeAction(action: string) {
    const labels: Record<string, string> = {
      run_build: 'Controllo se Kira funziona correttamente...',
      run_audit: 'Controllo che le dipendenze siano sicure...',
      secret_check: 'Controllo che non ci siano chiavi o dati sensibili...',
      git_status: 'Controllo quali file sono stati modificati...',
      git_diff: 'Preparo un riepilogo delle modifiche...',
      git_log: 'Controllo gli ultimi punti salvati...',
      sync_reports: 'Aggiorno la memoria locale...',
      piper_test: 'Controllo la voce locale...',
    };
    setBusy(labels[action] || 'Eseguo controllo...');
    try {
      const response = await fetch('/api/agents/runtime/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await response.json();
      setMessage(data.ok ? 'Controllo completato.' : data.error || data.stderr || 'Controllo non riuscito.');
      await load();
    } catch {
      setMessage('Runtime non raggiungibile.');
    } finally {
      setBusy('');
    }
  }

  async function loopAction(action: 'pause' | 'resume' | 'stop') {
    setBusy('Aggiorno il lavoro in autonomia...');
    try {
      await fetch(`/api/agents/loop/${action}`, { method: 'POST' });
      setMessage(action === 'pause' ? 'Lavoro in autonomia messo in pausa.' : action === 'resume' ? 'Lavoro in autonomia ripreso.' : 'Lavoro in autonomia fermato.');
      await load();
    } catch {
      setMessage('Loop non raggiungibile.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-28 pt-32 md:px-8 md:pt-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.32em] text-kira-blue/70" data-kira-night-work-ready="true">Agenti</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Action Center</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">Tu dici cosa vuoi. Kira sceglie chi lavora, applica patch sicure quando puo e ti mostra il risultato.</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3 text-sm text-cyan-100/75">
          {loop?.state.paused ? 'Autonomia in pausa' : loop?.state.running ? 'Kira sta lavorando' : 'Autonomia pronta'} · {loop?.queue.queue.length || 0} in attesa
        </div>
      </header>

      <nav className="grid grid-cols-3 gap-2 rounded-[1.4rem] border border-white/10 bg-black/25 p-1.5 backdrop-blur-xl md:grid-cols-5">
        {TABS.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-2xl px-3 py-2.5 text-sm transition ${tab === item.id ? 'bg-white text-black shadow-[0_0_30px_rgba(125,211,252,0.18)]' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}>{item.label}</button>)}
      </nav>

      {message ? <div className="flex items-center justify-between gap-3 rounded-2xl border border-sky-300/20 bg-sky-300/[0.08] px-4 py-3 text-sm text-sky-100"><span>{message}</span><button className="text-white/50 hover:text-white" onClick={() => setMessage('')}>Chiudi</button></div> : null}
      {busy ? <div className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.08] px-4 py-3 text-sm text-violet-100">{busy}</div> : null}

      {tab === 'command' ? <CommandTab request={request} autoStart={autoStart} onRequest={setRequest} onAutoStart={setAutoStart} onCreate={() => void createJob()} onRuntime={runtimeAction} onLoop={loopAction} /> : null}
      {tab === 'jobs' ? <JobsTab jobs={visibleJobs} selectedId={selectedJob?.id || ''} onSelect={(job) => setSelectedJob(selectedJob?.id === job.id ? null : job)} onAction={jobAction} /> : null}
      {tab === 'team' ? <TeamTab agents={agents} bridges={bridges} /> : null}
      {tab === 'approvals' ? <ApprovalsTab jobs={approvals} onAction={jobAction} /> : null}
      {tab === 'log' ? <LogTab events={humanEvents} onRuntime={runtimeAction} activeJob={activeJob} bridges={bridges} git={git} logs={logs} /> : null}
    </div>
  );
}

function CommandTab(props: { request: string; autoStart: boolean; onRequest: (value: string) => void; onAutoStart: (value: boolean) => void; onCreate: () => void; onRuntime: (action: string) => void; onLoop: (action: 'pause' | 'resume' | 'stop') => void }) {
  return <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
    <div className="hero-panel">
      <div className="text-sm font-medium text-white/70">Cosa vuoi far fare a Kira?</div>
      <textarea className="field-input mt-4 min-h-44 resize-none text-base leading-7" value={props.request} onChange={(event) => props.onRequest(event.target.value)} placeholder="Esempi: Kira, controlla se funziona tutto. Kira, cambia le particelle in viola. Kira, migliora la voce se legge asterischi." />
      <label className="mt-4 flex items-center gap-3 text-sm text-white/55"><input type="checkbox" checked={props.autoStart} onChange={(event) => props.onAutoStart(event.target.checked)} /> Avvia se e sicuro. Se serve autorizzazione, fermati e chiedi.</label>
      <button className="mt-5 w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-cyan-100" onClick={props.onCreate}>Avvia Kira</button>
    </div>
    <div className="grid gap-3">
      <div className="panel-block">
        <div className="text-sm font-medium text-white">Controlli rapidi</div>
        <div className="mt-4 grid gap-2">
          <RuntimeButton title="Controlla Kira" detail="Verifica che il progetto funzioni correttamente." onClick={() => void props.onRuntime('run_build')} />
          <RuntimeButton title="Controlla dipendenze" detail="Verifica che non ci siano vulnerabilita note." onClick={() => void props.onRuntime('run_audit')} />
          <RuntimeButton title="Controlla dati sensibili" detail="Cerca chiavi o dati sensibili nelle modifiche senza mostrarli." onClick={() => void props.onRuntime('secret_check')} />
          <RuntimeButton title="File modificati" detail="Mostra un controllo sintetico delle modifiche." onClick={() => void props.onRuntime('git_status')} />
        </div>
      </div>
      <div className="panel-block">
        <div className="text-sm font-medium text-white">Lavoro in autonomia</div>
        <p className="mt-2 text-xs leading-5 text-white/42">Comando lungo pronto, ma non parte finche non premi Avvia Kira.</p>
        <div className="mt-4 flex flex-wrap gap-2"><button className="voice-button-primary" onClick={() => { props.onRequest(NIGHT_WORK_COMMAND); props.onAutoStart(false); }}>Prepara lavoro lungo UI</button><button className="voice-button" onClick={() => props.onLoop('pause')}>Pausa</button><button className="voice-button" onClick={() => props.onLoop('resume')}>Riprendi</button><button className="voice-button" onClick={() => props.onLoop('stop')}>Ferma tutto</button></div>
      </div>
    </div>
  </section>;
}

function DirectionTab({ job, bridges, status }: { job?: AgentJob; bridges: BridgeStatus[]; status: AgentStatus | null }) {
  return <section className="grid gap-4 lg:grid-cols-[1fr_20rem]">
    <div className="panel-block">
      <div className="text-xs uppercase tracking-[0.24em] text-white/35">Direzione</div>
      <h3 className="mt-3 text-2xl font-semibold text-white">{job ? 'Kira ha scelto' : 'Nessun lavoro selezionato'}</h3>
      <p className="mt-3 text-sm leading-7 text-cyan-100/75">{directionFor(job)}</p>
      {job ? <div className="mt-5 grid gap-2">{job.subtasks.map((item) => <SubtaskLine key={item.id} subtask={item} />)}</div> : null}
    </div>
    <aside className="grid h-fit gap-3">
      <MiniStat label="OpenCode" value={status?.agentOs?.opencode || status?.opencode || 'n/d'} />
      <MiniStat label="Discord" value={status?.agentOs?.discord || status?.discordReport || 'n/d'} />
      <MiniStat label="Qwen" value={status?.agentOs?.qwen || 'automatico se Ollama risponde'} />
      {bridges.slice(0, 3).map((bridge) => <MiniStat key={bridge.id} label={bridge.name} value={bridge.mode} />)}
    </aside>
  </section>;
}

function JobsTab({ jobs, selectedId, onSelect, onAction }: { jobs: AgentJob[]; selectedId: string; onSelect: (job: AgentJob) => void; onAction: (jobId: string, action: 'enqueue' | 'approve' | 'deny' | 'discord-approval' | 'skip' | 'pause' | 'plan-only') => void }) {
  const active  = jobs.filter((j) => ['running','reviewing','testing','reporting'].includes(j.status));
  const waiting = jobs.filter((j) => ['waiting_approval','needs_human','waiting_human','handoff_ready','waiting_opencode','waiting_patch'].includes(j.status));
  const rest    = jobs.filter((j) => !active.includes(j) && !waiting.includes(j));
  if (!jobs.length) return <div className="panel-block text-sm text-white/45">Nessun lavoro ancora creato.</div>;
  return (
    <section className="grid gap-5">
      {active.length > 0 && (
        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.22em] text-cyan-300/60">In corso</div>
          <div className="grid gap-2">{active.map((job) => <JobCard key={job.id} job={job} selected={selectedId === job.id} onSelect={() => onSelect(job)} onAction={onAction} />)}</div>
        </div>
      )}
      {waiting.length > 0 && (
        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.22em] text-amber-300/60">Serve intervento</div>
          <div className="grid gap-2">{waiting.map((job) => <JobCard key={job.id} job={job} selected={selectedId === job.id} onSelect={() => onSelect(job)} onAction={onAction} />)}</div>
        </div>
      )}
      {rest.length > 0 && (
        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.22em] text-white/25">Recenti</div>
          <div className="grid gap-2">{rest.map((job) => <JobCard key={job.id} job={job} selected={selectedId === job.id} onSelect={() => onSelect(job)} onAction={onAction} />)}</div>
        </div>
      )}
    </section>
  );
}

function TeamTab({ agents, bridges }: { agents: HierarchyAgent[]; bridges: BridgeStatus[] }) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TEAM_GROUPS.map((group) => {
          const members = agents.filter((a) => group.ids.includes(a.id));
          const anyDown = members.some((a) => a.health === 'unavailable' || a.health === 'degraded');
          return (
            <div key={group.title} className="panel-block">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{group.title}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[0.62rem] ${anyDown ? 'bg-amber-300/10 text-amber-200' : 'bg-emerald-300/[0.08] text-emerald-300'}`}>
                  {anyDown ? 'degradato' : 'ok'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {members.map((a) => (
                  <span key={a.id} className={`rounded-full border px-2.5 py-0.5 text-xs ${a.health === 'unavailable' ? 'border-red-400/20 text-red-300/70' : 'border-white/10 text-white/55'}`}>
                    {a.humanName}
                  </span>
                ))}
                {members.length === 0 && <span className="text-xs text-white/25">nessun agente</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="panel-block">
        <div className="text-sm font-medium text-white/70">Piattaforme</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {bridges.map((b) => (
            <div key={b.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
              <span className="font-medium text-white/80">{b.name}</span>
              <span className="ml-2 text-white/35">{bridgeModeLabel(b.mode)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ApprovalsTab({ jobs, onAction }: { jobs: AgentJob[]; onAction: (jobId: string, action: 'enqueue' | 'approve' | 'deny' | 'discord-approval' | 'skip' | 'pause' | 'plan-only') => void }) {
  return <section className="grid gap-3">{jobs.length ? jobs.map((job) => <article key={job.id} className="rounded-[1.35rem] border border-amber-300/20 bg-amber-300/[0.07] p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="text-xs uppercase tracking-[0.22em] text-amber-100/45">Serve la tua autorizzazione</div><h3 className="mt-2 text-base font-semibold text-white">{job.title}</h3><p className="mt-2 text-sm leading-6 text-amber-100/75">{job.approvalMode === 'single_job' ? `Per questo lavoro ${primaryAgent(job)} puo modificare piu file consentiti senza chiederti micro-permessi.` : `${primaryAgent(job)} vuole continuare questo lavoro.`}</p><div className="mt-3 grid gap-2 text-xs text-white/45 md:grid-cols-2"><div>Motivo: {job.approvalReason || 'Devo modificare alcuni file.'}</div><div>Rischio: {job.risk || 'medio'}</div><div>Durata stimata: {job.estimatedDuration || 'breve'}</div><div>Scope: {fileScopeSummary(job)}</div></div><p className="mt-2 text-xs text-white/38">Discord: {job.discordReportsSent > 0 || job.discordApprovalSentAt ? 'avvisato' : 'non necessario o non configurato'}</p></div><div className="flex flex-wrap gap-2"><button className="voice-button-primary" onClick={() => onAction(job.id, 'approve')}>Approva lavoro</button><button className="voice-button" onClick={() => onAction(job.id, 'deny')}>Rifiuta</button><button className="voice-button" onClick={() => onAction(job.id, 'plan-only')}>Solo prepara piano</button><button className="voice-button" onClick={() => onAction(job.id, 'pause')}>Ferma</button><button className="voice-button" onClick={() => onAction(job.id, 'discord-approval')}>Avvisa su Discord</button></div></div></article>) : <div className="panel-block text-sm text-white/45">Nessuna approvazione in attesa.</div>}</section>;
}

function LogTab({ events, onRuntime, activeJob, bridges, git, logs }: {
  events: Array<RuntimeLogEntry | JobEvent>;
  onRuntime: (action: string) => void;
  activeJob?: AgentJob;
  bridges: BridgeStatus[];
  git: GitInfo | null;
  logs: RuntimeLogEntry[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="panel-block">
        <div className="text-sm font-medium text-white">Attività recente</div>
        <div className="mt-4 grid gap-2">
          {events.length
            ? events.map((event, index) => (
              <div key={'id' in event ? event.id : index} className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2 text-sm text-white/55">
                {humanLog(event)}
              </div>
            ))
            : <div className="text-sm text-white/35">Nessun evento recente.</div>
          }
        </div>
      </div>
      <aside className="grid h-fit gap-3">
        <RuntimeButton title="Riepilogo modifiche" detail="Prepara un diff tecnico." onClick={() => void onRuntime('git_diff')} />
        <RuntimeButton title="Ultimi salvataggi" detail="Controlla i commit recenti." onClick={() => void onRuntime('git_log')} />
        <RuntimeButton title="Aggiorna memoria" detail="Sincronizza report nella memoria locale." onClick={() => void onRuntime('sync_reports')} />
        <RuntimeButton title="Controlla voce" detail="Prova una frase con Piper." onClick={() => void onRuntime('piper_test')} />
        <details className="rounded-[1.2rem] border border-white/[0.06] bg-black/15">
          <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-[0.22em] text-white/25 select-none">Raw dev</summary>
          <div className="grid gap-3 p-3">
            <RawBlock title="Job" content={activeJob ? JSON.stringify(activeJob, null, 2) : 'Seleziona un job.'} />
            <RawBlock title="Bridges" content={JSON.stringify(bridges, null, 2)} />
            <RawBlock title="Git" content={git?.available ? JSON.stringify(git, null, 2) : 'n/d'} />
            <RawBlock title="Log runtime" content={logs.map((e) => `[${e.source || 'Runtime'}] ${e.message || ''}`).join('\n') || '—'} />
          </div>
        </details>
      </aside>
    </section>
  );
}

function JobCard({ job, selected, onSelect, onAction }: { job: AgentJob; selected: boolean; onSelect: () => void; onAction: (jobId: string, action: 'enqueue' | 'approve' | 'deny' | 'discord-approval' | 'skip' | 'pause' | 'plan-only') => void }) {
  const needsHuman = ['pending','needs_human','waiting_human','waiting_approval','handoff_ready','waiting_opencode','waiting_patch'].includes(job.status) || job.approvalStatus === 'pending';
  const color = STATUS_COLOR[job.status] || '#94a3b8';

  return (
    <article className={`rounded-[1.35rem] border transition ${selected ? 'border-cyan-300/25 bg-cyan-300/[0.06]' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/15'}`}>
      {/* Collapsed header — always visible */}
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={onSelect}>
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} />
        <span className="flex-1 min-w-0">
          <span className="block truncate text-sm font-medium text-white/88">{job.title}</span>
          <span className="block text-xs text-white/32 mt-0.5">{primaryAgent(job)} · {elapsed(job.updatedAt)}</span>
        </span>
        <span className="flex-shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem]" style={{ borderColor: `${color}44`, color }}>
          {statusText(job.status)}
        </span>
        {needsHuman && <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400" title="Serve intervento" />}
        <span className="flex-shrink-0 text-white/25 text-xs">{selected ? '▲' : '▼'}</span>
      </button>

      {/* Progress bar — only when active */}
      {(job.progress > 0 && job.progress < 100) && (
        <div className="mx-4 mb-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all" style={{ width: `${Math.max(4, job.progress)}%` }} />
        </div>
      )}

      {/* Expanded body */}
      {selected && (
        <div className="border-t border-white/[0.06] px-4 py-3 grid gap-3">
          {needsHuman && (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2 text-xs text-amber-100/80">
              {actionHint(job)}
            </div>
          )}
          <div className="grid gap-2 text-xs text-white/50 md:grid-cols-2">
            <Info label="Richiesta" value={job.originalRequest} />
            <Info label="Chi lavora" value={workersFor(job)} />
            <Info label="Stato" value={activitySummary(job)} />
            {modifiedFiles(job).length > 0 && <Info label="File" value={modifiedFiles(job).join(', ')} />}
            {nextHumanAction(job) !== 'In corso' && <Info label="Prossimo passo" value={nextHumanAction(job)} />}
          </div>
          {job.subtasks.length > 0 && (
            <div className="grid gap-1.5">
              {job.subtasks.map((st) => <SubtaskLine key={st.id} subtask={st} />)}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="voice-button" onClick={() => onAction(job.id, 'enqueue')}>Avvia</button>
            {job.approvalStatus === 'pending' && <>
              <button className="voice-button-primary" onClick={() => onAction(job.id, 'approve')}>Approva</button>
              <button className="voice-button" onClick={() => onAction(job.id, 'deny')}>Rifiuta</button>
              <button className="voice-button" onClick={() => onAction(job.id, 'plan-only')}>Solo piano</button>
              <button className="voice-button" onClick={() => onAction(job.id, 'discord-approval')}>Discord</button>
            </>}
          </div>
        </div>
      )}
    </article>
  );
}

function SubtaskLine({ subtask }: { subtask: { title: string; agentName: string; status: string; progress: number } }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-medium text-white/80">{subtask.title}</span><span className="text-xs text-white/35">{statusText(subtask.status)}</span></div><div className="mt-1 text-xs text-white/45">{subtask.agentName}</div></div>;
}

function Progress({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value || 0)));
  return <div className="mt-4"><div className="flex justify-between text-xs text-white/40"><span>{label}</span><span>{safe}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400" style={{ width: `${Math.max(4, safe)}%` }} /></div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[0.68rem] uppercase tracking-[0.18em] text-white/28">{label}</div><div className="mt-1 line-clamp-3">{value}</div></div>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4"><div className="text-xs uppercase tracking-[0.2em] text-white/32">{label}</div><div className="mt-2 text-sm leading-6 text-white/70">{value}</div></div>;
}

function RawBlock({ title, content }: { title: string; content: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/50"><div className="font-medium text-white/75">{title}</div><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{content}</pre></div>;
}

function RuntimeButton({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return <button className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.07]" onClick={onClick}><div className="text-sm font-medium text-white">{title}</div><div className="mt-1 text-xs leading-5 text-white/42">{detail}</div></button>;
}
