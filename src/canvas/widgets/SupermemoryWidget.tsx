import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { WidgetSpinner } from '../components/WidgetStates';

interface Manifest {
  generatedAt?: string;
  pendingRead?: number;
  promotedFacts?: number;
  chunks?: number;
  rawSources?: number;
  rawChunks?: number;
  canonicalTotal?: number;
}
interface RunState {
  task: 'curate' | 'reindex';
  trigger: 'manual' | 'scheduler';
  startedAt: string;
  finishedAt?: string;
  ok?: boolean;
  durationMs?: number;
  error?: string;
}
interface SuperStatus {
  ok: boolean;
  vaultDir: string;
  manifest: Manifest | null;
  running: RunState | null;
  lastRun: { curate: RunState | null; reindex: RunState | null };
  schedulerActive: boolean;
  runHour: number;
}
interface CanonicalSearchHit {
  id?: string;
  title?: string;
  content?: string;
  text?: string;
  score?: number;
  [key: string]: unknown;
}
interface RawEvidenceHit {
  id?: string;
  text?: string;
  source?: string;
  sourceFile?: string;
  filename?: string;
  score?: number;
  [key: string]: unknown;
}
interface RetrieveResponse {
  ok?: boolean;
  query?: string;
  canonical?: CanonicalSearchHit[];
  rawEvidence?: RawEvidenceHit[];
  items?: unknown[];
  errors?: string[];
}

