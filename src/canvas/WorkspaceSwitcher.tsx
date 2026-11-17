import { useEffect, useState, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { useCanvas } from './canvasStore';
import { useToast } from '../contexts/ToastContext';
import { WORKSPACE_PRESETS } from './workspacePresets';

const PRESET_HINTS: Record<string, { icon: string; desc: string }> = {
  default: { icon: '◯', desc: 'Solo Kira Core' },
  lavoro:  { icon: '▣', desc: 'Operazioni · Activity · LongRun' },
  sistema: { icon: '⌂', desc: 'Stato · Modelli · Grafo · MCP' },
  anime:   { icon: '▶', desc: 'Media · Chat' },
  focus:   { icon: '◉', desc: 'Solo Kira Core + Activity + Calendar' },
  debug:   { icon: '⌘', desc: 'Activity · LongRun' },
};

/**
 * WorkspaceSwitcher — overlay HUD to switch saved layouts.
 * Toggle: Ctrl+L (or ⌘+L on macOS) or via canvas command "apri palette".
 */
export function WorkspaceSwitcher() {
  const canvas = useCanvas();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  void refreshTick; // forza il re-render dopo l'edit di una nota
  const layouts = canvas.listLayouts();

  const editNote = useCallback((e: MouseEvent, l: { name: string; note?: string }) => {
    e.stopPropagation();
    const next = window.prompt(`Nota per il workspace «${l.name}» (a cosa serve):`, l.note || '');
    if (next === null) return; // annullato
    canvas.setLayoutNote(l.name, next);
    setRefreshTick((t) => t + 1);
    toast.success('Nota workspace aggiornata');
  }, [canvas, toast]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+L / Cmd+L → toggle
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setOpen((v) => !v);
        setSelectedIdx(0);
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(layouts.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = layouts[selectedIdx];
        if (item) {
          const ok = canvas.loadLayout(item.name);
          if (ok) toast.success(`Workspace «${item.name}» caricato`);
          else toast.error(`Layout «${item.name}» non trovato`);
          setOpen(false);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, layouts, selectedIdx, canvas, toast]);

  const choose = useCallback((name: string) => {
    const ok = canvas.loadLayout(name);
    if (ok) toast.success(`Workspace «${name}» caricato`);
    else toast.error(`Layout «${name}» non trovato`);
    setOpen(false);
  }, [canvas, toast]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = WORKSPACE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    // Chiudi tutto tranne il core, poi apri i widget del preset
    canvas.closeAll();
    // Apre con piccolo delay per dare tempo al close di propagare
    setTimeout(() => {
      preset.widgets.forEach((wid, idx) => {
        setTimeout(() => canvas.openWidget(wid), idx * 60);
      });
    }, 80);
    toast.success(`Scena «${preset.name}» applicata`);
    setOpen(false);
  }, [canvas, toast]);

  if (!open) return null;

  return (
    <div
      className="kc-ws-overlay"
      role="dialog"
      aria-label="Workspace switcher"
      onClick={() => setOpen(false)}
    >
      <div className="kc-ws-panel" onClick={(e) => e.stopPropagation()}>
        <header className="kc-ws-head">
          <span className="kc-ws-head-label">WORKSPACE · LAYOUT</span>
          <span className="kc-ws-head-hint">↑↓ navigare · Enter caricare · Esc chiudere</span>
        </header>

        {/* Scene presets — sempre disponibili, no setup */}
        <div className="kc-ws-presets">
          <div className="kc-ws-presets-label">SCENE RAPIDE</div>
          <div className="kc-ws-presets-grid">
            {WORKSPACE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="kc-ws-preset"
                onClick={() => applyPreset(p.id)}
                title={p.description}
              >
                <span className="kc-ws-preset-icon">{p.icon}</span>
                <div className="kc-ws-preset-body">
                  <span className="kc-ws-preset-name">{p.name}</span>
                  <span className="kc-ws-preset-desc">{p.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <ul className="kc-ws-list">
          {layouts.length === 0 ? (
            <li className="kc-ws-empty">Nessun layout salvato</li>
          ) : layouts.map((l, idx) => {
            const hint = PRESET_HINTS[l.name];
            return (
              <li
                key={l.name}
                className={`kc-ws-item ${idx === selectedIdx ? 'kc-ws-item-on' : ''}`}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => choose(l.name)}
              >
                <span className="kc-ws-item-icon">{hint?.icon || '•'}</span>
                <div className="kc-ws-item-body">
                  <span className="kc-ws-item-name">{l.name}</span>
                  <span className={`kc-ws-item-desc${l.note ? ' kc-ws-item-note' : ''}`}>
                    {l.note || hint?.desc || `${l.widgets.length} widget`}
                  </span>
                </div>
                <button
                  type="button"
                  className="kc-ws-item-editnote"
                  onClick={(e) => editNote(e, l)}
                  title={l.note ? 'Modifica nota workspace' : 'Aggiungi nota workspace'}
                >✎</button>
                <span className="kc-ws-item-count">{l.widgets.length}</span>
              </li>
            );
          })}
        </ul>
        <footer className="kc-ws-foot">
          <kbd>⌃</kbd>+<kbd>L</kbd>  per chiudere
        </footer>
      </div>
    </div>
  );
}
