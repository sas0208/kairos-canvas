import { useEffect, useMemo, useState } from 'react';
import { OpenSettingsLink } from './OpenSettingsLink';
import { WidgetCardMenu, useCardMenu } from '../components/WidgetCardMenu';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';
import { askPrompts } from '../../lib/askKira';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  isAllDay: boolean;
  calendarName?: string;
}

interface CalendarData {
  events: CalendarEvent[];
}

interface CalendarResponse {
  status: 'ok' | 'error' | 'not_configured';
  data?: CalendarData | null;
  error?: string;
  setupInstructions?: string;
  cached?: boolean;
}

type WidgetStatus = 'loading' | 'ok' | 'error' | 'setup_required';

const HOUR_FMT = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const DAY_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });

function formatCountdown(start: Date, now: Date): string {
  const diff = Math.max(0, start.getTime() - now.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'inizia ora';
  if (min < 60) return `tra ${min} min`;
  const h = Math.floor(min / 60);
  const remMin = min % 60;
  if (h < 24) return remMin === 0 ? `tra ${h}h` : `tra ${h}h ${remMin}m`;
  const d = Math.floor(h / 24);
  return `tra ${d}g`;
}

function isToday(d: Date, ref: Date): boolean {
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

export function CalendarWidget() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [status, setStatus] = useState<WidgetStatus>('loading');
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [reloadKey, setReloadKey] = useState(0);
  const cardMenu = useCardMenu();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const resp = await fetch('/api/assistant/calendar');
        const json = await resp.json() as CalendarResponse;
        if (cancelled) return;
        if (json.status === 'not_configured') {
          setStatus('setup_required');
          setError(json.setupInstructions || 'Google Calendar non configurato');
          return;
        }
        if (json.status === 'ok' && json.data) {
          setData(json.data);
          setStatus('ok');
        } else {
          setError(json.error || 'Nessun dato');
          setStatus('error');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Errore rete');
        setStatus('error');
      }
    }
    void load();
    const tick = window.setInterval(() => setNow(new Date()), 30 * 1000);
    const refresh = window.setInterval(load, 5 * 60 * 1000);
    // Refresh immediato quando Kira crea un nuovo evento
    const onUpdated = () => { void load(); };
    window.addEventListener('kira:calendarUpdated', onUpdated);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearInterval(refresh);
      window.removeEventListener('kira:calendarUpdated', onUpdated);
    };
  }, [reloadKey]);

  const { todayEvents, upcoming, next } = useMemo(() => {
    const events = data?.events ?? [];
    const parsed = events
      .map((e) => ({ ...e, startDate: new Date(e.start), endDate: new Date(e.end) }))
      .filter((e) => !Number.isNaN(e.startDate.getTime()))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const todayE = parsed.filter((e) => isToday(e.startDate, now));
    const future = parsed.filter((e) => e.endDate.getTime() >= now.getTime());
    const nextE = future[0] ?? null;
    return { todayEvents: todayE, upcoming: future.slice(0, 6), next: nextE };
  }, [data, now]);

  if (status === 'loading') {
    return <WidgetSpinner label="Caricamento calendario…" fullHeight />;
  }
  if (status === 'setup_required') {
    return (
      <div className="kc-w-empty kc-w-empty-info">
        <div style={{ fontSize: '1.4rem' }}>📅</div>
        <div>Google Calendar non configurato</div>
        <div className="kc-w-empty-hint">Servono GOOGLE_CLIENT_ID + autorizzazione OAuth</div>
        <OpenSettingsLink hint="Configura l'integrazione Google:" />
      </div>
    );
  }
  if (status === 'error') {
    return <WidgetError message={error || 'Calendario offline'} onRetry={() => { setStatus('loading'); setReloadKey((k) => k + 1); }} />;
  }

  return (
    <div className="kc-w-cal">
      {next ? (
        <div className="kc-w-cal-priority">
          <span className="kc-w-cal-priority-corner kc-w-cal-priority-corner-tl" aria-hidden="true" />
          <span className="kc-w-cal-priority-corner kc-w-cal-priority-corner-tr" aria-hidden="true" />
          <span className="kc-w-cal-priority-corner kc-w-cal-priority-corner-bl" aria-hidden="true" />
          <span className="kc-w-cal-priority-corner kc-w-cal-priority-corner-br" aria-hidden="true" />
          <div className="kc-w-cal-priority-label">
            <span className="kc-w-cal-priority-pulse" aria-hidden="true" />
            PROSSIMO EVENTO
          </div>
          <div className="kc-w-cal-priority-title">{next.title}</div>
          <div className="kc-w-cal-priority-meta">
            <span className="kc-w-cal-priority-time">
              {next.isAllDay ? 'tutto il giorno' : HOUR_FMT.format(next.startDate)}
            </span>
            <span className="kc-w-cal-priority-count">{formatCountdown(next.startDate, now)}</span>
          </div>
          {next.location ? <div className="kc-w-cal-priority-loc">📍 {next.location}</div> : null}
        </div>
      ) : (
        <div className="kc-w-cal-priority kc-w-cal-priority-empty">
          <div className="kc-w-cal-priority-label">OGGI</div>
          <div className="kc-w-cal-priority-title">Nessun evento</div>
        </div>
      )}
      <div className="kc-w-cal-section">
        <div className="kc-w-cal-section-head">
          <span>Oggi</span>
          <span className="kc-w-cal-section-count">{todayEvents.length}</span>
        </div>
        {todayEvents.length === 0 ? (
          <div className="kc-w-empty-hint">Nessun evento oggi</div>
        ) : (
          <ul className="kc-w-cal-list">
            {todayEvents.map((e) => (
              <li
                key={e.id}
                className="kc-w-cal-row"
                onContextMenu={(ev) => cardMenu.open(ev, {
                  title: e.title,
                  body: askPrompts.calendarBrief(e.title, e.isAllDay ? 'tutto il giorno' : HOUR_FMT.format(e.startDate)),
                })}
              >
                <span className="kc-w-cal-time">
                  {e.isAllDay ? '·' : HOUR_FMT.format(e.startDate)}
                </span>
                <span className="kc-w-cal-title">{e.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {upcoming.length > todayEvents.length ? (
        <div className="kc-w-cal-section">
          <div className="kc-w-cal-section-head">
            <span>Prossimi</span>
          </div>
          <ul className="kc-w-cal-list">
            {upcoming.filter((e) => !isToday(e.startDate, now)).slice(0, 4).map((e) => (
              <li
                key={e.id}
                className="kc-w-cal-row"
                onContextMenu={(ev) => cardMenu.open(ev, {
                  title: e.title,
                  body: askPrompts.calendarBrief(e.title, e.isAllDay ? 'tutto il giorno' : HOUR_FMT.format(e.startDate)),
                })}
              >
                <span className="kc-w-cal-time">{DAY_FMT.format(e.startDate)}</span>
                <span className="kc-w-cal-title">{e.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <WidgetCardMenu {...cardMenu.props} />
    </div>
  );
}
