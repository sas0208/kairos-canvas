import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../contexts/ToastContext';

// NowBar — striscia ambient in basso a sinistra (sopra la StatusRail).
// Mostra: ⏱ tempo attivo di sessione · ultima azione · 📅 prossimo evento.
// Cliccando l'ultima azione si apre il pannello Recents con undo per le azioni reversibili.

interface ActivitySnap {
  available?: boolean;
  currentSessionSec?: number;
  onBreak?: boolean;
}

interface ActionRecord {
  id: string;
  ts: string;
  source: string;
  category: string;
  label: string;
  detail?: string;
  reversible: boolean;
  undone?: boolean;
}

interface CalEvent { title?: string; start?: string; end?: string }

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h${rm.toString().padStart(2, '0')}` : `${h}h`;
}

function fmtEventTime(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `dom ${time}`;
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ` ${time}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

const SOURCE_ICON: Record<string, string> = {
  notes: '📝', pc: '🖥', calendar: '📅',
  gmail: '✉', agent: '⚙', reminder: '⏰',
};

export function NowBar() {
  const toast = useToast();
  const [activity, setActivity] = useState<ActivitySnap>({});
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [nextEvent, setNextEvent] = useState<CalEvent | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const loadActions = useCallback(async () => {
    try {
      const r = await fetch('/api/actions/history?limit=8');
      if (!r.ok) return;
      const j = await r.json() as { ok: boolean; actions?: ActionRecord[] };
      if (j.ok && Array.isArray(j.actions)) setActions(j.actions);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      try {
        const [a, cal] = await Promise.allSettled([
          fetch('/api/system/monitor-activity').then((r) => r.ok ? r.json() : null),
          fetch('/api/assistant/calendar').then((r) => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;
        if (a.status === 'fulfilled' && a.value) setActivity(a.value as ActivitySnap);
        if (cal.status === 'fulfilled' && cal.value?.status === 'ok') {
          const events: CalEvent[] = cal.value.data?.events || [];
          const upcoming = events
            .filter((e) => e.start && new Date(e.start).getTime() >= Date.now())
            .sort((x, y) => new Date(x.start!).getTime() - new Date(y.start!).getTime());
          setNextEvent(upcoming[0] ?? null);
        }
      } catch { /* silent */ }
    }
    void loadAll();
    void loadActions();
    const id = window.setInterval(() => { if (document.hidden) return; void loadAll(); void loadActions(); }, 60_000);
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    // Refresh azioni quando il sistema ne registra una nuova
    const onAction = () => { void loadActions(); };
    window.addEventListener('kira:actionLogged', onAction);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearInterval(tick);
      window.removeEventListener('kira:actionLogged', onAction);
    };
  }, [loadActions]);

  // Chiudi il popover cliccando fuori
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const undo = useCallback(async (rec: ActionRecord) => {
    setUndoing(rec.id);
    try {
      const r = await fetch(`/api/actions/undo/${encodeURIComponent(rec.id)}`, { method: 'POST' });
      const j = await r.json() as { ok: boolean; message?: string };
      if (j.ok) {
        toast.success(j.message || 'Azione annullata');
        await loadActions();
      } else {
        toast.error(j.message || 'Annullamento fallito');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore annullamento');
    } finally {
      setUndoing(null);
    }
  }, [toast, loadActions]);

  const lastAction = actions[0] ?? null;
  const sessionSec = activity.currentSessionSec ?? 0;
  const showActive = activity.available !== false && (sessionSec > 0 || activity.onBreak);

  // Niente da mostrare → non ingombrare il canvas
  if (!showActive && !lastAction && !nextEvent) return null;

  return (
    <div className="kc-nowbar" ref={rootRef}>
      {open && (
        <div className="kc-nowbar-pop" role="dialog" aria-label="Azioni recenti">
          <div className="kc-nowbar-pop-head">
            <span>Azioni recenti</span>
            <button type="button" className="kc-nowbar-pop-x" onClick={() => setOpen(false)} aria-label="Chiudi">×</button>
          </div>
          {actions.length === 0 ? (
            <div className="kc-nowbar-pop-empty">Nessuna azione registrata</div>
          ) : (
            <ul className="kc-nowbar-pop-list">
              {actions.map((a) => (
                <li key={a.id} className={`kc-nowbar-pop-item ${a.undone ? 'kc-nowbar-pop-item-undone' : ''}`}>
                  <span className="kc-nowbar-pop-ico" aria-hidden="true">{SOURCE_ICON[a.source] || '•'}</span>
                  <span className="kc-nowbar-pop-body">
                    <span className="kc-nowbar-pop-label">{a.label}</span>
                    <span className="kc-nowbar-pop-ts">{fmtEventTime(a.ts, now)}{a.undone ? ' · annullata' : ''}</span>
                  </span>
                  {a.reversible && !a.undone && (
                    <button
                      type="button"
                      className="kc-nowbar-pop-undo"
                      onClick={() => void undo(a)}
                      disabled={undoing === a.id}
                      title="Annulla questa azione"
                    >
                      {undoing === a.id ? '…' : '↩'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="kc-nowbar-strip">
        {showActive && (
          <span className="kc-nowbar-seg" title={activity.onBreak ? 'In pausa (nessun input ≥5 min)' : 'Tempo di sessione attiva'}>
            <span className="kc-nowbar-seg-ico">{activity.onBreak ? '⏸' : '⏱'}</span>
            <span className="kc-nowbar-seg-val">{activity.onBreak ? 'in pausa' : fmtDuration(sessionSec)}</span>
          </span>
        )}
        {lastAction && (
          <>
            {showActive && <span className="kc-nowbar-div" />}
            <button
              type="button"
              className="kc-nowbar-seg kc-nowbar-seg-btn"
              onClick={() => setOpen((v) => !v)}
              title="Mostra azioni recenti"
            >
              <span className="kc-nowbar-seg-ico">{SOURCE_ICON[lastAction.source] || '•'}</span>
              <span className="kc-nowbar-seg-val">{truncate(lastAction.label, 26)}</span>
            </button>
          </>
        )}
        {nextEvent?.start && (
          <>
            {(showActive || lastAction) && <span className="kc-nowbar-div" />}
            <span className="kc-nowbar-seg" title={nextEvent.title ? `Prossimo: ${nextEvent.title}` : 'Prossimo evento'}>
              <span className="kc-nowbar-seg-ico">📅</span>
              <span className="kc-nowbar-seg-val">{truncate(nextEvent.title || 'evento', 20)} · {fmtEventTime(nextEvent.start, now)}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
