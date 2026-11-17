import { useEffect, useState, useCallback } from 'react';

interface PermissionEntry {
  actionId: string;
  tier: 'auto' | 'notify' | 'confirm';
  isOverride: boolean;
  reason?: string;
}

const TIER_COLOR = {
  auto:    '#4ade80',
  notify:  '#a9c9ff',
  confirm: '#f87171',
};

const TIER_LABEL = {
  auto:    'automatico',
  notify:  'notifica',
  confirm: 'conferma',
};

const TIER_ICON = {
  auto:    '⚡',
  notify:  '🔔',
  confirm: '🛑',
};

const GROUP_LABELS: Record<string, string> = {
  pc: 'PC Control',
  memory: 'Memoria',
  notes: 'Note',
  agent: 'Agenti',
  system: 'Sistema',
};

interface AuditEntry {
  ts: string;
  actionId: string;
  tier: 'auto' | 'notify' | 'confirm';
  source: 'default' | 'override';
  actor?: string;
  outcome?: string;
  context?: Record<string, unknown>;
}

export function PermissionsWidget() {
  const [perms, setPerms] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [tab, setTab] = useState<'rules' | 'audit'>('rules');
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const r = await fetch('/api/permissions/audit/log?limit=200');
      const j = await r.json() as { ok: boolean; entries?: AuditEntry[] };
      setAudit(j.entries ?? []);
    } catch { /* noop */ } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'audit') return;
    void loadAudit();
    const t = window.setInterval(() => void loadAudit(), 5000);
    return () => window.clearInterval(t);
  }, [tab, loadAudit]);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/permissions');
      const j = await r.json() as { ok: boolean; permissions?: PermissionEntry[] };
      setPerms(j.permissions ?? []);
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setTier = useCallback(async (actionId: string, tier: 'auto' | 'notify' | 'confirm') => {
    setSaving(actionId);
    try {
      await fetch(`/api/permissions/${encodeURIComponent(actionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      setPerms((prev) => prev.map((p) => p.actionId === actionId ? { ...p, tier, isOverride: true } : p));
    } catch { /* noop */ } finally {
      setSaving(null);
    }
  }, []);

  const resetTier = useCallback(async (actionId: string) => {
    setSaving(actionId);
    try {
      await fetch(`/api/permissions/${encodeURIComponent(actionId)}`, { method: 'DELETE' });
      void load();
    } catch { /* noop */ } finally {
      setSaving(null);
    }
  }, [load]);

  // Group by prefix (pc:, memory:, notes:, etc.)
  const groups = new Map<string, PermissionEntry[]>();
  for (const p of perms) {
    const prefix = p.actionId.split(':')[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(p);
  }

  const allGroups = ['all', ...Array.from(groups.keys())];

  const S = {
    label: { fontSize: '0.58rem', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.3)' },
    btn: (active: boolean, color: string) => ({
      padding: '2px 8px', borderRadius: 4, fontSize: '0.6rem', cursor: 'pointer',
      fontFamily: 'inherit', border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
      background: active ? `${color}22` : 'none',
      color: active ? color : 'rgba(255,255,255,0.45)',
      transition: 'all 0.12s',
    }),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,0,0,0.22)' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: '0.6rem', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
            Permission Layer · {perms.length} azioni
          </div>
          <button onClick={() => setTab('rules')} style={S.btn(tab === 'rules', '#a9c9ff')}>regole</button>
          <button onClick={() => setTab('audit')} style={S.btn(tab === 'audit', '#a78bfa')}>audit</button>
        </div>
        {tab === 'rules' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {allGroups.map((g) => (
              <button key={g} onClick={() => setFilter(g)} style={S.btn(filter === g, '#a9c9ff')}>
                {g === 'all' ? 'tutti' : (GROUP_LABELS[g] || g)}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'rules' && (
        <div style={{ display: 'flex', gap: 12, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
          {(['auto', 'notify', 'confirm'] as const).map((t) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: TIER_COLOR[t] }}>
              {TIER_ICON[t]} {TIER_LABEL[t]}
            </span>
          ))}
        </div>
      )}

      {/* Audit log view */}
      {tab === 'audit' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {auditLoading && audit.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>caricamento…</div>
          ) : audit.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>Nessuna voce di audit ancora registrata.</div>
          ) : (
            audit.map((e, idx) => {
              const date = new Date(e.ts);
              const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const outcomeColor = e.outcome === 'failed' || e.outcome === 'denied' ? '#f87171' : e.outcome === 'executed' || e.outcome === 'allowed' ? '#4ade80' : '#a78bfa';
              return (
                <div key={idx} style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.68rem', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 64, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{time}</span>
                  <span style={{ flex: 1, color: 'rgba(255,255,255,0.78)', fontFamily: 'monospace' }}>{e.actionId}</span>
                  <span style={{ color: TIER_COLOR[e.tier], minWidth: 18, textAlign: 'center' }} title={TIER_LABEL[e.tier]}>{TIER_ICON[e.tier]}</span>
                  {e.outcome && (
                    <span style={{ color: outcomeColor, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 64, textAlign: 'right' }}>{e.outcome}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* List */}
      {tab === 'rules' && (
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>caricamento…</div>
        ) : (
          Array.from(groups.entries())
            .filter(([g]) => filter === 'all' || filter === g)
            .map(([groupKey, items]) => (
              <div key={groupKey}>
                <div style={{ padding: '6px 14px 2px', fontSize: '0.55rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.02)' }}>
                  {GROUP_LABELS[groupKey] || groupKey}
                </div>
                {items.map((p) => {
                  const isSaving = saving === p.actionId;
                  const action = p.actionId.split(':').slice(1).join(':');
                  return (
                    <div key={p.actionId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ flex: 1, fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', fontFamily: 'monospace' }}>
                        {action}
                        {p.isOverride && <span style={{ marginLeft: 6, fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' }}>override</span>}
                      </span>
                      {(['auto', 'notify', 'confirm'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => void setTier(p.actionId, t)}
                          disabled={isSaving || p.tier === t}
                          style={{ ...S.btn(p.tier === t, TIER_COLOR[t]), minWidth: 28 }}
                          title={TIER_LABEL[t]}
                        >
                          {TIER_ICON[t]}
                        </button>
                      ))}
                      {p.isOverride && (
                        <button
                          onClick={() => void resetTier(p.actionId)}
                          disabled={isSaving}
                          style={{ ...S.btn(false, 'rgba(255,255,255,0.3)'), fontSize: '0.58rem' }}
                          title="ripristina default"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
        )}
      </div>
      )}

      <div style={{ padding: '6px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: '0.6rem', color: 'rgba(255,255,255,0.22)', lineHeight: 1.5 }}>
        ⚡ automatico · 🔔 notifica prima · 🛑 chiede conferma
      </div>
    </div>
  );
}
