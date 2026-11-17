/**
 * Livello di rete della demo.
 *
 * - VITE_DEMO !== 'false' (default)  -> window.fetch / EventSource / WebSocket vengono
 *   intercettati: le chiamate al backend (/api/..., Ollama su :11434) ricevono dati
 *   inventati da demoData.ts, con piccoli ritardi.
 * - VITE_DEMO === 'false'            -> il codice client resta quello vero. Se imposti
 *   VITE_API_BASE (es. http://localhost:8787) le chiamate relative /api/... vengono
 *   riscritte verso quel backend; altrimenti passano dal proxy di Vite (VITE_API_PROXY).
 */
import * as D from './demoData';

export const IS_DEMO = import.meta.env.VITE_DEMO !== 'false';
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || '').replace(/\/+$/, '');

// ───────────────────────────── helpers ─────────────────────────────────────

type Body = Record<string, unknown>;
interface Ctx { url: URL; path: string; method: string; body: Body; m: RegExpMatchArray; signal?: AbortSignal | null }
type Handler = (c: Ctx) => unknown;

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const jitter = () => 70 + Math.random() * 150;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// ───────────────────────────── stato mutabile ──────────────────────────────

const state = {
  notes: D.seedNotes(),
  memory: D.seedMemory(),
  notifications: D.seedNotifications(),
  actions: D.seedActions(),
  jobs: D.seedJobs(),
  overrides: new Map<string, string>(),
  quiet: { ...D.QUIET },
  layouts: new Map<string, unknown>(),
  turbo: false,
  turboAuto: false,
};

const newId = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const norm = (s: unknown) => String(s ?? '').toLowerCase();

function noteFrom(body: Body, id: string, prev?: D.DemoNote): D.DemoNote {
  return {
    id,
    title: String(body.title ?? prev?.title ?? 'Senza titolo'),
    content: String(body.content ?? prev?.content ?? ''),
    tags: Array.isArray(body.tags) ? (body.tags as string[]) : (prev?.tags ?? []),
    pinned: typeof body.pinned === 'boolean' ? body.pinned : (prev?.pinned ?? false),
    createdAt: prev?.createdAt ?? D.iso(),
    updatedAt: D.iso(),
  };
}

// ───────────────────────────── tabella delle route ─────────────────────────

