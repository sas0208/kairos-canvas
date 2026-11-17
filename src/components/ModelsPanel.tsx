import { useEffect, useRef, useState } from 'react';
import { MODEL_PROFILES, getModelProfile } from '../config/models';
import type { OllamaModel } from '../types/ollama';
import type { KiraSettings } from '../types/settings';

const S = {
  section: { borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', padding: '18px 20px', display: 'flex', flexDirection: 'column' as const, gap: 12 },
  label: { fontSize: '0.58rem', letterSpacing: '0.26em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.28)' },
  value: { fontSize: '1.2rem', fontWeight: 300, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  sub: { fontSize: '0.74rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 },
  pill: { borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.035)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' as const },
  action: { padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.055)', fontSize: '0.72rem', color: 'rgba(255,255,255,0.62)', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, color 0.15s' },
};

type OllamaRuntime = {
  ok: boolean; latencyMs?: number; keepAlive?: string;
  installed?: Array<{ name: string; sizeGb: number; parameterSize?: string; quantization?: string }>;
  running?: Array<{ name: string; vramGb: number; expiresAt: string }>;
};

const RECOMMENDED: Array<{ name: string; size: string; use: string; priority: 'must' | 'upgrade' | 'optional'; cmd: string; reason: string }> = [
  { name: 'qwen3:8b',     size: '~5GB',   use: 'Chat / orchestrator', priority: 'must',    cmd: 'ollama pull qwen3:8b',     reason: 'Modello principale chat/orchestrator. Buon italiano, entra in 8GB VRAM.' },
  { name: 'qwen3-vl:8b',  size: '~6GB',   use: 'Visione camera (top)', priority: 'must',   cmd: 'ollama pull qwen3-vl:8b',  reason: 'Vision principale: molto piu\' intelligente di llava su scene reali e OCR.' },
  { name: 'bge-m3',       size: '~1.2GB', use: 'Memoria semantica',   priority: 'must',    cmd: 'ollama pull bge-m3',       reason: 'Embedding multilingue, nettamente migliore di nomic per l\'italiano.' },
  { name: 'phi4-mini:3.8b',size: '~2.5GB', use: 'Router veloce/voce', priority: 'must',    cmd: 'ollama pull phi4-mini:3.8b', reason: 'Phi-4 Mini: classifier/router rapido, ottimo per la voce.' },
  { name: 'qwen2.5-vl:7b',size: '~5GB',   use: 'Visione (fallback)',  priority: 'optional',cmd: 'ollama pull qwen2.5-vl:7b',reason: 'Fallback vision se qwen3-vl non e\' disponibile.' },
];

function modelMatches(installedName: string, targetId: string) {
  if (installedName === targetId) return true;
  if (installedName === `${targetId}:latest`) return true;
  if (targetId.endsWith(':latest') && installedName === targetId.replace(/:latest$/, '')) return true;
  return installedName.split(':')[0] === targetId.split(':')[0];
}

function isProfileInstalled(profileId: string, names: string[]) {
  return names.some((name) => modelMatches(name, profileId));
}

function verdictColor(verdict: string) {
  if (verdict === 'tieni') return 'rgba(74,222,128,0.78)';
  if (verdict === 'solo se serve') return 'rgba(251,191,36,0.82)';
  if (verdict === 'evita') return 'rgba(248,113,113,0.8)';
  return 'rgba(125,211,252,0.78)';
}

function shortResponseTime(value: string) {
  return value.split(';')[0].split(' per ')[0].split(',')[0].trim();
}

export function ModelsPanel(props: {
  settings: KiraSettings;
  localModels: OllamaModel[];
  onChange: (settings: KiraSettings) => void;
}) {
  const installedNames = props.localModels.map((m) => m.name);
  const selected = getModelProfile(props.settings.selectedModel);
  const [runtime, setRuntime] = useState<OllamaRuntime | null>(null);
  const [message, setMessage] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<string>('');
  // Poll del pull in un ref → si può fermare su unmount (evita leak + setState su
  // componente smontato se l'utente cambia view mentre un pull è in corso).
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function pullModel(modelName: string) {
    setPullingModel(modelName);
    setPullProgress('avvio...');
    try {
      const r = await fetch('/api/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      const d = await r.json() as { ok: boolean; pulling?: boolean; message?: string; error?: string };
      if (!d.ok) {
        setPullProgress(d.error || 'pull fallito');
        setTimeout(() => { setPullingModel(null); setPullProgress(''); }, 4000);
        return;
      }
      setPullProgress(d.message || 'pull avviato');

      // Poll status until completed
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch('/api/models/pull/status');
          const sd = await sr.json() as { pulling: boolean; model?: string; progress?: string; lastLine?: string };
          if (sd.pulling && sd.model === modelName) {
            setPullProgress(sd.progress || sd.lastLine || '...');
          } else if (!sd.pulling) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setPullProgress('completato');
            await refreshRuntime();
            setTimeout(() => { setPullingModel(null); setPullProgress(''); }, 3000);
          }
        } catch { /* ignore */ }
      }, 1500);
    } catch (e) {
      setPullProgress(e instanceof Error ? e.message : 'errore rete');
      setTimeout(() => { setPullingModel(null); setPullProgress(''); }, 4000);
    }
  }

  async function refreshRuntime() {
    const r = await fetch(`/api/models/ollama/status?endpoint=${encodeURIComponent(props.settings.endpoint)}`).catch(() => null);
    if (r?.ok) setRuntime(await r.json() as OllamaRuntime);
  }

  async function modelAction(action: 'warmup' | 'unload' | 'keep-alive', model: string, keepAlive?: string) {
    setActing(model + action);
    setMessage(action === 'warmup' ? 'Warmup...' : action === 'unload' ? 'Unload...' : 'Aggiorno keep_alive...');
    try {
      const ep = action === 'warmup' ? '/api/models/local/warmup' : action === 'unload' ? '/api/models/ollama/unload' : '/api/models/ollama/keep-alive';
      const body: Record<string, string> = { endpoint: props.settings.endpoint, model };
      if (keepAlive) body.keepAlive = keepAlive;
      const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({})) as { message?: string; error?: string };
      setMessage(r.ok ? (d.message || 'OK') : (d.error || 'Errore'));
      await refreshRuntime();
    } catch { setMessage('Errore connessione.'); }
    finally { setActing(null); }
  }

  function copyCmd(cmd: string) {
    navigator.clipboard.writeText(cmd).then(() => { setCopied(cmd); setTimeout(() => setCopied(null), 2000); }).catch(() => null);
  }

  useEffect(() => { void refreshRuntime(); }, [props.settings.endpoint]);

  const missing = RECOMMENDED.filter((m) => !props.localModels.some((i) => i.name.startsWith(m.name.split(':')[0])));
  const testedProfiles = MODEL_PROFILES.filter((profile) => profile.performance && isProfileInstalled(profile.id, installedNames));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 96px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>Kira</div>
        <h2 style={{ marginTop: 8, fontSize: '2rem', fontWeight: 200, letterSpacing: '-0.04em', color: 'rgba(255,255,255,0.95)', lineHeight: 1.1 }}>Modelli locali</h2>
        <p style={{ marginTop: 6, fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)' }}>Kira sceglie automaticamente. Intervieni solo se vuoi forzare un modello specifico.</p>
      </div>

      {/* Modello attivo */}
      {selected && (
        <div style={S.section}>
          <div style={S.label}>Modello attivo</div>
          <div style={S.value}>{selected.displayName}</div>
          <p style={S.sub}>{selected.recommendedUse}</p>
          {selected.performance && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                <div style={S.pill}>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.38)' }}>risposta</span>
                  <strong style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.76)', textAlign: 'right' as const }}>{selected.performance.responseTime}</strong>
                </div>
                <div style={S.pill}>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.38)' }}>qualita</span>
                  <strong style={{ fontSize: '0.72rem', color: verdictColor(selected.performance.verdict), textTransform: 'uppercase' as const }}>{selected.performance.quality}</strong>
                </div>
                <div style={S.pill}>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.38)' }}>input</span>
                  <strong style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.72)', textAlign: 'right' as const }}>{selected.performance.inputTokens}</strong>
                </div>
                <div style={S.pill}>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.38)' }}>output</span>
                  <strong style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.72)', textAlign: 'right' as const }}>{selected.performance.outputTokens}</strong>
                </div>
              </div>
              <p style={{ ...S.sub, marginTop: -2 }}>{selected.performance.note}</p>
            </>
          )}

          {/* VRAM status */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            <div style={{ ...S.pill, flex: 1, minWidth: 120 }}>
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.38)' }}>keep_alive</span>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>{runtime?.keepAlive || '10m'}</span>
            </div>
            <div style={{ ...S.pill, flex: 1, minWidth: 120 }}>
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.38)' }}>latenza</span>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>{runtime?.latencyMs ? `${runtime.latencyMs}ms` : '—'}</span>
            </div>
            {runtime?.running?.length ? (
              <div style={{ ...S.pill, flex: 2, minWidth: 200, borderColor: 'rgba(74,222,128,0.2)', background: 'rgba(74,222,128,0.04)' }}>
                <span style={{ fontSize: '0.7rem', color: 'rgba(74,222,128,0.7)' }}>in VRAM</span>
                <span style={{ fontSize: '0.72rem', color: 'rgba(74,222,128,0.8)' }}>{runtime.running.map((m) => `${m.name} ${m.vramGb}GB`).join(' · ')}</span>
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {(['warmup', 'unload', 'keep-alive:10m', 'keep-alive:30m'] as const).map((a) => {
              const [action, param] = a.split(':') as [string, string | undefined];
              const label = action === 'warmup' ? 'Warmup' : action === 'unload' ? 'Unload VRAM' : `keep ${param}`;
              const key = props.settings.selectedModel + action;
              return (
                <button key={a} disabled={!!acting} onClick={() => void modelAction(action as 'warmup' | 'unload' | 'keep-alive', props.settings.selectedModel, param)}
                  style={{ ...S.action, color: acting === key ? 'rgba(125,211,252,0.9)' : 'rgba(255,255,255,0.62)', cursor: acting ? 'not-allowed' : 'pointer', opacity: acting && acting !== key ? 0.4 : 1 }}
                >
                  {acting === key ? '...' : label}
                </button>
              );
            })}
          </div>
          {message && <div style={{ fontSize: '0.72rem', color: 'rgba(125,211,252,0.7)' }}>{message}</div>}
        </div>
      )}

      {/* Routing mode */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { id: 'auto', title: 'Automatico', desc: 'Kira sceglie: chat, coding, reasoning, voice.', color: 'rgba(125,211,252,0.6)' },
          { id: 'manual', title: 'Manuale', desc: 'Forza un modello specifico per tutte le richieste.', color: 'rgba(167,139,250,0.6)' },
        ].map((opt) => {
          const active = props.settings.modelRoutingMode === opt.id || (opt.id === 'auto' && props.settings.modelRoutingMode !== 'manual');
          return (
            <button key={opt.id} onClick={() => props.onChange({ ...props.settings, modelRoutingMode: opt.id as 'auto' | 'manual' })}
              style={{ ...S.section, cursor: 'pointer', borderColor: active ? `${opt.color.replace('0.6', '0.35')}` : 'rgba(255,255,255,0.07)', background: active ? `${opt.color.replace('0.6', '0.06')}` : 'rgba(255,255,255,0.025)', textAlign: 'left' as const, transition: 'all 0.18s' }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 400, color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)' }}>{opt.title}</div>
              <p style={S.sub}>{opt.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Tested lineup */}
      {testedProfiles.length > 0 && (
        <div style={S.section}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={S.label}>Benchmark locale OBS/game</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.34)' }}>cold load + 750 token max</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
            {testedProfiles.map((profile) => {
              const perf = profile.performance!;
              const active = props.settings.selectedModel === profile.id;
              return (
                <button
                  key={profile.id}
                  onClick={() => props.onChange({ ...props.settings, selectedModel: profile.id, activeProvider: profile.provider })}
                  style={{
                    padding: '12px',
                    borderRadius: 8,
                    border: `1px solid ${active ? 'rgba(125,211,252,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    background: active ? 'rgba(125,211,252,0.065)' : 'rgba(255,255,255,0.028)',
                    textAlign: 'left' as const,
                    cursor: 'pointer',
                    minHeight: 148,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ minWidth: 0, flex: 1, fontSize: '0.82rem', color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{profile.displayName}</span>
                    <span style={{ color: verdictColor(perf.verdict), border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '2px 7px', fontSize: '0.58rem', textTransform: 'uppercase' as const, flexShrink: 0 }}>{perf.verdict}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                    <span style={{ ...S.pill, fontSize: '0.66rem', color: 'rgba(255,255,255,0.56)' }}>tempo <strong style={{ color: 'rgba(255,255,255,0.78)' }}>{shortResponseTime(perf.responseTime)}</strong></span>
                    <span style={{ ...S.pill, fontSize: '0.66rem', color: 'rgba(255,255,255,0.56)' }}>tok/s <strong style={{ color: 'rgba(255,255,255,0.78)' }}>{perf.tokensPerSecond ?? '-'}</strong></span>
                  </div>
                  <p style={{ ...S.sub, margin: 0 }}>{perf.note}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Installed models */}
      {runtime?.installed?.length ? (
        <div style={S.section}>
          <div style={{ ...S.label, marginBottom: 8 }}>Modelli installati ({runtime.installed.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
            {runtime.installed.map((m) => (
              <div key={m.name} style={{ ...S.pill }}>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{m.name}</span>
                <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginLeft: 8 }}>{m.sizeGb}GB</span>
              </div>
            ))}
          </div>
          {runtime.running?.length ? (
            <div>
              <div style={{ ...S.label, marginBottom: 6 }}>In VRAM</div>
              {runtime.running.map((m) => (
                <div key={m.name} style={{ ...S.pill, borderColor: 'rgba(74,222,128,0.2)', background: 'rgba(74,222,128,0.04)', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>{m.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(74,222,128,0.7)' }}>{m.vramGb} GB</span>
                    <button onClick={() => void modelAction('unload', m.name)} disabled={!!acting}
                      style={{ ...S.action, padding: '3px 8px', borderColor: 'rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.06)', fontSize: '0.6rem', color: 'rgba(248,113,113,0.78)' }}>
                      Unload
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Recommendations */}
      {missing.length > 0 && (
        <div style={{ ...S.section, borderColor: 'rgba(251,191,36,0.15)', background: 'rgba(251,191,36,0.02)' }}>
          <div style={{ ...S.label, color: 'rgba(251,191,36,0.5)' }}>Modelli consigliati non installati</div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {missing.map((m) => (
              <div key={m.name} style={{ padding: '10px 12px', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.025)', border: `1px solid ${m.priority === 'must' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>{m.name}</span>
                  <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)' }}>{m.size}</span>
                  {m.priority === 'must' && <span style={{ fontSize: '0.55rem', color: '#fcd34d', padding: '1px 6px', borderRadius: 999, border: '1px solid rgba(252,211,77,0.3)' }}>essenziale</span>}
                  <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>{m.use}</span>
                </div>
                <p style={{ ...S.sub, marginBottom: 8 }}>{m.reason}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, fontSize: '0.65rem', color: 'rgba(125,211,252,0.6)', padding: '4px 8px', borderRadius: '0.5rem', background: 'rgba(0,0,0,0.3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{m.cmd}</code>
                  <button
                    onClick={() => void pullModel(m.name)}
                    disabled={!!pullingModel}
                    style={{
                      padding: '4px 12px', borderRadius: 8,
                      border: '1px solid rgba(74,222,128,0.3)',
                      background: pullingModel === m.name ? 'rgba(74,222,128,0.12)' : 'rgba(74,222,128,0.06)',
                      fontSize: '0.62rem',
                      color: pullingModel === m.name ? 'rgba(74,222,128,0.95)' : 'rgba(74,222,128,0.75)',
                      cursor: pullingModel ? 'not-allowed' : 'pointer',
                      flexShrink: 0,
                      opacity: pullingModel && pullingModel !== m.name ? 0.35 : 1,
                    }}
                  >
                    {pullingModel === m.name ? `... ${pullProgress || ''}` : 'Installa'}
                  </button>
                  <button onClick={() => copyCmd(m.cmd)} style={{ ...S.action, padding: '4px 10px', fontSize: '0.62rem', color: copied === m.cmd ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.55)', flexShrink: 0 }}>
                    {copied === m.cmd ? 'copiato' : 'copia'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model catalog */}
      <details>
        <summary style={{ fontSize: '0.62rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: '4px 0' }}>Catalogo avanzato</summary>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
          {MODEL_PROFILES.map((profile) => {
            const isInstalled = profile.compatibility === 'cloud' || isProfileInstalled(profile.id, installedNames);
            const isActive = props.settings.selectedModel === profile.id;
            return (
              <button key={profile.id} disabled={!isInstalled}
                onClick={() => props.onChange({ ...props.settings, selectedModel: profile.id, activeProvider: profile.provider })}
                style={{ padding: '14px 16px', borderRadius: 8, textAlign: 'left' as const, cursor: isInstalled ? 'pointer' : 'not-allowed', opacity: isInstalled ? 1 : 0.4, border: `1px solid ${isActive ? 'rgba(125,211,252,0.3)' : 'rgba(255,255,255,0.07)'}`, background: isActive ? 'rgba(125,211,252,0.06)' : 'rgba(255,255,255,0.025)', transition: 'all 0.15s' }}
              >
                <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>{profile.displayName}</div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>{profile.recommendedUse}</div>
                {profile.performance && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '2px 7px', fontSize: '0.58rem' }}>{shortResponseTime(profile.performance.responseTime)}</span>
                    <span style={{ color: verdictColor(profile.performance.verdict), border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '2px 7px', fontSize: '0.58rem' }}>{profile.performance.quality}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}
