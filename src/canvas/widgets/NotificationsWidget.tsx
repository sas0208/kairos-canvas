import { useEffect, useState, useCallback } from 'react';
import { WidgetCardMenu, useCardMenu } from '../components/WidgetCardMenu';
import { WidgetSpinner } from '../components/WidgetStates';

interface NotifEntry {
  id: string;
  timestamp: string;
  type: 'action' | 'info' | 'warning' | 'error';
  source: string;
  message: string;
  detail?: string;
}

const TYPE_ICON: Record<string, string> = {
  action:  'ACT',
  info:    'i',
  warning: '!',
  error:   'x',
};
const TYPE_COLOR: Record<string, string> = {
  action:  'rgba(99,179,237,0.9)',
  info:    'rgba(160,210,160,0.8)',
  warning: 'rgba(214,226,246,0.9)',
  error:   'rgba(248,113,113,0.9)',
};
const SOURCE_LABEL: Record<string, string> = {
  pc: 'PC', notes: 'Note',
  memory: 'Memoria', media: 'Media', calendar: 'Calendario', system: 'Sistema', agent: 'Agenti',
};

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}

interface ActionRecord {
  id: string;
  ts: string;
  source: string;
  category: string;
  label: string;
  reversible: boolean;
  undone?: boolean;
  undoneAt?: string;
  undoSpec?: { description?: string };
}

type ViewTab = 'notif' | 'actions';

export function NotificationsWidget() {
  const [entries, setEntries] = useState<NotifEntry[]>([]);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [tab, setTab] = useState<ViewTab>('notif');
  const [undoBusy, setUndoBusy] = useState<string | null>(null);
  const cardMenu = useCardMenu();

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications');
      const d = await r.json() as { ok: boolean; notifications: NotifEntry[] };
      if (d.ok) setEntries(d.notifications);
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, []);

  const loadActions = useCallback(async () => {
    try {
      const r = await fetch('/api/actions/history?limit=80');
      const d = await r.json() as { ok: boolean; actions: ActionRecord[] };
      if (d.ok) setActions(d.actions);
    } catch { /* noop */ }
  }, []);

  const undo = useCallback(async (id: string) => {
    setUndoBusy(id);
    try {
      const r = await fetch(`/api/actions/undo/${encodeURIComponent(id)}`, { method: 'POST' });
      const d = await r.json() as { ok: boolean; message?: string };
      if (d.ok) await loadActions();
    } catch { /* noop */ } finally {
      setUndoBusy(null);
    }
  }, [loadActions]);

  useEffect(() => {
    void load();
    void loadActions();
    const id = window.setInterval(() => { void load(); void loadActions(); }, 5000);
    return () => window.clearInterval(id);
  }, [load, loadActions]);

  const clear = useCallback(async () => {
    await fetch('/api/notifications/clear', { method: 'POST' });
    setEntries([]);
  }, []);

  const sources = ['all', ...Array.from(new Set(entries.map((e) => e.source)))];
  const visible = filter === 'all' ? entries : entries.filter((e) => e.source === filter);
  return (
    <div className="kc-w-notif">
      <div className="kc-w-notif-header">
        <div className="kc-w-notif-chips">
          <button className={`kc-w-notif-chip ${tab === 'notif' ? 'kc-w-notif-chip-active' : ''}`} onClick={() => setTab('notif')}>Notifiche</button>
          <button className={`kc-w-notif-chip ${tab === 'actions' ? 'kc-w-notif-chip-active' : ''}`} onClick={() => setTab('actions')}>
            Cronologia {actions.filter((a) => a.reversible && !a.undone).length > 0 && (
              <span style={{ marginLeft: 4, color: '#a9c9ff' }}>undo</span>
            )}
          </button>
        </div>
        {tab === 'notif' && (
          <button className="kc-w-notif-clear" onClick={() => void clear()} title="Svuota log">
            clear
          </button>
        )}
      </div>

      {tab === 'notif' && (
        <div className="kc-w-notif-chips" style={{ padding: '4px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {sources.map((src) => (
            <button
              key={src}
              className={`kc-w-notif-chip ${filter === src ? 'kc-w-notif-chip-active' : ''}`}
              onClick={() => setFilter(src)}
            >
              {src === 'all' ? 'Tutto' : (SOURCE_LABEL[src] || src)}
            </button>
          ))}
        </div>
      )}

      <div className="kc-w-notif-list">
        {tab === 'notif' ? (
          loading ? (
            <WidgetSpinner label="Caricamento notifiche..." />
          ) : visible.length === 0 ? (
            <div className="kc-w-empty-hint">Nessuna azione registrata</div>
          ) : (
            visible.map((e) => (
              <div
                key={e.id}
                className="kc-w-notif-row"
                data-type={e.type}
                onContextMenu={(ev) => cardMenu.open(ev, {
                  title: e.message,
                  body: `[${SOURCE_LABEL[e.source] || e.source}] ${e.detail || ''}`.trim(),
                })}
              >
                <div className="kc-w-notif-icon" style={{ color: TYPE_COLOR[e.type] }}>
                  {TYPE_ICON[e.type] ?? '-'}
                </div>
                <div className="kc-w-notif-body">
                  <div className="kc-w-notif-top">
                    <span className="kc-w-notif-source">{SOURCE_LABEL[e.source] || e.source}</span>
                    <span className="kc-w-notif-time">{fmtTime(e.timestamp)}</span>
                  </div>
                  <div className="kc-w-notif-msg">{e.message}</div>
                  {e.detail && <div className="kc-w-notif-detail">{e.detail}</div>}
                </div>
              </div>
            ))
          )
        ) : (
          actions.length === 0 ? (
            <div className="kc-w-empty-hint">Nessuna azione registrata</div>
          ) : (
            actions.map((a) => (
              <div key={a.id} className="kc-w-notif-row" style={{ opacity: a.undone ? 0.5 : 1 }}>
                <div className="kc-w-notif-icon" style={{ color: a.reversible ? '#a9c9ff' : 'rgba(255,255,255,0.4)' }}>
                  {a.reversible ? 'undo' : '-'}
                </div>
                <div className="kc-w-notif-body">
                  <div className="kc-w-notif-top">
                    <span className="kc-w-notif-source">{SOURCE_LABEL[a.source] || a.source} - {a.category}</span>
                    <span className="kc-w-notif-time">{fmtTime(a.ts)}</span>
                  </div>
                  <div className="kc-w-notif-msg">{a.label}</div>
                  {a.reversible && !a.undone && (
                    <button
                      style={{
                        marginTop: 4, padding: '3px 10px', fontSize: '0.66rem',
                        background: 'rgba(169,201,255,0.1)', border: '1px solid rgba(169,201,255,0.35)',
                        color: 'rgba(169,201,255,0.9)', borderRadius: 4, cursor: 'pointer',
                      }}
                      disabled={undoBusy === a.id}
                      onClick={() => void undo(a.id)}
                      title={a.undoSpec?.description}
                    >
                      {undoBusy === a.id ? '...' : 'Annulla'}
                    </button>
                  )}
                  {a.undone && (
                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)' }}>
                      annullata {a.undoneAt && fmtTime(a.undoneAt)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )
        )}
      </div>

      <div className="kc-w-notif-footer">
        {tab === 'notif'
          ? `${entries.length} azioni registrate - aggiornamento ogni 5s`
          : `${actions.length} azioni - ${actions.filter((a) => a.reversible && !a.undone).length} annullabili`}
      </div>
      <WidgetCardMenu {...cardMenu.props} />
    </div>
  );
}
