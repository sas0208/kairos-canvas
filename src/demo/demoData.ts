/**
 * Dati INVENTATI per la modalità demo: nessun dato reale, nessun backend.
 * Ogni funzione ricalcola le date rispetto a "adesso", così l'interfaccia
 * sembra sempre viva (eventi in arrivo, job appena aggiornati, ecc.).
 */
import { USER_NAME } from '../config/user';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** ISO string spostata di `min` minuti da adesso (negativo = passato). */
export const iso = (min = 0): string => new Date(Date.now() + min * MIN).toISOString();

// ───────────────────────────── Modelli ─────────────────────────────────────

export const DEMO_MODELS = [
  { name: 'llama3.1:8b', sizeGb: 4.9, param: '8B', quant: 'Q4_K_M' },
  { name: 'qwen2.5:7b', sizeGb: 4.7, param: '7.6B', quant: 'Q4_K_M' },
  { name: 'qwen2.5-coder:7b', sizeGb: 4.7, param: '7.6B', quant: 'Q4_K_M' },
  { name: 'phi4-mini:3.8b', sizeGb: 2.5, param: '3.8B', quant: 'Q4_K_M' },
  { name: 'bge-m3:latest', sizeGb: 1.2, param: '567M', quant: 'F16' },
];

export function ollamaTags() {
  return {
    models: DEMO_MODELS.map((m, i) => ({
      name: m.name,
      model: m.name,
      modified_at: iso(-(i + 1) * 3 * 24 * 60),
      size: Math.round(m.sizeGb * 1024 ** 3),
    })),
  };
}

export function ollamaRuntime() {
  return {
    ok: true,
    latencyMs: 38,
    keepAlive: '30m',
    installed: DEMO_MODELS.map((m) => ({ name: m.name, sizeGb: m.sizeGb, parameterSize: m.param, quantization: m.quant })),
    running: [{ name: 'llama3.1:8b', vramGb: 5.4, expiresAt: iso(24) }],
  };
}

export function modelAudit() {
  return {
    ok: true,
    ollamaReachable: true,
    installedCount: DEMO_MODELS.length,
    totalSizeGB: Number(DEMO_MODELS.reduce((a, m) => a + m.sizeGb, 0).toFixed(1)),
    roles: [
      { role: 'chat', preferred: 'llama3.1:8b', resolved: 'llama3.1:8b', usingFallback: false, installed: true },
      { role: 'fast', preferred: 'phi4-mini:3.8b', resolved: 'phi4-mini:3.8b', usingFallback: false, installed: true },
      { role: 'coding', preferred: 'qwen2.5-coder:7b', resolved: 'qwen2.5-coder:7b', usingFallback: false, installed: true },
      { role: 'reasoning', preferred: 'qwen3:8b', resolved: 'qwen2.5:7b', usingFallback: true, installed: false },
      { role: 'embeddings', preferred: 'bge-m3', resolved: 'bge-m3:latest', usingFallback: false, installed: true },
      { role: 'vision', preferred: 'qwen2.5-vl:7b', resolved: null, usingFallback: false, installed: false },
    ],
    missingRoles: ['vision'],
    fallbackRoles: ['reasoning'],
    heavyInstalled: [],
    notes: ['Modalità demo: elenco modelli inventato.'],
  };
}

// ───────────────────────────── Meteo / calendario ──────────────────────────

export function weather() {
  const days = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const conds = ['Soleggiato', 'Parzialmente nuvoloso', 'Nuvoloso', 'Pioggia leggera', 'Soleggiato', 'Parzialmente nuvoloso', 'Soleggiato'];
  const forecast = conds.map((condition, i) => {
    const d = new Date(Date.now() + i * DAY);
    return { date: d.toISOString().slice(0, 10), day: days[d.getDay()], condition, tempMax: 22 + ((i * 3) % 5), tempMin: 12 + ((i * 2) % 4) };
  });
  return {
    status: 'ok',
    cached: false,
    data: { city: 'Valdoro', temp: 21, condition: 'Parzialmente nuvoloso', humidity: 54, wind: 11, forecast },
  };
}

export function calendar() {
  const ev = (id: string, title: string, startMin: number, durMin: number, location?: string, calendarName = 'Personale') => ({
    id,
    title,
    start: iso(startMin),
    end: iso(startMin + durMin),
    location,
    isAllDay: false,
    calendarName,
  });
  return {
    status: 'ok',
    cached: false,
    data: {
      events: [
        ev('ev-1', 'Stand-up del progetto', -95, 20, 'Sala Meet', 'Lavoro'),
        ev('ev-2', 'Revisione del design', 50, 45, 'Sala Meet', 'Lavoro'),
        ev('ev-3', 'Pranzo con il team', 150, 60, 'Trattoria Demo', 'Personale'),
        ev('ev-4', 'Sessione di studio: sistemi distribuiti', 300, 90, undefined, 'Studio'),
        ev('ev-5', 'Allenamento', 480, 60, 'Palestra', 'Personale'),
        ev('ev-6', 'Call con il cliente di prova', 24 * 60 + 60, 30, 'Online', 'Lavoro'),
        ev('ev-7', 'Cena con amici', 24 * 60 + 600, 120, 'Ristorante Demo', 'Personale'),
        ev('ev-8', 'Pianificazione della settimana', 2 * 24 * 60 + 30, 40, undefined, 'Lavoro'),
      ],
    },
  };
}

// ───────────────────────────── Note ────────────────────────────────────────

export interface DemoNote {
  id: string; title: string; content: string; tags: string[];
  createdAt: string; updatedAt: string; pinned: boolean;
}