function fmtAge(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'ora';
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.round(h / 24)}g fa`;
}

function fmtScore(score?: number): string {
  return typeof score === 'number' && Number.isFinite(score) ? score.toFixed(3) : '-';
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function canonicalContent(hit: CanonicalSearchHit): string {
  return cleanText(hit.content) || cleanText(hit.text) || cleanText(hit.title) || 'Ricordo senza testo';
}

function rawEvidenceText(hit: RawEvidenceHit): string {
  const text = cleanText(hit.text) || 'Evidenza senza testo';
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function rawEvidenceSource(hit: RawEvidenceHit): string {
  const direct = cleanText(hit.source) || cleanText(hit.filename);
  if (direct) return direct;
  const sourceFile = cleanText(hit.sourceFile);
  if (!sourceFile) return 'raw';
  return sourceFile.split(/[\\/]/).filter(Boolean).pop() || 'raw';
}

export function SupermemoryWidget() {
  const toast = useToast();
  const [status, setStatus] = useState<SuperStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchResult, setSearchResult] = useState<RetrieveResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetch('/api/memory/supermemory/status').then((r) => r.json()).catch(() => null) as SuperStatus | null;
      setStatus(s);
    } finally { setLoading(false); }
  }, []);

  // Poll più spesso mentre un task è in corso, così la UI segue curate/reindex live.
  useEffect(() => {
    void load();
    const fast = status?.running != null;
    const id = setInterval(() => { if (document.hidden) return; void load(); }, fast ? 3000 : 20_000);
    return () => clearInterval(id);
  }, [load, status?.running]);

  const run = useCallback(async (task: 'curate' | 'reindex') => {
    if (status?.running) { toast.error('Supermemoria già occupata'); return; }
    try {
      const r = await fetch(`/api/memory/supermemory/${task}`, { method: 'POST' });
      const d = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (d?.ok) toast.success(task === 'curate' ? 'Curatore avviato — promuove i fatti forti' : 'Reindex semantico avviato (bge-m3)');
      else toast.error(d?.error || 'Avvio fallito');
    } catch { toast.error('Errore di rete'); }
    finally { void load(); }
  }, [status, toast, load]);

  const searchMemory = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearched(false);
      setSearchResult(null);
      return;
    }
    setSearching(true);
    setSearched(true);
    try {
      const r = await fetch(`/api/memory/supermemory/retrieve?q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json().catch(() => null) as RetrieveResponse | null;
      if (!d?.ok) {
        toast.error(d?.errors?.[0] || 'Ricerca memoria fallita');
        setSearchResult(null);
        setSearched(false);
        return;
      }
      setSearchResult(d);
    } catch {
      toast.error('Errore di rete');
      setSearchResult(null);
      setSearched(false);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, toast]);

  const m = status?.manifest;
  const totalCandidates = useMemo(() => {
    if (!m) return null;
    return (m.promotedFacts ?? 0) + (m.pendingRead ?? 0);
  }, [m]);
  const canonicalHits = useMemo(() => {
    return Array.isArray(searchResult?.canonical) ? searchResult.canonical.slice(0, 5) : [];
  }, [searchResult]);
  const rawEvidenceHits = useMemo(() => {
    return Array.isArray(searchResult?.rawEvidence) ? searchResult.rawEvidence.slice(0, 5) : [];
  }, [searchResult]);
  const hasSearchResults = canonicalHits.length > 0 || rawEvidenceHits.length > 0;

  if (loading && !status) return <WidgetSpinner label="Stato Supermemoria…" fullHeight />;
  if (!status?.ok) return <div className="kc-w-super"><div className="kc-w-super-empty">Supermemoria non raggiungibile.</div></div>;

  const running = status.running;
  const busy = running != null;

  return (
    <div className="kc-w-super">
      <div className="kc-w-super-head">
        <span className={`kc-w-super-dot ${busy ? 'kc-w-super-dot-live' : ''}`} aria-hidden />
        <span className="kc-w-super-title">Supermemoria</span>
        <span className="kc-w-super-fresh" title={m?.generatedAt}>{fmtAge(m?.generatedAt)}</span>
        <button type="button" className="kc-w-super-refresh" onClick={() => void load()} title="Aggiorna" aria-label="Aggiorna">↻</button>
      </div>

      <div className="kc-w-super-hero">
        <span className="kc-w-super-hero-num">{m?.canonicalTotal ?? '—'}</span>
        <span className="kc-w-super-hero-lbl">ricordi canonici · memoria operativa</span>
      </div>
      <div className="kc-w-super-grid3">
        <div className="kc-w-super-stat">
          <span className="kc-w-super-num">{m?.promotedFacts ?? '—'}</span>
          <span className="kc-w-super-lbl">promossi</span>
        </div>
        <div className="kc-w-super-stat">
          <span className="kc-w-super-num">{m?.pendingRead ?? '—'}</span>
          <span className="kc-w-super-lbl">pending</span>
        </div>
        <div className="kc-w-super-stat">
          <span className="kc-w-super-num">{totalCandidates ?? '—'}</span>
          <span className="kc-w-super-lbl">candidati</span>
        </div>
      </div>

      <div className="kc-w-super-meta">
        {m?.rawSources ?? 0} sorgenti · {m?.rawChunks ?? 0} raw chunks
      </div>

      {busy && running && (
        <div className="kc-w-super-running">
          <span className="kc-w-super-spin" aria-hidden />
          <span>{running.task === 'curate' ? 'Curatore in corso…' : 'Reindex semantico in corso…'} ({running.trigger})</span>
        </div>
      )}

      <div className="kc-w-super-actions">
        <button type="button" className="kc-w-super-go" onClick={() => void run('curate')} disabled={busy}>
          ✦ Curate
        </button>
        <button type="button" className="kc-w-super-go kc-w-super-go-cyan" onClick={() => void run('reindex')} disabled={busy}>
          ⟳ Reindex
        </button>
      </div>

      <div className="kc-w-super-last">
        <LastRunLine label="Curate" run={status.lastRun.curate} />
        <LastRunLine label="Reindex" run={status.lastRun.reindex} />
      </div>

      <div className="kc-w-super-hint">
        Giro notturno automatico alle {String(status.runHour).padStart(2, '0')}:00 quando la GPU è libera.
        {status.schedulerActive ? ' Scheduler attivo.' : ''}
      </div>

      <form className="kc-w-super-search" onSubmit={searchMemory}>
        <div className="kc-w-super-search-head">Cerca nella memoria</div>
        <div className="kc-w-super-search-row">
          <input
            className="kc-w-super-search-input"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Memoria profonda..."
            aria-label="Cerca nella memoria"
          />
          <button
            type="submit"
            className="kc-w-super-search-btn"
            disabled={searching || searchQuery.trim().length === 0}
            title="Cerca"
            aria-label="Cerca"
          >
            &#8981;
          </button>
        </div>
      </form>

      {(searching || searched) && (
        <div className="kc-w-super-results">
          {searching ? (
            <div className="kc-w-super-results-state">
              <span className="kc-w-super-spin" aria-hidden />
              <span>Cerco...</span>
            </div>
          ) : !hasSearchResults ? (
            <div className="kc-w-super-empty">Nessun ricordo trovato</div>
          ) : (
            <>
              {canonicalHits.length > 0 && (
                <div className="kc-w-super-result-group">
                  <div className="kc-w-super-result-head">Fatti (canonici)</div>
                  <div className="kc-w-super-result-list">
                    {canonicalHits.map((hit, index) => {
                      const title = cleanText(hit.title);
                      const content = canonicalContent(hit);
                      return (
                        <div className="kc-w-super-result-item" key={hit.id || `canonical-${index}`}>
                          <div className="kc-w-super-result-top">
                            {title && title !== content ? <span className="kc-w-super-result-title">{title}</span> : <span />}
                            <span className="kc-w-super-score">{fmtScore(hit.score)}</span>
                          </div>
                          <div className="kc-w-super-result-text">{content}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {rawEvidenceHits.length > 0 && (
                <div className="kc-w-super-result-group">
                  <div className="kc-w-super-result-head">Evidenza (raw)</div>
                  <div className="kc-w-super-result-list">
                    {rawEvidenceHits.map((hit, index) => (
                      <div className="kc-w-super-result-item" key={hit.id || `raw-${index}`}>
                        <div className="kc-w-super-result-top">
                          <span className="kc-w-super-result-source">{rawEvidenceSource(hit)}</span>
                          <span className="kc-w-super-score">{fmtScore(hit.score)}</span>
                        </div>
                        <div className="kc-w-super-result-text">{rawEvidenceText(hit)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LastRunLine({ label, run }: { label: string; run: RunState | null }) {
  if (!run) return <div className="kc-w-super-last-row"><span>{label}</span><span className="kc-w-super-last-na">mai</span></div>;
  const ok = run.ok;
  const dur = run.durationMs != null ? `${Math.round(run.durationMs / 1000)}s` : '';
  return (
    <div className="kc-w-super-last-row">
      <span>{label}</span>
      <span className={ok ? 'kc-w-super-last-ok' : 'kc-w-super-last-err'} title={run.error}>
        {ok ? '✓' : '✕'} {fmtAge(run.finishedAt || run.startedAt)} {dur && `· ${dur}`}
      </span>
    </div>
  );
}
