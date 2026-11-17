import { USER_NAME } from '../config/user';
import { useEffect, useMemo, useState } from 'react';
import type { Conversation } from '../types/chat';

export type SidebarView =
  | 'canvas' | 'settings' | 'memory' | 'mind' | 'forge'
  | 'chat' | 'voice' | 'agents' | 'models';

// ─── SVG icons per voce nav ────────────────────────────────────────────────────
function IconCanvas({ active }: { active: boolean }) {
  const c = active ? '#a9c9ff' : 'rgba(255,255,255,0.32)';
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.4" y="3.6" width="15.2" height="12.8" rx="2" stroke={c} strokeWidth="1.4" />
      <circle cx="10" cy="10" r="2" fill={c} fillOpacity="0.9" />
      <rect x="4.5" y="5.5" width="3.6" height="2.6" rx="0.6" stroke={c} strokeWidth="1" strokeOpacity="0.6" />
      <rect x="12" y="11.6" width="3.6" height="2.6" rx="0.6" stroke={c} strokeWidth="1" strokeOpacity="0.6" />
    </svg>
  );
}

function IconMemory({ active }: { active: boolean }) {
  const c = active ? '#a9c9ff' : 'rgba(255,255,255,0.32)';
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <ellipse cx="10" cy="10" rx="7.5" ry="4" stroke={c} strokeWidth="1.4" />
      <path d="M2.5 10v4c0 2.2 3.36 4 7.5 4s7.5-1.8 7.5-4v-4" stroke={c} strokeWidth="1.4" />
      <path d="M2.5 10v-4" stroke={c} strokeWidth="1.4" strokeOpacity="0.4" />
    </svg>
  );
}

function IconSettings({ active }: { active: boolean }) {
  const c = active ? '#a9c9ff' : 'rgba(255,255,255,0.32)';
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="2.6" stroke={c} strokeWidth="1.4" />
      <path d="M10 2v1.8M10 16.2V18M2 10h1.8M16.2 10H18M4.1 4.1l1.27 1.27M14.63 14.63l1.27 1.27M15.9 4.1l-1.27 1.27M5.37 14.63l-1.27 1.27" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconEngine({ active }: { active: boolean }) {
  const c = active ? '#a78bfa' : 'rgba(255,255,255,0.22)';
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6" stroke={c} strokeWidth="1.4" />
      <circle cx="10" cy="10" r="2" stroke={c} strokeWidth="1.4" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.6 3.6l1.4 1.4M15 15l1.4 1.4M16.4 3.6L15 5M5 15l-1.4 1.4" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.55" />
    </svg>
  );
}

function IconMind({ active }: { active: boolean }) {
  const c = active ? '#a9c9ff' : 'rgba(255,255,255,0.32)';
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="1.6" fill={c} />
      <circle cx="10" cy="10" r="7" stroke={c} strokeWidth="1.1" strokeOpacity="0.4" />
      <circle cx="4.6" cy="7.2" r="1.1" fill={c} fillOpacity="0.85" />
      <circle cx="15.2" cy="8.4" r="1.1" fill={c} fillOpacity="0.85" />
      <circle cx="12.6" cy="15" r="1.1" fill={c} fillOpacity="0.85" />
      <circle cx="6" cy="14.2" r="0.9" fill={c} fillOpacity="0.7" />
      <path d="M10 10L4.6 7.2M10 10l5.2-1.6M10 10l2.6 5M10 10l-4 4.2" stroke={c} strokeWidth="0.8" strokeOpacity="0.35" />
    </svg>
  );
}

function IconForge({ active }: { active: boolean }) {
  const c = active ? '#a78bfa' : 'rgba(255,255,255,0.22)';
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7 6l-3.5 4L7 14" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6l3.5 4L13 14" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 4.5l-2 11" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6" />
    </svg>
  );
}

const ICON_MAP: Record<string, (active: boolean) => React.ReactNode> = {
  canvas:   (a) => <IconCanvas active={a} />,
  memory:   (a) => <IconMemory active={a} />,
  mind:     (a) => <IconMind active={a} />,
  settings: (a) => <IconSettings active={a} />,
  agents:   (a) => <IconEngine active={a} />,
  forge:    (a) => <IconForge active={a} />,
};

const PRIMARY_NAV = [
  { id: 'canvas'   as const, label: 'Canvas' },
  { id: 'mind'     as const, label: 'La Mente' },
  { id: 'memory'   as const, label: 'Memoria' },
  { id: 'settings' as const, label: 'Impostazioni' },
];