export function seedNotes(): DemoNote[] {
  const n = (id: string, title: string, content: string, tags: string[], ageMin: number, pinned = false): DemoNote =>
    ({ id, title, content, tags, createdAt: iso(-ageMin - 30), updatedAt: iso(-ageMin), pinned });
  return [
    n('n1', 'Idee per il prossimo sprint', '- Rifinire il command palette\n- Aggiungere suoni di conferma\n- Provare un tema chiaro', ['lavoro', 'idee'], 40, true),
    n('n2', 'Lista della spesa', 'Caffè, avena, mele, olio, pane integrale, yogurt greco', ['casa'], 300),
    n('n3', 'Appunti: lettura "Designing Data-Intensive Applications"', 'Cap. 5: replicazione. Leader/follower, lag di replica, letture monotone.', ['studio', 'libri'], 1500),
    n('n4', 'Ricetta: pasta al limone', 'Burro, limone, parmigiano, pepe nero. Mantecare fuori dal fuoco.', ['cucina'], 4200),
    n('n5', 'Obiettivi del trimestre', '1) Finire il prototipo\n2) Scrivere la documentazione\n3) Pubblicare la demo', ['lavoro', 'obiettivi'], 6000, true),
    n('n6', 'Playlist per concentrarsi', 'Ambient, lo-fi, colonne sonore di videogiochi. Volume basso.', ['musica'], 9000),
  ];
}

// ───────────────────────────── Notifiche / azioni ──────────────────────────

export function seedNotifications() {
  const e = (i: number, type: string, source: string, message: string, detail: string | undefined, ageMin: number) =>
    ({ id: `nt-${i}`, timestamp: iso(-ageMin), type, source, message, detail });
  return [
    e(1, 'info', 'system', 'Kira avviata in modalità demo', 'Nessun backend collegato', 2),
    e(2, 'action', 'notes', 'Nota fissata: Idee per il prossimo sprint', undefined, 40),
    e(3, 'action', 'memory', 'Salvato un nuovo ricordo', 'categoria: preferenza', 75),
    e(4, 'warning', 'agent', 'Job "Controllo dipendenze" in attesa di approvazione', undefined, 130),
    e(5, 'info', 'calendar', 'Promemoria: Revisione del design tra 50 minuti', undefined, 180),
    e(6, 'action', 'media', 'Riprodotto: playlist "Ambient focus"', undefined, 260),
    e(7, 'error', 'agent', 'Test fallito in modulo "parser"', '3 asserzioni non superate', 400),
    e(8, 'info', 'system', 'Sincronizzazione memoria completata', '12 ricordi aggiornati', 720),
  ];
}

export function seedActions() {
  const a = (i: number, source: string, category: string, label: string, reversible: boolean, ageMin: number) =>
    ({ id: `ac-${i}`, ts: iso(-ageMin), source, category, label, reversible, undone: false, undoSpec: reversible ? { description: 'Ripristina lo stato precedente' } : undefined });
  return [
    a(1, 'notes', 'write', 'Creata nota "Lista della spesa"', true, 20),
    a(2, 'memory', 'write', 'Salvato ricordo: preferisco risposte brevi', true, 75),
    a(3, 'pc', 'system', 'Volume impostato al 40%', true, 160),
    a(4, 'calendar', 'write', 'Aggiunto evento "Allenamento"', true, 320),
    a(5, 'agent', 'job', 'Avviato job "Refactor del parser"', false, 500),
    a(6, 'media', 'open', 'Aperto YouTube', false, 900),
  ];
}

// ───────────────────────────── Agenti / job ────────────────────────────────

const AGENTS: Array<[string, string, string]> = [
  ['coding-manager', 'Marta (Coding)', 'Coordina le modifiche al codice e le assegna agli esecutori.'],
  ['patch-runner', 'Patch Runner', 'Applica patch in un worktree isolato.'],
  ['qwen-coding-agent', 'Qwen Coder', 'Scrive e rivede codice con un modello locale.'],
  ['opencode-agent', 'OpenCode', 'Agente di coding esterno (handoff assistito).'],
  ['memory-manager', 'Memory Manager', 'Cura e promuove i ricordi.'],
  ['voice-manager', 'Voice Manager', 'Gestisce TTS, STT e coda del parlato.'],
  ['security-manager', 'Security Manager', 'Controlla segreti e permessi.'],
  ['tester-agent', 'Tester', 'Esegue build e test.'],
  ['reviewer-agent', 'Reviewer', 'Rivede le patch prima dell approvazione.'],
  ['reporting-manager', 'Reporting Manager', 'Prepara i report per l utente.'],
  ['recovery-agent', 'Recovery', 'Riprende i job rimasti a metà.'],
  ['scheduler-agent', 'Scheduler', 'Pianifica le code di lavoro.'],
];

export function hierarchy() {
  const agents = AGENTS.map(([id, humanName, description], i) => ({
    id,
    humanName,
    role: id.endsWith('manager') ? 'manager' : 'worker',
    description,
    type: id.endsWith('manager') ? 'manager' : 'worker',
    supervisorId: id.endsWith('manager') ? undefined : 'coding-manager',
    subordinateIds: id === 'coding-manager' ? ['patch-runner', 'qwen-coding-agent', 'opencode-agent'] : [],
    capabilities: ['analisi', 'pianificazione'],
    limits: ['nessun accesso alla rete pubblica', 'serve approvazione per modificare file'],
    maxPermission: 'confirm',
    preferredModel: i % 2 ? 'qwen2.5-coder:7b' : 'llama3.1:8b',
    preferredRuntime: 'ollama',
    canExecuteCode: id.includes('runner') || id.includes('tester'),
    canModifyFiles: id.includes('patch'),
    requiresApproval: true,
    status: i % 4 === 0 ? 'working' : 'idle',
    lastTask: i % 4 === 0 ? 'Refactor del parser' : undefined,
    health: 'ok',
  }));
  return { runtime: { agents }, agents, bridges: bridges() };
}

export function bridges() {
  return [
    { id: 'opencode', name: 'OpenCode', mode: 'handoff', automatic: false, handoff: true, requiresHuman: true, detail: 'Handoff assistito (demo)' },
    { id: 'ollama', name: 'Ollama', mode: 'locale', automatic: true, handoff: false, requiresHuman: false, detail: 'Modelli locali (demo)' },
  ];
}

export function agentStatus() {
  return {
    opencode: 'pronto',
    openclaw: 'pronto',
    discordReport: 'non configurato',
    ollama: 'online',
    tasks: { queued: 1, running: 2, completed: 14, failed: 1, blocked: 0, archived: 5 },
    agentOs: { agents: AGENTS.length, opencode: 'pronto', discord: 'non configurato', qwen: 'pronto' },
  };
}

