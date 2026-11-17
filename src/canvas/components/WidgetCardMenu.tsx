// Context menu riusabile per card dei widget. Si apre su right-click di un
// container che racchiude il componente. Offre azioni rapide cross-widget:
// Ask Kira / Salva memoria / Nota / Reminder / Custom.

import { useEffect, useRef, useState } from 'react';
import { askKira } from '../../lib/askKira';

export interface MenuAction {
  id: string;
  label: string;
  icon?: string;
  /** Quando l'utente clicca. Riceve il `subject` originale per logging. */
  run: () => void | Promise<void>;
  /** Disabilita l'azione (es. integrazione non configurata). */
  disabled?: boolean;
  variant?: 'default' | 'destructive' | 'accent';
}

interface WidgetCardMenuProps {
  /** Mostra il menu */
  open: boolean;
  /** Posizione clientX/Y al right-click */
  position: { x: number; y: number };
  /** Soggetto su cui agire — usato per il prompt "Ask Kira" default */
  subject: { title: string; body?: string };
  /** Azioni extra specifiche del widget */
  extraActions?: MenuAction[];
  /** Chiamato quando il menu si chiude (click fuori, ESC, dopo azione) */
  onClose: () => void;
  /** Override del prompt "Ask Kira" se vuoi qualcosa di specifico */
  askPrompt?: string;
}

export function WidgetCardMenu({ open, position, subject, extraActions = [], onClose, askPrompt }: WidgetCardMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const askText = askPrompt || `Parlami di:\n\n**${subject.title}**${subject.body ? `\n${subject.body}` : ''}`;

  const defaultActions: MenuAction[] = [
    {
      id: 'ask',
      label: 'Ask Kira',
      icon: '💬',
      variant: 'accent',
      run: () => askKira({ prompt: askText, send: true }),
    },
    {
      id: 'fillComposer',
      label: 'Apri in composer',
      icon: '✎',
      run: () => askKira({ prompt: askText, send: false }),
    },
    {
      id: 'memory',
      label: 'Salva in memoria',
      icon: '🧠',
      run: async () => {
        try {
          await fetch('/api/memory/canonical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: 'fact',
              title: subject.title,
              content: subject.body || subject.title,
              tags: ['user-saved'],
            }),
          });
        } catch { /* silent */ }
      },
    },
    {
      id: 'note',
      label: 'Nuova nota',
      icon: '📝',
      run: async () => {
        try {
          await fetch('/api/notes/quick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `${subject.title}\n\n${subject.body || ''}`.trim() }),
          });
          window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: 'notes' } }));
        } catch { /* silent */ }
      },
    },
    {
      id: 'reminder',
      label: 'Crea reminder',
      icon: '⏰',
      run: () => askKira({ prompt: `Crea un reminder per: ${subject.title}`, send: false }),
    },
    {
      id: 'copy',
      label: 'Copia testo',
      icon: '📋',
      run: async () => {
        const text = `${subject.title}${subject.body ? `\n${subject.body}` : ''}`.trim();
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard non disponibile */ }
      },
    },
  ];

  const actions = [...defaultActions, ...extraActions];

  // Position: clamp to viewport
  const W = 220, H = actions.length * 32 + 8;
  const left = Math.min(position.x, window.innerWidth - W - 8);
  const top = Math.min(position.y, window.innerHeight - H - 8);

  return (
    <div
      ref={ref}
      className="kc-cardmenu"
      style={{
        position: 'fixed', left, top, width: W, zIndex: 10000,
      }}
      role="menu"
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`kc-cardmenu-item kc-cardmenu-item-${a.variant || 'default'}`}
          disabled={a.disabled}
          onClick={async () => {
            try { await a.run(); } catch { /* silent */ }
            onClose();
          }}
        >
          {a.icon && <span className="kc-cardmenu-icon">{a.icon}</span>}
          <span className="kc-cardmenu-label">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Hook per gestire lo state del menu — semplifica l'integrazione nei widget.
 *
 * Uso:
 *   const menu = useCardMenu();
 *   <div onContextMenu={(e) => menu.open(e, { title, body })}>...</div>
 *   <WidgetCardMenu {...menu.props} />
 */
export function useCardMenu() {
  const [state, setState] = useState<{ open: boolean; position: { x: number; y: number }; subject: { title: string; body?: string } }>({
    open: false,
    position: { x: 0, y: 0 },
    subject: { title: '' },
  });

  return {
    open(e: React.MouseEvent, subject: { title: string; body?: string }) {
      e.preventDefault();
      setState({ open: true, position: { x: e.clientX, y: e.clientY }, subject });
    },
    close() { setState((s) => ({ ...s, open: false })); },
    props: {
      open: state.open,
      position: state.position,
      subject: state.subject,
      onClose: () => setState((s) => ({ ...s, open: false })),
    },
  };
}