const DEV_NAV = [
  { id: 'forge'    as const, label: 'Officina' },
  { id: 'agents'   as const, label: 'Engine Room' },
];

export function Sidebar(props: {
  conversations: Conversation[];
  temporaryConversation: Conversation | null;
  activeId: string;
  view: SidebarView;
  collapsed: boolean;
  hideOnMobile: boolean;
  mobileOpen: boolean;
  peek?: boolean;
  peekVisible?: boolean;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onTemporaryChat: () => void;
  onDeleteConversation: (id: string) => void;
  onPinConversation?: (id: string) => void;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onChangeView: (view: SidebarView) => void;
}) {
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState('');
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [engineSummary, setEngineSummary] = useState<{ active: number; pending: number }>({ active: 0, pending: 0 });

  // Polla lo stato Engine Room ogni 30s per mostrare contatore in sidebar
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch('/api/agents/jobs?limit=50');
        if (!r.ok || cancelled) return;
        const j = await r.json() as { jobs?: Array<{ status: string }> };
        const jobs = j.jobs || [];
        const active = jobs.filter((x) => ['running', 'planned', 'waiting_opencode', 'handoff_ready', 'plan_ready', 'waiting_patch'].includes(x.status)).length;
        const pending = jobs.filter((x) => ['waiting_approval', 'waiting_human', 'needs_human'].includes(x.status)).length;
        if (!cancelled) setEngineSummary({ active, pending });
      } catch { /* offline */ }
    }
    void tick();
    const id = window.setInterval(tick, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? props.conversations.filter((c) => `${c.title} ${c.messages.map((m) => m.content).join(' ')}`.toLowerCase().includes(q))
      : props.conversations;
    return [...base].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [props.conversations, query]);

  function changeView(v: SidebarView) {
    props.onChangeView(v);
    props.onCloseMobile();
  }

  const inChat = props.view === 'chat';

  const isActive = (id: SidebarView) => props.view === id;

  return (
    <>
      {/* Mobile backdrop */}
      {props.mobileOpen && !props.hideOnMobile && (
        <button className="fixed inset-0 z-40 md:hidden" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={props.onCloseMobile} aria-label="Chiudi" />
      )}

      <aside
        data-kc-sidebar
        className={`fixed inset-y-0 left-0 z-50 flex flex-col md:z-40 md:translate-x-0 ${props.hideOnMobile ? 'hidden md:flex' : ''} ${props.mobileOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform md:transition-[width,transform] duration-300`}
        style={{
          width: props.peek ? '16rem' : (props.collapsed ? '3.25rem' : '16rem'),
          background: 'rgba(4,8,18,0.97)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)',
          paddingTop: 'var(--kc-titlebar-h, 0px)',
          // In peek mode: nascondi traslando fuori, mostra solo on hover
          transform: props.peek
            ? (props.peekVisible ? 'translateX(0)' : 'translateX(-100%)')
            : undefined,
          boxShadow: props.peek && props.peekVisible
            ? '12px 0 32px -8px rgba(0,0,0,0.6)'
            : undefined,
        }}
      >
        {/* Brand */}
        <div
          className="flex shrink-0 items-center border-b"
          style={{ padding: props.collapsed ? '14px 6px' : '16px 18px', borderColor: 'rgba(255,255,255,0.06)', justifyContent: props.collapsed ? 'center' : 'space-between' }}
        >
          <button onClick={() => changeView('canvas')} className="text-left">
            {props.collapsed ? (
              <span style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.1em', color: '#a9c9ff' }}>K</span>
            ) : (
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.55em', color: 'rgba(255,255,255,0.88)', textTransform: 'uppercase' }}>KIRA</div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', marginTop: 1, letterSpacing: '0.1em' }}>AI OS - {USER_NAME}</div>
              </div>
            )}
          </button>
          <button
            className="hidden md:flex items-center justify-center transition rounded-lg"
            onClick={props.onToggleCollapse}
            style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
          >
            {props.collapsed ? '>' : '<'}
          </button>
        </div>

        {/* Primary Nav */}
        <nav className="shrink-0" style={{ padding: '10px 8px 4px' }}>
          {PRIMARY_NAV.map((item) => {
            const active = isActive(item.id);
            const hovered = hoveredNav === item.id;
            return (
              <div key={item.id} className="relative" style={{ marginBottom: 2 }}>
                {/* Gold left border for active state */}
                {active && (
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '20%',
                      bottom: '20%',
                      width: 2.5,
                      borderRadius: 2,
                      background: 'linear-gradient(to bottom, #a9c9ff, #0891b2)',
                      boxShadow: '0 0 6px rgba(169,201,255,0.5)',
                    }}
                  />
                )}
                {/* Tooltip for collapsed mode */}
                {props.collapsed && hovered && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '110%',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'rgba(10,15,30,0.96)',
                      border: '1px solid rgba(169,201,255,0.18)',
                      borderRadius: 8,
                      padding: '5px 10px',
                      fontSize: '0.72rem',
                      color: 'rgba(255,255,255,0.82)',
                      whiteSpace: 'nowrap',
                      zIndex: 200,
                      pointerEvents: 'none',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    }}
                  >
                    {item.label}
                  </div>
                )}
                <button
                  onClick={() => changeView(item.id)}
                  onMouseEnter={() => setHoveredNav(item.id)}
                  onMouseLeave={() => setHoveredNav(null)}
                  className="flex w-full items-center rounded-xl transition-all"
                  style={{
                    gap: 9,
                    padding: props.collapsed ? '8px 0' : '8px 12px 8px 14px',
                    justifyContent: props.collapsed ? 'center' : 'flex-start',
                    // Radial glow for active state
                    background: active
                      ? 'radial-gradient(ellipse at left center, rgba(169,201,255,0.09) 0%, rgba(169,201,255,0.03) 60%, transparent 100%)'
                      : hovered
                        ? 'rgba(255,255,255,0.04)'
                        : 'transparent',
                    border: active
                      ? '1px solid rgba(169,201,255,0.12)'
                      : hovered
                        ? '1px solid rgba(255,255,255,0.06)'
                        : '1px solid transparent',
                    // Micro-scale on hover
                    transform: hovered && !active ? 'scale(1.015)' : 'scale(1)',
                    opacity: hovered || active ? 1 : 0.85,
                    transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.15s ease, opacity 0.2s ease',
                  }}
                >
                  {/* SVG icon */}
                  <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {ICON_MAP[item.id]?.(active)}
                  </span>
                  {!props.collapsed && (
                    <span
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? '#a9c9ff' : 'rgba(255,255,255,0.5)',
                        letterSpacing: active ? '0.02em' : undefined,
                        transition: 'color 0.2s ease',
                      }}
                    >
                      {item.label}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        {/* Divider */}
        <div style={{ height: 1, margin: '4px 10px', background: 'rgba(255,255,255,0.05)' }} />

        {/* Chat history */}
        {!props.collapsed && (inChat || props.conversations.length > 0) ? (
          <div className="flex min-h-0 flex-1 flex-col" style={{ padding: '8px 10px 10px', gap: 6 }}>
            {/* Search + New */}
            <div className="flex gap-1.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca chat..."
                style={{
                  flex: 1, fontSize: '0.75rem', padding: '6px 10px', borderRadius: '0.75rem',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.65)', outline: 'none',
                }}
              />
              <button
                onClick={() => { props.onNewChat(); props.onCloseMobile(); }}
                style={{ padding: '6px 10px', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
              >+</button>
            </div>

            {/* Section label */}
            <div style={{ fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', paddingLeft: 2 }}>Cronologia</div>

            {/* List */}
            <div className="min-h-0 flex-1 overflow-y-auto" style={{ gap: 2, display: 'flex', flexDirection: 'column' }}>
              {props.temporaryConversation && (
                <HistoryItem
                  conversation={props.temporaryConversation}
                  active={props.activeId === props.temporaryConversation.id}
                  temporary
                  onSelect={() => changeView('chat')}
                />
              )}
              {filteredConversations.length === 0 && !props.temporaryConversation && (
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '16px 0' }}>Nessuna conversazione</div>
              )}
              {filteredConversations.map((c) => (
                <HistoryItem
                  key={c.id}
                  conversation={c}
                  active={c.id === props.activeId}
                  confirmDelete={pendingDelete === c.id}
                  onSelect={() => { changeView('chat'); props.onSelectConversation(c.id); }}
                  onDelete={() => {
                    if (pendingDelete === c.id) { props.onDeleteConversation(c.id); setPendingDelete(''); }
                    else { setPendingDelete(c.id); window.setTimeout(() => setPendingDelete((cur) => cur === c.id ? '' : cur), 1800); }
                  }}
                  onPin={props.onPinConversation ? () => props.onPinConversation!(c.id) : undefined}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Dev mode nav, in fondo e piccolo. */}
        <div style={{ padding: '4px 8px 6px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {DEV_NAV.map((item) => {
            const active = props.view === item.id;
            const hovered = hoveredNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => changeView(item.id)}
                onMouseEnter={() => setHoveredNav(item.id)}
                onMouseLeave={() => setHoveredNav(null)}
                className="flex w-full items-center rounded-lg transition-all"
                style={{
                  gap: 8,
                  padding: props.collapsed ? '6px 0' : '6px 10px 6px 12px',
                  justifyContent: props.collapsed ? 'center' : 'flex-start',
                  background: active ? 'rgba(167,139,250,0.08)' : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                  border: active ? '1px solid rgba(167,139,250,0.12)' : '1px solid transparent',
                  opacity: hovered || active ? 1 : 0.6,
                  transition: 'background 0.2s ease, opacity 0.2s ease',
                }}
                title={props.collapsed ? item.label : undefined}
              >
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  {ICON_MAP[item.id]?.(active)}
                </span>
                {!props.collapsed && (
                  <>
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: active ? '#a78bfa' : 'rgba(255,255,255,0.35)', letterSpacing: '0.02em' }}>
                      {item.label}
                    </span>
                    {(engineSummary.active > 0 || engineSummary.pending > 0) && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: '0.58rem',
                          fontFamily: 'ui-monospace, monospace',
                          color: engineSummary.pending > 0 ? '#fbbf24' : '#a78bfa',
                          padding: '1px 6px',
                          borderRadius: 8,
                          background: engineSummary.pending > 0 ? 'rgba(251,191,36,0.08)' : 'rgba(167,139,250,0.08)',
                          border: `1px solid ${engineSummary.pending > 0 ? 'rgba(251,191,36,0.25)' : 'rgba(167,139,250,0.2)'}`,
                        }}
                        title={`${engineSummary.active} job attivi, ${engineSummary.pending} in attesa`}
                      >
                        {engineSummary.active}
                        {engineSummary.pending > 0 && <span style={{ color: '#fbbf24' }}>-{engineSummary.pending}</span>}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}

// History item.

function HistoryItem(props: {
  conversation: Conversation;
  active: boolean;
  temporary?: boolean;
  confirmDelete?: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onPin?: () => void;
}) {
  const preview = props.conversation.messages.find((m) => m.content.trim())?.content || 'Nessun messaggio';

  return (
    <div
      className="group flex items-center gap-1.5 rounded-xl cursor-pointer transition-all"
      style={{
        padding: '7px 8px',
        background: props.active ? 'rgba(125,211,252,0.08)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${props.active ? 'rgba(125,211,252,0.14)' : 'rgba(255,255,255,0.04)'}`,
        marginBottom: 1,
      }}
      onMouseEnter={(e) => { if (!props.active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={(e) => { if (!props.active) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
    >
      <button className="min-w-0 flex-1 text-left" onClick={props.onSelect}>
        <div className="flex items-center gap-1" style={{ overflow: 'hidden' }}>
          {props.conversation.pinned && <span style={{ fontSize: '0.5rem', color: '#fcd34d', flexShrink: 0 }}>PIN</span>}
          <span style={{ fontSize: '0.75rem', color: props.active ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: props.active ? 500 : 400 }}>
            {props.conversation.title}
          </span>
        </div>
        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.22)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {props.temporary ? 'Non salvata' : preview}
        </div>
      </button>

      {/* Pin button */}
      {props.onPin && !props.temporary && (
        <button
          className="opacity-0 group-hover:opacity-100 transition"
          onClick={props.onPin}
          title={props.conversation.pinned ? 'Sblocca' : 'Fissa'}
          style={{ fontSize: '0.62rem', color: props.conversation.pinned ? '#fcd34d' : 'rgba(255,255,255,0.3)', flexShrink: 0, padding: '2px 4px', borderRadius: 4 }}
        >
          {props.conversation.pinned ? 'PIN' : 'pin'}
        </button>
      )}

      {/* Delete */}
      {props.onDelete && !props.temporary && (
        <button
          className="opacity-0 group-hover:opacity-100 transition"
          onClick={props.onDelete}
          title={props.confirmDelete ? 'Conferma eliminazione' : 'Elimina'}
          style={{ fontSize: '0.62rem', color: props.confirmDelete ? '#f87171' : 'rgba(255,255,255,0.2)', flexShrink: 0, padding: '2px 4px', borderRadius: 4 }}
        >
          x
        </button>
      )}
    </div>
  );
}
