import type { OllamaModel } from '../types/ollama';
import type { KiraSettings } from '../types/settings';
import type { DiagnosticsState } from '../hooks/useDiagnostics';

const S = {
  section: { borderRadius: '1.1rem', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: '18px 20px', display: 'flex', flexDirection: 'column' as const, gap: 12 },
  label: { fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.3)', marginBottom: 6, display: 'block' },
  input: { width: '100%', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.35)', padding: '10px 14px', fontSize: '0.83rem', color: 'rgba(255,255,255,0.8)', outline: 'none' },
  sectionTitle: { fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)', marginBottom: 4 },
  value: { fontSize: '1.1rem', fontWeight: 300, color: 'rgba(255,255,255,0.85)' },
  sub: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 },
};

export function SettingsPanel(props: {
  settings: KiraSettings;
  models: OllamaModel[];
  modelsError: string;
  diagnostics: DiagnosticsState;
  isLoadingModels: boolean;
  onRefreshModels: () => void;
  onOpenModels: () => void;
  onChange: (settings: KiraSettings) => void;
}) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 96px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>Kira</div>
        <h2 style={{ marginTop: 8, fontSize: '2rem', fontWeight: 200, letterSpacing: '-0.04em', color: 'rgba(255,255,255,0.95)', lineHeight: 1.1 }}>Impostazioni</h2>
        <p style={{ marginTop: 6, fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)' }}>Pochi controlli essenziali — il resto è automatico.</p>
      </div>

      {/* Endpoint */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Connessione Ollama</div>
        <div>
          <label style={S.label} htmlFor="endpoint">Endpoint</label>
          <input
            id="endpoint"
            value={props.settings.endpoint}
            onChange={(e) => props.onChange({ ...props.settings, endpoint: e.target.value })}
            style={S.input}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: props.diagnostics.ollamaOk ? '#4ade80' : 'rgba(255,255,255,0.2)', flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
            {props.diagnostics.ollamaOk ? `Online · ${props.diagnostics.latencyMs ?? '?'}ms` : 'Non raggiungibile'}
          </span>
        </div>
      </div>

      {/* Modello */}
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={S.sectionTitle}>Modello (override manuale)</div>
          <button
            onClick={props.onRefreshModels}
            style={{ fontSize: '0.68rem', color: 'rgba(125,211,252,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#7dd3fc'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(125,211,252,0.6)'; }}
          >
            {props.isLoadingModels ? 'Ricerca...' : '↺ Aggiorna'}
          </button>
        </div>
        <select
          value={props.settings.selectedModel}
          onChange={(e) => props.onChange({ ...props.settings, selectedModel: e.target.value })}
          style={{ ...S.input, cursor: 'pointer' }}
        >
          <option value="">Auto (consigliato)</option>
          {props.models.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
          <p style={{ ...S.sub, margin: 0, flex: 1, minWidth: 260 }}>In modalita automatica Kira sceglie il modello ottimale per ogni task. Forza solo se necessario.</p>
          <button
            type="button"
            onClick={props.onOpenModels}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(125,211,252,0.22)', background: 'rgba(125,211,252,0.07)', color: 'rgba(125,211,252,0.84)', fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0 }}
          >
            Dettagli performance
          </button>
        </div>
        {props.modelsError && <p style={{ fontSize: '0.72rem', color: '#f87171' }}>{props.modelsError}</p>}
      </div>

      {/* Voce */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Voce</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={S.value}>
              {props.diagnostics.piperConfigured ? 'Piper locale (gratis, offline)' : 'Non configurata'}
            </div>
            <p style={{ ...S.sub, marginTop: 4 }}>STT Whisper + TTS Piper, tutto in locale — nessun costo, nessuna quota.</p>
          </div>
          <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: props.diagnostics.piperConfigured ? '#4ade80' : 'rgba(255,255,255,0.2)', display: 'inline-block' }} />
        </div>
      </div>

      {/* System prompt */}
      <div style={S.section}>
        <div style={S.sectionTitle}>System Prompt</div>
        <textarea
          value={props.settings.systemPrompt}
          onChange={(e) => props.onChange({ ...props.settings, systemPrompt: e.target.value })}
          rows={8}
          style={{ ...S.input, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
        />
      </div>

      {/* Diagnostics */}
      <details>
        <summary style={{ fontSize: '0.65rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: '4px 0' }}>
          Diagnostica avanzata
        </summary>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {[
            { l: 'Server', v: props.diagnostics.serverOk ? 'online' : 'offline', ok: props.diagnostics.serverOk },
            { l: 'Ollama', v: props.diagnostics.ollamaOk ? 'online' : 'offline', ok: props.diagnostics.ollamaOk },
            { l: 'Latenza', v: props.diagnostics.latencyMs !== null ? `${props.diagnostics.latencyMs} ms` : 'n/d', ok: null },
            { l: 'Piper', v: props.diagnostics.piperConfigured ? 'ok' : 'non configurato', ok: props.diagnostics.piperConfigured },
          ].map((d) => (
            <div key={d.l} style={{ padding: '10px 14px', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>{d.l}</div>
              <div style={{ marginTop: 4, fontSize: '0.82rem', color: d.ok === null ? 'rgba(255,255,255,0.6)' : d.ok ? '#6ee7b7' : 'rgba(255,255,255,0.35)' }}>{d.v}</div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
