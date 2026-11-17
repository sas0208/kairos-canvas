import { useEffect, useRef, useState, useCallback } from 'react';
import { useVoiceState } from '../../contexts/VoiceStateContext';
import { useToast } from '../../contexts/ToastContext';
import { transcribeAudio } from '../../lib/sttClient';

interface TtsStatus {
  provider: 'piper' | 'none';
  piperConfigured: boolean;
  sentencesQueued: number;
  isSpeaking: boolean;
  currentSentence: string | null;
  lastSpokenAt: string | null;
}

interface SttStatus {
  local?: { url?: string; enabled: boolean };
  activeEngine: 'local-whisper' | 'none';
}

const STATE_COLORS: Record<string, string> = {
  idle:      '#a9c9ff',
  listening: '#fb7185',
  thinking:  '#a78bfa',
  speaking:  '#4ade80',
  executing: '#f5d780',
  error:     '#f87171',
};
const STATE_LABEL: Record<string, string> = {
  idle:      'In attesa',
  listening: 'Ascolto…',
  thinking:  'Sto ragionando',
  speaking:  'Sto parlando',
  executing: 'Esecuzione',
  error:     'Errore',
};

function preferredMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) return 'audio/ogg;codecs=opus';
  return '';
}

const BAR_COUNT = 20;

// "Kira" + trascrizioni vicine che lo STT italiano produce spesso
// (Kyra/Keira/Chira/Kiara): meglio un falso positivo raro che una dea sorda.
const WAKE_WORD = /\b(?:ok\s+|hey\s+|ehi\s+)?(kira|kyra|keira|chira|kiara)\b/i;
const WAKE_WORD_PATTERNS = [WAKE_WORD];

