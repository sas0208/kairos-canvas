import { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { WidgetCardMenu, useCardMenu } from '../components/WidgetCardMenu';
import { WidgetSpinner } from '../components/WidgetStates';

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
}

type View = 'list' | 'editor';

export function NotesWidget() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Note | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  // Editor state
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editPinned, setEditPinned] = useState(false);

  // Quick-capture
  const [quickText, setQuickText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const toast = useToast();
  const cardMenu = useCardMenu();

  const loadNotes = useCallback(async (q?: string) => {
    try {
      const url = q ? `/api/notes/search?q=${encodeURIComponent(q)}` : '/api/notes';
      const r = await fetch(url);
      const j = await r.json() as { ok: boolean; notes: Note[] };
      setNotes(j.notes ?? []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { void loadNotes(search || undefined); }, 260);
    return () => clearTimeout(t);
  }, [search, loadNotes]);

  const openNew = useCallback(() => {
    setSelected(null);
    setEditTitle('');
    setEditContent('');
    setEditTags('');
    setEditPinned(false);
    setView('editor');
  }, []);

  const openNote = useCallback((n: Note) => {
    setSelected(n);
    setEditTitle(n.title);
    setEditContent(n.content);
    setEditTags(n.tags.join(', '));
    setEditPinned(n.pinned);
    setView('editor');
  }, []);

  const saveNote = useCallback(async () => {
    setBusy(true);
    const body = {
      title: editTitle.trim() || 'Nota',
      content: editContent,
      tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
      pinned: editPinned,
    };
    try {
      const url = selected ? `/api/notes/${selected.id}` : '/api/notes';
      const method = selected ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json() as { ok: boolean };
      if (j.ok) {
        toast.success(selected ? 'Nota aggiornata' : 'Nota creata');
        void loadNotes(search || undefined);
        setView('list');
      }
    } catch {
      toast.error('Salvataggio fallito');
    } finally {
      setBusy(false);
    }
  }, [selected, editTitle, editContent, editTags, editPinned, search, loadNotes, toast]);

  const deleteNote = useCallback(async (id: string) => {
    if (!confirm('Elimina questa nota?')) return;
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      toast.info('Nota eliminata');
      void loadNotes(search || undefined);
      if (view === 'editor') setView('list');
    } catch {
      toast.error('Eliminazione fallita');
    }
  }, [search, loadNotes, toast, view]);

  const togglePin = useCallback(async (n: Note, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/notes/${n.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !n.pinned }),
      });
      void loadNotes(search || undefined);
    } catch { /* noop */ }
  }, [search, loadNotes]);

  const sendQuick = useCallback(async () => {
    if (!quickText.trim()) return;
    setBusy(true);
    try {
      const r = await fetch('/api/notes/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: quickText }),
      });
      const j = await r.json() as { ok: boolean };
      if (j.ok) {
        toast.success('Nota rapida salvata');
        setQuickText('');
        void loadNotes(search || undefined);
      }
    } catch {
      toast.error('Invio fallito');
    } finally {
      setBusy(false);
    }
  }, [quickText, search, loadNotes, toast]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 24) return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  };

  // ── Editor view ─────────────────────────────────────────────────────────
  if (view === 'editor') {
    return (
      <div className="kc-w-notes kc-w-notes-editor">
        <div className="kc-w-notes-editor-bar">
          <button className="kc-w-notes-back" onClick={() => setView('list')}>← Lista</button>
          <span className="kc-w-notes-editor-title-chip">
            {selected ? 'Modifica' : 'Nuova nota'}
          </span>
          <div className="kc-w-notes-editor-actions">
            {selected && (
              <button className="kc-w-notes-del-btn" onClick={() => void deleteNote(selected.id)}>
                🗑
              </button>
            )}
            <label className="kc-w-notes-pin-label">
              <input type="checkbox" checked={editPinned} onChange={(e) => setEditPinned(e.target.checked)} />
              📌
            </label>
          </div>
        </div>
        <input
          className="kc-w-notes-title-input"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Titolo"
          maxLength={120}
        />
        <textarea
          className="kc-w-notes-content-input"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          placeholder="Scrivi qualcosa…"
        />
        <input
          className="kc-w-notes-tags-input"
          value={editTags}
          onChange={(e) => setEditTags(e.target.value)}
          placeholder="tag1, tag2, tag3"
        />
        <button
          className="kc-w-notes-save-btn"
          onClick={() => void saveNote()}
          disabled={busy}
        >
          {busy ? '…' : 'Salva'}
        </button>
      </div>
    );
  }

  // Drag-and-drop: testo selezionato e trascinato da qualsiasi widget → nuova nota.
  const addDroppedText = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const r = await fetch('/api/notes/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
      });
      const j = await r.json() as { ok: boolean };
      if (j.ok) {
        toast.success('Testo salvato in nota');
        window.dispatchEvent(new CustomEvent('kira:actionLogged'));
        void loadNotes(search || undefined);
      }
    } catch {
      toast.error('Salvataggio fallito');
    } finally {
      setBusy(false);
    }
  }, [toast, loadNotes, search]);

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div
      className={`kc-w-notes${dragOver ? ' kc-w-dropping' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); setDragOver(true); }
      }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void addDroppedText(e.dataTransfer.getData('text/plain'));
      }}
    >
      {dragOver && <div className="kc-w-drop-hint" aria-hidden="true">📝 Rilascia per salvare come nota</div>}
      <div className="kc-w-notes-top">
        <input
          ref={searchRef}
          className="kc-w-notes-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca note…"
        />
        <button className="kc-w-notes-new-btn" onClick={openNew}>+</button>
      </div>

      <div className="kc-w-notes-quick">
        <input
          className="kc-w-notes-quick-input"
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          placeholder="Nota rapida…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendQuick(); } }}
        />
        <button className="kc-w-notes-quick-btn" onClick={() => void sendQuick()} disabled={busy || !quickText.trim()}>
          ↵
        </button>
      </div>

      {loading ? (
        <WidgetSpinner label="Caricamento note…" fullHeight />
      ) : notes.length === 0 ? (
        <div className="kc-w-empty">
          {search ? 'Nessun risultato' : 'Nessuna nota — premi + per crearne una'}
        </div>
      ) : (
        <ul className="kc-w-notes-list">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`kc-w-notes-item${n.pinned ? ' kc-w-notes-item-pinned' : ''}`}
              onClick={() => openNote(n)}
              onContextMenu={(ev) => cardMenu.open(ev, { title: n.title, body: n.content })}
            >
              <div className="kc-w-notes-item-head">
                <span className="kc-w-notes-item-title">{n.title}</span>
                <span className="kc-w-notes-item-date">{fmtDate(n.updatedAt)}</span>
              </div>
              {n.content && (
                <div className="kc-w-notes-item-preview">
                  {n.content.slice(0, 80)}{n.content.length > 80 ? '…' : ''}
                </div>
              )}
              <div className="kc-w-notes-item-footer">
                {n.tags.length > 0 && (
                  <div className="kc-w-notes-item-tags">
                    {n.tags.slice(0, 3).map((t) => (
                      <span key={t} className="kc-w-notes-tag">{t}</span>
                    ))}
                  </div>
                )}
                <button
                  className={`kc-w-notes-pin-btn${n.pinned ? ' kc-w-notes-pin-active' : ''}`}
                  onClick={(e) => void togglePin(n, e)}
                  title={n.pinned ? 'Rimuovi pinna' : 'Pinna'}
                >
                  📌
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <WidgetCardMenu {...cardMenu.props} />
    </div>
  );
}
