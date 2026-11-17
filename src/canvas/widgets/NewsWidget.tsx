import { useCallback, useEffect, useMemo, useState } from 'react';

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
  category?: string;
}
interface NewsResponse { items: NewsItem[]; sources: string[]; fetchedAt: string }

type Cat = 'all' | 'Mondo' | 'Italia' | 'Tech';
const CATS: Array<{ id: Cat; label: string }> = [
  { id: 'all', label: 'Tutte' },
  { id: 'Mondo', label: 'Mondo' },
  { id: 'Italia', label: 'Italia' },
  { id: 'Tech', label: 'Tech' },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'ora';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ora';
  if (m < 60) return `${m}m fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface Briefing { summary: string; highlights: string[] }

export function NewsWidget() {
  const [cat, setCat] = useState<Cat>('all');
  const [only24h, setOnly24h] = useState(false);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [updated, setUpdated] = useState<Date | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingStatus, setBriefingStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const load = useCallback(() => {
    setStatus('loading');
    const url = cat === 'all' ? '/api/search/news' : `/api/search/news?cat=${encodeURIComponent(cat)}`;
    void fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NewsResponse | null) => {
        if (d?.items) {
          setItems(d.items);
          setSources(d.sources || []);
          setStatus('ok');
          setUpdated(new Date());
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [cat]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh ogni 10 min (le RSS in cache backend reggono comunque).
  useEffect(() => {
    const id = window.setInterval(load, 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  // Sintesi AI on-demand (usa Ollama locale; degrada a lista titoli se offline).
  const toggleBriefing = useCallback(() => {
    if (briefing) { setBriefing(null); return; }
    setBriefingStatus('loading');
    void fetch('/api/search/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cat === 'all' ? {} : { query: cat }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { summary?: string; highlights?: string[] } | null) => {
        if (d?.summary) { setBriefing({ summary: d.summary, highlights: d.highlights || [] }); setBriefingStatus('idle'); }
        else setBriefingStatus('error');
      })
      .catch(() => setBriefingStatus('error'));
  }, [briefing, cat]);

  const visible = useMemo(() => {
    if (!only24h) return items;
    const now = Date.now();
    return items.filter((i) => now - new Date(i.publishedAt).getTime() <= DAY_MS);
  }, [items, only24h]);

  const fmtTime = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="kc-nw">
      <div className="kc-nw-header">
        <div className="kc-nw-tabs">
          {CATS.map((c) => (
            <button
              key={c.id}
              className={`kc-nw-tab${cat === c.id ? ' kc-nw-tab-on' : ''}`}
              onClick={() => setCat(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="kc-nw-header-right">
          <button
            className={`kc-nw-24h${briefing ? ' kc-nw-24h-on' : ''}`}
            onClick={toggleBriefing}
            disabled={briefingStatus === 'loading'}
            title="Sintesi AI delle notizie principali"
          >
            {briefingStatus === 'loading' ? '…' : '✨'}
          </button>
          <button
            className={`kc-nw-24h${only24h ? ' kc-nw-24h-on' : ''}`}
            onClick={() => setOnly24h((v) => !v)}
            title="Solo notizie delle ultime 24 ore"
          >
            24h
          </button>
          <button className="kc-nw-refresh" onClick={load} title="Aggiorna" aria-label="Aggiorna notizie">↻</button>
        </div>
      </div>

      {briefingStatus === 'error' && (
        <div className="kc-nw-brief kc-nw-brief-err">Sintesi non disponibile (modello locale offline). Mostro i titoli.</div>
      )}
      {briefing && (
        <div className="kc-nw-brief">
          <div className="kc-nw-brief-title">✨ Sintesi del giorno</div>
          <div className="kc-nw-brief-summary">{briefing.summary}</div>
          {briefing.highlights.length > 0 && (
            <ul className="kc-nw-brief-list">
              {briefing.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="kc-nw-list">
        {status === 'loading' && items.length === 0 && (
          <div className="kc-nw-empty">Carico le notizie…</div>
        )}
        {status === 'error' && items.length === 0 && (
          <div className="kc-nw-empty">Notizie non raggiungibili. Riprova con ↻.</div>
        )}
        {status !== 'loading' && visible.length === 0 && items.length > 0 && (
          <div className="kc-nw-empty">Nessuna notizia nelle ultime 24h in questa categoria.</div>
        )}
        {visible.map((it, i) => (
          <a
            key={`${it.url}-${i}`}
            className="kc-nw-item"
            href={it.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <div className="kc-nw-item-meta">
              <span className="kc-nw-item-source">{it.source}</span>
              {it.category && <span className="kc-nw-item-cat">{it.category}</span>}
              <span className="kc-nw-item-time">{timeAgo(it.publishedAt)}</span>
            </div>
            <div className="kc-nw-item-title">{it.title}</div>
            {it.snippet && <div className="kc-nw-item-snippet">{it.snippet}</div>}
          </a>
        ))}
      </div>

      <div className="kc-nw-footer">
        <span>{sources.length ? sources.join(' · ') : 'RSS pubblici'}</span>
        {updated && <span>aggiornato {fmtTime(updated)}</span>}
      </div>
    </div>
  );
}