function job(id: string, title: string, status: string, agentId: string, progress: number, ageMin: number, extra: Record<string, unknown> = {}) {
  const agent = AGENTS.find((a) => a[0] === agentId) ?? AGENTS[0];
  return {
    id,
    title,
    prompt: title,
    originalRequest: title,
    status,
    priority: 'normal',
    createdBy: 'user',
    assignedManagerId: 'coding-manager',
    assignedManagerName: 'Marta (Coding)',
    involvedAgentIds: [agentId],
    mainAgentId: agentId,
    mainAgentName: agent[1],
    activeAgentId: agentId,
    activeAgentName: agent[1],
    agent: agent[1],
    level: 1,
    subtasks: [
      { id: `${id}-s1`, title: 'Analisi', agentId, agentName: agent[1], status: 'completed', progress: 100 },
      { id: `${id}-s2`, title: 'Esecuzione', agentId, agentName: agent[1], status: progress >= 100 ? 'completed' : 'running', progress: Math.min(100, progress) },
    ],
    approvalStatus: status === 'waiting_approval' ? 'pending' : 'none',
    approvalMode: 'manual',
    approvalReason: status === 'waiting_approval' ? 'La modifica tocca più di 3 file.' : undefined,
    planOnly: false,
    risk: 'low',
    filesInvolved: ['src/parser/index.ts', 'src/parser/tokens.ts'],
    estimatedDuration: '10-15 min',
    partialOutputs: [{ at: iso(-ageMin + 3), agentId, title: 'Piano', content: 'Passi: 1) leggere il modulo, 2) isolare i casi limite, 3) aggiungere test.' }],
    errors: status === 'failed' ? [{ at: iso(-ageMin + 5), agentId, message: '3 asserzioni non superate nel modulo parser' }] : [],
    recoveryAttempts: status === 'failed' ? 1 : 0,
    discordReportsSent: 0,
    memoryUpdated: status === 'completed',
    progress,
    result: status === 'completed' ? 'Completato: patch pronta e test verdi (demo).' : undefined,
    nextAction: status === 'waiting_approval' ? 'Approva o rifiuta la patch' : undefined,
    createdAt: iso(-ageMin),
    updatedAt: iso(-Math.max(1, ageMin - 6)),
    ...extra,
  };
}

export function seedJobs() {
  return [
    job('job-101', 'Refactor del parser', 'running', 'qwen-coding-agent', 62, 22),
    job('job-102', 'Controllo dipendenze', 'waiting_approval', 'security-manager', 80, 130),
    job('job-103', 'Aggiornare la documentazione API', 'planned', 'reporting-manager', 0, 8),
    job('job-104', 'Scrivere test per il modulo note', 'completed', 'tester-agent', 100, 420),
    job('job-105', 'Ottimizzare il caricamento dei widget', 'completed', 'patch-runner', 100, 900),
    job('job-106', 'Correggere il bug del calendario', 'failed', 'qwen-coding-agent', 45, 600),
    job('job-107', 'Analisi dei log di ieri', 'needs_human', 'recovery-agent', 30, 1200),
  ];
}

export function archivedJobs() {
  return [
    job('job-090', 'Pulizia della cartella temporanea', 'completed', 'scheduler-agent', 100, 4000, { archived: true }),
    job('job-091', 'Migrazione impostazioni', 'completed', 'patch-runner', 100, 5200, { archived: true }),
  ];
}

export function gitStatus() {
  return {
    branch: 'main',
    lastCommit: 'a1b2c3d',
    lastCommitMessage: 'feat(canvas): rifinitura del command palette',
    lastCommitDate: iso(-95),
    workingTree: 'modificato',
    modifiedFiles: 3,
    available: true,
    files: [
      { path: 'src/canvas/CommandPalette.tsx', code: ' M', state: 'modified' },
      { path: 'src/parser/tokens.ts', code: ' M', state: 'modified' },
      { path: 'src/parser/tokens.test.ts', code: '??', state: 'untracked' },
    ],
  };
}

export function gitDiff(path: string) {
  return {
    ok: true,
    path,
    isNew: false,
    truncated: false,
    diff: [
      `diff --git a/${path} b/${path}`,
      '@@ -12,7 +12,9 @@ export function tokenize(input: string) {',
      '   const out: Token[] = [];',
      '-  for (const ch of input) {',
      '+  for (const ch of input.trim()) {',
      '     if (ch === " ") continue;',
      '+    // demo: gestione dei casi limite',
      '     out.push(classify(ch));',
      '   }',
    ].join('\n'),
  };
}

export function runtimeLogs() {
  const l = (level: string, source: string, message: string, ageMin: number) => ({ timestamp: iso(-ageMin), level, source, message });
  return [
    l('info', 'scheduler', 'Job job-101 preso in carico da Qwen Coder', 22),
    l('process', 'qwen-coder', 'Analizzo src/parser/index.ts', 20),
    l('success', 'tester', 'Build completata in 14s', 16),
    l('warning', 'reviewer', 'La patch tocca 4 file: serve revisione', 12),
    l('info', 'memory', 'Aggiunto un ricordo operativo', 9),
    l('process', 'qwen-coder', 'Scrivo test per i casi limite', 5),
  ];
}

export function handoffs() {
  return {
    handoffs: [
      { agent: 'opencode', id: 'ho-1', title: 'Rifattorizzazione del parser', preview: 'Contesto: il tokenizer non gestisce spazi multipli. File coinvolti: tokens.ts.', at: Date.now() - 50 * MIN },
      { agent: 'opencode', id: 'ho-2', title: 'Documentazione API', preview: 'Generare una bozza dei README per i moduli pubblici.', at: Date.now() - 4 * HOUR },
    ],
  };
}

export function loopStatus() {
  return { state: { running: false, paused: false, activeJobId: 'job-101' }, queue: { queue: ['job-103'] } };
}

export function watchdog() {
  return { running: true, lastRunAt: iso(-3), totalRecoveries: 2, totalFailed: 0 };
}

export function tickets() {
  return [
    { id: 'tk-1', capabilityId: 'vision', description: 'Aggiungere un modello di visione locale', mode: 'manual', status: 'pending', createdAt: iso(-300) },
    { id: 'tk-2', capabilityId: 'calendar-write', description: 'Creare eventi dal chat', mode: 'auto', status: 'done', createdAt: iso(-2000), resolvedAt: iso(-1900) },
  ];
}

