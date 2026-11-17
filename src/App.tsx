import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { getActiveWorkspaceNote } from './canvas/canvasStore';
import { ChatPanel } from './components/ChatPanel';
import { CognitiveBackdrop } from './components/CognitiveBackdrop';
import { MemoryPanel } from './components/MemoryPanel';
import { ModelsPanel } from './components/ModelsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';
import type { SidebarView } from './components/Sidebar';
import { VoicePanel } from './components/VoicePanel';
import { AgentsPanel } from './components/agents/AgentsPanel';
// Viste secondarie di nicchia (mind/forge): lazy → fuori dal main bundle, caricate on-demand.
const MindScreen = lazy(() => import('./components/screens/MindScreen').then((m) => ({ default: m.MindScreen })));
const ForgeScreen = lazy(() => import('./components/screens/ForgeScreen').then((m) => ({ default: m.ForgeScreen })));
import { VoiceIndicator } from './components/canvas/VoiceIndicator';
import { CanvasShell } from './canvas/CanvasShell';
import type { KiraAttachment } from './canvas/KiraCore';
import { useVoiceState } from './contexts/VoiceStateContext';
import { useDiagnostics } from './hooks/useDiagnostics';
import { DEFAULT_SETTINGS, OLLAMA_UNREACHABLE, STORAGE_KEYS } from './lib/constants';
import { createId } from './lib/ids';
import { streamChat } from './lib/ollamaClient';
import { resolveModel } from './lib/router/modelRouter';
import { useLocalStorage } from './hooks/useLocalStorage';
import { speak as speakTTS } from './lib/ttsPlayback';
import { useOllamaModels } from './hooks/useOllamaModels';
import { useCalmMode } from './hooks/useCalmMode';
import type { ChatMessage, Conversation } from './types/chat';
import type { KiraSettings } from './types/settings';
import type { VoiceSendHooks } from './types/voice';

type View = SidebarView;
type RouterStreamMessage = { role: string; content: string };

const VIEW_STORAGE_KEY = 'kira-active-view';
const VALID_VIEWS: View[] = ['canvas', 'settings', 'models', 'memory', 'mind', 'forge', 'chat', 'voice', 'agents'];

// Tutte le view legacy ora vengono rimappate a canvas (UI principale).
const LEGACY_REDIRECT: Record<string, View> = {
  cockpit: 'canvas', hub: 'canvas', dashboard: 'canvas',
  activity: 'agents', tools: 'settings', models: 'models',
  devices: 'canvas', home: 'canvas', coach: 'canvas',
  assistant: 'canvas', capabilities: 'canvas', briefing: 'canvas',
  'memory-ingest': 'memory',
};

function readStoredView(): View {
  try {
    // ?view=mind|forge|... apre direttamente quella schermata (usato dalle
    // finestre secondarie) e NON tocca la view salvata
    const fromUrl = new URLSearchParams(window.location.search).get('view');
    if (fromUrl && VALID_VIEWS.includes(fromUrl as View)) return fromUrl as View;
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored && LEGACY_REDIRECT[stored]) return LEGACY_REDIRECT[stored];
    return VALID_VIEWS.includes(stored as View) ? (stored as View) : 'canvas';
  } catch {
    return 'canvas';
  }
}

function createConversation(): Conversation {
  const now = Date.now();

  return {
    id: createId('chat'),
    title: 'Nuova conversazione',
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: createId(role),
    role,
    content,
    createdAt: Date.now()
  };
}

function titleFromMessage(content: string) {
  return content.replace(/\s+/g, ' ').trim().slice(0, 42) || 'Nuova conversazione';
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && /abort|annull/i.test(error.message);
}

function routeTaskFromText(content: string, voice = false): 'chat' | 'voice' | 'coding' | 'reasoning' {
  const lower = content.toLowerCase();
  if (voice) return 'voice';
  if (/codice|coding|patch|bug|fix|typescript|tsx|react|build|debug|refactor/.test(lower)) return 'coding';
  if (/ragiona|analizza|architettura|piano|strategia|research|multi-step/.test(lower)) return 'reasoning';
  return 'chat';
}

