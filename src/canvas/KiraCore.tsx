import { USER_NAME } from '../config/user';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ParticleCoreCanvas } from '../components/visual/ParticleCoreCanvas';
import { ThinkingBubble } from '../components/kira/ThinkingBubble';
import { useVoiceState } from '../contexts/VoiceStateContext';
import { useAvatarAmbientMode } from '../hooks/useAvatarAmbientMode';
import { useCanvasCommand } from './useCanvasCommand';
import { KiraGlyph } from './KiraGlyph';
import { parseCommand } from './commandParser';
import { WIDGET_REGISTRY } from './widgetRegistry';
import type { KiraSettings } from '../types/settings';

// SpeechRecognition browser API (web-speech)
type SpeechRecognitionResultsLike = { 0: { transcript: string }; isFinal: boolean };
interface SpeechRecognitionEventLike { results: ArrayLike<SpeechRecognitionResultsLike>; resultIndex: number }
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
function getSpeechRecognitionCtor(): { new(): SpeechRecognitionLike } | null {
  const w = window as unknown as { SpeechRecognition?: { new(): SpeechRecognitionLike }; webkitSpeechRecognition?: { new(): SpeechRecognitionLike } };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface KiraAttachment {
  roleId?: string;
  roleName?: string;
  text?: string;
  filename?: string;
  topic?: string;
  kind?: string;
}

interface KiraCoreProps {
  onSend: (text: string, attachment?: KiraAttachment) => void;
  onStop: () => void;
  isThinking: boolean;
  canSend: boolean;
  performanceMode?: KiraSettings['performanceMode'];
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return 'Buonanotte';
  if (h < 12) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

export function KiraCore({ onSend, onStop, isThinking, canSend, performanceMode }: KiraCoreProps) {
  const { voiceState } = useVoiceState();
  useAvatarAmbientMode(voiceState);
  const dispatchCanvasCommand = useCanvasCommand();
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(new Date());
  const [recording, setRecording] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [attached, setAttached] = useState<KiraAttachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const sendRecognizedText = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || isThinking) return;
    const result = await dispatchCanvasCommand(content);
    if (result.handled) {
      setDraft('');
      return;
    }
    if (!canSend) return;
    setDraft('');
    onSend(content);
  }, [canSend, dispatchCanvasCommand, isThinking, onSend]);

  const handleFile = useCallback(async (file: File) => {
    if (!file || attaching) return;
    if (file.size > 20 * 1024 * 1024) { setAttachError('File troppo grande (max 20MB).'); return; }
    setAttaching(true);
    setAttachError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('lettura fallita'));
        fr.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1] || '';
      const r = await fetch('/api/kira/attach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime: file.type, dataBase64: base64 }),
      });
      const d = await r.json().catch(() => null) as
        | { ok: boolean; error?: string; text?: string; kind?: string; topic?: string; roleId?: string; roleName?: string }
        | null;
      if (!d?.ok) { setAttachError(d?.error || 'Impossibile leggere il file.'); return; }
      setAttached({ filename: file.name, text: d.text, kind: d.kind, topic: d.topic, roleId: d.roleId, roleName: d.roleName });
    } catch {
      setAttachError('Errore durante l\'allegato.');
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [attaching]);

  const toggleMic = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      // Browser non supporta SpeechRecognition (Firefox). Fallback: trigger VoiceWidget?
      window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: 'voice' } }));
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    if (isThinking) return;
    const rec = new Ctor();
    rec.lang = 'it-IT';
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = '';
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setDraft((finalText + interim).trim());
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
      if (finalText.trim()) {
        const spokenText = finalText.trim();
        window.setTimeout(() => { void sendRecognizedText(spokenText); }, 50);
      }
    };
    recognitionRef.current = rec;
    setRecording(true);
    try { rec.start(); } catch { setRecording(false); }
  }, [isThinking, recording, sendRecognizedText]);

  // Cleanup recognition se il widget viene smontato durante recording
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Ampiezza audio live: l'orb reagisce alla voce. La sorgente e' il
  // VoiceWidget (analyser del microfono / TTS) che emette `kira:amplitude`.
  // Decay automatico verso 0 se non arrivano aggiornamenti (es. registrazione finita).
  useEffect(() => {
    let last = 0;
    const onAmp = (e: Event) => {
      const v = (e as CustomEvent<{ value: number }>).detail?.value;
      if (typeof v === 'number' && Number.isFinite(v)) {
        last = Date.now();
        setAmplitude(Math.min(1, Math.max(0, v)));
      }
    };
    window.addEventListener('kira:amplitude', onAmp as EventListener);
    const decay = window.setInterval(() => {
      if (Date.now() - last > 250) setAmplitude((a) => (a > 0.01 ? a * 0.7 : 0));
    }, 120);
    return () => {
      window.removeEventListener('kira:amplitude', onAmp as EventListener);
      window.clearInterval(decay);
    };
  }, []);

  // Auto-invia il testo trascritto dal VoiceWidget al composer
  useEffect(() => {
    const onVoiceInput = async (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail || {};
      if (!text?.trim() || isThinking) return;
      const result = await dispatchCanvasCommand(text);
      if (!result.handled && canSend) onSend(text);
    };
    window.addEventListener('kira:voice-input', onVoiceInput as EventListener);
    return () => window.removeEventListener('kira:voice-input', onVoiceInput as EventListener);
  }, [isThinking, canSend, dispatchCanvasCommand, onSend]);

  // Composer fill da widget cards (Ask Kira, senza inviare).
  useEffect(() => {
    const onFill = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail || {};
      if (typeof text === 'string') setDraft(text);
    };
    window.addEventListener('kira:composerFill', onFill as EventListener);
    return () => window.removeEventListener('kira:composerFill', onFill as EventListener);
  }, []);

  const commandPreview = useMemo(() => {
    if (!draft.trim() || isThinking) return null;
    const cmd = parseCommand(draft);
    if (!cmd) return null;
    switch (cmd.type) {
      case 'open': {
        const def = WIDGET_REGISTRY[cmd.widgetId];
        return { icon: def.icon, label: `Apri ${def.name}` };
      }
      case 'close': {
        const def = WIDGET_REGISTRY[cmd.widgetId];
        return { icon: 'x', label: `Chiudi ${def.name}` };
      }
      case 'closeAll':
        return { icon: 'o', label: 'Chiudi tutti i widget' };
      case 'hideAllExceptCore':
        return { icon: 'o', label: 'Solo Kira Core' };
      case 'saveLayout':
        return { icon: '#', label: `Salva layout "${cmd.name}"` };
      case 'loadLayout':
        return { icon: '#', label: `Carica layout "${cmd.name}"` };
      case 'minimize': {
        const def = WIDGET_REGISTRY[cmd.widgetId];
        return { icon: '-', label: `Minimizza ${def.name}` };
      }
      case 'fullscreen': {
        const def = WIDGET_REGISTRY[cmd.widgetId];
        return { icon: '+', label: `Espandi ${def.name}` };
      }
      case 'move': {
        const def = WIDGET_REGISTRY[cmd.widgetId];
        return { icon: '<>', label: `Sposta ${def.name} a ${cmd.position}` };
      }
      case 'stopVoice':
        return { icon: 'stop', label: 'Ferma voce' };
      case 'copyResume':
        return { icon: 'copy', label: 'Copia resume prompt' };
      case 'help':
        return { icon: '?', label: 'Mostra comandi' };
      case 'openView':
        return cmd.view === 'mind'
          ? { icon: 'mind', label: 'Apri La Mente' }
          : { icon: 'forge', label: 'Apri Officina' };
      default:
        return null;
    }
  }, [draft, isThinking]);

  async function submit() {
    const content = draft.trim();
    if (isThinking) {
      onStop();
      return;
    }
    if (!content && !attached) return;

    // Con un allegato saltiamo i comandi canvas: e' una richiesta di analisi documento.
    if (content && !attached) {
      const result = await dispatchCanvasCommand(content);
      if (result.handled) {
        setDraft('');
        return;
      }
    }

    if (!canSend) return;
    const att = attached || undefined;
    setDraft('');
    setAttached(null);
    setAttachError('');
    onSend(content, att);
  }

  return (
    <div className="kc-core" data-state={voiceState}>
      <div className="kc-core-system-id" aria-hidden="true">
        <span className="kc-core-system-id-tick" />
        <span className="kc-core-system-id-glyph"><KiraGlyph size={14} voiceState={voiceState} /></span>
        <span className="kc-core-system-id-text">KIRA · AI OS</span>
        <span className="kc-core-system-id-tick" />
      </div>

      <div className="kc-core-greeting">
        <span className="kc-core-greeting-text">{greetingFor(now)}, <span className="kc-core-greeting-name">{USER_NAME}</span></span>
        <span className="kc-core-greeting-time">
          <span className="kc-core-greeting-clock">{now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <span className="kc-core-greeting-sep">/</span>
          <span>{now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </span>
      </div>

      <div className="kc-core-orb" aria-hidden="true">
        <ParticleCoreCanvas mode={voiceState} amplitude={amplitude} performanceMode={performanceMode} />
      </div>

      <div className="kc-core-thinking">
        <ThinkingBubble active={isThinking} />
      </div>

      <form className="kc-core-composer" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <span className="kc-core-wave" aria-hidden="true" data-state={voiceState}>
          <span /><span /><span /><span /><span />
        </span>

        <input
          className="kc-core-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isThinking ? 'Elaborazione in corso...' : recording ? 'Ascolto...' : 'Chiedi a Kira...'}
          disabled={!canSend && !isThinking}
          aria-label="Composer Kira"
          autoComplete="off"
          spellCheck={false}
        />

        <button
          type="button"
          className="kc-core-attach"
          onClick={() => fileRef.current?.click()}
          disabled={attaching || !canSend}
          title="Allega file, PDF o immagine (Kira lo legge e attiva il ruolo giusto)"
          aria-label="Allega file"
          style={{ opacity: attaching ? 0.5 : 1 }}
        >
          {attaching ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7" cy="7" r="5" strokeDasharray="22" strokeDashoffset="8"><animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="0.8s" repeatCount="indefinite" /></circle></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md,.csv,.tsv,.json,.html,.xml,.log,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf,text/*"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />

        <button
          type="button"
          className={`kc-core-mic ${recording ? 'kc-core-mic-on' : ''}`}
          onClick={toggleMic}
          title={recording ? 'Ferma dettatura' : 'Detta con la voce (STT)'}
          aria-label={recording ? 'Ferma dettatura' : 'Detta con la voce'}
        >
          {recording ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="4" height="7" rx="2" />
              <path d="M3 7a4 4 0 0 0 8 0M7 11v2" />
            </svg>
          )}
        </button>

        <button
          type="submit"
          className={`kc-core-send ${isThinking ? 'kc-core-send-stop' : ''}`}
          disabled={!isThinking && (!canSend || (draft.trim().length === 0 && !attached))}
          title={isThinking ? 'Ferma' : 'Invia'}
          aria-label={isThinking ? 'Ferma' : 'Invia'}
        >
          {isThinking ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="3" y="3" width="6" height="6" rx="1" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6h7M6 3l3 3-3 3" />
            </svg>
          )}
        </button>
      </form>

      {(attached || attachError) && (
        <div className="kc-core-attached" style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '6px 10px',
          borderRadius: 10, fontSize: 12,
          background: attachError ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${attachError ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.1)'}`,
          color: attachError ? '#fca5a5' : '#cbd5e1', maxWidth: 520,
        }}>
          {attachError ? (
            <span>Errore: {attachError}</span>
          ) : (
            <>
              <span>File</span>
              <span style={{ fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attached?.filename}</span>
              {attached?.roleName && (
                <span style={{ opacity: 0.7 }}>-&gt; <strong style={{ color: '#7dd3fc' }}>{attached.roleName}</strong>{attached.topic ? ` - ${attached.topic}` : ''}</span>
              )}
              <button
                type="button"
                onClick={() => { setAttached(null); setAttachError(''); }}
                aria-label="Rimuovi allegato"
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6, fontSize: 14 }}
              >x</button>
            </>
          )}
        </div>
      )}

      {commandPreview && (
        <div className="kc-core-preview" key={draft}>
          <span className="kc-core-preview-icon">{commandPreview.icon}</span>
          <span className="kc-core-preview-label">{commandPreview.label}</span>
          <span className="kc-core-preview-enter">Enter</span>
        </div>
      )}
    </div>
  );
}
