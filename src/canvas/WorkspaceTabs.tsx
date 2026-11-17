// Workspace tabs — chip orizzontali sempre visibili in alto del canvas.
// Click → carica layout. Più immediato del WorkspaceSwitcher (Ctrl+L) per
// switch frequenti tra Casa/Lavoro/Focus.

import { useEffect, useState } from 'react';
import { ACTIVE_WORKSPACE_KEY, useCanvas } from './canvasStore';
import { useToast } from '../contexts/ToastContext';

const PRESET_ICONS: Record<string, string> = {
  default: 'O',
  lavoro: 'W',
  sistema: 'S',
  anime: 'A',
  focus: 'F',
  debug: 'D',
};

// Azioni reali legate al workspace: il tab non è solo un layout, è un contesto.
// "anime" → riprende l'ultimo episodio Crunchyroll a tutto schermo dal punto esatto.
const WORKSPACE_ACTIONS: Record<string, { run: () => Promise<string | null> }> = {
  anime: {
    run: async () => {
      try {
        const r = await fetch('/api/media/crunchyroll/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullscreen: true }),
        });
        const j = await r.json() as { ok: boolean; series?: string; episode?: string; error?: string };
        if (j.ok) return `▶ ${j.series || 'Anime'}${j.episode ? ` — ${j.episode}` : ''}`;
        return null;
      } catch {
        return null;
      }
    },
  },
};

function readActiveWorkspace(): string | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name || null;
  } catch {
    return null;
  }
}

export function WorkspaceTabs() {
  const canvas = useCanvas();
  const toast = useToast();
  const [active, setActive] = useState<string | null>(() => readActiveWorkspace());

  // Re-render when workspaces change
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => {
      setActive(readActiveWorkspace());
      setTick((t) => t + 1);
    };
    window.addEventListener('kira:layoutChanged', onChange);
    return () => window.removeEventListener('kira:layoutChanged', onChange);
  }, []);

  const layouts = canvas.listLayouts();
  if (layouts.length === 0) return null;

  // Limita a 5 chip per non saturare l'alto canvas. I rimanenti via Ctrl+L.
  const visible = layouts.slice(0, 5);
  const hidden = Math.max(0, layouts.length - 5);

  const choose = (name: string) => {
    const ok = canvas.loadLayout(name);
    if (ok) {
      setActive(name);
      toast.success(`Workspace "${name}"`);
      const action = WORKSPACE_ACTIONS[name.toLowerCase()];
      if (action) {
        void action.run().then((label) => {
          if (label) toast.success(label);
        });
      }
    }
  };

  return (
    <div className="kc-ws-tabs" key={tick}>
      {visible.map((l) => (
        <button
          key={l.name}
          type="button"
          className={`kc-ws-tab ${active === l.name ? 'kc-ws-tab-on' : ''}`}
          onClick={() => choose(l.name)}
          title={`${l.widgets.length} widget - click per caricare`}
        >
          <span className="kc-ws-tab-icon">{PRESET_ICONS[l.name] || '-'}</span>
          <span className="kc-ws-tab-name">{l.name}</span>
        </button>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          className="kc-ws-tab kc-ws-tab-more"
          onClick={() => {
            // Apri WorkspaceSwitcher overlay simulando Ctrl+L
            const event = new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true });
            window.dispatchEvent(event);
          }}
          title={`+${hidden} altri layout - Ctrl+L per vederli tutti`}
        >
          <span className="kc-ws-tab-icon">...</span>
          <span className="kc-ws-tab-name">+{hidden}</span>
        </button>
      )}
    </div>
  );
}