export function jobEvents() {
  return [
    { id: 'je-1', at: iso(-22), jobId: 'job-101', level: 'info', title: 'Job avviato', detail: 'Refactor del parser' },
    { id: 'je-2', at: iso(-12), jobId: 'job-102', level: 'warning', title: 'Serve approvazione', detail: 'Controllo dipendenze' },
  ];
}

// ───────────────────────────── Long run / operazioni ───────────────────────

export function lastRun() {
  return {
    ok: true,
    run: {
      id: 'run-demo-1',
      goal: 'Migliorare le prestazioni del canvas senza rompere i widget esistenti',
      sessionLabel: 'sessione-demo',
      status: 'active',
      currentPhase: 'Misurazione dei frame',
      nextStep: 'Ridurre i re-render del widget Attività',
      buildStatus: 'ok',
      progressPct: 58,
      createdAt: iso(-240),
      updatedAt: iso(-6),
      checkpointAt: iso(-6),
      resumePrompt: 'Riprendi dal checkpoint: stavi misurando i frame del canvas. Prossimo passo: ridurre i re-render del widget Attività.',
    },
  };
}

export function operations() {
  const step = (label: string, status: string, ageMin: number) => ({ label, status, at: iso(-ageMin) });
  const ops = [
    {
      id: 'op-1', kind: 'agent-job', title: 'Refactor del parser', summary: 'Qwen Coder sta riscrivendo il tokenizer.',
      status: 'running', module: 'agenti', progress: 62,
      steps: [step('Analisi', 'done', 20), step('Scrittura patch', 'active', 8), step('Test', 'pending', 0)],
      startedAt: iso(-22), updatedAt: iso(-2), techLog: ['[info] job-101 avviato', '[process] analisi src/parser/index.ts'],
      userInitiated: true, source: 'chat', canRetry: false,
      output: { kind: 'widget', summary: 'Segui i dettagli in Attività', widgetId: 'activity' },
    },
    {
      id: 'op-2', kind: 'agent-job', title: 'Controllo dipendenze', summary: 'Serve la tua approvazione per aggiornare 3 pacchetti.',
      status: 'waiting', module: 'agenti', progress: 80,
      steps: [step('Scansione', 'done', 130), step('Approvazione', 'active', 125)],
      startedAt: iso(-135), updatedAt: iso(-125), techLog: ['[info] 3 aggiornamenti minori disponibili'],
      needsInput: { question: 'Aggiorno i 3 pacchetti minori?', options: ['Sì', 'No'] },
      userInitiated: false, source: 'scheduler', canRetry: false,
    },
    {
      id: 'op-3', kind: 'build', title: 'Build del frontend', summary: 'Build completata senza errori.',
      status: 'success', module: 'sistema', progress: 100,
      steps: [step('Compilazione', 'done', 60), step('Bundle', 'done', 58)],
      startedAt: iso(-62), updatedAt: iso(-58), finishedAt: iso(-58), durationMs: 14_200,
      techLog: ['vite build: 1.2 MB in 14s'], userInitiated: true, source: 'chat', canRetry: false,
    },
    {
      id: 'op-4', kind: 'test', title: 'Test del modulo calendario', summary: 'Un test non è passato.',
      status: 'error', module: 'test', progress: 100,
      steps: [step('Preparazione', 'done', 300), step('Esecuzione', 'error', 298)],
      startedAt: iso(-301), updatedAt: iso(-298), finishedAt: iso(-298), durationMs: 3_100,
      error: {
        title: 'Un test è fallito', explanation: 'La funzione che calcola il prossimo evento restituisce un valore vuoto quando l agenda è vuota.',
        cause: 'Caso limite non gestito', impact: 'Nessun impatto in produzione: succede solo nei test.', action: 'Aggiungi un controllo sul caso agenda vuota e rilancia.',
        retryable: true, technical: 'AssertionError: expected null to equal "nessun evento"',
      },
      techLog: ['FAIL calendar.test.ts > nextEvent'], userInitiated: false, source: 'scheduler', canRetry: true,
    },
  ];
  return {
    ok: true,
    summary: { running: 1, waiting: 1, success: 1, error: 1, needsAttention: 2 },
    operations: ops,
    systems: [
      { id: 'sys-core', label: 'Kira Core', icon: '🧠', state: 'ok', summary: 'Attivo', detail: 'Modalità demo', ageLabel: 'ora', widgetId: 'statuskira' },
      { id: 'sys-models', label: 'Modelli locali', icon: '⊞', state: 'ok', summary: '5 modelli installati', ageLabel: '1m fa', widgetId: 'models' },
      { id: 'sys-memory', label: 'Memoria', icon: '🧬', state: 'idle', summary: 'Curatore a riposo', detail: 'Prossimo giro stanotte', ageLabel: '3h fa', widgetId: 'supermemory' },
      { id: 'sys-voice', label: 'Voce', icon: '🎙️', state: 'off', summary: 'TTS non configurato (demo)', widgetId: 'voice' },
    ],
    quickActions: [
      { id: 'qa-memory', label: 'Cura la memoria', endpoint: '/api/memory/supermemory/curate', available: true },
      { id: 'qa-update', label: 'Cerca aggiornamenti', endpoint: '/api/evolve/start', body: { once: true }, available: true },
    ],
    outputs: [
      { key: 'daily-report', label: 'Report giornaliero', description: 'Riepilogo di ciò che Kira ha fatto oggi.', publicName: 'report-giornaliero', path: 'output/report.md', updatedAt: iso(-90), reachable: true, stale: false, ageLabel: '1h fa' },
    ],
    notReady: [{ name: 'Visione', reason: 'Nessun modello di visione installato', chatControllable: false }],
  };
}

// ───────────────────────────── Sistema ─────────────────────────────────────

export function overview() {
  return {
    ok: true,
    at: iso(0),
    uptimeSec: 3 * 3600 + 25 * 60,
    evolve: { running: false, patches: 3 },
    proposals: { open: 2, total: 9 },
    models: { reachable: true, installed: DEMO_MODELS.length, missingRoles: ['vision'], fallbackRoles: ['reasoning'] },
    warnings: ['Modalità demo: i dati mostrati sono inventati.'],
  };
}

