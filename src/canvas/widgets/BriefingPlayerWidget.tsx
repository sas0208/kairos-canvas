import { useEffect, useRef, useState, useCallback } from 'react';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';

// Briefing Player — la rassegna parlata di Kira (AI/agenti/cyber/ecommerce/paper/dev).
// Play → Kira legge lo script con la sua voce (/api/tts). Ogni news può diventare un'idea/task.

interface BriefingItem { id: string; category: string; title: string; source: string; url: string; snippet: string; }
interface BriefingFeed { id: string; createdAt: string; script: string; items: BriefingItem[]; model?: string; }

const CAT_COLOR: Record<string, string> = {
  AI: '#7dd3fc', Paper: '#c4b5fd', Cyber: '#fca5a5', Dev: '#86efac', Ecommerce: '#fcd34d',
};

export function BriefingPlayerWidget() {
  const [feed, setFeed] = useState<BriefingFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tasked, setTasked] = useState<Record<string, boolean>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/briefing/feed${refresh ? '?refresh=1' : ''}`);
      if (!r.ok) throw new Error('Errore briefing');
      setFeed(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const play = useCallback(async () => {
    if (!feed?.script) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(true);
    // Kira entra nello stato "briefing" (avatar) mentre legge.
    window.dispatchEvent(new CustomEvent('kira:setMode', { detail: 'briefing' }));
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: feed.script }) });
      if (!r.ok) throw new Error('tts');
      const audio = new Audio(URL.createObjectURL(await r.blob()));
      audioRef.current = audio;
      audio.ontimeupdate = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
      audio.onended = () => { setPlaying(false); setProgress(0); window.dispatchEvent(new CustomEvent('kira:setMode', { detail: 'idle' })); };
      await audio.play();
    } catch {
      // fallback: voce del browser
      try {
        const u = new SpeechSynthesisUtterance(feed.script); u.lang = 'it-IT';
        u.onend = () => setPlaying(false);
        speechSynthesis.speak(u);
      } catch { setPlaying(false); }
    }
  }, [feed]);

  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    setPlaying(false); setProgress(0);
    window.dispatchEvent(new CustomEvent('kira:setMode', { detail: 'idle' }));
  }, []);

  const seek = useCallback((frac: number) => {
    const a = audioRef.current;
    if (a && a.duration) { a.currentTime = frac * a.duration; setProgress(frac); }
  }, []);

  const makeTask = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/briefing/feed/item/${id}/task`, { method: 'POST' });
      if (r.ok) setTasked((t) => ({ ...t, [id]: true }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  if (error && !feed) return <WidgetError message={error} onRetry={() => load(false)} />;
  if (!feed) return <WidgetSpinner />;

  return (
    <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.7rem', fontSize: '0.8rem', height: '100%' }}>
      {/* Player bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <button onClick={playing ? stop : play} style={{
          width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
          background: 'radial-gradient(circle at 38% 32%,#dbeafe,#7dd3fc 40%,#3b82f6)', color: '#04121f', fontSize: '1.1rem',
        }}>{playing ? '⏸' : '▶'}</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Rassegna di Kira</div>
          <div
            onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); seek((e.clientX - b.left) / b.width); }}
            style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.1)', cursor: 'pointer', overflow: 'hidden' }}
          >
            <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: '#7dd3fc', transition: 'width .2s' }} />
          </div>
        </div>
        <button onClick={() => load(true)} disabled={loading} title="Aggiorna"
          style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', color: '#fff', cursor: 'pointer' }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Script preview */}
      <div style={{ color: 'rgba(255,255,255,.6)', lineHeight: 1.45, maxHeight: 90, overflowY: 'auto', fontSize: '0.76rem',
        borderLeft: '2px solid rgba(125,211,252,.4)', paddingLeft: '0.6rem' }}>
        {feed.script}
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto', flex: 1 }}>
        {feed.items.map((it) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            border: '1px solid rgba(255,255,255,.08)', borderRadius: '0.6rem', padding: '0.45rem 0.55rem', background: 'rgba(255,255,255,.03)' }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: CAT_COLOR[it.category] || '#cbd5e1', flexShrink: 0, marginTop: 2 }}>{it.category}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={it.url} target="_blank" rel="noreferrer" style={{ color: '#e2e8f0', textDecoration: 'none', fontSize: '0.76rem', lineHeight: 1.3 }}>{it.title}</a>
              <div style={{ color: 'rgba(255,255,255,.35)', fontSize: '0.66rem' }}>{it.source}</div>
            </div>
            <button onClick={() => makeTask(it.id)} disabled={tasked[it.id]} title="Trasforma in idea/task"
              style={{ background: tasked[it.id] ? 'rgba(134,239,172,.15)' : 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)',
                borderRadius: '0.5rem', padding: '0.25rem 0.5rem', color: tasked[it.id] ? '#86efac' : '#fff', fontSize: '0.66rem', cursor: 'pointer', flexShrink: 0 }}>
              {tasked[it.id] ? '✓ idea' : '+ idea'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
