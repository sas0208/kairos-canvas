import { useEffect, useRef, useState } from 'react';

interface HudNotification {
  id: string;
  text: string;
  kind: 'info' | 'success' | 'warn' | 'error';
  ts: number;
  source?: string;
}

interface KiraEvent {
  id: string;
  kind: 'job' | 'coach' | 'ha' | 'reminder' | 'watchdog' | 'integration' | 'operation' | 'system';
  level: 'info' | 'success' | 'warn' | 'error';
  title: string;
  detail?: string;
  source?: string;
  ts: string;
  meta?: Record<string, unknown>;
  replayed?: boolean;
}

const LAST_SEEN_KEY = 'kira.notifhud.lastSeenTs';

const MAX_HUD = 5;
const AUTO_DISMISS_MS = 6000;

const KIND_ICON: Record<string, string> = {
  job: '⚙', coach: '🎯', ha: '🏠', reminder: '⏰',
  watchdog: '🛡', integration: '🔌', operation: '🛰', system: '',
};

/**
 * NotificationHud — fixed top-right stream of Kira events.
 * Subscribes to the unified SSE bus `/api/events/stream` which multiplexes:
 *   - job lifecycle (started/completed/failed/approval)
 *   - HA webhook events
 *   - reminders firing
 *   - watchdog recoveries / failures
 *   - notification log (action/warning/error)
 *
 */
export function NotificationHud() {
  const [notifications, setNotifications] = useState<HudNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);

  function push(text: string, kind: HudNotification['kind'] = 'info', source?: string) {
    const id = `hud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNotifications((prev) => [{ id, text, kind, ts: Date.now(), source }, ...prev].slice(0, MAX_HUD));
    window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }

  function dismiss(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  // ── Unified SSE bus ─────────────────────────────────────────────────────
  useEffect(() => {
    // Recupera ultimo timestamp visto per replay degli eventi persi
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    const url = lastSeen ? `/api/events/stream?since=${encodeURIComponent(lastSeen)}` : '/api/events/stream';
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as KiraEvent;
        if (!evt.title) return;
        if (evt.kind === 'system' && evt.title === 'connesso') return; // welcome event silent
        // Salva il timestamp di questo evento come ultimo visto
        try { localStorage.setItem(LAST_SEEN_KEY, evt.ts); } catch { /* quota */ }
        const icon = KIND_ICON[evt.kind] || '';
        const replayedTag = evt.replayed ? '⏪ ' : '';
        const prefix = `${replayedTag}${icon}${icon ? ' ' : ''}`;
        const text = evt.detail ? `${prefix}${evt.title}: ${evt.detail}` : `${prefix}${evt.title}`;
        push(text, evt.level, evt.source || evt.kind);
        // Operazioni: quando una che l'utente ha avviato parte o richiede attenzione,
        // apri/evidenzia automaticamente il Centro Operazioni — niente più "dove vedo?".
        if (!evt.replayed && evt.kind === 'operation' && evt.meta?.autoFocus) {
          window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: 'operations' } }));
        }
        // Notifica al ParticleCore: pulse con il level dell'evento.
        // Skip per eventi "replayed" (boot replay) per non fare flashare il core all'avvio.
        if (!evt.replayed) {
          window.dispatchEvent(new CustomEvent('kira:eventPulse', { detail: { kind: evt.kind, level: evt.level } }));
        }
      } catch { /* skip malformed */ }
    };
    es.onerror = () => { /* SSE auto-reconnects */ };
    return () => { es.close(); };
  }, []);

  if (notifications.length === 0) return null;

  return (
    <div className="kc-hud" role="log" aria-live="polite" aria-label="Notifiche Kira">
      {notifications.map((n) => (
        <div key={n.id} className={`kc-hud-item kc-hud-item-${n.kind}`}>
          <span className="kc-hud-item-text">{n.text}</span>
          <button
            type="button"
            className="kc-hud-item-close"
            onClick={() => dismiss(n.id)}
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