export function turboStatus(active: boolean) {
  return {
    active,
    gpu: { available: true, name: 'GPU demo 8 GB', totalMiB: 8192, usedMiB: active ? 3100 : 5600, freeMiB: active ? 5092 : 2592 },
    apps: [
      { id: 'browser', label: 'Browser', defaultOn: true, running: !active, note: 'Molte schede aperte' },
      { id: 'editor-video', label: 'Editor video', defaultOn: true, running: !active },
      { id: 'launcher', label: 'Launcher giochi', defaultOn: false, running: true },
    ],
    lastClosed: active ? ['Browser', 'Editor video'] : [],
    platformSupported: true,
    auto: { auto: false, thresholdMiB: 1500 },
  };
}

export function setupStatus() {
  const f = (key: string, label: string, type = 'text', current = '') => ({ key, label, type, current });
  return [
    { id: 'weather', label: 'Meteo', description: 'Previsioni per la tua città.', ok: true, missing: [], fields: [f('WEATHER_CITY', 'Città', 'text', 'Valdoro')] },
    { id: 'google', label: 'Google Calendar', description: 'Legge e crea eventi.', ok: false, missing: ['GOOGLE_CLIENT_ID'], fields: [f('GOOGLE_CLIENT_ID', 'Client ID'), f('GOOGLE_CLIENT_SECRET', 'Client secret', 'password')], oauthFlow: true },
    { id: 'ollama', label: 'Ollama', description: 'Modelli linguistici locali.', ok: true, missing: [], fields: [f('OLLAMA_URL', 'URL', 'url', 'http://localhost:11434')] },
    { id: 'n8n', label: 'n8n', description: 'Automazioni via webhook.', ok: true, missing: [], fields: [f('N8N_BASE_URL', 'URL', 'url', 'http://localhost:5678'), f('N8N_API_KEY', 'API key', 'password')] },
  ];
}

export function evolveStatus() {
  return { running: false, pid: null, stopRequested: false, patches: 3, logTail: '', reportTail: 'Demo: nessun ciclo di auto-miglioramento in corso.' };
}

export const QUIET = { enabled: true, start: '23:00', end: '07:00', now: false };

export function capabilities() {
  const c = (id: string, name: string, status: string, widget: string | null, gaps?: string[]) => ({ id, name, status, widget, gaps, aliases: [] });
  const list = [
    c('chat', 'Conversazione', 'implemented', 'chat'),
    c('voice', 'Voce (TTS/STT)', 'partial', 'voice', ['TTS locale non configurato in demo']),
    c('notes', 'Note rapide', 'implemented', 'notes'),
    c('calendar', 'Calendario', 'implemented', 'calendar'),
    c('weather', 'Meteo', 'implemented', 'weather'),
    c('memory', 'Memoria a lungo termine', 'implemented', 'memgraph'),
    c('agents', 'Agenti di coding', 'partial', 'activity', ['serve approvazione manuale']),
    c('mcp', 'Tool MCP', 'implemented', 'mcp'),
    c('vision', 'Visione', 'missing', null, ['nessun modello di visione']),
    c('automation', 'Automazioni n8n', 'implemented', 'automation'),
  ];
  const count = (s: string) => list.filter((x) => x.status === s).length;
  return {
    list: { capabilities: list },
    status: {
      summary: {
        total: list.length, implemented: count('implemented'), partial: count('partial'),
        missing: count('missing'), broken: count('broken'),
        saturationPct: Math.round(((count('implemented') + count('partial') * 0.5) / list.length) * 100),
      },
    },
  };
}

export function permissions() {
  const p = (actionId: string, tier: string, reason?: string) => ({ actionId, tier, isOverride: false, reason });
  return [
    p('pc:open_app', 'notify'), p('pc:close_app', 'confirm', 'Può far perdere lavoro non salvato'), p('pc:volume', 'auto'),
    p('memory:save', 'auto'), p('memory:delete', 'confirm'), p('notes:create', 'auto'), p('notes:delete', 'confirm'),
    p('agent:create_job', 'notify'), p('agent:approve_patch', 'confirm', 'Modifica il codice'),
    p('system:restart', 'confirm'), p('system:install_model', 'confirm', 'Scarica diversi GB'),
  ];
}

export function permissionAudit() {
  const a = (i: number, actionId: string, tier: string, outcome: string, ageMin: number) =>
    ({ ts: iso(-ageMin), actionId, tier, source: 'default', actor: 'kira', outcome });
  return [a(1, 'notes:create', 'auto', 'ok', 20), a(2, 'pc:open_app', 'notify', 'ok', 90), a(3, 'agent:approve_patch', 'confirm', 'approvata', 200)];
}

export function mcpStatus() {
  return {
    configured: true,
    configPath: 'mcp-servers.json',
    servers: [
      { name: 'filesystem', enabled: true, note: 'Lettura di una cartella di prova', reachable: true, toolCount: 6 },
      { name: 'web-fetch', enabled: true, note: 'Scarica pagine pubbliche', reachable: true, toolCount: 2 },
      { name: 'git', enabled: true, reachable: true, toolCount: 5 },
      { name: 'sqlite', enabled: false, note: 'Disattivato', reachable: null, toolCount: null },
    ],
  };
}

export function mcpTools(server: string) {
  const sets: Record<string, Array<[string, string]>> = {
    filesystem: [['read_file', 'Legge un file di testo'], ['list_directory', 'Elenca una cartella'], ['search_files', 'Cerca file per nome']],
    'web-fetch': [['fetch_url', 'Scarica e riassume una pagina'], ['fetch_headers', 'Legge gli header HTTP']],
    git: [['git_status', 'Stato del repository'], ['git_diff', 'Differenze non committate'], ['git_log', 'Ultimi commit']],
  };
  return { ok: true, tools: (sets[server] ?? []).map(([name, description]) => ({ name, description })) };
}

export function n8nWorkflows() {
  return {
    ok: true,
    workflows: [
      { id: 'wf-1', name: 'Riepilogo mattutino via email', active: true },
      { id: 'wf-2', name: 'Salva articoli interessanti nelle note', active: true },
      { id: 'wf-3', name: 'Backup settimanale delle note', active: false },
    ],
  };
}