const routes: Array<[string, RegExp, Handler]> = [
  // Sistema / diagnostica
  ['GET', /^\/api\/health$/, () => ({ ok: true })],
  ['GET', /^\/api\/system\/status$/, () => ({ ok: true })],
  ['GET', /^\/api\/diagnostics$/, () => ({ server: { ok: true }, ollama: { ok: true, latencyMs: 38, modelCount: D.DEMO_MODELS.length }, tts: { piperConfigured: false } })],
  ['GET', /^\/api\/system\/overview$/, () => D.overview()],
  ['GET', /^\/api\/system\/quiet-hours$/, () => state.quiet],
  ['POST', /^\/api\/system\/quiet-hours$/, (c) => { state.quiet = { ...state.quiet, ...(c.body as Partial<typeof state.quiet>) }; return state.quiet; }],
  ['GET', /^\/api\/system\/integrations-health$/, () => ({ overall: 'ok', downCount: 0, degradedCount: 0 })],
  ['GET', /^\/api\/system\/monitor-activity$/, () => ({ available: true, currentSessionSec: 47 * 60, onBreak: false })],
  ['GET', /^\/api\/system\/ollama-status$/, () => ({ ok: true, installed: D.DEMO_MODELS.map((m) => m.name), missing: ['qwen2.5-vl:7b'], totalSizeGb: '18.0' })],
  ['POST', /^\/api\/system\/install-ollama-models$/, () => ({ ok: true, message: 'Demo: installazione simulata' })],
  ['POST', /^\/api\/system\/restart$/, () => ({ ok: true })],
  ['GET', /^\/api\/system\/turbo\/status$/, () => ({ ...D.turboStatus(state.turbo), auto: { auto: state.turboAuto, thresholdMiB: 1500 } })],
  ['POST', /^\/api\/system\/turbo\/enable$/, () => { state.turbo = true; return { ok: true, closed: ['Browser', 'Editor video'], failed: [], vramBeforeMiB: 5600, vramAfterMiB: 3100, vramFreedMiB: 2500, powerPlan: 'high' }; }],
  ['POST', /^\/api\/system\/turbo\/disable$/, () => { state.turbo = false; return { ok: true }; }],
  ['POST', /^\/api\/system\/turbo\/auto$/, (c) => { state.turboAuto = Boolean(c.body.auto); return { ok: true }; }],
  ['POST', /^\/api\/session\/ping$/, () => ({ ok: true })],
  ['GET', /^\/api\/evolve\/status$/, () => D.evolveStatus()],
  ['POST', /^\/api\/evolve\/(start|stop)$/, () => ({ ok: true, message: 'Demo: nessun ciclo avviato' })],
  ['GET', /^\/api\/setup\/status$/, () => D.setupStatus()],
  ['POST', /^\/api\/setup\/env$/, () => ({ ok: true })],
  ['GET', /^\/api\/setup\/google\/auth-url$/, () => ({ ok: false, error: 'Non disponibile in modalità demo' })],
  ['GET', /^\/api\/coach\/urgent$/, () => ({ count: 0, recommendations: [], generatedAt: D.iso() })],
  ['GET', /^\/api\/keys\/expiring$/, () => ({ keys: [] })],
  ['POST', /^\/api\/home\/routine\/morning$/, () => ({ ok: true, message: 'demo', spoken: '', announced: false })],

  // Modelli / chat
  ['GET', /^\/api\/(models|tags)$/, () => D.ollamaTags()],
  ['GET', /^\/api\/models\/ollama\/status$/, () => D.ollamaRuntime()],
  ['GET', /^\/api\/models\/roles\/audit$/, () => D.modelAudit()],
  ['POST', /^\/api\/models\/pull$/, () => ({ ok: true })],
  ['GET', /^\/api\/models\/pull\/status$/, () => ({ pulling: false, done: true })],
  ['POST', /^\/api\/models\/(local\/warmup|ollama\/unload|ollama\/keep-alive)$/, () => ({ ok: true, message: 'Demo: operazione simulata' })],
  ['POST', /^\/api\/kira\/message$/, () => ({ intent: 'chat', handled: false, reply: '', executionMode: 'stream_llm', streamLLM: true })],
  ['POST', /^\/api\/kira\/attach$/, () => ({ ok: false, error: 'Gli allegati non sono disponibili in modalità demo' })],
  ['POST', /^\/api\/kira\/apply-fix$/, () => ({ ok: true })],
  ['POST', /^\/api\/chat\/agent-intent$/, () => ({ handled: true, reply: 'Task creato (demo): lo trovi nel widget Attività.', jobId: 'job-demo', executionMode: 'queued' })],
  ['POST', /^\/api\/chat\/extract-memory$/, () => ({ ok: true, saved: 0 })],
  ['GET', /^\/api\/chat\/conversations$/, () => ({ conversations: [] })],
  ['POST', /^\/api\/chat\/conversations\/[^/]+\/(sync|pin)$/, () => ({ ok: true })],

  // Meteo / calendario / note
  ['GET', /^\/api\/assistant\/weather$/, () => D.weather()],
  ['GET', /^\/api\/assistant\/calendar$/, () => D.calendar()],
  ['GET', /^\/api\/notes\/search$/, (c) => {
    const q = norm(c.url.searchParams.get('q'));
    return { ok: true, notes: state.notes.filter((n) => norm(`${n.title} ${n.content} ${n.tags.join(' ')}`).includes(q)) };
  }],
  ['POST', /^\/api\/notes\/quick$/, (c) => {
    const text = String(c.body.text ?? '').trim();
    const first = text.split('\n')[0].slice(0, 60) || 'Nota rapida';
    state.notes.unshift(noteFrom({ title: first, content: text, tags: ['rapida'] }, newId('n')));
    return { ok: true };
  }],
  ['GET', /^\/api\/notes$/, () => ({ ok: true, notes: [...state.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)) })],
  ['POST', /^\/api\/notes$/, (c) => { const n = noteFrom(c.body, newId('n')); state.notes.unshift(n); return { ok: true, note: n }; }],
  ['PUT', /^\/api\/notes\/([^/]+)$/, (c) => {
    const i = state.notes.findIndex((n) => n.id === c.m[1]);
    if (i >= 0) state.notes[i] = noteFrom(c.body, c.m[1], state.notes[i]);
    return { ok: i >= 0 };
  }],
  ['DELETE', /^\/api\/notes\/([^/]+)$/, (c) => { state.notes = state.notes.filter((n) => n.id !== c.m[1]); return { ok: true }; }],

  // Notifiche / azioni
  ['GET', /^\/api\/notifications$/, () => ({ ok: true, notifications: state.notifications })],
  ['POST', /^\/api\/notifications\/clear$/, () => { state.notifications = []; return { ok: true }; }],
  ['POST', /^\/api\/notifications\/log$/, (c) => {
    state.notifications.unshift({ id: newId('nt'), timestamp: D.iso(), type: String(c.body.type ?? 'info'), source: String(c.body.source ?? 'system'), message: String(c.body.message ?? ''), detail: c.body.detail as string | undefined });
    return { ok: true };
  }],
  ['GET', /^\/api\/actions\/history$/, (c) => ({ ok: true, actions: state.actions.slice(0, Number(c.url.searchParams.get('limit')) || 50) })],
  ['POST', /^\/api\/actions\/undo\/([^/]+)$/, (c) => {
    const a = state.actions.find((x) => x.id === decodeURIComponent(c.m[1]));
    if (a) a.undone = true;
    return { ok: Boolean(a), message: 'Azione annullata (demo)' };
  }],

  // Agenti
  ['GET', /^\/api\/agents\/status$/, () => D.agentStatus()],
  ['GET', /^\/api\/agents\/jobs\/archived$/, () => D.archivedJobs()],
  ['POST', /^\/api\/agents\/jobs\/bulk-archive$/, () => { state.jobs = state.jobs.filter((j) => !['completed', 'failed'].includes(j.status)); return { ok: true }; }],
  ['GET', /^\/api\/agents\/jobs$/, (c) => {
    if (!c.url.searchParams.has('limit')) return state.jobs;
    const active = state.jobs.filter((j) => ['running', 'planned', 'waiting_opencode', 'handoff_ready', 'plan_ready', 'waiting_patch'].includes(j.status)).length;
    return { jobs: state.jobs, total: state.jobs.length, active, pending: state.jobs.length - active };
  }],
  ['POST', /^\/api\/agents\/jobs$/, (c) => {
    const title = String(c.body.request ?? c.body.title ?? c.body.message ?? 'Nuovo lavoro').slice(0, 80);
    const j = { ...D.seedJobs()[2], id: newId('job'), title, prompt: title, originalRequest: title, createdAt: D.iso(), updatedAt: D.iso() };
    state.jobs.unshift(j);
    return { ok: true, job: j, ...j };
  }],
  ['POST', /^\/api\/agents\/jobs\/([^/]+)\/archive$/, (c) => { state.jobs = state.jobs.filter((j) => j.id !== c.m[1]); return { ok: true }; }],
  ['POST', /^\/api\/agents\/jobs\/([^/]+)\/([a-z-]+)$/, () => ({ ok: true })],
  ['DELETE', /^\/api\/agents\/jobs\/([^/]+)$/, (c) => { state.jobs = state.jobs.filter((j) => j.id !== c.m[1]); return { ok: true }; }],
  ['GET', /^\/api\/agents\/hierarchy$/, () => D.hierarchy()],
  ['GET', /^\/api\/agents\/bridges$/, () => D.bridges()],
  ['GET', /^\/api\/agents\/runtime\/logs$/, () => D.runtimeLogs()],
  ['POST', /^\/api\/agents\/runtime\/exec$/, () => ({ ok: true, message: 'Demo: nessun comando eseguito' })],
  ['GET', /^\/api\/agents\/git-status$/, () => D.gitStatus()],
  ['GET', /^\/api\/agents\/git-diff$/, (c) => D.gitDiff(c.url.searchParams.get('path') || 'file.ts')],
  ['GET', /^\/api\/agents\/handoffs$/, () => D.handoffs()],
  ['GET', /^\/api\/agents\/loop\/status$/, () => D.loopStatus()],
  ['POST', /^\/api\/agents\/loop\/[a-z-]+$/, () => ({ ok: true })],
  ['GET', /^\/api\/agents\/watchdog\/status$/, () => D.watchdog()],
  ['GET', /^\/api\/capability\/tickets$/, () => ({ ok: true, tickets: D.tickets() })],
  ['POST', /^\/api\/capability\/tickets\/clear-done$/, () => ({ ok: true })],
  ['DELETE', /^\/api\/capability\/tickets\/[^/]+$/, () => ({ ok: true })],
  ['GET', /^\/api\/capability\/list$/, () => D.capabilities().list],
  ['GET', /^\/api\/capability\/status$/, () => D.capabilities().status],
  ['GET', /^\/api\/runs\/last$/, () => D.lastRun()],
  ['GET', /^\/api\/runs\/[^/]+\/resume-prompt$/, () => ({ ok: true, resumePrompt: D.lastRun().run.resumePrompt })],
  ['POST', /^\/api\/runs\/[^/]+\/notify$/, () => ({ ok: true })],
  ['GET', /^\/api\/operations$/, () => D.operations()],
  ['POST', /^\/api\/operations\/[^/]+\/[a-z-]+$/, () => ({ ok: true })],
  ['GET', /^\/api\/ops-stack\/output$/, () => ({ ok: true, summary: 'Riepilogo di esempio: 3 job completati, 1 in attesa.', raw: '# Report (demo)\n- job-104 completato\n- job-105 completato\n- job-102 in attesa' })],
  ['POST', /^\/api\/ops-stack\/.+$/, () => ({ ok: true, message: 'Demo: operazione simulata' })],

  // Permessi / integrazioni / MCP
  ['GET', /^\/api\/permissions\/audit\/log$/, () => ({ ok: true, entries: D.permissionAudit() })],
  ['GET', /^\/api\/permissions$/, () => ({ ok: true, permissions: D.permissions().map((p) => (state.overrides.has(p.actionId) ? { ...p, tier: state.overrides.get(p.actionId)!, isOverride: true } : p)) })],
  ['POST', /^\/api\/permissions\/(.+)$/, (c) => { state.overrides.set(decodeURIComponent(c.m[1]), String(c.body.tier)); return { ok: true }; }],
  ['DELETE', /^\/api\/permissions\/(.+)$/, (c) => { state.overrides.delete(decodeURIComponent(c.m[1])); return { ok: true }; }],
  ['GET', /^\/api\/integrations\/n8n\/status$/, () => ({ configured: true, baseUrl: 'http://localhost:5678', reachable: true, hasApiKey: true, detail: 'Connesso (demo)' })],
  ['GET', /^\/api\/integrations\/n8n\/workflows$/, () => D.n8nWorkflows()],
  ['POST', /^\/api\/integrations\/n8n\/trigger$/, () => ({ ok: true, status: 200 })],
  ['GET', /^\/api\/mcp\/status$/, () => D.mcpStatus()],
  ['GET', /^\/api\/mcp\/tools$/, (c) => D.mcpTools(c.url.searchParams.get('server') || '')],

  // Memoria
  ['GET', /^\/api\/memory\/status$/, () => D.memoryStatus(state.memory.length)],
  ['GET', /^\/api\/memory\/canonical$/, (c) => {
    const q = norm(c.url.searchParams.get('q'));
    const cat = c.url.searchParams.get('category');
    return state.memory.filter((e) => (!cat || e.category === cat) && (!q || norm(`${e.title} ${e.content}`).includes(q)));
  }],
  ['POST', /^\/api\/memory\/canonical$/, (c) => {
    const now = D.iso();
    state.memory.unshift({ id: D.newCanonicalId(), category: String(c.body.category ?? 'fact'), title: String(c.body.title ?? 'Ricordo'), content: String(c.body.content ?? ''), source: 'human', tags: (c.body.tags as string[]) ?? [], createdAt: now, updatedAt: now });
    return { ok: true };
  }],
  ['DELETE', /^\/api\/memory\/canonical\/([^/]+)$/, (c) => { state.memory = state.memory.filter((e) => e.id !== decodeURIComponent(c.m[1])); return { ok: true }; }],
  ['GET', /^\/api\/memory\/search$/, (c) => {
    const q = norm(c.url.searchParams.get('q'));
    return { ok: true, results: state.memory.filter((e) => norm(`${e.title} ${e.content}`).includes(q)).map((e, i) => ({ ...e, score: 0.9 - i * 0.07 })) };
  }],
  ['GET', /^\/api\/memory\/graph$/, () => D.memoryGraph()],
  ['GET', /^\/api\/memory\/temp$/, () => D.tempMemory()],
  ['GET', /^\/api\/agent-memory$/, () => D.operationalMemory()],
  ['GET', /^\/api\/memory\/supermemory\/status$/, () => D.supermemoryStatus()],
  ['GET', /^\/api\/memory\/supermemory\/retrieve$/, (c) => {
    const q = norm(c.url.searchParams.get('q'));
    return {
      ok: true, query: q,
      canonical: state.memory.filter((e) => norm(`${e.title} ${e.content}`).includes(q)).slice(0, 4).map((e, i) => ({ id: e.id, title: e.title, content: e.content, score: 0.88 - i * 0.08 })),
      rawEvidence: [{ id: 'raw-1', text: 'Estratto di esempio da una fonte grezza (demo).', source: 'vault-demo', sourceFile: 'Letture/sistemi-distribuiti.md', score: 0.61 }],
    };
  }],
  ['POST', /^\/api\/memory\/supermemory\/(curate|reindex)$/, () => ({ ok: true })],
  ['POST', /^\/api\/memory\/sync\/obsidian$/, () => ({ ok: true, synced: 5 })],
  ['GET', /^\/api\/obsidian\/status$/, () => D.obsidianStatus()],
  ['GET', /^\/api\/obsidian\/recent$/, () => ({ notes: D.obsidianNotes() })],
  ['GET', /^\/api\/obsidian\/search$/, (c) => {
    const q = norm(c.url.searchParams.get('q'));
    return { results: D.obsidianNotes().filter((n) => norm(`${n.title} ${n.content}`).includes(q)) };
  }],
  ['POST', /^\/api\/obsidian\/ingest-inbox$/, () => ({ ok: true, processed: 2 })],
  ['POST', /^\/api\/obsidian\/ensure-structure$/, () => ({ ok: true, created: [] })],

  // Media / notizie / briefing
  ['GET', /^\/api\/media\/status$/, () => D.mediaStatus()],
  ['GET', /^\/api\/media\/recent$/, () => D.mediaRecent()],
  ['GET', /^\/api\/media\/crunchyroll\/continue$/, () => D.mediaContinue()],
  ['POST', /^\/api\/media\/(open|search|resume|crunchyroll\/resume)$/, () => ({ ok: true })],
  ['GET', /^\/api\/search\/news$/, (c) => D.news(c.url.searchParams.get('cat') || undefined)],
  ['POST', /^\/api\/search\/briefing$/, () => D.newsBriefing()],
  ['GET', /^\/api\/briefing\/feed$/, () => D.briefingFeed()],
  ['POST', /^\/api\/briefing\/feed\/item\/[^/]+\/task$/, () => ({ ok: true })],

  // Voce (TTS/STT non disponibili in demo: il client ripiega sul parlato del browser)
  ['GET', /^\/api\/voice\/status$/, () => D.voiceStatus()],
  ['POST', /^\/api\/voice\/stop$/, () => ({ ok: true })],
  ['GET', /^\/api\/stt\/status$/, () => ({ local: { enabled: false }, activeEngine: 'none' })],
  ['GET', /^\/api\/tts\/piper\/status$/, () => ({ configured: false })],

  // Layout del canvas
  ['GET', /^\/api\/canvas\/layout$/, () => ({ ok: true, layouts: [...state.layouts.values()] })],
  ['POST', /^\/api\/canvas\/layout$/, (c) => { state.layouts.set(String(c.body.name), c.body); return { ok: true }; }],
  ['DELETE', /^\/api\/canvas\/layout\/[^/]+$/, () => ({ ok: true })],
];

