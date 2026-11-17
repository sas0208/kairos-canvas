import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useToast } from '../../contexts/ToastContext';

type MediaServiceId = 'youtube' | 'crunchyroll' | 'netflix' | 'prime' | 'disney';

interface MediaServiceStatus {
  id: MediaServiceId;
  name: string;
  icon: string;
  color: string;
  isOpen: boolean;
  isLoggedIn: boolean;
  requiresLogin: boolean;
  loginUrl: string;
  lastUrl?: string;
}

interface RecentEntry {
  title: string;
  service: MediaServiceId;
  url?: string;
  searchedAt: string;
  type?: string;
}

interface DirectLauncher {
  id: string;
  name: string;
  icon: string;
  url: string;
  hint: string;
}

interface ContinueItem {
  url: string;
  title: string;
  series: string;
  episode: string;
}

const DIRECT_LINKS: DirectLauncher[] = [
  { id: 'plex',    name: 'Plex',    icon: 'TV', url: 'https://app.plex.tv/desktop', hint: 'link esterno' },
  { id: 'spotify', name: 'Spotify', icon: '♪',  url: 'https://open.spotify.com/',    hint: 'link esterno' },
  { id: 'twitch',  name: 'Twitch',  icon: 'T',  url: 'https://www.twitch.tv/',       hint: 'link esterno' },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m fa`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h fa`;
  return `${Math.floor(diff / 86_400_000)}g fa`;
}

export function MediaWidget() {
  const [services, setServices] = useState<MediaServiceStatus[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContinueItem[]>([]);
  const [selected, setSelected] = useState<MediaServiceId | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const [statusResp, recentResp] = await Promise.all([
        fetch('/api/media/status'),
        fetch('/api/media/recent'),
      ]);
      if (!statusResp.ok) throw new Error(`media status HTTP ${statusResp.status}`);
      const statusJson = await statusResp.json() as { services?: MediaServiceStatus[] };
      setServices(statusJson.services || []);
      if (recentResp.ok) {
        const recentJson = await recentResp.json() as { recent?: RecentEntry[] };
        setRecent(recentJson.recent || []);
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Media backend non raggiungibile');
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const id = window.setInterval(fetchStatus, 30_000);
    return () => window.clearInterval(id);
  }, [fetchStatus]);

  // Continua a guardare: le ultime serie, se il backend le fornisce
  useEffect(() => {
    fetch('/api/media/crunchyroll/continue')
      .then((r) => r.json() as Promise<{ ok: boolean; items?: ContinueItem[] }>)
      .then((j) => { if (j.ok && j.items) setContinueWatching(j.items.slice(0, 4)); })
      .catch(() => { /* sezione opzionale */ });
  }, []);

  async function resumeSeries(item: ContinueItem) {
    setLoading(true);
    try {
      const resp = await fetch('/api/media/crunchyroll/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: item.series, fullscreen: true }),
      });
      const data = await resp.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || 'resume fallito');
      toast.info(`▶ ${item.series} — dal punto dove eri rimasto`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ripresa fallita');
    } finally {
      setLoading(false);
    }
  }

  async function openService(service: MediaServiceStatus) {
    setSelected(service.id);
    setLoading(true);
    try {
      const resp = await fetch('/api/media/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: service.id }),
      });
      const data = await resp.json() as { ok: boolean; error?: string };
      if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      toast.info(`${service.name} aperto`);
      await fetchStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Apertura media fallita');
    } finally {
      setLoading(false);
    }
  }

  async function searchService(serviceId: MediaServiceId, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const resp = await fetch('/api/media/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceId, query: trimmed }),
      });
      const data = await resp.json() as { ok: boolean; error?: string };
      if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      const svc = services.find((s) => s.id === serviceId);
      toast.info(`Ricerca su ${svc?.name || serviceId}`);
      setQuery('');
      await fetchStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ricerca media fallita');
    } finally {
      setLoading(false);
    }
  }

  async function resumeLast() {
    const last = recent[0];
    if (!last) return;
    setLoading(true);
    try {
      const resp = await fetch('/api/media/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: last.service }),
      });
      const data = await resp.json() as { ok: boolean; error?: string };
      if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      toast.info(`Riprendo ${last.title}`);
      await fetchStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ripresa media fallita');
    } finally {
      setLoading(false);
    }
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const fallback = selected || services.find((service) => service.isOpen)?.id || services[0]?.id;
    if (fallback) void searchService(fallback, query);
  }

  function openDirect(link: DirectLauncher) {
    window.open(link.url, '_blank', 'noopener,noreferrer');
    toast.info(`${link.name} aperto come link esterno`);
  }

  return (
    <div className="kc-w-media">
      <header className="kc-w-media-header">
        <form className="kc-w-media-form" onSubmit={submitSearch}>
          <input
            type="text"
            className="kc-w-media-search"
            placeholder={selected ? `Cerca su ${services.find((s) => s.id === selected)?.name || selected}` : 'Cerca su media backend'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading || services.length === 0}
          />
          <button type="submit" className="kc-w-media-go" disabled={loading || !query.trim() || services.length === 0}>Go</button>
        </form>
      </header>

      {error && services.length === 0 ? <div className="kc-w-empty kc-w-empty-err">{error}</div> : null}

      {continueWatching.length > 0 && (
        <div className="kc-w-media-continue">
          <div className="kc-w-media-continue-title">Continua a guardare</div>
          {continueWatching.map((item) => (
            <button
              key={item.url}
              type="button"
              className="kc-w-media-continue-item"
              onClick={() => void resumeSeries(item)}
              disabled={loading}
              title={item.title}
            >
              <span className="kc-w-media-continue-play">▶</span>
              <span className="kc-w-media-continue-series">{item.series}</span>
              {item.episode ? <span className="kc-w-media-continue-ep">{item.episode}</span> : null}
            </button>
          ))}
        </div>
      )}

      <div className="kc-w-media-grid">
        {services.map((service) => {
          const hint = service.isOpen
            ? service.isLoggedIn ? 'aperto · login ok' : 'aperto · verifica login'
            : service.requiresLogin ? 'login richiesto' : 'pronto';
          return (
            <button
              key={service.id}
              type="button"
              className="kc-w-media-card"
              data-platform={service.id}
              data-selected={selected === service.id}
              onClick={() => query.trim() ? searchService(service.id, query) : openService(service)}
              title={hint}
              disabled={loading}
            >
              <span className="kc-w-media-icon">{service.icon}</span>
              <span className="kc-w-media-name">{service.name}</span>
              <span className="kc-w-media-hint">{hint}</span>
            </button>
          );
        })}

        {DIRECT_LINKS.map((link) => (
          <button
            key={link.id}
            type="button"
            className="kc-w-media-card"
            data-platform={link.id}
            onClick={() => openDirect(link)}
            title={link.hint}
          >
            <span className="kc-w-media-icon">{link.icon}</span>
            <span className="kc-w-media-name">{link.name}</span>
            <span className="kc-w-media-hint">{link.hint}</span>
          </button>
        ))}
      </div>

      <footer className="kc-w-media-footer">
        <button type="button" className="kc-w-media-resume" disabled={loading || recent.length === 0} onClick={resumeLast}>
          Riprendi
        </button>
        <div className="kc-w-media-recent">
          {recent[0] ? `${recent[0].title} · ${recent[0].service} · ${timeAgo(recent[0].searchedAt)}` : 'Nessun media recente'}
        </div>
      </footer>
    </div>
  );
}