// ───────────────────────────── Memoria ─────────────────────────────────────

export interface DemoMemory {
  id: string; category: string; title: string; content: string; source: string;
  createdAt: string; updatedAt: string; tags: string[];
}

export function seedMemory(): DemoMemory[] {
  const m = (id: string, category: string, title: string, content: string, tags: string[], ageMin: number, source = 'human'): DemoMemory =>
    ({ id, category, title, content, source, tags, createdAt: iso(-ageMin - 60), updatedAt: iso(-ageMin) });
  return [
    m('mem-1', 'identity', `${USER_NAME} preferisce risposte brevi`, `${USER_NAME} preferisce risposte sintetiche, con un elenco puntato quando ci sono più passaggi.`, ['preferenza', 'verified:3', 'confidence:0.9'], 120),
    m('mem-2', 'preference', 'Tema scuro e interfaccia minimale', 'Preferisce interfacce scure, poco rumorose, con animazioni lente.', ['ui', 'promoted'], 600),
    m('mem-3', 'project', 'Progetto: prototipo dell assistente locale', 'Obiettivo: un assistente che gira tutto in locale, con memoria e agenti.', ['progetto'], 1500),
    m('mem-4', 'fact', 'Orario di lavoro', 'Lavora di solito dalle 9 alle 18, con una pausa pranzo verso le 13.', ['routine', 'confidence:0.8'], 2200, 'auto'),
    m('mem-5', 'reference', 'Lettura in corso', 'Sta leggendo un libro sui sistemi distribuiti.', ['libri'], 3000),
    m('mem-6', 'fact', 'Caffè la mattina', 'Prima di iniziare prende sempre un caffè lungo.', ['routine', 'auto'], 4000, 'auto'),
    m('mem-7', 'architecture', 'Scelte architetturali del progetto', 'Frontend React + canvas di widget; backend separato con API REST e SSE.', ['progetto', 'verified:2', 'promoted'], 5200),
    m('mem-8', 'rule', 'Regola: chiedere conferma prima di cancellare', 'Prima di cancellare file o ricordi, chiedere sempre conferma.', ['regola', 'verified:5'], 7000),
  ];
}

export function memoryStatus(count: number) {
  return {
    canonical: { count, categories: ['identity', 'preference', 'project', 'fact', 'reference', 'architecture', 'rule'] },
    operational: { count: 3, types: ['decision', 'result'] },
    temporary: { count: 2, keys: ['ultimo_file', 'filtro_note'] },
  };
}

export function operationalMemory() {
  const o = (id: string, type: string, title: string, summary: string, ageMin: number, importance = 'normal') => ({
    id, timestamp: iso(-ageMin), agentId: 'coding-manager', jobId: 'job-101', type, title, summary,
    detail: `${summary} (voce dimostrativa)`, files: ['src/parser/tokens.ts'], tags: ['demo'], importance, reusable: true,
    sensitivity: 'low', provenance: { source: 'agent', confidence: 0.8 },
  });
  return [
    o('om-1', 'decision', 'Usare un tokenizer a stati', 'Più semplice da testare dei regex annidati.', 40, 'high'),
    o('om-2', 'result', 'Build verde dopo il refactor', 'Tutti i test del parser passano.', 180),
    o('om-3', 'decision', 'Rimandare il supporto a Unicode esteso', 'Non serve per la demo.', 600, 'low'),
  ];
}

export function tempMemory() {
  return [
    { key: 'ultimo_file', value: 'src/parser/index.ts', source: 'agent', jobId: 'job-101', createdAt: iso(-20), expiresAt: iso(40) },
    { key: 'filtro_note', value: 'tag:lavoro', source: 'ui', createdAt: iso(-5), expiresAt: iso(55) },
  ];
}

export function memoryGraph() {
  const specs: Array<[string, string, string, string, string, string]> = [
    // id, label, type, cluster, color, desc
    ['core', 'Kira Core', 'system', 'Core', '#a9c9ff', 'Il nucleo dell assistente'],
    ['chat', 'Chat', 'component', 'Interfaccia', '#63b3ed', 'Conversazione e comandi'],
    ['voice', 'Voce', 'capability', 'Interfaccia', '#4ade80', 'TTS e STT'],
    ['canvas', 'Canvas', 'ui_paradigm', 'Interfaccia', '#a78bfa', 'Widget trascinabili'],
    ['agents', 'Agenti', 'agent', 'Agenti', '#fb923c', 'Coding, test, revisione'],
    ['qwen', 'Qwen Coder', 'agent', 'Agenti', '#fb923c', 'Modello locale per il codice'],
    ['tester', 'Tester', 'agent', 'Agenti', '#fb923c', 'Esegue build e test'],
    ['memory', 'Memoria', 'component', 'Memoria', '#cbd5e1', 'Ricordi canonici e operativi'],
    ['m-pref', 'Risposte brevi', 'memory_verified', 'Memoria', '#a9c9ff', 'Preferenza verificata'],
    ['m-ui', 'Tema scuro', 'memory_promoted', 'Memoria', '#4ade80', 'Preferenza promossa'],
    ['m-proj', 'Prototipo locale', 'memory_manual', 'Memoria', '#c8c8c8', 'Progetto in corso'],
    ['m-auto', 'Orario di lavoro', 'memory_auto', 'Memoria', '#a78bfa', 'Dedotto automaticamente'],
    ['ollama', 'Ollama', 'integration', 'Integrazioni', '#d6e2f6', 'Modelli locali'],
    ['mcp', 'Tool MCP', 'integration', 'Integrazioni', '#d6e2f6', 'Tool modulari'],
    ['n8n', 'n8n', 'integration', 'Integrazioni', '#d6e2f6', 'Automazioni'],
    ['vision', 'Visione', 'capability', 'Capacità', '#ef4444', 'Non ancora disponibile'],
  ];
  const nodes = specs.map(([id, label, type, cluster, color, desc], i) => {
    const angle = (i / (specs.length - 1)) * Math.PI * 2;
    const r = id === 'core' ? 0 : 260 + (i % 3) * 40;
    return {
      id, label, rawLabel: label, type, cluster, color, desc,
      status: id === 'vision' ? 'missing' : undefined,
      x: 480 + Math.cos(angle) * r, y: 320 + Math.sin(angle) * r * 0.7, width: 130, height: 38,
    };
  });
  const links: Array<[string, string, string]> = [
    ['core', 'chat', 'ospita'], ['core', 'canvas', 'ospita'], ['core', 'agents', 'coordina'], ['core', 'memory', 'usa'],
    ['chat', 'voice', 'usa'], ['agents', 'qwen', 'include'], ['agents', 'tester', 'include'],
    ['memory', 'm-pref', 'contiene'], ['memory', 'm-ui', 'contiene'], ['memory', 'm-proj', 'contiene'], ['memory', 'm-auto', 'contiene'],
    ['core', 'ollama', 'si appoggia a'], ['core', 'mcp', 'si appoggia a'], ['core', 'n8n', 'si appoggia a'], ['core', 'vision', 'manca'],
    ['qwen', 'ollama', 'gira su'],
  ];
  const edges = links.map(([from, to, rel], i) => ({ id: `e${i}`, fromNode: from, toNode: to, from, to, rel }));
  return { ok: true, source: 'demo', nodes, edges };
}