function normalizeSettings(settings: KiraSettings): KiraSettings {
  const storedProvider = (settings as { activeProvider?: string }).activeProvider;

  return {
    ...settings,
    activeProvider: 'ollama',
    selectedModel: storedProvider && storedProvider !== 'ollama' ? DEFAULT_SETTINGS.selectedModel : settings.selectedModel,
    // Migrazione: qualunque provider TTS legacy salvato (es. 'elevenlabs', rimosso) viene rimappato al default locale.
    ttsProvider: 'piper',
    performanceMode: settings.performanceMode || 'high'
  };
}

export default function App() {
  const [storedSettings, setSettings] = useLocalStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
  const [conversations, setConversations] = useLocalStorage<Conversation[]>(STORAGE_KEYS.conversations, []);
  const [activeId, setActiveId] = useLocalStorage(STORAGE_KEYS.activeConversation, '');
  const [temporaryConversation, setTemporaryConversation] = useState<Conversation | null>(null);
  const [view, setView] = useState<View>(() => readStoredView());
  const [isThinking, setIsThinking] = useState(false);
  const [chatError, setChatError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarPeek, setSidebarPeek] = useState(false);    // hidden ma fly-out on hover
  const [peekVisible, setPeekVisible] = useState(false);    // hover-trigger
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastInputAtRef = useRef('');
  const extractionTurnRef = useRef(0);
  const lastVoiceInputAtRef = useRef(0);

  interface PendingConfirm {
    question: string;
    action: {
      endpoint: string; method?: string; body?: unknown;
      confirmLabel?: string; cancelLabel?: string;
      cancelEndpoint?: string; cancelMethod?: string;
    };
    conversationId: string;
  }
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const { setVoiceState } = useVoiceState();

  // Sync isThinking → VoiceStateContext so all primitives react to it
  useEffect(() => {
    setVoiceState(isThinking ? 'thinking' : 'idle');
  }, [isThinking, setVoiceState]);

  // Expose sidebar offset globally so CanvasShell (position:fixed) can respect it
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const value = isMobile ? '0px'
      : sidebarPeek ? '0px'   // peek mode → no static offset, sidebar fluttua
      : (sidebarCollapsed ? '3.25rem' : '16rem');
    document.documentElement.style.setProperty('--kc-sidebar-offset', value);
  }, [sidebarCollapsed, sidebarPeek]);

  useEffect(() => {
    document.documentElement.style.setProperty('--kc-titlebar-h', '0px');
  }, []);

  // (Auto-collapse on canvas rimosso — rispetta la scelta utente del toggle ‹/›)

  const { models, error: modelsError, isLoading: isLoadingModels, refresh } = useOllamaModels(settings.endpoint);
  const { diagnostics } = useDiagnostics(settings.endpoint);
  useCalmMode();
  const activeConversation = temporaryConversation || conversations.find((conversation) => conversation.id === activeId);

  useEffect(() => {
    setConversations((current) => current.filter((conversation) => conversation.messages.length > 0));
  }, [setConversations]);

  useEffect(() => {
    try {
      // Le finestre secondarie (?view=…) non devono sovrascrivere la view della principale
      if (new URLSearchParams(window.location.search).has('view')) return;
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Ignora storage non disponibile senza resettare la pagina.
    }
  }, [view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      // Ctrl/Cmd+K → apre l'UNICA Command Palette (quella del Canvas).
      // Se non siamo sul canvas, ci passiamo prima così la palette è montata,
      // poi emettiamo l'evento che la palette ascolta.
      if ((event.ctrlKey || event.metaKey) && key === 'k') {
        event.preventDefault();
        setView('canvas');
        requestAnimationFrame(() => requestAnimationFrame(() =>
          window.dispatchEvent(new CustomEvent('kira:openCommandPalette'))));
      }
    };
    const onSidebarToggle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebarPeek((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onSidebarToggle);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onSidebarToggle);
    };
  }, []);

  // Edge hover trigger per sidebar peek mode — quando in peek, hover sui primi 8px
  // del bordo sinistro espande la sidebar fluttuante
  useEffect(() => {
    if (!sidebarPeek) { setPeekVisible(false); return; }
    const onMove = (e: MouseEvent) => {
      if (e.clientX < 8) setPeekVisible(true);
      else if (e.clientX > 280) setPeekVisible(false);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [sidebarPeek]);

  useEffect(() => {
    if (!settings.selectedModel && models.length > 0) {
      setSettings({ ...settings, selectedModel: models[0].name });
    }
  }, [models, settings, setSettings]);

  // Traccia ogni voice-input per attivare TTS feedback dopo la risposta
  useEffect(() => {
    const onVoice = () => { lastVoiceInputAtRef.current = Date.now(); };
    window.addEventListener('kira:voice-input', onVoice);
    return () => window.removeEventListener('kira:voice-input', onVoice);
  }, []);

  useEffect(() => {
    function ping() {
      const device = window.innerWidth < 768 ? 'mobile' : 'desktop';
      void fetch('/api/session/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view, device, chatOpen: view === 'chat', lastInputAt: lastInputAtRef.current }),
      }).catch(() => undefined);
    }
    ping();
    const id = window.setInterval(ping, 25_000);
    return () => window.clearInterval(id);
  }, [view]);

  // ─── Server → localStorage sync (boot) ───────────────────────────────────────
  // Load recent conversations from server and merge into localStorage so
  // cross-session history is visible without manual import.
  useEffect(() => {
    let cancelled = false;
    async function loadFromServer() {
      try {
        const res = await fetch('/api/chat/conversations');
        if (!res.ok || cancelled) return;
        const data = await res.json() as { conversations?: Array<{ id: string; title: string; updatedAt: string; messageCount: number }> };
        const serverMetas = (data.conversations || []).filter((c) => c.messageCount > 0).slice(0, 20);
        if (serverMetas.length === 0 || cancelled) return;

        const localIds = new Set(conversations.map((c) => c.id));
        const toFetch = serverMetas.filter((sm) => !localIds.has(sm.id));
        if (toFetch.length === 0) return;

        const fetched: Conversation[] = [];
        for (const meta of toFetch.slice(0, 10)) {
          if (cancelled) break;
          try {
            const r = await fetch(`/api/chat/conversations/${meta.id}`);
            if (!r.ok) continue;
            const full = await r.json() as { id: string; title: string; createdAt: string; updatedAt: string; messages: Array<{ id: string; role: string; content: string; createdAt: string }> };
            fetched.push({
              id: full.id,
              title: full.title,
              createdAt: new Date(full.createdAt).getTime(),
              updatedAt: new Date(full.updatedAt).getTime(),
              messages: full.messages.map((m) => ({
                id: m.id,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                createdAt: new Date(m.createdAt).getTime(),
              })),
            });
          } catch { /* skip */ }
        }

        if (fetched.length > 0 && !cancelled) {
          setConversations((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const newOnes = fetched.filter((f) => !existingIds.has(f.id));
            if (newOnes.length === 0) return prev;
            return [...newOnes, ...prev].sort((a, b) => b.updatedAt - a.updatedAt);
          });
        }
      } catch { /* server not running — skip */ }
    }
    void loadFromServer();
    return () => { cancelled = true; };
  // Run once on mount — conversations array excluded intentionally to avoid re-triggering
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Server sync ─────────────────────────────────────────────────────────────

  async function syncToServer(conv: Conversation) {
    if (conv.temporary || conv.messages.length === 0) return;
    try {
      await fetch(`/api/chat/conversations/${conv.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: conv.title,
          messages: conv.messages.map((m) => ({ role: m.role, content: m.content })),
          linkedJobIds: conv.linkedJobIds || [],
        }),
      });
    } catch { /* non bloccante */ }
  }

  // Sync attiva conversazione al server dopo ogni risposta completata
  useEffect(() => {
    if (isThinking || !activeConversation || activeConversation.temporary) return;
    if (activeConversation.messages.length === 0) return;
    void syncToServer(activeConversation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isThinking]);

  function handlePinConversation(id: string) {
    setConversations((current) =>
      current.map((c) => c.id === id ? { ...c, pinned: !c.pinned } : c)
    );
    fetch(`/api/chat/conversations/${id}/pin`, { method: 'POST' }).catch(() => null);
  }

  function updateConversation(id: string, updater: (conversation: Conversation) => Conversation) {
    if (temporaryConversation?.id === id) {
      setTemporaryConversation((current) => (current ? updater(current) : current));
      return;
    }

    setConversations((current) => current.map((conversation) => (conversation.id === id ? updater(conversation) : conversation)));
  }

  function handleNewChat() {
    setTemporaryConversation(null);
    setActiveId('');
    setView('chat');
    setChatError('');
  }

  function handleTemporaryChat() {
    const next = { ...createConversation(), id: 'temporary', title: 'Chat temporanea', temporary: true };
    setTemporaryConversation(next);
    setActiveId(next.id);
    setView('chat');
    setChatError('');
  }

  function handleSelectConversation(id: string) {
    setTemporaryConversation(null);
    setActiveId(id);
  }

  function handleDeleteConversation(id: string) {
    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    if (id === activeId) {
      setActiveId('');
      setTemporaryConversation(null);
      setView('canvas');
    }
  }

  function handleCockpitSend(content: string, attachment?: KiraAttachment) {
    // Dal Kira Core composer: usa il router unificato. Resta su canvas —
    // la conversazione vive nel ChatWidget; widget specifici
    // si aprono automaticamente via `openWidget` dal router.
    void handleSend(content, undefined, attachment);
    // Apri ChatWidget se non già aperto, così l'utente vede la risposta arrivare.
    window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: 'chat' } }));
  }

  function handleClearChat() {
    if (!activeConversation) {
      return;
    }

    if (temporaryConversation?.id === activeConversation.id) {
      setTemporaryConversation({ ...temporaryConversation, messages: [], updatedAt: Date.now() });
      return;
    }

    handleDeleteConversation(activeConversation.id);
  }

  function stopActiveResponse() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsThinking(false);
  }

  // Bridge ChatWidget (dentro al canvas) → handleSend del root.
  // Quando ChatWidget emette `kira:userSend`, eseguiamo lo stesso flow di
  // KiraCore.onSend così tutta l'app vede la stessa pipeline (router unificato,
  // openWidget, history, etc).
  useEffect(() => {
    const onUserSend = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text?: string } | null;
      if (!detail?.text?.trim()) return;
      void handleSend(detail.text.trim()).finally(() => {
        window.dispatchEvent(new CustomEvent('kira:assistantDone'));
      });
    };
    window.addEventListener('kira:userSend', onUserSend);
    return () => window.removeEventListener('kira:userSend', onUserSend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apertura schermi (La Mente / Officina) via comando naturale dal canvas.
  useEffect(() => {
    const onSetView = (e: Event) => {
      const detail = (e as CustomEvent).detail as { view?: View } | null;
      if (detail?.view && VALID_VIEWS.includes(detail.view)) setView(detail.view);
    };
    window.addEventListener('kira:setView', onSetView);
    return () => window.removeEventListener('kira:setView', onSetView);
  }, []);

  // ESC globale: torna al Canvas da qualsiasi view secondaria. Non interferisce con
  // input attivi (l'utente potrebbe usare ESC per chiudere dropdown/dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      // Non rubare ESC a input/textarea/contenteditable
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (view !== 'canvas') {
        e.preventDefault();
        setView('canvas');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  async function handleSend(content: string, hooks?: VoiceSendHooks, attachment?: KiraAttachment) {
    if (isThinking) {
      return '';
    }
    lastInputAtRef.current = new Date().toISOString();
    const displayContent = content || (attachment?.filename ? `📎 ${attachment.filename}` : content);

    let conversationForSend = activeConversation;
    if (!conversationForSend) {
      conversationForSend = createConversation();
      setConversations((current) => [conversationForSend as Conversation, ...current]);
      setActiveId(conversationForSend.id);
    }

    const userMessage = createMessage('user', displayContent);
    const assistantMessage = createMessage('assistant', '');
    const activeConversationId = conversationForSend.id;

    setChatError('');
    setIsThinking(true);
    let routerStreamMessages: RouterStreamMessage[] | undefined;

    updateConversation(activeConversationId, (conversation) => ({
      ...conversation,
      title: conversation.messages.length === 0 ? titleFromMessage(content) : conversation.title,
      updatedAt: Date.now(),
      messages: [...conversation.messages, userMessage, assistantMessage]
    }));

    // ── Kira Unified Router ─────────────────────────────────────────────────
    // Prima tenta il router unificato; se risponde con stream_llm, cade su Ollama.
    {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      let routerHandled = false;
      let agentReply = '';

      try {
        hooks?.onStart?.();
        const history = conversationForSend.messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
        const workspaceContext = getActiveWorkspaceNote();
        const routerResp = await fetch('/api/kira/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, history, workspaceContext: workspaceContext || undefined, attachment: attachment?.text ? attachment : undefined }),
          signal: controller.signal,
        });

        if (routerResp.ok) {
          const routerData = await routerResp.json() as {
            intent: string; handled: boolean; reply: string; executionMode: string;
            streamLLM?: boolean; jobId?: string; openView?: View; openWidget?: string; closeWidget?: string;
            streamMessages?: RouterStreamMessage[];
            needsConfirm?: boolean;
            pendingAction?: { endpoint: string; method?: string; body?: unknown; confirmLabel?: string; cancelLabel?: string };
          };
          if (routerData.handled && routerData.executionMode !== 'stream_llm') {
            // Risposta diretta dal router
            routerHandled = true;
            agentReply = routerData.reply || '';
            updateConversation(activeConversationId, (conversation) => ({
              ...conversation,
              updatedAt: Date.now(),
              messages: conversation.messages.map((message) =>
                message.id === assistantMessage.id ? { ...message, content: agentReply } : message
              )
            }));

            // Confirm flow — sospendi e chiedi all'utente prima di eseguire
            if (routerData.needsConfirm && routerData.pendingAction) {
              setPendingConfirm({
                question: agentReply,
                action: routerData.pendingAction,
                conversationId: activeConversationId,
              });
            }

            if (routerData.openView && VALID_VIEWS.includes(routerData.openView)) {
              setView(routerData.openView);
            }
            if (routerData.openWidget) {
              const wid = routerData.openWidget;
              const dispatch = () => window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: wid } }));
              if (view !== 'canvas') {
                setView('canvas');
                requestAnimationFrame(() => requestAnimationFrame(dispatch));
              } else {
                dispatch();
              }
            }
            if (routerData.closeWidget) {
              window.dispatchEvent(new CustomEvent('kira:closeWidget', { detail: { widgetId: routerData.closeWidget } }));
            }
            hooks?.onDone?.(agentReply);
          }
          if (routerData.streamLLM && routerData.streamMessages?.length) {
            routerStreamMessages = routerData.streamMessages;
          }
          // Se stream_llm -> cade su Ollama sotto con i messaggi preparati dal router.
        }
      } catch (error) {
        if (isAbortError(error)) {
          hooks?.onStop?.();
          setIsThinking(false);
          return 'Risposta fermata.';
        }
        // In caso di errore router, cade su Ollama
      }

      if (routerHandled) {
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
        setIsThinking(false);
        return agentReply;
      }
    }
    // ── Fine Kira Router — fallthrough a Ollama per risposte LLM ────────────

    if (!settings.selectedModel) {
      const message = 'Seleziona un modello Ollama nelle impostazioni';
      setChatError(message);
      setView('settings');
      hooks?.onError?.(message);
      updateConversation(activeConversationId, (conversation) => ({
        ...conversation,
        updatedAt: Date.now(),
        messages: conversation.messages.map((item) =>
          item.id === assistantMessage.id ? { ...item, content: message } : item
        )
      }));
      setIsThinking(false);
      return '';
    }

    const contextMessages = [...conversationForSend.messages, userMessage];

    let assistantContent = '';
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let firstTokenSeen = false;

    try {
      hooks?.onStart?.();
      await streamChat({
        endpoint: settings.endpoint,
        model: resolveModel(settings, routeTaskFromText(content, Boolean(hooks))),
        systemPrompt: settings.systemPrompt,
        messages: contextMessages,
        messageOverride: routerStreamMessages,
        signal: controller.signal,
        onToken: (token) => {
          if (!firstTokenSeen) {
            firstTokenSeen = true;
            hooks?.onFirstToken?.();
          }
          assistantContent += token;
          hooks?.onToken?.(assistantContent, token);
          updateConversation(activeConversationId, (conversation) => ({
            ...conversation,
            updatedAt: Date.now(),
            messages: conversation.messages.map((message) =>
              message.id === assistantMessage.id ? { ...message, content: assistantContent } : message
            )
          }));
        }
      });
      hooks?.onDone?.(assistantContent);
    } catch (error) {
      if (isAbortError(error)) {
        hooks?.onStop?.();
        if (!assistantContent) assistantContent = 'Risposta fermata.';
        updateConversation(activeConversationId, (conversation) => ({
          ...conversation,
          updatedAt: Date.now(),
          messages: conversation.messages.map((item) =>
            item.id === assistantMessage.id ? { ...item, content: assistantContent } : item
          )
        }));
        return assistantContent;
      }
      const message = error instanceof Error ? error.message : OLLAMA_UNREACHABLE;
      setChatError(message || OLLAMA_UNREACHABLE);
      hooks?.onError?.(message || OLLAMA_UNREACHABLE);
      updateConversation(activeConversationId, (conversation) => ({
        ...conversation,
        updatedAt: Date.now(),
        messages: conversation.messages.map((item) =>
          item.id === assistantMessage.id ? { ...item, content: message || OLLAMA_UNREACHABLE } : item
        )
      }));
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setIsThinking(false);
    }

    // Fire-and-forget memory extraction every 4 turns (non-blocking).
    // Usa i messaggi REALI di questo turno (contextMessages + reply), non
    // `activeConversation` che è una closure stale (null per le chat appena create
    // → prima l'estrazione non partiva mai nei primi turni di una conversazione nuova).
    extractionTurnRef.current += 1;
    if (extractionTurnRef.current % 4 === 0 && assistantContent) {
      const msgs = [...contextMessages, { role: 'assistant' as const, content: assistantContent }]
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));
      if (msgs.length >= 2) {
        fetch('/api/chat/extract-memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: msgs }),
        }).catch(() => { /* silent */ });
      }
    }

    // Voice TTS feedback: se l'input è arrivato dalla voce (wake word) negli
    // ultimi 30s e abbiamo un assistantContent → sintetizza in voce.
    const voiceTriggered = lastVoiceInputAtRef.current > 0 && Date.now() - lastVoiceInputAtRef.current < 30_000;
    if (voiceTriggered && assistantContent && assistantContent.trim().length > 0) {
      lastVoiceInputAtRef.current = 0; // consume
      const speakText = assistantContent.length > 600 ? assistantContent.slice(0, 600) + '…' : assistantContent;
      void speakTTS(speakText);
    }

    return assistantContent;
  }

  return (
    <div className={`min-h-screen overflow-hidden text-white`} style={{ background: '#000' }}>
      {/* Kira 1.0 — ambient glow più contenuto e profondo */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(169,201,255,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 20%, rgba(124,58,237,0.07) 0%, transparent 55%), radial-gradient(ellipse 50% 35% at 20% 75%, rgba(30,64,175,0.06) 0%, transparent 55%)' }} />
      {/* Sottile griglia quantica */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(169,201,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(169,201,255,0.6) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />

      {view !== 'voice' ? (
        <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-kira-void/92 px-4 backdrop-blur-xl md:hidden">
          <button className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white/70" onClick={() => setMobileSidebarOpen(true)}>
            Menu
          </button>
          <button className="text-sm font-semibold uppercase tracking-[0.34em] text-white/88" onClick={() => setView('canvas')}>KIRA</button>
          <button className="rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-medium text-black" onClick={handleNewChat}>
            Nuova
          </button>
        </header>
      ) : null}

      <Sidebar
        conversations={conversations}
        temporaryConversation={temporaryConversation}
        activeId={activeConversation?.id || ''}
        view={view}
        collapsed={sidebarCollapsed}
        hideOnMobile={view === 'voice'}
        mobileOpen={mobileSidebarOpen}
        peek={sidebarPeek}
        peekVisible={peekVisible}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onTemporaryChat={handleTemporaryChat}
        onDeleteConversation={handleDeleteConversation}
        onPinConversation={handlePinConversation}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onChangeView={setView}
      />

      {/* Peek-mode edge indicator + hint */}
      {sidebarPeek && !peekVisible ? (
        <div
          aria-hidden="true"
          className="hidden md:block"
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, width: 6, zIndex: 39,
            background: 'linear-gradient(90deg, rgba(169,201,255,0.18), transparent)',
            pointerEvents: 'none',
          }}
        />
      ) : null}

      <main
        className={`relative z-10 min-h-[100dvh] transition-[padding] duration-300 ${view === 'voice' ? '' : 'pt-14 md:pt-0'} ${sidebarPeek ? '' : (sidebarCollapsed ? 'md:pl-[3.25rem]' : 'md:pl-64')}`}
      >
        <CognitiveBackdrop active={isThinking || view === 'voice'} />
        <VoiceIndicator />
        {/* Floating "← Canvas" button visibile in tutte le view non-canvas */}
        {view !== 'canvas' && view !== 'voice' ? (
          <button
            type="button"
            onClick={() => setView('canvas')}
            className="fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full border border-white/12 bg-kira-void/85 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-white/85 shadow-lg backdrop-blur-md transition hover:border-white/24 hover:bg-kira-void/95 hover:text-white md:left-auto md:right-6 md:top-4 md:translate-x-0"
            title="Torna al Canvas (ESC)"
            aria-label="Torna al Canvas"
          >
            ← Canvas
          </button>
        ) : null}
        {view === 'canvas' ? (
          <CanvasShell
            onSend={handleCockpitSend}
            onStop={stopActiveResponse}
            isThinking={isThinking}
            canSend={Boolean(settings.selectedModel)}
            performanceMode={settings.performanceMode}
          />
        ) : null}
        {view === 'settings' ? (
          <SettingsPanel
            settings={settings}
            models={models}
            modelsError={modelsError}
            diagnostics={diagnostics}
            isLoadingModels={isLoadingModels}
            onRefreshModels={refresh}
            onOpenModels={() => setView('models')}
            onChange={setSettings}
          />
        ) : null}
        {view === 'models' ? (
          <ModelsPanel
            settings={settings}
            localModels={models}
            onChange={setSettings}
          />
        ) : null}
        {view === 'memory' ? <MemoryPanel /> : null}
        {view === 'mind' ? <Suspense fallback={null}><MindScreen /></Suspense> : null}
        {view === 'forge' ? <Suspense fallback={null}><ForgeScreen /></Suspense> : null}
        {view === 'agents' ? <AgentsPanel /> : null}
        {view === 'voice' ? (
          <VoicePanel
            canSend={Boolean(settings.selectedModel)}
            settings={settings}
            globalError={chatError || modelsError}
            onBack={() => setView('canvas')}
            onSendVoice={handleSend}
            onStopVoice={stopActiveResponse}
          />
        ) : null}
        {view === 'chat' ? (
          <ChatPanel
            messages={activeConversation?.messages || []}
            isThinking={isThinking}
            error={chatError || modelsError}
            canSend={Boolean(settings.selectedModel)}
            onSend={handleSend}
            onStop={stopActiveResponse}
            onClear={handleClearChat}
            onOpenVoice={() => setView('voice')}
          />
        ) : null}
      </main>

      {/* Mobile bottom navigation — visible only on small screens */}
      <nav className="k-mobile-nav" aria-label="Navigazione mobile">
        {[
          { icon: '⬡', label: 'Kira',   viewId: 'canvas'   },
          { icon: '◎', label: 'Memoria',  viewId: 'memory'   },
          { icon: '◷', label: 'Settings', viewId: 'settings' },
        ].map((item) => (
          <button
            key={item.viewId}
            className={`k-mobile-nav-btn${view === item.viewId ? ' active' : ''}`}
            onClick={() => setView(item.viewId as Parameters<typeof setView>[0])}
          >
            <span className="k-mobile-nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── Confirm Dialog overlay ─────────────────────────────────────────── */}
      {pendingConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10010,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPendingConfirm(null); }}
        >
          <div style={{
            background: 'rgba(7,11,24,0.96)',
            border: '1px solid rgba(169,201,255,0.25)',
            borderRadius: 16,
            padding: '28px 32px',
            maxWidth: 420,
            width: '90%',
            boxShadow: '0 32px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(169,201,255,0.08)',
          }}>
            <div style={{ fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(169,201,255,0.6)', marginBottom: 10 }}>
              🛑 Conferma richiesta
            </div>
            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.88)', lineHeight: 1.55, marginBottom: 22 }}>
              {pendingConfirm.question}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                disabled={confirmLoading}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9,
                  background: 'rgba(248,113,113,0.14)', border: '1px solid rgba(248,113,113,0.35)',
                  color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s', letterSpacing: '0.04em',
                }}
                onClick={() => {
                  const { action, conversationId } = pendingConfirm;
                  setPendingConfirm(null);
                  updateConversation(conversationId, (conv) => ({
                    ...conv,
                    messages: [...conv.messages, createMessage('assistant', 'Annullato.')],
                  }));
                  if (action.cancelEndpoint) {
                    fetch(action.cancelEndpoint, {
                      method: action.cancelMethod || 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    }).catch(() => null);
                  }
                }}
              >
                {pendingConfirm.action.cancelLabel || 'Annulla'}
              </button>
              <button
                disabled={confirmLoading}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9,
                  background: 'rgba(169,201,255,0.14)', border: '1px solid rgba(169,201,255,0.4)',
                  color: '#a9c9ff', fontSize: '0.78rem', cursor: confirmLoading ? 'wait' : 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.15s', letterSpacing: '0.04em',
                }}
                onClick={async () => {
                  setConfirmLoading(true);
                  const { action, conversationId } = pendingConfirm;
                  setPendingConfirm(null);
                  try {
                    const resp = await fetch(action.endpoint, {
                      method: action.method || 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: action.body ? JSON.stringify(action.body) : undefined,
                    });
                    const json = await resp.json() as { ok?: boolean; message?: string };
                    const resultText = json.message || (json.ok ? 'Fatto.' : 'Errore nell\'esecuzione.');
                    updateConversation(conversationId, (conv) => ({
                      ...conv,
                      messages: [...conv.messages, createMessage('assistant', resultText)],
                    }));
                    // Notify relevant widgets of data change
                    if (action.endpoint.includes('calendar') && json.ok) {
                      window.dispatchEvent(new CustomEvent('kira:calendarUpdated'));
                    }
                    if (json.ok && action.endpoint.includes('/api/kira/apply-fix')) {
                      setView('forge');
                    }
                    // Refresh ambient NowBar / Recents
                    if (json.ok) window.dispatchEvent(new CustomEvent('kira:actionLogged'));
                    // Log confirmed action in notification log
                    const source = action.endpoint.includes('pc') ? 'pc'
                      : 'system';
                    fetch('/api/notifications/log', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ source, message: resultText.slice(0, 120), type: json.ok ? 'action' : 'error', detail: action.confirmLabel }),
                    }).catch(() => null);
                  } catch {
                    updateConversation(conversationId, (conv) => ({
                      ...conv,
                      messages: [...conv.messages, createMessage('assistant', 'Errore di rete durante l\'esecuzione.')],
                    }));
                  } finally {
                    setConfirmLoading(false);
                  }
                }}
              >
                {confirmLoading ? '…' : (pendingConfirm.action.confirmLabel || 'Conferma')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
