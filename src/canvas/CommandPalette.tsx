import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvas } from './canvasStore';
import { useToast } from '../contexts/ToastContext';
import { useCanvasCommand } from './useCanvasCommand';
import { WIDGET_REGISTRY } from './widgetRegistry';
import type { WidgetId } from './widgetRegistry';

type ActionKind = 'widget' | 'layout' | 'system';

interface Action {
  id: string;
  kind: ActionKind;
  icon: string;
  label: string;
  hint: string;
  keywords: string;
  run: () => void;
}

/** Multi-term ranked match: ogni termine deve comparire; lo score premia i match sul label. */
function scoreAction(a: Action, terms: string[]): number | null {
  const label = a.label.toLowerCase();
  const hint = a.hint.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (label.startsWith(t)) score += 100;
    else if (label.includes(t)) score += 45;
    else if (a.keywords.includes(t)) score += 18;
    else if (hint.includes(t)) score += 6;
    else return null; // questo termine non matcha da nessuna parte → scarta
  }
  return score;
}

/**
 * CommandPalette — generic action picker overlay.
 * Toggle: Ctrl+Space / Cmd+K. I comandi globali riusano lo stesso dispatcher di
 * linguaggio naturale del canvas (useCanvasCommand) → niente logica duplicata.
 */
export function CommandPalette() {
  const canvas = useCanvas();
  const toast = useToast();
  const dispatch = useCanvasCommand();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLLIElement>(null);

  const actions = useMemo<Action[]>(() => {
    const items: Action[] = [];

    // Widget open actions
    for (const def of Object.values(WIDGET_REGISTRY)) {
      items.push({
        id: `open-${def.id}`,
        kind: 'widget',
        icon: def.icon,
        label: `Apri ${def.name}`,
        hint: def.description,
        keywords: `${def.id} ${def.name} ${def.commands.join(' ')}`.toLowerCase(),
        run: () => {
          canvas.openWidget(def.id as WidgetId);
          toast.info(`Widget «${def.name}» aperto`);
        },
      });
    }

    // Layout actions (use canvas.listLayouts())
    for (const l of canvas.listLayouts()) {
      items.push({
        id: `layout-${l.name}`,
        kind: 'layout',
        icon: '▣',
        label: `Workspace · ${l.name}`,
        hint: `Carica layout (${l.widgets.length} widget)`,
        keywords: `workspace layout ${l.name}`.toLowerCase(),
        run: () => {
          const ok = canvas.loadLayout(l.name);
          if (ok) toast.success(`Workspace «${l.name}» caricato`);
          else toast.error(`Layout «${l.name}» non trovato`);
        },
      });
    }

    // System / global actions — superficie sul dispatcher comandi naturali.
    const sys = (id: string, icon: string, label: string, hint: string, keywords: string, phrase: string): Action => ({
      id: `system-${id}`, kind: 'system', icon, label, hint, keywords,
      run: () => { void dispatch(phrase); },
    });
    items.push(sys('morning', '☀️', 'Routine mattina', 'Workspace mattina + briefing parlato', 'mattina buongiorno stark routine sveglia good morning', 'buongiorno'));
    items.push(sys('mind', '🧠', 'La Mente', 'Schermo costellazione — la memoria viva di Kira', 'mente memoria viva costellazione cervello', 'apri la mente'));
    items.push(sys('forge', '⚒', 'Officina', 'Schermo codice live — agenti, Claude/Codex, sala macchine', 'officina codice live sala macchine agenti forge', 'apri officina'));
    items.push(sys('close-all', '◯', 'Chiudi tutto', 'Chiude tutti i widget aperti', 'chiudi tutto pulisci reset svuota canvas', 'chiudi tutto'));
    items.push(sys('only-core', '◉', 'Solo Kira', 'Minimizza tutto tranne il Core', 'solo kira nascondi focus core minimizza tranne', 'nascondi tutto tranne kira'));
    items.push(sys('copy-resume', '📋', 'Copia resume prompt', "Copia negli appunti il prompt di ripresa dell'ultimo long run", 'copia resume prompt ripresa long run checkpoint', 'copia resume prompt'));
    items.push(sys('stop-voice', '🔇', 'Stop voce', 'Interrompe il parlato TTS in corso', 'stop voce ferma tts audio parlato silenzio', 'stop voce'));

    // Minimizza tutto (non c'è un comando naturale dedicato → azione diretta).
    items.push({
      id: 'system-minimize-all', kind: 'system', icon: '▽',
      label: 'Minimizza tutto', hint: 'Collassa tutti i widget aperti',
      keywords: 'minimizza tutti collassa riduci',
      run: () => {
        let n = 0;
        for (const w of canvas.widgets) if (w.state === 'open') { canvas.minimizeWidget(w.id); n++; }
        toast.info(n > 0 ? `Minimizzati ${n} widget` : 'Niente da minimizzare');
      },
    });

    return items;
  }, [canvas, toast, dispatch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    const terms = q.split(/\s+/).filter(Boolean);
    return actions
      .map((a) => ({ a, s: scoreAction(a, terms) }))
      .filter((x): x is { a: Action; s: number } => x.s !== null)
      .sort((x, y) => y.s - x.s)
      .map((x) => x.a);
  }, [query, actions]);

  const visible = useMemo(() => filtered.slice(0, 40), [filtered]);

  useEffect(() => { setSelectedIdx(0); }, [query]);
  // Mantiene la selezione dentro i limiti della lista visibile.
  useEffect(() => {
    if (selectedIdx > visible.length - 1) setSelectedIdx(Math.max(0, visible.length - 1));
  }, [visible.length, selectedIdx]);
  // Scrolla l'elemento selezionato in vista quando ci si muove con le frecce.
  useEffect(() => { selectedRef.current?.scrollIntoView({ block: 'nearest' }); }, [selectedIdx]);

  // Apertura via evento globale: unica sorgente di verità per Ctrl+K (gestito in
  // App.tsx) e per il bottone della StatusRail. Evita il doppio binding di Ctrl+K.
  useEffect(() => {
    const onOpen = () => { setOpen(true); setQuery(''); setSelectedIdx(0); };
    window.addEventListener('kira:openCommandPalette', onOpen);
    return () => window.removeEventListener('kira:openCommandPalette', onOpen);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+Space → toggle (scorciatoia secondaria; Ctrl+K passa dall'evento globale)
      const isToggle = (e.ctrlKey || e.metaKey) && e.key === ' ';
      if (isToggle) {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery('');
        setSelectedIdx(0);
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(visible.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = visible[selectedIdx];
        if (item) { item.run(); setOpen(false); }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, visible, selectedIdx]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="kc-cp-overlay"
      role="dialog"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div className="kc-cp-panel" onClick={(e) => e.stopPropagation()}>
        <header className="kc-cp-head">
          <span className="kc-cp-prompt">⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="kc-cp-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cosa vuoi fare? — apri meteo · workspace lavoro · buongiorno · stop voce…"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="kc-cp-count">{filtered.length}</span>
        </header>
        <div className="kc-cp-body">
          <ul className="kc-cp-list">
            {visible.length === 0 ? (
              <li className="kc-cp-empty">Nessun comando trovato per «{query}»</li>
            ) : visible.map((a, idx) => (
              <li
                key={a.id}
                ref={idx === selectedIdx ? selectedRef : null}
                className={`kc-cp-item kc-cp-item-${a.kind} ${idx === selectedIdx ? 'kc-cp-item-on' : ''}`}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => { a.run(); setOpen(false); }}
              >
                <span className="kc-cp-item-icon">{a.icon}</span>
                <div className="kc-cp-item-body">
                  <span className="kc-cp-item-label">{a.label}</span>
                  <span className="kc-cp-item-hint">{a.hint}</span>
                </div>
                <span className="kc-cp-item-kind">{a.kind}</span>
              </li>
            ))}
          </ul>

          {/* Mini-preview panel for widget actions */}
          {(() => {
            const selected = visible[selectedIdx];
            if (!selected || selected.kind !== 'widget') return null;
            const widgetId = selected.id.replace('open-', '') as keyof typeof WIDGET_REGISTRY;
            const def = WIDGET_REGISTRY[widgetId];
            if (!def) return null;
            const isOpen = canvas.widgets.some((w) => w.widgetId === widgetId);
            return (
              <div className="kc-cp-preview">
                <div className="kc-cp-preview-icon">{def.icon}</div>
                <div className="kc-cp-preview-name">{def.name}</div>
                <div className="kc-cp-preview-desc">{def.description}</div>
                <div className="kc-cp-preview-meta">
                  <span>{def.defaultSize.w} × {def.defaultSize.h}</span>
                  <span className={`kc-cp-preview-status ${isOpen ? 'kc-cp-preview-status-open' : ''}`}>
                    {isOpen ? '● aperto' : '○ chiuso'}
                  </span>
                </div>
                {def.commands.length > 0 && (
                  <div className="kc-cp-preview-cmds">
                    {def.commands.slice(0, 3).map((c) => (
                      <span key={c} className="kc-cp-preview-cmd">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        <footer className="kc-cp-foot">
          <span><kbd>↑↓</kbd> navigare</span>
          <span><kbd>Enter</kbd> eseguire</span>
          <span><kbd>Esc</kbd> chiudere</span>
          <span className="kc-cp-foot-spacer" />
          <span><kbd>⌃</kbd>+<kbd>␣</kbd> toggle</span>
        </footer>
      </div>
    </div>
  );
}
