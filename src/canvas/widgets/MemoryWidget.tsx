import { useEffect, useState, useMemo, useCallback } from 'react';
import { WidgetCardMenu, useCardMenu } from '../components/WidgetCardMenu';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';

interface CanonicalEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  source?: string;
  tags?: string[];
  createdAt?: number | string;
  updatedAt?: number | string;
}

type Status = 'loading' | 'ok' | 'empty' | 'error';

const CATEGORIES = ['all', 'identity', 'preference', 'project', 'reference', 'fact'] as const;
type Category = typeof CATEGORIES[number];
type SourceFilter = 'all' | 'human' | 'auto' | 'verified';

function isAuto(e: CanonicalEntry): boolean {
  return e.id.startsWith('auto-');
}
function isVerified(e: CanonicalEntry): boolean {
  return Array.isArray(e.tags) && e.tags.some((t) => t.startsWith('verified:') || t === 'promoted');
}
function isPromoted(e: CanonicalEntry): boolean {
  return Array.isArray(e.tags) && e.tags.includes('promoted');
}
function getConfidence(e: CanonicalEntry): number | null {
  if (!Array.isArray(e.tags)) return null;
  const conf = e.tags.find((t) => t.startsWith('confidence:'));
  if (!conf) return null;
  const n = parseFloat(conf.split(':')[1]);
  return Number.isFinite(n) ? n : null;
}
function getVerifiedCount(e: CanonicalEntry): number {
  if (!Array.isArray(e.tags)) return 0;
  const v = e.tags.find((t) => t.startsWith('verified:'));
  if (!v) return 0;
  return parseInt(v.split(':')[1], 10) || 0;
}

