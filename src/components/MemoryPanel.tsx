import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useToast } from '../contexts/ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type CanonicalEntry = {
  id: string; category: string; title: string; content: string;
  source: string; createdAt: string; updatedAt: string; tags: string[];
  score?: number;
};

type OperativeEntry = {
  id: string; timestamp: string; agentId: string; jobId?: string;
  type: string; title: string; summary: string; detail: string;
  files: string[]; tags: string[]; importance: string; reusable: boolean;
  sensitivity: string; provenance?: { source: string; confidence?: number };
};

type TempEntry = {
  key: string; value: string; source: string; jobId?: string;
  createdAt: string; expiresAt: string;
};

type MemoryStatus = {
  canonical: { count: number; categories: string[] };
  operational: { count: number; types: string[] };
  temporary: { count: number; keys: string[] };
};

type MemoryNode = { id: string; label: string; rawLabel: string; cluster: string; x: number; y: number; width: number; height: number; color: string };
type MemoryEdge = { id: string; fromNode: string; toNode: string };
type MemoryGraph = { source: string; nodes: MemoryNode[]; edges: MemoryEdge[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Tab = 'canonical' | 'operational' | 'temp' | 'obsidian' | 'graph';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'canonical', label: 'Canonica' },
  { id: 'operational', label: 'Operativa' },
  { id: 'temp', label: 'Temporanea' },
  { id: 'obsidian', label: 'Obsidian' },
  { id: 'graph', label: 'Grafico' },
];

const CATEGORY_LABELS: Record<string, string> = {
  fact: 'Fatto', preference: 'Preferenza', architecture: 'Architettura',
  profile: 'Profilo', rule: 'Regola', truth: 'Verità',
};

const IMPORTANCE_COLOR: Record<string, string> = {
  high: 'text-amber-300', normal: 'text-white/60', low: 'text-white/38',
};

const SOURCE_BADGE: Record<string, string> = {
  agent: 'bg-violet-300/10 text-violet-200',
  human: 'bg-emerald-300/10 text-emerald-200',
  system: 'bg-sky-300/10 text-sky-200',
  'claude-code': 'bg-cyan-300/10 text-cyan-200',
  document: 'bg-white/10 text-white/55',
};

function elapsed(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'ora';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m fa`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h fa`;
  return new Date(iso).toLocaleDateString('it');
}

// ─── Panel ────────────────────────────────────────────────────────────────────

type ObsidianStatus = {
  configured: boolean; vaultPath: string | null; exists: boolean;
  noteCount: number; folders: string[]; lastScan: string | null; error?: string;
  watcher?: { active: boolean; autoSync: boolean; lastIngestAt: string | null };
};
type ObsidianNote = { path: string; title: string; content: string; folder: string; modifiedAt: string; tags: string[]; score?: number };