export function supermemoryStatus() {
  return {
    ok: true,
    vaultDir: './vault-demo',
    manifest: { generatedAt: iso(-180), pendingRead: 4, promotedFacts: 11, chunks: 240, rawSources: 18, rawChunks: 960, canonicalTotal: 8 },
    running: null,
    lastRun: {
      curate: { task: 'curate', trigger: 'scheduler', startedAt: iso(-181), finishedAt: iso(-180), ok: true, durationMs: 42_000 },
      reindex: { task: 'reindex', trigger: 'manual', startedAt: iso(-1500), finishedAt: iso(-1498), ok: true, durationMs: 118_000 },
    },
    schedulerActive: true,
    runHour: 3,
  };
}

export function obsidianStatus() {
  return {
    configured: true, vaultPath: './vault-demo', exists: true, noteCount: 5,
    folders: ['Inbox', 'Progetti', 'Letture'], lastScan: iso(-30),
    watcher: { active: true, autoSync: true, lastIngestAt: iso(-45) },
  };
}

export function obsidianNotes() {
  const n = (path: string, title: string, content: string, folder: string, ageMin: number, tags: string[]) =>
    ({ path, title, content, folder, modifiedAt: iso(-ageMin), tags });
  return [
    n('Progetti/prototipo.md', 'Prototipo locale', 'Obiettivi, milestone e rischi del prototipo.', 'Progetti', 90, ['progetto']),
    n('Letture/sistemi-distribuiti.md', 'Sistemi distribuiti', 'Appunti sui capitoli 5 e 6.', 'Letture', 400, ['libri']),
    n('Inbox/idee.md', 'Idee sparse', 'Raccolta di idee da smistare.', 'Inbox', 800, []),
  ];
}

// ───────────────────────────── Media / notizie ─────────────────────────────

export function mediaStatus() {
  const s = (id: string, name: string, icon: string, color: string, isOpen = false) =>
    ({ id, name, icon, color, isOpen, isLoggedIn: true, requiresLogin: false, loginUrl: '#', lastUrl: undefined });
  return {
    services: [
      s('youtube', 'YouTube', '▶', '#ff4d4d', true), s('crunchyroll', 'Anime Demo', 'A', '#fb923c'),
      s('netflix', 'Film Demo', 'N', '#ef4444'), s('prime', 'Prime Demo', 'P', '#38bdf8'), s('disney', 'Family Demo', 'D', '#6366f1'),
    ],
  };
}

export function mediaRecent() {
  return {
    recent: [
      { title: 'Ambient focus - 2 ore', service: 'youtube', searchedAt: iso(-180), type: 'search' },
      { title: 'Cronache di Aurora', service: 'crunchyroll', searchedAt: iso(-1500), type: 'series' },
    ],
  };
}

export function mediaContinue() {
  return {
    ok: true,
    items: [
      { url: '#', title: 'Cronache di Aurora - Ep. 7', series: 'Cronache di Aurora', episode: 'Ep. 7' },
      { url: '#', title: 'Il Viandante delle Stelle - Ep. 3', series: 'Il Viandante delle Stelle', episode: 'Ep. 3' },
    ],
  };
}

export function news(cat?: string) {
  const it = (title: string, source: string, category: string, ageMin: number, snippet: string) =>
    ({ title, url: 'https://example.com/demo', source, publishedAt: iso(-ageMin), snippet, category });
  const all = [
    it('Accordo internazionale sul clima: i punti chiave', 'Notiziario Demo', 'Mondo', 35, 'Dopo due settimane di negoziati è stato raggiunto un testo condiviso.'),
    it('Nuova missione verso la Luna: lancio fissato', 'Spazio Oggi (demo)', 'Mondo', 120, 'Il lancio è previsto entro la fine del trimestre.'),
    it('Mercati europei in lieve rialzo', 'Economia Demo', 'Mondo', 260, 'Gli indici chiudono la seduta con variazioni contenute.'),
    it('Festival del cinema: i film in concorso', 'Cultura Demo', 'Italia', 70, 'Annunciato il programma con venti titoli da otto Paesi.'),
    it('Treni: potenziati i collegamenti regionali', 'Cronaca Demo', 'Italia', 190, 'Nuove corse nelle ore di punta a partire dal mese prossimo.'),
    it('Scuola: al via il progetto di biblioteche aperte', 'Cronaca Demo', 'Italia', 500, 'Le scuole resteranno aperte il pomeriggio per attività di lettura.'),
    it('Un nuovo modello linguistico open source batte i benchmark', 'Tech Weekly (demo)', 'Tech', 25, 'Il modello da 8 miliardi di parametri gira su una GPU consumer.'),
    it('Rust 2.0: cosa cambia per gli sviluppatori', 'Dev Notes (demo)', 'Tech', 150, 'Una panoramica delle novità del linguaggio e degli strumenti.'),
    it('Come ridurre la latenza delle app web con i worker', 'Dev Notes (demo)', 'Tech', 380, 'Guida pratica con esempi e misurazioni.'),
  ];
  const items = cat && cat !== 'all' ? all.filter((x) => x.category === cat) : all;
  return { items, sources: ['Notiziario Demo', 'Spazio Oggi (demo)', 'Economia Demo', 'Cultura Demo', 'Cronaca Demo', 'Tech Weekly (demo)', 'Dev Notes (demo)'], fetchedAt: iso(0) };
}