// ───────────────────────────── chat in streaming ───────────────────────────

function streamChat(body: Body, signal?: AbortSignal | null): Response {
  const messages = (body.messages as Array<{ role: string; content: string }> | undefined) ?? [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const words = D.cannedReply(lastUser).split(/(\s+)/).filter(Boolean);
  const enc = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal?.aborted) { controller.error(new DOMException('Aborted', 'AbortError')); return; }
      if (i === 0) await sleep(450);
      if (i >= words.length) {
        controller.enqueue(enc.encode(JSON.stringify({ model: String(body.model ?? 'llama3.1:8b'), message: { role: 'assistant', content: '' }, done: true }) + '\n'));
        controller.close();
        return;
      }
      await sleep(28 + Math.random() * 35);
      controller.enqueue(enc.encode(JSON.stringify({ model: String(body.model ?? 'llama3.1:8b'), message: { role: 'assistant', content: words[i++] }, done: false }) + '\n'));
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

// ───────────────────────────── fetch demo ──────────────────────────────────

function isBackendUrl(u: URL): boolean {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.origin === window.location.origin) return u.pathname.startsWith('/api/') || u.pathname.startsWith('/node');
  return local && ['11434', '8787'].includes(u.port);
}

async function parseBody(init?: RequestInit): Promise<Body> {
  const b = init?.body;
  if (typeof b !== 'string') return {};
  try { return JSON.parse(b) as Body; } catch { return {}; }
}

