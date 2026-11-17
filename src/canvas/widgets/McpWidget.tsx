import { useCallback, useEffect, useState } from 'react';
import { OpenSettingsLink } from './OpenSettingsLink';
import { WidgetSpinner } from '../components/WidgetStates';

interface McpServerStatus {
  name: string;
  enabled: boolean;
  note?: string;
  reachable: boolean | null;
  toolCount: number | null;
  error?: string;
}
interface McpStatus { configured: boolean; configPath: string; servers: McpServerStatus[] }
interface McpTool { name: string; description?: string }

export function McpWidget() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [openServer, setOpenServer] = useState<string | null>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [toolsErr, setToolsErr] = useState('');
  const [toolsLoading, setToolsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await fetch('/api/mcp/status').then((r) => r.json()).catch(() => null) as McpStatus | null;
      setStatus(s);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openTools = useCallback(async (name: string) => {
    if (openServer === name) { setOpenServer(null); return; }
    setOpenServer(name);
    setTools([]); setToolsErr(''); setToolsLoading(true);
    try {
      const r = await fetch(`/api/mcp/tools?server=${encodeURIComponent(name)}`).then((res) => res.json()).catch(() => null) as { ok: boolean; tools: McpTool[]; error?: string } | null;
      if (r?.ok) setTools(r.tools);
      else setToolsErr(r?.error || 'tool non disponibili');
    } catch { setToolsErr('errore'); }
    finally { setToolsLoading(false); }
  }, [openServer]);

  if (loading && !status) return <WidgetSpinner label="Stato MCP…" fullHeight />;

  const anyEnabled = status?.servers.some((s) => s.enabled);

  return (
    <div className="kc-w-mcp">
      <div className="kc-w-mcp-head">
        <span className="kc-w-mcp-title">MCP · tool modulari</span>
        <button type="button" className="kc-w-mcp-refresh" onClick={() => void load()} title="Aggiorna" aria-label="Aggiorna">↻</button>
      </div>

      {!anyEnabled && (
        <div className="kc-w-mcp-detail">
          Nessun server MCP attivo. Abilita un server nel file di config per dare a Kira tool
          modulari (filesystem, web…) senza gonfiare il prompt.
          <OpenSettingsLink hint={`Modifica ${status?.configPath || 'mcp-servers.json'} → "enabled": true`} />
        </div>
      )}

      {status?.servers.map((s) => {
        const dot = !s.enabled ? 'kc-w-mcp-dot-off' : s.reachable ? 'kc-w-mcp-dot-on' : 'kc-w-mcp-dot-warn';
        const label = !s.enabled ? 'disabilitato' : s.reachable ? `${s.toolCount} tool` : 'non raggiungibile';
        return (
          <div key={s.name} className="kc-w-mcp-srv">
            <button
              type="button"
              className="kc-w-mcp-srv-head"
              onClick={() => s.enabled && s.reachable && void openTools(s.name)}
              disabled={!s.enabled || !s.reachable}
            >
              <span className={`kc-w-mcp-dot ${dot}`} aria-hidden />
              <span className="kc-w-mcp-srv-name">{s.name}</span>
              <span className="kc-w-mcp-srv-meta">{label}</span>
              {s.enabled && s.reachable && <span className="kc-w-mcp-chev">{openServer === s.name ? '▾' : '▸'}</span>}
            </button>
            {s.note && openServer !== s.name && <div className="kc-w-mcp-note">{s.note}</div>}
            {s.error && <div className="kc-w-mcp-err">{s.error}</div>}
            {openServer === s.name && (
              <div className="kc-w-mcp-tools">
                {toolsLoading && <div className="kc-w-mcp-empty">caricamento tool…</div>}
                {toolsErr && <div className="kc-w-mcp-empty">{toolsErr}</div>}
                {!toolsLoading && !toolsErr && tools.length === 0 && <div className="kc-w-mcp-empty">nessun tool</div>}
                {tools.map((t) => (
                  <div key={t.name} className="kc-w-mcp-tool">
                    <span className="kc-w-mcp-tool-name">{t.name}</span>
                    {t.description && <span className="kc-w-mcp-tool-desc">{t.description}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