export function VoiceWidget() {
  const { voiceState, setVoiceState, temporaryState } = useVoiceState();
  void temporaryState;
  const [tts, setTts] = useState<TtsStatus | null>(null);
  const [stt, setStt] = useState<SttStatus | null>(null);
  const [transcripts, setTranscripts] = useState<Array<{ time: string; text: string }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState('');
  const [wakeWordOn, setWakeWordOn] = useState(false);
  const [wakeHeard, setWakeHeard] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(() => localStorage.getItem('kira.voice.micId') || '');
  const wakeRecognitionRef = useRef<any>(null);
  const toast = useToast();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<BlobPart[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const frameRef         = useRef(0);
  const barsRef          = useRef<Array<HTMLSpanElement | null>>([]);

  const loadStatus = useCallback(async () => {
    try {
      const [vResp, sResp] = await Promise.all([
        fetch('/api/voice/status'),
        fetch('/api/stt/status'),
      ]);
      setTts(await vResp.json() as TtsStatus);
      setStt(await sResp.json() as SttStatus);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    void loadStatus();
    const id = window.setInterval(loadStatus, 5000);
    const onTranscript = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail || {};
      if (text) setTranscripts((p) => [{ time: new Date().toLocaleTimeString('it-IT'), text }, ...p].slice(0, 8));
    };
    window.addEventListener('kira:transcript', onTranscript as EventListener);
    return () => { window.clearInterval(id); window.removeEventListener('kira:transcript', onTranscript as EventListener); };
  }, [loadStatus]);

  // Enumera device microfono (devono essere già autorizzati una volta per
  // vedere le label leggibili — altrimenti enumerate ritorna anonimi).
  const loadMicDevices = useCallback(async (forcePrompt = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      if (forcePrompt) {
        // Trigger esplicito del prompt permessi cosi' le label diventano leggibili
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
          tmp.getTracks().forEach((t) => t.stop());
        } catch {
          toast.error('Permesso microfono negato. Clicca sull\'icona del lucchetto nella barra URL per autorizzare.');
          return;
        }
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === 'audioinput');
      setMicDevices(mics);
      if (forcePrompt) {
        toast.success(`${mics.length} microfoni rilevati`);
      }
    } catch { /* */ }
  }, [toast]);

  useEffect(() => {
    void loadMicDevices(false);
    if (!navigator.mediaDevices?.addEventListener) return;
    const onChange = () => { void loadMicDevices(false); };
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => { navigator.mediaDevices.removeEventListener('devicechange', onChange); };
  }, [loadMicDevices]);

  const handleMicChange = useCallback((id: string) => {
    setSelectedMicId(id);
    try { localStorage.setItem('kira.voice.micId', id); } catch { /* */ }
  }, []);

  // ── Wake word continuous listener ────────────────────────────────────────
  // Usa Web Speech API SpeechRecognition (Chrome/Edge). Quando sente "Kira",
  // "ok Kira" o "hey Kira" emette evento kira:voice-input col testo dopo
  // la wake word, oppure attiva recording esplicito se la frase è solo la wake.
  useEffect(() => {
    // Broadcast lo stato wake word a tutto il canvas (StatusRail badge)
    window.dispatchEvent(new CustomEvent('kira:wakeword', { detail: { active: wakeWordOn } }));
    if (!wakeWordOn) {
      if (wakeRecognitionRef.current) {
        try { wakeRecognitionRef.current.stop(); } catch { /* ignore */ }
        wakeRecognitionRef.current = null;
      }
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Wake word non supportato (servono Chrome o Edge)');
      setWakeWordOn(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'it-IT';

    rec.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      if (!last || !last.isFinal) return;
      const transcript = (last[0]?.transcript || '').trim();
      if (!transcript) return;
      const matched = WAKE_WORD_PATTERNS.some((p) => p.test(transcript));
      if (!matched) return;
      // Estrai testo dopo la wake word
      const afterWake = transcript.replace(/^.*?\b(?:ok\s+|hey\s+|ehi\s+)?(?:kira|selena|celine|selen)\b[,\s]*/i, '').trim();
      setWakeHeard(true);
      window.dispatchEvent(new CustomEvent('kira:wakeheard'));
      window.setTimeout(() => setWakeHeard(false), 2500);
      if (afterWake) {
        // Comando integrato — invia direttamente al router
        window.dispatchEvent(new CustomEvent('kira:voice-input', { detail: { text: afterWake } }));
      } else {
        // Solo wake word → attiva il recording esplicito
        toast.info('Kira ti ascolta — parla ora');
        void startRecording();
      }
    };
    rec.onerror = (e: any) => {
      const err = e?.error || 'unknown';
      if (err === 'no-speech' || err === 'aborted') return; // continuo
      console.warn('[WakeWord]', err);
    };
    rec.onend = () => {
      // Auto-restart se ancora attivo
      if (wakeWordOn && wakeRecognitionRef.current === rec) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    try { rec.start(); wakeRecognitionRef.current = rec; }
    catch (e) { console.warn('[WakeWord] start failed', e); }

    return () => {
      try { rec.stop(); } catch { /* ignore */ }
      wakeRecognitionRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeWordOn]);

  // Waveform animation from microphone analyser
  const animateBars = useCallback(() => {
    const analyser = analyserRef.current;
    const bars = barsRef.current;
    if (!analyser || !bars.length) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const step = Math.floor(data.length / BAR_COUNT);
    let sum = 0;
    bars.forEach((bar, i) => {
      if (!bar) return;
      const v = data[i * step] / 255;
      sum += v;
      bar.style.transform = `scaleY(${0.15 + v * 0.85})`;
      bar.style.opacity   = String(0.35 + v * 0.65);
    });
    // Ampiezza media → l'orb centrale reagisce alla voce in tempo reale.
    const amp = Math.min(1, (sum / BAR_COUNT) * 1.6);
    window.dispatchEvent(new CustomEvent('kira:amplitude', { detail: { value: amp } }));
    frameRef.current = requestAnimationFrame(animateBars);
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current  = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    barsRef.current.forEach((b) => { if (b) { b.style.transform = 'scaleY(0.15)'; b.style.opacity = '0.35'; } });
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording) { stopRecording(); return; }
    setMicError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Microfono non supportato in questo browser');
      return;
    }
    try {
      const audioConstraints: MediaTrackConstraints = selectedMicId
        ? { deviceId: { exact: selectedMicId } }
        : {};
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        setIsRecording(false);
        cleanup();
        setVoiceState('thinking');
        setIsTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
          const text = await transcribeAudio(blob);
          if (text) {
            setTranscripts((p) => [{ time: new Date().toLocaleTimeString('it-IT'), text }, ...p].slice(0, 8));
            window.dispatchEvent(new CustomEvent('kira:transcript', { detail: { text } }));
            // Auto-invia al composer del canvas
            window.dispatchEvent(new CustomEvent('kira:voice-input', { detail: { text } }));
            toast.success(`Trascritto: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`);
          } else {
            toast.info('Nessun testo rilevato');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Errore trascrizione';
          setMicError(msg);
          toast.error(msg);
        } finally {
          setIsTranscribing(false);
          setVoiceState('idle');
        }
      };

      recorder.start();
      setIsRecording(true);
      setVoiceState('listening');
      frameRef.current = requestAnimationFrame(animateBars);
      toast.info('Microfono attivo — premi Stop per trascrivere');
    } catch (err) {
      const msg = err instanceof DOMException
        ? (err.name === 'NotAllowedError' ? 'Permesso microfono negato'
          : err.name === 'NotFoundError'   ? 'Nessun microfono trovato'
          : err.message)
        : 'Microfono non disponibile';
      setMicError(msg);
      toast.error(msg);
    }
  }, [isRecording, stopRecording, cleanup, setVoiceState, animateBars, toast, selectedMicId]);

  const stopSpeaking = useCallback(async () => {
    try {
      await fetch('/api/voice/stop', { method: 'POST' });
      setVoiceState('idle');
      toast.info('TTS fermato');
      void loadStatus();
    } catch { toast.error('Stop fallito'); }
  }, [setVoiceState, toast, loadStatus]);

  useEffect(() => () => cleanup(), [cleanup]);

  const color = STATE_COLORS[voiceState] ?? STATE_COLORS.idle;
  const label = STATE_LABEL[voiceState]  ?? voiceState;

  return (
    <div className="kc-w-voice" data-state={voiceState}>
      <div className="kc-w-voice-head">
        <div className="kc-w-voice-state" style={{ background: color, boxShadow: `0 0 14px ${color}80` }} />
        <div className="kc-w-voice-state-text">
          <div className="kc-w-voice-state-label" style={{ color }}>{label}</div>
          <div className="kc-w-voice-state-mode">
            {isTranscribing ? 'Trascrizione in corso…' : `TTS: ${tts?.provider ?? '—'}`}
          </div>
        </div>
      </div>

      {/* Waveform — bars pilotate dall'analyser quando registra */}
      <div className="kc-w-voice-wave" aria-hidden="true" style={{ ['--kc-wave-color' as string]: color }}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <span
            key={i}
            className="kc-w-voice-wave-bar"
            ref={(el) => { barsRef.current[i] = el; }}
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>

      {micError && <div className="kc-w-voice-error">{micError}</div>}

      <div className="kc-w-voice-provider">
        <div className="kc-w-voice-row kc-w-voice-row-mic">
          <span className="kc-w-voice-row-label">🎙 Microfono ({micDevices.length})</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
            <select
              className="kc-w-voice-mic-select"
              value={selectedMicId}
              onChange={(e) => handleMicChange(e.target.value)}
              style={{ minWidth: 0, flex: 1 }}
            >
              <option value="">Default sistema</option>
              {micDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Mic ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="kc-w-voice-btn"
              onClick={() => void loadMicDevices(true)}
              title="Autorizza microfono / aggiorna lista (usa per le cuffie USB)"
              style={{ padding: '4px 10px', fontSize: '0.62rem' }}
            >
              ↻
            </button>
          </div>
        </div>
        {micDevices.length === 0 && (
          <div className="kc-w-voice-row" style={{ fontSize: '0.68rem', color: 'rgba(245,158,11,0.85)' }}>
            Nessun microfono visibile — clicca ↻ per autorizzare il browser.
          </div>
        )}
        <div className="kc-w-voice-row">
          <span className="kc-w-voice-row-label">STT (riconoscimento)</span>
          <span className="kc-w-voice-row-val" style={{ color: stt?.activeEngine === 'local-whisper' ? '#4ade80' : 'rgba(255,255,255,0.5)' }}>
            {stt?.activeEngine === 'local-whisper' ? '✓ Whisper locale (gratis)' : '— nessun motore'}
          </span>
        </div>
        <div className="kc-w-voice-row">
          <span className="kc-w-voice-row-label">TTS (voce)</span>
          <span className="kc-w-voice-row-val" style={{ color: tts?.provider === 'piper' ? '#4ade80' : 'rgba(255,255,255,0.5)' }}>
            {tts?.provider === 'piper' ? '✓ Piper locale (gratis)' : '— non configurato'}
          </span>
        </div>
        <div className="kc-w-voice-row kc-w-voice-row-wake">
          <span className="kc-w-voice-row-label">
            Wake word "Kira"
            {wakeHeard && <span className="kc-w-voice-wake-flash">●</span>}
          </span>
          <label className="kc-w-voice-toggle">
            <input
              type="checkbox"
              checked={wakeWordOn}
              onChange={(e) => setWakeWordOn(e.target.checked)}
            />
            <span className="kc-w-voice-toggle-slider" />
          </label>
        </div>
        {tts?.isSpeaking && (
          <div className="kc-w-voice-row">
            <span className="kc-w-voice-row-label">Parla</span>
            <span className="kc-w-voice-row-val">{tts.currentSentence?.slice(0, 36) ?? '…'}</span>
          </div>
        )}
      </div>

      <div className="kc-w-voice-actions">
        <button
          className={`kc-w-voice-btn ${isRecording ? 'kc-w-voice-btn-on' : ''}`}
          onClick={() => void startRecording()}
          disabled={isTranscribing}
        >
          {isTranscribing ? '⏳ trascrivo…' : isRecording ? '⏹ stop + trascrivi' : '🎙 inizia ascolto'}
        </button>
        <button
          className="kc-w-voice-btn"
          onClick={() => void stopSpeaking()}
          disabled={!tts?.isSpeaking}
        >
          🔇 stop voce
        </button>
      </div>

      <div className="kc-w-voice-section">
        <div className="kc-w-voice-section-head">Ultime trascrizioni</div>
        {transcripts.length === 0 ? (
          <div className="kc-w-empty-hint">Premi "Inizia ascolto" e parla</div>
        ) : (
          <ul className="kc-w-voice-list">
            {transcripts.map((t, i) => (
              <li key={i} className="kc-w-voice-line">
                <span className="kc-w-voice-line-time">{t.time}</span>
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