export function MemoryWidget() {
  const [entries, setEntries] = useState<CanonicalEntry[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [hint, setHint] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [semantic, setSemantic] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const cardMenu = useCardMenu();

  const load = useCallback(async () => {
    try {
      if (semantic && query.trim()) {
        const resp = await fetch(`/api/memory/search?mode=semantic&q=${encodeURIComponent(query.trim())}`);
        if (!resp.ok) { setStatus('error'); setHint(`HTTP ${resp.status}`); return; }
        const json = await resp.json() as { ok: boolean; results?: CanonicalEntry[]; error?: string };
        if (!json.ok) { setStatus('error'); setHint(json.error || 'Semantic search non disponibile'); return; }
        const list = json.results || [];
        setEntries(list);
        setStatus(list.length === 0 ? 'empty' : 'ok');
        return;
      }
      const url = query.trim()
        ? `/api/memory/canonical?q=${encodeURIComponent(query.trim())}`
        : category === 'all'
          ? '/api/memory/canonical'
          : `/api/memory/canonical?category=${encodeURIComponent(category)}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        setStatus('error');
        setHint(`HTTP ${resp.status}`);
        return;
      }
      const json = await resp.json();
      const list: CanonicalEntry[] = Array.isArray(json) ? json : Array.isArray(json?.entries) ? json.entries : [];
      setEntries(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch (e) {
      setStatus('error');
      setHint(e instanceof Error ? e.message : 'Errore rete');
    }
  }, [category, query, semantic]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (sourceFilter === 'human' && isAuto(e)) return false;
      if (sourceFilter === 'auto' && !isAuto(e)) return false;
      if (sourceFilter === 'verified' && !isVerified(e)) return false;
      return true;
    });
  }, [entries, sourceFilter]);

  const counts = useMemo(() => ({
    total: entries.length,
    auto: entries.filter(isAuto).length,
    verified: entries.filter(isVerified).length,
  }), [entries]);

  async function deleteEntry(id: string) {
    if (!confirm(`Eliminare definitivamente "${id}"?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/memory/canonical/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (r.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
      }
    } catch { /* silent */ }
    setBusy(false);
  }

  const visible = useMemo(() => filtered.slice(0, 50), [filtered]);

  async function addDroppedText(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const firstLine = clean.split('\n')[0].slice(0, 60) || 'Memoria';
    setBusy(true);
    try {
      const r = await fetch('/api/memory/canonical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'fact', title: firstLine, content: clean, tags: ['user-saved'] }),
      });
      if (r.ok) { void load(); }
    } catch { /* silent */ } finally { setBusy(false); }
  }

  if (status === 'loading') return <WidgetSpinner label="Caricamento memoria…" fullHeight />;
  if (status === 'error') return <WidgetError message={hint || 'Errore memoria'} onRetry={() => { setStatus('loading'); void load(); }} />;

  return (
    <div
      className={`kc-w-memory${dragOver ? ' kc-w-dropping' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); void addDroppedText(e.dataTransfer.getData('text/plain')); }}
    >
      {dragOver && <div className="kc-w-drop-hint" aria-hidden="true">🧠 Rilascia per salvare in memoria</div>}
      <header className="kc-w-memory-header">
        <input
          type="text"
          className="kc-w-memory-search"
          placeholder={semantic ? 'Cerca per significato…' : 'Cerca…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className={`kc-w-mem-semantic-btn${semantic ? ' kc-w-mem-semantic-on' : ''}`}
          onClick={() => setSemantic((v) => !v)}
          title={semantic ? 'Disattiva ricerca semantica' : 'Attiva ricerca semantica (embeddings)'}
        >
          {semantic ? '🧬' : '🔤'}
        </button>
        <span className="kc-w-memory-count">{counts.total}</span>
      </header>
      <div className="kc-w-memory-source-tabs">
        <button
          className={`kc-w-mem-tab${sourceFilter === 'all' ? ' kc-w-mem-tab-on' : ''}`}
          onClick={() => setSourceFilter('all')}
        >
          Tutto <span className="kc-w-mem-tab-count">{counts.total}</span>
        </button>
        <button
          className={`kc-w-mem-tab${sourceFilter === 'human' ? ' kc-w-mem-tab-on' : ''}`}
          onClick={() => setSourceFilter('human')}
        >
          ✍ Manuali <span className="kc-w-mem-tab-count">{counts.total - counts.auto}</span>
        </button>
        <button
          className={`kc-w-mem-tab${sourceFilter === 'auto' ? ' kc-w-mem-tab-on kc-w-mem-tab-auto-on' : ''}`}
          onClick={() => setSourceFilter('auto')}
          title="Estratte automaticamente dalle conversazioni"
        >
          ⚙ Auto <span className="kc-w-mem-tab-count">{counts.auto}</span>
        </button>
        <button
          className={`kc-w-mem-tab${sourceFilter === 'verified' ? ' kc-w-mem-tab-on kc-w-mem-tab-verified-on' : ''}`}
          onClick={() => setSourceFilter('verified')}
          title="Fatti confermati 3+ volte"
        >
          ✓ Verified <span className="kc-w-mem-tab-count">{counts.verified}</span>
        </button>
      </div>
      <div className="kc-w-memory-filters">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`kc-w-memory-chip ${category === c ? 'kc-w-memory-chip-on' : ''}`}
            onClick={() => { setCategory(c); }}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="kc-w-memory-list">
        {visible.length === 0 ? (
          <div className="kc-w-empty-hint">Nessuna voce in questo filtro</div>
        ) : (
          visible.map((e) => {
            const auto = isAuto(e);
            const promoted = isPromoted(e);
            const verifiedCount = getVerifiedCount(e);
            const confidence = getConfidence(e);
            const visibleTags = Array.isArray(e.tags)
              ? e.tags.filter((t) => !t.startsWith('confidence:') && !t.startsWith('verified:') && t !== 'promoted').slice(0, 4)
              : [];
            return (
              <article
                key={e.id}
                className={`kc-w-memory-card${auto ? ' kc-w-memory-card-auto' : ''}${promoted ? ' kc-w-memory-card-promoted' : ''}`}
                data-cat={e.category}
                title={e.id}
                onContextMenu={(ev) => cardMenu.open(ev, { title: e.title, body: e.content })}
              >
                <header className="kc-w-memory-card-head">
                  <span className="kc-w-memory-card-cat">{e.category}</span>
                  <span className="kc-w-memory-card-title">{e.title}</span>
                  <span className="kc-w-memory-card-badges">
                    {promoted && <span className="kc-w-mem-badge kc-w-mem-badge-promoted" title="Promosso — confermato 3+ volte">★</span>}
                    {!promoted && verifiedCount > 0 && <span className="kc-w-mem-badge kc-w-mem-badge-verified" title={`Confermato ${verifiedCount}×`}>✓{verifiedCount}</span>}
                    {auto && !promoted && <span className="kc-w-mem-badge kc-w-mem-badge-auto" title="Estratto automaticamente">⚙</span>}
                    {confidence !== null && <span className="kc-w-mem-badge kc-w-mem-badge-conf" title="Confidence score">{confidence.toFixed(2)}</span>}
                  </span>
                </header>
                <p className="kc-w-memory-card-body">{e.content}</p>
                <div className="kc-w-memory-card-footer">
                  {visibleTags.length > 0 && (
                    <div className="kc-w-memory-card-tags">
                      {visibleTags.map((t) => <span key={t} className="kc-w-memory-tag">#{t}</span>)}
                    </div>
                  )}
                  {auto && (
                    <button
                      className="kc-w-mem-delete"
                      onClick={() => void deleteEntry(e.id)}
                      disabled={busy}
                      title="Elimina questa entry"
                    >
                      ×
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
      <WidgetCardMenu {...cardMenu.props} />
    </div>
  );
}