export function MemoryPanel() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('canonical');
  const [status, setStatus] = useState<MemoryStatus | null>(null);
  const [canonical, setCanonical] = useState<CanonicalEntry[]>([]);
  const [operational, setOperational] = useState<OperativeEntry[]>([]);
  const [temp, setTemp] = useState<TempEntry[]>([]);
  const [graph, setGraph] = useState<MemoryGraph | null>(null);
  const [obsidianStatus, setObsidianStatus] = useState<ObsidianStatus | null>(null);
  const [obsidianNotes, setObsidianNotes] = useState<ObsidianNote[]>([]);
  const [obsidianQuery, setObsidianQuery] = useState('');
  const [obsidianSearching, setObsidianSearching] = useState(false);
  const [obsidianAction, setObsidianAction] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('tutti');
  const [typeFilter, setTypeFilter] = useState('tutti');
  const [importanceFilter, setImportanceFilter] = useState('tutti');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [graphZoom, setGraphZoom] = useState(1);
  const [graphCluster, setGraphCluster] = useState('tutti');
  const [graphSelected, setGraphSelected] = useState('core');
  const [dragId, setDragId] = useState('');
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    fetch('/api/memory/status').then((r) => r.ok ? r.json() : null).then((d) => { if (d) setStatus(d); }).catch(() => null);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'canonical') return;
    const q = search.trim();
    const url = q ? `/api/memory/canonical?q=${encodeURIComponent(q)}` : '/api/memory/canonical';
    fetch(url).then((r) => r.ok ? r.json() : []).then(setCanonical).catch(() => setCanonical([]));
  }, [tab, search]);

  useEffect(() => {
    if (tab !== 'operational') return;
    fetch('/api/agent-memory').then((r) => r.ok ? r.json() : []).then(setOperational).catch(() => setOperational([]));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'temp') return;
    fetch('/api/memory/temp').then((r) => r.ok ? r.json() : []).then(setTemp).catch(() => setTemp([]));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'graph') return;
    fetch('/api/memory/graph').then((r) => r.ok ? r.json() : null).then((d) => { if (d) setGraph(d); }).catch(() => null);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'obsidian') return;
    fetch('/api/obsidian/status').then((r) => r.ok ? r.json() : null).then((d) => { if (d) setObsidianStatus(d as ObsidianStatus); }).catch(() => null);
    fetch('/api/obsidian/recent').then((r) => r.ok ? r.json() : null).then((d) => { if (d && d.notes) setObsidianNotes(d.notes as ObsidianNote[]); }).catch(() => null);
  }, [tab]);

  async function obsidianSearch() {
    if (!obsidianQuery.trim()) return;
    setObsidianSearching(true);
    try {
      const r = await fetch(`/api/obsidian/search?q=${encodeURIComponent(obsidianQuery)}`);
      if (r.ok) { const d = await r.json() as { results: ObsidianNote[] }; setObsidianNotes(d.results); }
    } finally { setObsidianSearching(false); }
  }

  async function obsidianDoAction(action: 'sync' | 'ingest' | 'structure') {
    setObsidianAction(action);
    try {
      const ep = action === 'sync' ? '/api/memory/sync/obsidian' : action === 'ingest' ? '/api/obsidian/ingest-inbox' : '/api/obsidian/ensure-structure';
      const r = await fetch(ep, { method: 'POST' });
      const d = r.ok ? await r.json() as Record<string, unknown> : null;
      if (d) {
        const msg = action === 'sync' ? `Sync: ${d.synced} note scritte` : action === 'ingest' ? `Ingest: ${d.processed} note processate` : `Struttura: ${(d.created as string[]).length} cartelle create`;
        toast.success(msg, 4200);
        // Ricarica stato
        fetch('/api/obsidian/status').then((r2) => r2.ok ? r2.json() : null).then((s) => { if (s) setObsidianStatus(s as ObsidianStatus); }).catch(() => null);
      } else {
        toast.error('Azione Obsidian non riuscita', 4200);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore Obsidian', 4200);
    } finally { setObsidianAction(null); }
  }

  const filteredCanonical = useMemo(() => {
    const base = canonical;
    return categoryFilter === 'tutti' ? base : base.filter((e) => e.category === categoryFilter);
  }, [canonical, categoryFilter]);

  const filteredOperational = useMemo(() => {
    let base = operational;
    if (typeFilter !== 'tutti') base = base.filter((e) => e.type === typeFilter);
    if (importanceFilter !== 'tutti') base = base.filter((e) => e.importance === importanceFilter);
    const q = search.trim().toLowerCase();
    if (q) base = base.filter((e) => `${e.title} ${e.summary} ${e.tags.join(' ')}`.toLowerCase().includes(q));
    return base;
  }, [operational, typeFilter, importanceFilter, search]);

  const opTypes = useMemo(() => ['tutti', ...Array.from(new Set(operational.map((e) => e.type)))], [operational]);
  const canonCategories = useMemo(() => ['tutti', ...Array.from(new Set(canonical.map((e) => e.category)))], [canonical]);

  const graphClusters = useMemo(() => graph ? Array.from(new Set(graph.nodes.map((n) => n.cluster))).sort() : [], [graph]);
  const filteredNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter((n) => graphCluster === 'tutti' || n.cluster === graphCluster);
  }, [graph, graphCluster]);
  const visibleIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const minX = graph ? Math.min(...graph.nodes.map((n) => n.x)) - 120 : 0;
  const minY = graph ? Math.min(...graph.nodes.map((n) => n.y)) - 120 : 0;
  const maxX = graph ? Math.max(...graph.nodes.map((n) => n.x + n.width)) + 120 : 1000;
  const maxY = graph ? Math.max(...graph.nodes.map((n) => n.y + n.height)) + 120 : 700;
  const selectedNode = graph?.nodes.find((n) => n.id === graphSelected) || filteredNodes[0];

  function svgPoint(e: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : null;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-28 pt-32 md:px-8 md:pt-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.32em] text-kira-blue/70">Memoria</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Memory System</h2>
          <p className="mt-2 text-sm text-white/45">Tre livelli: Canonica (stabile), Operativa (agenti), Temporanea (job).</p>
        </div>
        {status ? (
          <div className="flex gap-3 text-xs text-white/40">
            <span>{status.canonical.count} canonici</span>
            <span>·</span>
            <span>{status.operational.count} operativi</span>
            <span>·</span>
            <span>{status.temporary.count} temp</span>
          </div>
        ) : null}
      </header>

      <nav className="grid grid-cols-5 gap-2 rounded-[1.4rem] border border-white/10 bg-black/25 p-1.5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); }}
            className={`rounded-2xl px-3 py-2.5 text-sm transition ${tab === t.id ? 'bg-white text-black shadow-[0_0_30px_rgba(125,211,252,0.18)]' : 'text-white/50 hover:bg-white/[0.06] hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── CANONICA ── */}
      {tab === 'canonical' ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <input className="field-input max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca nella memoria canonica..." />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {canonCategories.map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`rounded-full border px-3 py-1 text-xs transition ${categoryFilter === c ? 'border-kira-blue/50 bg-kira-blue/10 text-white' : 'border-white/10 text-white/40 hover:text-white'}`}>
                {c === 'tutti' ? 'tutti' : (CATEGORY_LABELS[c] || c)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {filteredCanonical.map((entry) => (
              <CanonicalCard key={entry.id} entry={entry} expanded={expanded === entry.id} onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)} />
            ))}
            {filteredCanonical.length === 0 ? <div className="col-span-2 rounded-2xl border border-white/10 p-6 text-center text-sm text-white/35">Nessuna voce trovata.</div> : null}
          </div>
          <div className="rounded-[1.35rem] border border-white/[0.07] bg-white/[0.025] p-4 text-xs text-white/28">
            La memoria canonica è read-only per gli agenti. Modifiche solo tramite Claude Code con approvazione umana.
          </div>
        </section>
      ) : null}

      {/* ── OPERATIVA ── */}
      {tab === 'operational' ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <input className="field-input max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca..." />
            <select className="field-input max-w-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              {opTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="field-input max-w-36" value={importanceFilter} onChange={(e) => setImportanceFilter(e.target.value)}>
              {['tutti', 'high', 'normal', 'low'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            {filteredOperational.slice(0, 40).map((entry) => (
              <OperativeCard key={entry.id} entry={entry} expanded={expanded === entry.id} onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)} />
            ))}
            {filteredOperational.length === 0 ? <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-white/35">Nessuna memoria operativa trovata.</div> : null}
            {filteredOperational.length > 40 ? <div className="text-center text-xs text-white/28">Mostrando 40 di {filteredOperational.length}. Raffina la ricerca.</div> : null}
          </div>
        </section>
      ) : null}

      {/* ── TEMPORANEA ── */}
      {tab === 'temp' ? (
        <section className="flex flex-col gap-4">
          {temp.length === 0 ? (
            <div className="rounded-[1.35rem] border border-white/10 p-10 text-center">
              <div className="text-sm text-white/40">Nessuna voce temporanea attiva.</div>
              <div className="mt-2 text-xs text-white/25">La memoria temporanea viene usata dagli agenti durante i job e scade automaticamente dopo 24h.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {temp.map((entry) => (
                <div key={entry.key} className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-cyan-200/70">{entry.key}</span>
                    <span className="text-xs text-white/35">scade {elapsed(entry.expiresAt)}</span>
                  </div>
                  {entry.jobId ? <div className="mt-1 text-xs text-white/35">Job: {entry.jobId}</div> : null}
                  <div className="mt-2 rounded-xl bg-black/25 p-3 font-mono text-xs text-white/55">{entry.value.slice(0, 300)}{entry.value.length > 300 ? '...' : ''}</div>
                  <div className="mt-2 text-xs text-white/28">source: {entry.source} · creata {elapsed(entry.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-[1.35rem] border border-white/[0.07] bg-white/[0.025] p-4 text-xs text-white/28">
            TTL default: 24h. Gli agenti possono impostare TTL personalizzati. La memoria temporanea non è persistita su disco.
          </div>
        </section>
      ) : null}

      {/* ── OBSIDIAN ── */}
      {tab === 'obsidian' ? (
        <section className="flex flex-col gap-4">
          {/* Status */}
          {obsidianStatus ? (
            <div className={`rounded-[1.35rem] border p-4 ${obsidianStatus.configured && obsidianStatus.exists ? 'border-violet-300/20 bg-violet-300/[0.03]' : 'border-amber-300/15 bg-amber-300/[0.02]'}`}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${obsidianStatus.exists ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-sm font-medium text-white/70">Obsidian Vault</span>
                </div>
                <span className="text-xs text-white/35">{obsidianStatus.noteCount} note</span>
              </div>
              {obsidianStatus.vaultPath ? (
                <div className="text-xs text-white/35 font-mono mb-2 truncate">{obsidianStatus.vaultPath}</div>
              ) : (
                <div className="text-xs text-amber-200/60 mb-2">
                  OBSIDIAN_VAULT_PATH non configurata. Aggiungila in Strumenti → Connessioni o nel .env.
                </div>
              )}
              {obsidianStatus.folders.length > 0 ? (
                <div className="flex flex-wrap gap-1 mb-3">
                  {obsidianStatus.folders.map((f) => <span key={f} className="rounded-full bg-violet-300/10 px-2 py-0.5 text-[0.6rem] text-violet-200/60">{f}/</span>)}
                </div>
              ) : null}
              {obsidianStatus.error ? <div className="text-xs text-red-300/60">{obsidianStatus.error}</div> : null}

              {/* Azioni */}
              {obsidianStatus.exists ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button onClick={() => void obsidianDoAction('sync')} disabled={!!obsidianAction}
                    className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.06] px-3 py-1.5 text-xs text-violet-200/70 transition hover:bg-violet-300/10 disabled:opacity-40">
                    {obsidianAction === 'sync' ? '...' : 'Sync memoria'}
                  </button>
                  <button onClick={() => void obsidianDoAction('ingest')} disabled={!!obsidianAction}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/45 transition hover:text-white disabled:opacity-40">
                    {obsidianAction === 'ingest' ? '...' : 'Ingest inbox'}
                  </button>
                  <button onClick={() => void obsidianDoAction('structure')} disabled={!!obsidianAction}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/35 transition hover:text-white disabled:opacity-40">
                    {obsidianAction === 'structure' ? '...' : 'Crea struttura'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-white/35">Caricamento stato Obsidian...</div>
          )}

          {/* Ricerca */}
          {obsidianStatus?.exists ? (
            <div className="flex gap-2">
              <input className="field-input flex-1" value={obsidianQuery} onChange={(e) => setObsidianQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void obsidianSearch(); }}
                placeholder="Cerca nella vault Obsidian..." />
              <button onClick={() => void obsidianSearch()} disabled={obsidianSearching}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/45 transition hover:text-white disabled:opacity-40">
                {obsidianSearching ? '...' : 'Cerca'}
              </button>
              <button onClick={() => { setObsidianQuery(''); fetch('/api/obsidian/recent').then((r) => r.ok ? r.json() : null).then((d) => { if (d?.notes) setObsidianNotes(d.notes as ObsidianNote[]); }).catch(() => null); }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/35 transition hover:text-white">
                Recenti
              </button>
            </div>
          ) : null}

          {/* Note */}
          {obsidianNotes.length > 0 ? (
            <div className="flex flex-col gap-2">
              {obsidianNotes.map((note, i) => (
                <div key={i} className="rounded-[1.35rem] border border-white/[0.07] bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                      <span className="text-sm font-medium text-white/80">{note.title}</span>
                      {note.folder ? <span className="ml-2 text-[0.6rem] text-violet-200/50">{note.folder}/</span> : null}
                    </div>
                    {note.score !== undefined ? <span className="text-[0.6rem] text-white/25">score {(note.score * 100).toFixed(0)}%</span> : null}
                  </div>
                  <div className="text-xs text-white/40 line-clamp-2">{note.content}</div>
                  {note.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {note.tags.map((t) => <span key={t} className="rounded-full bg-violet-300/[0.07] px-2 py-0.5 text-[0.55rem] text-violet-200/50">#{t}</span>)}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[0.6rem] text-white/22">{note.path} · {elapsed(note.modifiedAt)}</div>
                </div>
              ))}
            </div>
          ) : obsidianStatus?.exists && !obsidianSearching ? (
            <div className="rounded-2xl border border-white/[0.07] p-6 text-center text-sm text-white/35">
              {obsidianQuery ? 'Nessuna nota trovata.' : 'Nessuna nota recente.'}
            </div>
          ) : null}

          {/* Setup guide */}
          {!obsidianStatus?.configured ? (
            <div className="rounded-[1.35rem] border border-white/[0.07] bg-white/[0.02] p-4 text-xs text-white/28 space-y-1">
              <div className="text-white/45 font-medium mb-2">Setup Obsidian Vault</div>
              <div>1. Apri PowerShell nella cartella Kira</div>
              <div>2. Esegui: <code className="text-violet-200/50">.\scripts\setup\validate-kira-env.ps1</code></div>
              <div>3. Aggiungi OBSIDIAN_VAULT_PATH nel .env (es. <code className="text-white/40">/path/to/ObsidianVault</code>)</div>
              <div>4. Riavvia il server e torna qui</div>
              <div className="mt-2">Comandi chat: <span className="text-white/40">"cerca in Obsidian ..."</span> · <span className="text-white/40">"salva questa idea in Obsidian"</span> · <span className="text-white/40">"crea nota wiki su ..."</span></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── GRAFICO ── */}
      {tab === 'graph' ? (
        <section className="panel-block flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-white">Memory Galaxy</div>
              <p className="mt-1 text-xs text-white/40">Vista da Memory_Galaxy.canvas + Agent OS. Lettura locale, nessun dato sensibile.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="voice-button" onClick={() => setGraphZoom((z) => Math.max(0.75, z - 0.15))}>−</button>
              <button className="voice-button" onClick={() => setGraphZoom((z) => Math.min(1.45, z + 0.15))}>+</button>
            </div>
          </div>
          {graphClusters.length ? (
            <div className="flex flex-wrap gap-1.5">
              {['tutti', ...graphClusters].map((c) => (
                <button key={c} onClick={() => setGraphCluster(c)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${graphCluster === c ? 'border-kira-blue/60 text-white' : 'border-white/10 text-white/38'}`}>
                  {c}
                </button>
              ))}
            </div>
          ) : null}
          {graph ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
              <div className="overflow-hidden rounded-[1.4rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_center,rgba(169,201,255,0.08),transparent_30%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(3,7,18,0.96))]">
                <svg ref={svgRef} viewBox={`${minX} ${minY} ${(maxX - minX) / graphZoom} ${(maxY - minY) / graphZoom}`} className="h-[28rem] w-full touch-none md:h-[36rem]"
                  onPointerMove={(e) => {
                    if (!dragId) return;
                    const pt = svgPoint(e);
                    if (!pt) return;
                    setGraph((g) => g ? { ...g, nodes: g.nodes.map((n) => n.id === dragId ? { ...n, x: pt.x - n.width / 2, y: pt.y - n.height / 2 } : n) } : g);
                  }}
                  onPointerUp={() => setDragId('')} onPointerLeave={() => setDragId('')}>
                  <defs>
                    <filter id="memory-glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <radialGradient id="node-core"><stop offset="0%" stopColor="rgba(255,255,255,0.98)"/><stop offset="45%" stopColor="rgba(125,211,252,0.82)"/><stop offset="100%" stopColor="rgba(169,201,255,0.08)"/></radialGradient>
                  </defs>
                  {graph.edges.filter((e) => visibleIds.has(e.fromNode) && visibleIds.has(e.toNode)).map((edge) => {
                    const f = graph.nodes.find((n) => n.id === edge.fromNode);
                    const t = graph.nodes.find((n) => n.id === edge.toNode);
                    if (!f || !t) return null;
                    return <line key={edge.id} x1={f.x + f.width / 2} y1={f.y + f.height / 2} x2={t.x + t.width / 2} y2={t.y + t.height / 2} stroke="rgba(125,211,252,0.2)" strokeWidth="1.5" />;
                  })}
                  {filteredNodes.map((node) => {
                    const active = selectedNode?.id === node.id;
                    const cx = node.x + node.width / 2;
                    const cy = node.y + node.height / 2;
                    const r = active ? 20 : 11;
                    return (
                      <g key={node.id} role="button" tabIndex={0} onClick={() => setGraphSelected(node.id)}
                        onPointerDown={(e) => { setDragId(node.id); setGraphSelected(node.id); e.currentTarget.setPointerCapture(e.pointerId); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') setGraphSelected(node.id); }}
                        className="cursor-grab active:cursor-grabbing">
                        <circle cx={cx} cy={cy} r={r * 2.2} fill={active ? 'rgba(169,201,255,0.14)' : 'transparent'} filter={active ? 'url(#memory-glow)' : undefined} />
                        <circle cx={cx} cy={cy} r={r} fill="url(#node-core)" stroke={active ? '#e0f2fe' : node.color} strokeWidth={active ? 2.5 : 1.2} />
                        <text x={cx} y={cy + r + 16} textAnchor="middle" fill="rgba(255,255,255,0.72)" fontSize={active ? 13 : 11} fontFamily="Inter, sans-serif">{node.label}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <aside className="rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-white/35">Nodo</div>
                <h3 className="mt-3 text-xl font-semibold text-white">{selectedNode?.label || '—'}</h3>
                <div className="mt-4 grid gap-1.5 text-xs text-white/45">
                  <div>Cluster: {selectedNode?.cluster || '—'}</div>
                  <div>Nodi: {filteredNodes.length}/{graph.nodes.length}</div>
                </div>
              </aside>
            </div>
          ) : <div className="text-sm text-white/40">Caricamento grafico...</div>}
        </section>
      ) : null}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CanonicalCard({ entry, expanded, onToggle }: { entry: CanonicalEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-[1.35rem] border bg-white/[0.035] transition ${expanded ? 'border-cyan-300/25' : 'border-white/10'}`}>
      <button className="w-full p-4 text-left" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] text-white/40">
                {CATEGORY_LABELS[entry.category] || entry.category}
              </span>
              <span className={`text-[0.62rem] ${SOURCE_BADGE[entry.source] || 'text-white/35'} rounded-full px-2 py-0.5`}>
                {entry.source}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium text-white/85">{entry.title}</div>
          </div>
          <span className="mt-1 shrink-0 text-xs text-white/28">{elapsed(entry.updatedAt)}</span>
        </div>
        {entry.tags.length ? <div className="mt-2 flex flex-wrap gap-1">{entry.tags.map((t) => <span key={t} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[0.6rem] text-white/38">#{t}</span>)}</div> : null}
      </button>
      {expanded ? (
        <div className="border-t border-white/[0.07] px-4 pb-4 pt-3 text-sm leading-7 text-white/65">
          {entry.content}
        </div>
      ) : null}
    </div>
  );
}

function OperativeCard({ entry, expanded, onToggle }: { entry: OperativeEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-[1.35rem] border bg-white/[0.03] transition ${expanded ? 'border-violet-300/25' : 'border-white/[0.07]'}`}>
      <button className="w-full p-3.5 text-left" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.6rem] text-white/40">{entry.type}</span>
              <span className={`text-[0.62rem] font-medium ${IMPORTANCE_COLOR[entry.importance] || 'text-white/50'}`}>{entry.importance}</span>
              {entry.provenance ? <span className={`rounded-full px-2 py-0.5 text-[0.6rem] ${SOURCE_BADGE[entry.provenance.source] || 'text-white/35'}`}>{entry.provenance.source}</span> : null}
              {entry.reusable ? <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[0.6rem] text-cyan-200/70">riusabile</span> : null}
            </div>
            <div className="mt-1.5 text-sm text-white/80">{entry.title}</div>
            {!expanded ? <div className="mt-1 line-clamp-2 text-xs text-white/40">{entry.summary}</div> : null}
          </div>
          <span className="shrink-0 text-[0.62rem] text-white/28">{elapsed(entry.timestamp)}</span>
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-white/[0.07] px-4 pb-4 pt-3">
          <div className="text-sm leading-7 text-white/65">{entry.detail || entry.summary}</div>
          {entry.files.length ? <div className="mt-3 flex flex-wrap gap-1.5">{entry.files.map((f) => <span key={f} className="rounded-xl bg-black/30 px-2.5 py-1 font-mono text-[0.6rem] text-white/45">{f.split(/[/\\]/).pop()}</span>)}</div> : null}
          {entry.tags.length ? <div className="mt-2 flex flex-wrap gap-1">{entry.tags.map((t) => <span key={t} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[0.6rem] text-white/35">#{t}</span>)}</div> : null}
          <div className="mt-3 text-[0.62rem] text-white/28">agente: {entry.agentId}{entry.jobId ? ` · job: ${entry.jobId}` : ''}</div>
        </div>
      ) : null}
    </div>
  );
}