export function newsBriefing() {
  return {
    summary: 'Giornata tranquilla: accordo sul clima, nuova missione lunare e un modello linguistico open source che sale in classifica.',
    highlights: ['Accordo internazionale sul clima', 'Lancio lunare fissato', 'Modello open source da 8B ai vertici'],
  };
}

export function briefingFeed() {
  const it = (id: string, category: string, title: string, source: string, snippet: string) => ({ id, category, title, source, url: 'https://example.com/demo', snippet });
  return {
    id: 'brief-demo',
    createdAt: iso(-45),
    model: 'llama3.1:8b',
    script: `Buongiorno ${USER_NAME}. Ecco la rassegna di oggi. Nel mondo dell'intelligenza artificiale arriva un nuovo modello open source da otto miliardi di parametri. Sul fronte dello sviluppo, una guida pratica per ridurre la latenza delle app web. Per i paper, un lavoro sulla memoria a lungo termine degli agenti. Buona giornata.`,
    items: [
      it('b1', 'AI', 'Nuovo modello open source da 8B', 'Tech Weekly (demo)', 'Gira su una GPU consumer con ottimi risultati.'),
      it('b2', 'Dev', 'Ridurre la latenza con i web worker', 'Dev Notes (demo)', 'Esempi pratici e misurazioni.'),
      it('b3', 'Paper', 'Memoria a lungo termine per agenti', 'Archivio Demo', 'Un metodo per promuovere i ricordi importanti.'),
      it('b4', 'Cyber', 'Buone pratiche per proteggere le chiavi API', 'Sicurezza Demo', 'Checklist di cinque minuti.'),
      it('b5', 'Ecommerce', 'Pagine prodotto: cosa conta davvero', 'Shop Notes (demo)', 'Tre test A/B commentati.'),
    ],
  };
}

// ───────────────────────────── Voce ────────────────────────────────────────

export function voiceStatus() {
  return { provider: 'none', piperConfigured: false, sentencesQueued: 0, isSpeaking: false, currentSentence: null, lastSpokenAt: null };
}

// ───────────────────────────── Chat ────────────────────────────────────────

const GENERIC_REPLIES = [
  `Sono in modalità demo, ${USER_NAME}: non c'è un modello collegato, ma posso mostrarti come si comporta l'interfaccia. Prova ad aprire un widget con la palette dei comandi (Ctrl+K).`,
  'Questa è una risposta di esempio. In una installazione completa qui risponderebbe il modello locale, con memoria, strumenti e agenti dietro le quinte.',
  'Ricevuto. In modalità demo non eseguo azioni reali, ma ogni widget che vedi è collegato a dati inventati per darti un\'idea del risultato.',
  'Posso aiutarti a organizzare la giornata: guarda il Calendario, le Note e il Pomodoro. Dimmi "apri note" o "apri calendario" per vederli sul canvas.',
];

let rr = 0;

export function cannedReply(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/\b(ciao|buongiorno|buonasera|salve|hey)\b/.test(p)) return `Ciao ${USER_NAME}. Sono Kira, in modalità demo: qui tutto è simulato, ma l'interfaccia è quella vera. Cosa vuoi esplorare?`;
  if (/meteo|tempo|pioggia|temperatura/.test(p)) return 'A Valdoro ci sono 21 gradi, parzialmente nuvoloso, vento debole. Nel pomeriggio qualche nuvola in più, nessuna pioggia prevista fino a giovedì. Puoi aprire il widget Meteo per i sette giorni.';
  if (/calendario|agenda|impegn|evento|riunion/.test(p)) return 'Il prossimo impegno è la "Revisione del design" tra circa cinquanta minuti, poi pranzo con il team. Domani hai una call con il cliente di prova alle dieci. Apro il Calendario?';
  if (/\bnot[ae]\b|appunt/.test(p)) return 'Hai sei note, due fissate in alto: "Idee per il prossimo sprint" e "Obiettivi del trimestre". Posso aggiungerne una nuova se me la detti.';
  if (/chi sei|cosa sei|cosa fai|cosa sai fare|aiuto/.test(p)) return 'Sono Kira, la shell di un sistema operativo AI personale: un canvas di widget attorno a un nucleo di particelle. Qui giro in modalità demo, senza backend.';
  if (/memoria|ricord/.test(p)) return `Nella memoria demo ci sono otto ricordi: preferenze, progetti e qualche abitudine di ${USER_NAME}. Apri il widget "Memoria · Grafo" per vederli collegati.`;
  if (/modell|ollama|llama|qwen/.test(p)) return 'Modelli installati (demo): llama3.1:8b, qwen2.5:7b, qwen2.5-coder:7b, phi4-mini:3.8b e bge-m3 per gli embedding. Il widget "Modelli" mostra ruoli e VRAM.';
  if (/agent|job|lavor|attivit/.test(p)) return 'Ci sono due job attivi: il refactor del parser è al 62% e il controllo dipendenze aspetta la tua approvazione. Apro Attività?';
  const reply = GENERIC_REPLIES[rr % GENERIC_REPLIES.length];
  rr += 1;
  return reply;
}

// ───────────────────────────── Eventi (SSE finto) ──────────────────────────

export const DEMO_EVENTS = [
  { kind: 'job', level: 'success', title: 'Job completato', detail: 'Scrivere test per il modulo note', source: 'agent' },
  { kind: 'reminder', level: 'info', title: 'Promemoria', detail: 'Revisione del design tra 15 minuti', source: 'calendar' },
  { kind: 'operation', level: 'info', title: 'Operazione avviata', detail: 'Build del frontend', source: 'system' },
  { kind: 'watchdog', level: 'warn', title: 'Job ripreso', detail: 'Il watchdog ha ripreso "Analisi dei log"', source: 'agent' },
  { kind: 'integration', level: 'info', title: 'Sincronizzazione memoria', detail: '4 ricordi nuovi', source: 'memory' },
];

export function newCanonicalId(): string {
  return `mem-${Math.random().toString(36).slice(2, 8)}`;
}