export async function demoHandle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input), window.location.href);
  const method = (init?.method || req?.method || 'GET').toUpperCase();
  const signal = init?.signal ?? req?.signal;
  const body = await parseBody(init);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  await sleep(jitter());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (method === 'POST' && path === '/api/chat') return streamChat(body, signal);
  if (path === '/api/tts' || path === '/api/tts/piper' || path === '/api/stt') {
    return jsonResponse({ error: 'Voce non disponibile in modalità demo' }, 503);
  }

  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = path.match(re);
    if (!match) continue;
    return jsonResponse(h({ url, path, method, body, m: match, signal }));
  }
  // Endpoint sconosciuto: risposta neutra, mai un errore che rompa un widget.
  return jsonResponse(method === 'GET' ? {} : { ok: true, message: 'Demo: operazione simulata' });
}

// ───────────────────────────── EventSource finto ───────────────────────────

class DemoEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  readyState = 1;
  url: string;
  withCredentials = false;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private timers: number[] = [];

  constructor(url: string | URL) {
    this.url = String(url);
    const emit = (data: unknown) => { if (this.readyState === 1) this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) })); };
    if (this.url.includes('jobs-events')) {
      this.timers.push(window.setTimeout(() => emit({ type: 'snapshot', events: D.jobEvents() }), 250));
    } else if (this.url.includes('/events/stream')) {
      let n = 0;
      const fire = () => {
        const e = D.DEMO_EVENTS[n++ % D.DEMO_EVENTS.length];
        emit({ id: `ev-${Date.now()}`, ts: new Date().toISOString(), ...e });
      };
      this.timers.push(window.setTimeout(fire, 9000));
      this.timers.push(window.setInterval(fire, 45000));
    }
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) { if (type === 'message') this.onmessage = fn; }
  removeEventListener() { /* noop */ }
  dispatchEvent() { return true; }
  close() { this.readyState = 2; this.timers.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); }); this.timers = []; }
}

