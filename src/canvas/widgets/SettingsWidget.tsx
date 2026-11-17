import { useCallback, useEffect, useState } from 'react';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';

interface Field {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  hint?: string;
  current?: string;
}

interface IntegrationStatus {
  id: string;
  label: string;
  description: string;
  ok: boolean;
  missing: string[];
  fields: Field[];
  docsUrl?: string;
  oauthFlow?: boolean;
}

const STATUS_ICONS: Record<string, string> = {
  weather: '🌤️',
  hass: '🏠',
  google: '✉️',
  maps: '🗺️',
  discord: '💬',
};

interface QuietConfig {
  enabled: boolean;
  start: string;
  end: string;
  now: boolean;
}

export function SettingsWidget() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [quiet, setQuiet] = useState<QuietConfig | null>(null);
  const [quietSaving, setQuietSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/setup/status');
      if (!r.ok) throw new Error('settings offline');
      const data = await r.json() as IntegrationStatus[];
      setIntegrations(data);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, []);

  const loadQuiet = useCallback(async () => {
    try {
      const r = await fetch('/api/system/quiet-hours');
      if (r.ok) setQuiet(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); void loadQuiet(); }, [load, loadQuiet]);

  const saveQuiet = async (patch: Partial<QuietConfig>) => {
    setQuietSaving(true);
    try {
      const r = await fetch('/api/system/quiet-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (r.ok) setQuiet(await r.json());
    } catch { /* ignore */ } finally { setQuietSaving(false); }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const setDraft = (intId: string, key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [intId]: { ...(prev[intId] || {}), [key]: value } }));
  };

  const save = async (intId: string) => {
    const updates = drafts[intId];
    if (!updates || Object.keys(updates).length === 0) return;
    // Strip masked values (***) — they mean "unchanged"
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v && v !== '***' && v.trim() !== '') filtered[k] = v.trim();
    }
    if (Object.keys(filtered).length === 0) {
      setFeedback({ id: intId, ok: false, msg: 'Nessuna modifica da salvare' });
      return;
    }
    setSaving(intId);
    try {
      const r = await fetch('/api/setup/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filtered),
      });
      const j = await r.json() as { ok: boolean; error?: string };
      if (j.ok) {
        setFeedback({ id: intId, ok: true, msg: 'Salvato — riavvia Kira per applicare alcune integrazioni' });
        setDrafts((prev) => { const next = { ...prev }; delete next[intId]; return next; });
        await load();
      } else {
        setFeedback({ id: intId, ok: false, msg: j.error || 'Errore salvataggio' });
      }
    } catch {
      setFeedback({ id: intId, ok: false, msg: 'Errore di rete' });
    } finally {
      setSaving(null);
      window.setTimeout(() => setFeedback(null), 5000);
    }
  };

  const startGoogleOAuth = () => {
    window.open('/api/setup/google/auth-url', '_blank');
  };

  if (status === 'loading') return <WidgetSpinner label="Caricamento settings…" fullHeight />;
  if (status === 'error') return <WidgetError message="Settings non disponibili" onRetry={() => { setStatus('loading'); void load(); void loadQuiet(); }} />;

  const okCount = integrations.filter((i) => i.ok).length;

  return (
    <div className="kc-w-settings">
      <header className="kc-w-settings-header">
        <span className="kc-w-settings-title">Integrazioni</span>
        <span className="kc-w-settings-stats">
          {okCount}/{integrations.length} attive
        </span>
      </header>

      {quiet && (
        <div className={`kc-w-settings-quiet ${quiet.now ? 'kc-w-settings-quiet-active' : ''}`}>
          <div className="kc-w-settings-quiet-head">
            <span className="kc-w-settings-quiet-title">
              {quiet.now ? '🌙 Quiet hours attivi' : '☀ Quiet hours'}
            </span>
            <label className="kc-w-settings-quiet-toggle">
              <input
                type="checkbox"
                checked={quiet.enabled}
                disabled={quietSaving}
                onChange={(e) => void saveQuiet({ enabled: e.target.checked })}
              />
              <span>{quiet.enabled ? 'on' : 'off'}</span>
            </label>
          </div>
          <div className="kc-w-settings-quiet-times">
            <label>
              <span>Da</span>
              <input
                type="time"
                value={quiet.start}
                disabled={quietSaving || !quiet.enabled}
                onChange={(e) => void saveQuiet({ start: e.target.value })}
              />
            </label>
            <label>
              <span>A</span>
              <input
                type="time"
                value={quiet.end}
                disabled={quietSaving || !quiet.enabled}
                onChange={(e) => void saveQuiet({ end: e.target.value })}
              />
            </label>
          </div>
          <p className="kc-w-settings-quiet-hint">
            Durante le quiet hours: niente TTS, niente ping di notifica. I log restano visibili nel widget Notifiche.
          </p>
        </div>
      )}

      <SystemRestartBlock />

      <KiraUpdateBlock />

      <VoiceGreetingBlock />

      <div className="kc-w-settings-list">
        {integrations.map((intg) => {
          const open = expanded.has(intg.id);
          const draft = drafts[intg.id] || {};
          const hasChanges = Object.values(draft).some((v) => v && v !== '***');
          const isSaving = saving === intg.id;
          const fb = feedback?.id === intg.id ? feedback : null;
          const icon = STATUS_ICONS[intg.id] || '◯';
          return (
            <div key={intg.id} className={`kc-w-settings-card kc-w-settings-card-${intg.ok ? 'ok' : 'missing'}`}>
              <button className="kc-w-settings-card-head" onClick={() => toggle(intg.id)}>
                <span className="kc-w-settings-card-icon">{icon}</span>
                <div className="kc-w-settings-card-info">
                  <span className="kc-w-settings-card-label">{intg.label}</span>
                  <span className="kc-w-settings-card-desc">{intg.description}</span>
                </div>
                <span className={`kc-w-settings-card-status kc-w-settings-card-status-${intg.ok ? 'ok' : 'missing'}`}>
                  {intg.ok ? '✓' : '✗'}
                </span>
              </button>

              {open && (
                <div className="kc-w-settings-card-body">
                  {!intg.ok && intg.missing.length > 0 && (
                    <div className="kc-w-settings-missing">
                      <strong>Mancano:</strong>
                      <ul>
                        {intg.missing.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}

                  {intg.fields.map((f) => (
                    <label key={f.key} className="kc-w-settings-field">
                      <span className="kc-w-settings-field-label">{f.label}</span>
                      <input
                        type={f.type === 'password' ? 'password' : 'text'}
                        className="kc-w-settings-field-input"
                        defaultValue={f.current || ''}
                        placeholder={f.hint || ''}
                        onChange={(e) => setDraft(intg.id, f.key, e.target.value)}
                      />
                      {f.hint && <span className="kc-w-settings-field-hint">{f.hint}</span>}
                    </label>
                  ))}

                  <div className="kc-w-settings-card-actions">
                    {intg.oauthFlow && (
                      <button
                        type="button"
                        className="kc-w-settings-btn kc-w-settings-btn-secondary"
                        onClick={startGoogleOAuth}
                      >
                        🔐 Autorizza Google
                      </button>
                    )}
                    {intg.docsUrl && (
                      <a
                        href={intg.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="kc-w-settings-btn kc-w-settings-btn-link"
                      >
                        ↗ Documentazione
                      </a>
                    )}
                    <button
                      type="button"
                      className="kc-w-settings-btn kc-w-settings-btn-primary"
                      onClick={() => void save(intg.id)}
                      disabled={!hasChanges || isSaving}
                    >
                      {isSaving ? '…' : 'Salva'}
                    </button>
                  </div>

                  {fb && (
                    <div className={`kc-w-settings-feedback kc-w-settings-feedback-${fb.ok ? 'ok' : 'err'}`}>
                      {fb.msg}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <footer className="kc-w-settings-foot">
        <span>I valori scritti sono salvati nel .env</span>
        <button className="kc-w-settings-btn-refresh" onClick={() => void load()} title="Ricarica stato">↻</button>
      </footer>
    </div>
  );
}

interface EvolveStatusDto {
  running: boolean;
  pid: number | null;
  stopRequested: boolean;
  patches: number;
  logTail: string;
  reportTail: string;
}

// Kira Update — auto-miglioramento: come Windows Update,
// lo lanci e lavora da solo in un worktree isolato senza toccare la Kira in uso.
function KiraUpdateBlock() {
  const [st, setSt] = useState<EvolveStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/evolve/status');
      if (r.ok) setSt(await r.json());
    } catch { /* server offline: lo stato resta com'era */ }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), st?.running ? 5000 : 20000);
    return () => window.clearInterval(id);
  }, [refresh, st?.running]);

  const act = async (path: string, body?: object) => {
    setBusy(true);
    try {
      await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <div className="kc-w-settings-system">
      <div className="kc-w-settings-system-head">
        <span className="kc-w-settings-system-title">✦ Kira Update</span>
        {st && (
          <span className={`kc-w-settings-evolve-state ${st.running ? 'kc-w-settings-evolve-on' : ''}`}>
            {st.running ? (st.stopRequested ? 'in arresto…' : '● in evoluzione') : '○ ferma'}
            {st.patches > 0 ? ` · ${st.patches} proposte` : ''}
          </span>
        )}
      </div>
      <div className="kc-w-settings-evolve-actions">
        <button
          type="button"
          className="kc-w-settings-restart-btn"
          onClick={() => void act('/api/evolve/start')}
          disabled={busy || !!st?.running}
        >
          ▶ Avvia evoluzione
        </button>
        <button
          type="button"
          className="kc-w-settings-restart-btn"
          onClick={() => void act('/api/evolve/start', { once: true })}
          disabled={busy || !!st?.running}
        >
          ① Un ciclo solo
        </button>
        <button
          type="button"
          className="kc-w-settings-restart-btn"
          onClick={() => void act('/api/evolve/stop')}
          disabled={busy || !st?.running}
        >
          ◼ Ferma
        </button>
      </div>
      <p className="kc-w-settings-system-hint">
        Migliora il codice di Kira in loop con i modelli locali (gratis, anche a token esauriti),
        in un worktree git isolato: la Kira in uso non viene MAI toccata. Le proposte finiscono
        sul branch evolve/auto — niente merge automatico.
      </p>
      {st && (st.reportTail || st.logTail) && (
        <>
          <button
            type="button"
            className="kc-w-settings-btn kc-w-settings-btn-link"
            onClick={() => setShowReport((v) => !v)}
          >
            {showReport ? '▾ Nascondi report' : '▸ Report e log'}
          </button>
          {showReport && (
            <pre className="kc-w-settings-evolve-report">
              {(st.reportTail ? `— REPORT —\n${st.reportTail}\n\n` : '') + (st.logTail ? `— LOG —\n${st.logTail}` : '')}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

// Voce di Kira — saluto al boot
// (file in public/voice/kira-greeting.wav).
function VoiceGreetingBlock() {
  const [on, setOn] = useState(() => localStorage.getItem('kira-voice-greeting') !== '0');

  const toggle = (v: boolean) => {
    setOn(v);
    localStorage.setItem('kira-voice-greeting', v ? '1' : '0');
  };

  const preview = () => {
    try {
      const a = new Audio('/voice/kira-greeting.wav');
      a.volume = 0.9;
      void a.play().catch(() => { /* autoplay */ });
    } catch { /* no audio */ }
  };

  return (
    <div className="kc-w-settings-system">
      <div className="kc-w-settings-system-head">
        <span className="kc-w-settings-system-title">✧ Voce di Kira</span>
        <span className="kc-w-settings-evolve-state">{on ? 'saluto attivo' : 'silenzioso'}</span>
      </div>
      <div className="kc-w-settings-evolve-actions">
        <button
          type="button"
          className="kc-w-settings-restart-btn"
          onClick={() => toggle(!on)}
        >
          {on ? '✦ Disattiva saluto' : '✦ Attiva saluto'}
        </button>
        <button type="button" className="kc-w-settings-restart-btn" onClick={preview}>
          ▶ Ascolta
        </button>
      </div>
      <p className="kc-w-settings-system-hint">
        All'avvio Kira ti saluta con la sua voce vera (timbro lounge scelto, ×1.5).
        La chat parla con Piper/Kokoro locali per la bassa latenza.
      </p>
    </div>
  );
}

function SystemRestartBlock() {
  const [phase, setPhase] = useState<'idle' | 'requested' | 'waiting' | 'online' | 'timeout'>('idle');
  const [error, setError] = useState('');
  const [ollama, setOllama] = useState<{ installed?: string[]; missing?: string[]; totalSizeGb?: string; ok?: boolean; message?: string } | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    fetch('/api/system/ollama-status').then((r) => r.json()).then(setOllama).catch(() => null);
  }, []);

  const installModels = useCallback(async () => {
    setInstalling(true);
    try {
      await fetch('/api/system/install-ollama-models', { method: 'POST' });
      // Refresh status dopo 30s
      setTimeout(() => {
        fetch('/api/system/ollama-status').then((r) => r.json()).then(setOllama).catch(() => null);
      }, 30_000);
    } finally {
      setInstalling(false);
    }
  }, []);

  const restart = useCallback(async () => {
    if (phase === 'requested' || phase === 'waiting') return;
    setError('');
    setPhase('requested');
    try {
      const r = await fetch('/api/system/restart', { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPhase('waiting');

      // Poll /api/system/status finché il server torna online (max 30s)
      const deadline = Date.now() + 30_000;
      let attempts = 0;
      const tick = async () => {
        attempts += 1;
        if (Date.now() > deadline) {
          setPhase('timeout');
          return;
        }
        try {
          const probe = await fetch('/api/system/status', { cache: 'no-store', signal: AbortSignal.timeout(1500) });
          if (probe.ok) {
            setPhase('online');
            setTimeout(() => setPhase('idle'), 4000);
            return;
          }
        } catch { /* ancora down */ }
        setTimeout(() => void tick(), attempts < 5 ? 800 : 1500);
      };
      setTimeout(() => void tick(), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore');
      setPhase('idle');
    }
  }, [phase]);

  const label = phase === 'requested' ? 'Invio richiesta…'
    : phase === 'waiting' ? 'Server in restart…'
    : phase === 'online' ? '✓ Kira online'
    : phase === 'timeout' ? '⚠ Timeout — controlla launcher'
    : '🔄 Riavvia Kira';

  const busy = phase === 'requested' || phase === 'waiting';

  return (
    <div className="kc-w-settings-system">
      <div className="kc-w-settings-system-head">
        <span className="kc-w-settings-system-title">⚙ Sistema</span>
      </div>
      <button
        type="button"
        className={`kc-w-settings-restart-btn ${busy ? 'kc-w-settings-restart-busy' : ''}`}
        onClick={() => void restart()}
        disabled={busy}
      >
        {label}
      </button>
      <p className="kc-w-settings-system-hint">
        Termina il server e lo rilancia in background (npm run dev). Utile dopo cambi a .env o riavvio Ollama.
      </p>
      {error && <div className="kc-w-settings-feedback kc-w-settings-feedback-err">{error}</div>}

      {/* Ollama models manager */}
      <div className="kc-w-settings-ollama">
        <div className="kc-w-settings-ollama-head">
          <span>🦙 Ollama</span>
          {ollama?.ok && (
            <span className="kc-w-settings-ollama-stat">
              {ollama.installed?.length || 0} modelli · {ollama.totalSizeGb} GB
            </span>
          )}
        </div>
        {!ollama?.ok && (
          <div className="kc-w-settings-feedback kc-w-settings-feedback-err">
            Ollama non raggiungibile. Verifica che ollama.exe sia in esecuzione.
          </div>
        )}
        {ollama?.ok && ollama.missing && ollama.missing.length > 0 && (
          <>
            <div className="kc-w-settings-ollama-missing">
              Modelli mancanti: <strong>{ollama.missing.join(', ')}</strong>
            </div>
            <button
              type="button"
              className="kc-w-settings-restart-btn"
              onClick={() => void installModels()}
              disabled={installing}
            >
              {installing ? '⏳ Installazione avviata…' : '⬇ Installa modelli mancanti'}
            </button>
            <p className="kc-w-settings-system-hint">
              Lancia uno script PowerShell che fa "ollama pull" usando il path assoluto
              (non richiede ollama nel PATH). Tempo stimato: 10-15 min.
            </p>
          </>
        )}
        {ollama?.ok && (!ollama.missing || ollama.missing.length === 0) && (
          <div className="kc-w-settings-ollama-ok">✓ Tutti i modelli richiesti sono installati.</div>
        )}
      </div>
    </div>
  );
}
