import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../../lib/constants';
import type { Conversation, ChatMessage } from '../../types/chat';

function readActiveConversation(): { conv: Conversation | null; count: number } {
  try {
    const convsRaw = localStorage.getItem(STORAGE_KEYS.conversations);
    const activeId = localStorage.getItem(STORAGE_KEYS.activeConversation);
    if (!convsRaw) return { conv: null, count: 0 };
    const conversations = JSON.parse(convsRaw) as Conversation[];
    if (!Array.isArray(conversations) || conversations.length === 0) return { conv: null, count: 0 };
    const id = activeId ? activeId.replace(/^"|"$/g, '') : '';
    const conv = (id && conversations.find((c) => c.id === id)) || conversations[0];
    return { conv: conv || null, count: conversations.length };
  } catch {
    return { conv: null, count: 0 };
  }
}

/**
 * ChatWidget — chat full inside the Canvas.
 * Mostra cronologia live (poll localStorage) e ha un composer attivo che dispatcha
 * un evento `kira:userSend` che App.tsx ascolta per invocare il router unificato.
 * Quando il router risponde con `openWidget`, il widget relativo si apre nel Canvas.
 */
export function ChatWidget() {
  const [state, setState] = useState(() => readActiveConversation());
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => { if (document.hidden) return; setState(readActiveConversation()); }, 800);
    return () => window.clearInterval(id);
  }, []);

  // Auto-scroll a fondo lista quando arrivano nuovi messaggi
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [state.conv?.messages?.length]);

  // Quando App segnala "thinking done" possiamo rilasciare busy
  useEffect(() => {
    const onDone = () => setBusy(false);
    window.addEventListener('kira:assistantDone', onDone);
    return () => window.removeEventListener('kira:assistantDone', onDone);
  }, []);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setBusy(true);
    // App.tsx ascolta questo evento e chiama il router unificato. Niente fetch duplicato.
    window.dispatchEvent(new CustomEvent('kira:userSend', { detail: { text } }));
    // Failsafe: rilascia busy dopo 30s anche se App non emette assistantDone
    window.setTimeout(() => setBusy(false), 30000);
  }, [draft, busy]);

  const { conv, count } = state;
  const messages: ChatMessage[] = (conv?.messages || []).slice(-40);

  return (
    <div className="kc-w-chat">
      <header className="kc-w-chat-header">
        <span className="kc-w-chat-title">{conv?.title || 'Nuova conversazione'}</span>
        <span className="kc-w-chat-count">{count} chat</span>
      </header>
      <div ref={listRef} className="kc-w-chat-list">
        {messages.length === 0 ? (
          <div className="kc-w-chat-empty-hint">Scrivi un messaggio a Kira qui sotto. I widget si apriranno automaticamente.</div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={`kc-w-chat-msg kc-w-chat-${m.role}`}>
            <span className="kc-w-chat-msg-role">{m.role === 'user' ? 'Tu' : 'Kira'}</span>
            <span className="kc-w-chat-msg-text">{m.content || (busy && m.role === 'assistant' ? '…' : '')}</span>
          </div>
        ))}
      </div>
      <footer className="kc-w-chat-composer">
        <textarea
          className="kc-w-chat-input"
          placeholder={busy ? 'Kira sta pensando…' : 'Scrivi qui (Invio per mandare, Shift+Invio per andare a capo)'}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="kc-w-chat-send"
          onClick={send}
          disabled={busy || !draft.trim()}
          aria-label="Invia messaggio"
        >
          {busy ? '…' : '↵'}
        </button>
      </footer>
    </div>
  );
}