// ───────────────────────────── WebSocket finto ─────────────────────────────

/** Nessun WebSocket reale in demo: si "apre e si chiude" senza lanciare eccezioni. */
class DemoWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  url: string;
  protocol = '';
  extensions = '';
  bufferedAmount = 0;
  binaryType: BinaryType = 'blob';
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  constructor(url: string | URL) {
    this.url = String(url);
    window.setTimeout(() => {
      this.readyState = 3;
      this.onerror?.(new Event('error'));
      this.onclose?.(new CloseEvent('close', { code: 1000, reason: 'demo' }));
    }, 50);
  }
  send() { /* noop */ }
  close() { this.readyState = 3; }
  addEventListener(type: string, fn: (e: Event) => void) {
    if (type === 'error') this.onerror = fn;
    if (type === 'close') this.onclose = fn as (e: CloseEvent) => void;
  }
  removeEventListener() { /* noop */ }
  dispatchEvent() { return true; }
}

// ───────────────────────────── installazione ───────────────────────────────

/** Da chiamare in main.tsx PRIMA del render. */
export function installDemoFetch(): void {
  if (typeof window === 'undefined') return;
  const realFetch = window.fetch.bind(window);
  const RealEventSource = window.EventSource;

  if (IS_DEMO) {
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const u = new URL(input instanceof Request ? input.url : String(input), window.location.href);
        if (isBackendUrl(u)) return demoHandle(input, init);
      } catch { /* URL non valido: lascia fare al fetch vero */ }
      return realFetch(input, init);
    };
    (window as unknown as { EventSource: unknown }).EventSource = DemoEventSource;
    (window as unknown as { WebSocket: unknown }).WebSocket = DemoWebSocket;
    return;
  }

  // Modalità reale: se VITE_API_BASE è impostato, riscrive /api/... verso quel backend.
  if (!API_BASE) return;
  const rewrite = (u: string) => (u.startsWith('/api/') || u.startsWith('/node') ? API_BASE + u : u);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return realFetch(rewrite(input), init);
    return realFetch(input, init);
  };
  class BaseEventSource extends RealEventSource {
    constructor(url: string | URL, cfg?: EventSourceInit) { super(typeof url === 'string' ? rewrite(url) : url, cfg); }
  }
  (window as unknown as { EventSource: unknown }).EventSource = BaseEventSource;
}
