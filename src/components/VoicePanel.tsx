import { useEffect, useMemo, useRef, useState } from 'react';
import { transcribeAudio } from '../lib/sttClient';
import { piperProvider } from '../lib/tts/piper';
import { SentenceBuffer, TtsQueue, cleanForSpeech } from '../lib/tts/sentenceBuffer';
import type { KiraSettings } from '../types/settings';
import type { VoiceMode, VoiceSendHooks } from '../types/voice';
import { CognitiveOrb } from './CognitiveOrb';

type VoicePanelProps = {
  canSend: boolean;
  settings: KiraSettings;
  globalError: string;
  onBack: () => void;
  onSendVoice: (content: string, hooks?: VoiceSendHooks) => Promise<string>;
  onStopVoice: () => void;
};

type VoiceTiming = {
  sttMs?: number;
  firstTokenMs?: number;
  llmMs?: number;
  ttsMs?: number;
  totalMs?: number;
  model: string;
  device: string;
  network: string;
};

const BAR_COUNT = 28;

function revealTextByProgress(text: string, progress: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const visible = Math.max(1, Math.min(words.length, Math.ceil(words.length * progress)));
  return words.slice(0, visible).join(' ');
}

function cleanSpokenText(text: string) {
  return text
    .replace(/^\s*[-+>]\s+/gm, ' ')
    .replace(/[\*_`#~>|]+/g, ' ')
    .replace(/[•●◆◇]+/g, ' ')
    .replace(/([!?.,;:])\1{1,}/g, '$1')
    .replace(/\s+([!?.,;:])/g, '$1')
    .replace(/([!?.,;:])(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function estimatedDuration(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2.4, words / 2.35);
}

function preferredMimeType() {
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) return 'audio/ogg;codecs=opus';
  return '';
}

function readableMicError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Permesso microfono negato.';
    if (error.name === 'NotFoundError') return 'Nessun microfono trovato.';
    if (error.name === 'NotReadableError') return 'Microfono non leggibile.';
  }
  return 'Microfono non disponibile.';
}

function readableTtsError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Piper')) return message;
  if (message.includes('non raggiungibile') || message.includes('Failed to fetch') || message.includes('NetworkError')) return 'Server voce non raggiungibile.';
  return 'Piper locale non disponibile.';
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && /abort|annull/i.test(error.message);
}

function deviceLabel() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 'telefono' : 'PC';
}

function networkLabel() {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'PC locale';
  if (host.startsWith('100.')) return 'VPN probabile';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return 'LAN probabile';
  return 'rete non riconosciuta';
}

function seconds(ms?: number) {
  return typeof ms === 'number' ? `${(ms / 1000).toFixed(1)}s` : 'n/d';
}

export function VoicePanel({ canSend, settings, globalError, onBack, onSendVoice, onStopVoice }: VoicePanelProps) {
  const [mode, setMode] = useState<VoiceMode>('idle');
  const [answer, setAnswer] = useState('');
  const [userText, setUserText] = useState('');
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTiming, setVoiceTiming] = useState<VoiceTiming | null>(null);
  const [voiceEnergy, setVoiceEnergy] = useState(0.08);
  const [piperReady, setPiperReady] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef(0);
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const liveEnergyRef = useRef(0.08);
  const playbackEnergyRef = useRef(0.08);
  const speakingStartedAtRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const sentenceBufferRef = useRef(new SentenceBuffer({ minLength: 10 }));
  const ttsQueueRef = useRef(new TtsQueue());
  const [currentSentence, setCurrentSentence] = useState('');

  const ttsProvider = piperProvider;

  const statusLabel = useMemo(() => {
    if (isRecording) return 'In ascolto';
    if (mode === 'thinking') return 'Kira sta ragionando';
    if (mode === 'speaking') return 'Kira risponde';
    return 'Tocca per parlare';
  }, [isRecording, mode]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isRecording) setVoiceEnergy(liveEnergyRef.current);
      else if (mode === 'speaking') setVoiceEnergy(Math.max(playbackEnergyRef.current, 0.36 + Math.sin(Date.now() * 0.009) * 0.18));
      else if (mode === 'thinking') setVoiceEnergy(0.34 + Math.sin(Date.now() * 0.006) * 0.08);
      else setVoiceEnergy((current) => Math.max(0.07, current * 0.88));
    }, 80);

    return () => window.clearInterval(id);
  }, [isRecording, mode]);

  useEffect(() => () => cleanupRecording(), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/tts/piper/status')
      .then((r) => r.ok ? r.json() : { configured: false })
      .catch(() => ({ configured: false }))
      .then((piperData: { configured?: boolean }) => {
        if (!alive) return;
        setPiperReady(Boolean(piperData.configured));
      });
    return () => { alive = false; };
  }, []);

  function cleanupRecording() {
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    barsRef.current.forEach((bar) => {
      if (bar) bar.style.transform = 'scaleY(0.18)';
    });
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    cleanupRecording();
    setIsRecording(false);
  }

  function stopAll() {
    if (isRecording) {
      cancelRecording();
      setMode('idle');
      setError('Registrazione fermata.');
      return;
    }

    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    piperProvider.stop();
    ttsQueueRef.current.stop();
    ttsQueueRef.current.reset();
    sentenceBufferRef.current.reset();
    onStopVoice();
    playbackEnergyRef.current = 0.08;
    setVoiceEnergy(0.12);
    setCurrentSentence('');
    setMode('idle');
  }

  function animateBars() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) sum += data[index];
      const energy = Math.min(1, sum / data.length / 96);
      liveEnergyRef.current = Math.max(0.12, energy);

      barsRef.current.forEach((bar, index) => {
        if (!bar) return;
        const sample = data[(index * 3) % data.length] / 255;
        const height = Math.max(0.16, sample * 0.92 + energy * 0.32);
        bar.style.transform = `scaleY(${height.toFixed(3)})`;
      });

      frameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microfono non disponibile. Usa HTTPS e un browser moderno.');
      return;
    }

    try {
      setError('');
      setUserText('');
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;

      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setMode('listening');
      animateBars();
    } catch (micError) {
      cleanupRecording();
      setIsRecording(false);
      setMode('idle');
      setError(readableMicError(micError));
    }
  }

  function stopRecording() {
    return new Promise<Blob>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cleanupRecording();
        setIsRecording(false);
        resolve(new Blob([], { type: 'audio/webm' }));
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        mediaRecorderRef.current = null;
        cleanupRecording();
        setIsRecording(false);
        resolve(blob);
      };
      recorder.stop();
    });
  }

  async function speak(text: string, totalStartedAt: number, timing: Omit<VoiceTiming, 'ttsMs' | 'totalMs'>) {
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    const ttsStartedAt = performance.now();

    try {
      playbackEnergyRef.current = 0.4;
      const spokenText = cleanSpokenText(text) || text;
      const displayText = text.trim() || spokenText;
      const fallbackDuration = estimatedDuration(spokenText);
      await ttsProvider.speak({
        text: spokenText,
        volume: settings.ttsVolume,
        signal: controller.signal,
        onStart: () => {
          speakingStartedAtRef.current = performance.now();
          setMode('speaking');
          setVoiceEnergy(0.72);
          setAnswer(revealTextByProgress(displayText, 0.03));
        },
        onAmplitude: (amplitude) => {
          playbackEnergyRef.current = amplitude;
        },
        onProgress: ({ currentTime, duration }) => {
          const elapsed = speakingStartedAtRef.current ? (performance.now() - speakingStartedAtRef.current) / 1000 : 0;
          const total = duration > 0 ? duration : fallbackDuration;
          const progress = Math.max(currentTime / total, elapsed / fallbackDuration);
          setAnswer(revealTextByProgress(displayText, Math.min(1, progress)));
        },
        onEnd: () => {
          setMode('idle');
          ttsAbortRef.current = null;
          playbackEnergyRef.current = 0.08;
          setVoiceEnergy(0.12);
          setAnswer(displayText);
          setVoiceTiming({
            ...timing,
            ttsMs: performance.now() - ttsStartedAt,
            totalMs: performance.now() - totalStartedAt,
          });
        },
        onError: () => setError('Riproduzione voce non riuscita.')
      });
    } catch (ttsError) {
      ttsAbortRef.current = null;
      setMode('idle');
      if (isAbortError(ttsError)) return;
      setError(readableTtsError(ttsError));
    }
  }

  async function processAudio(audio: Blob) {
    if (!audio.size || !canSend) {
      setError(canSend ? 'Nessun audio registrato.' : 'Seleziona un modello nelle impostazioni.');
      setMode('idle');
      return;
    }

    const totalStartedAt = performance.now();
    const timingBase = { model: settings.selectedModel, device: deviceLabel(), network: networkLabel() };
    setVoiceTiming(null);
    setMode('thinking');
    setAnswer('');
    setError('');

    try {
      const sttController = new AbortController();
      requestAbortRef.current = sttController;
      const sttStartedAt = performance.now();
      const text = await transcribeAudio(audio, sttController.signal);
      const sttMs = performance.now() - sttStartedAt;
      if (requestAbortRef.current === sttController) requestAbortRef.current = null;
      if (!text) {
        setError('Non ho rilevato parole.');
        setMode('idle');
        return;
      }
      setUserText(text);

      const llmStartedAt = performance.now();
      let firstTokenMs: number | undefined;
      let fullText = '';

      // Reset SentenceBuffer e TtsQueue per questa nuova risposta
      sentenceBufferRef.current.reset();
      ttsQueueRef.current.reset();

      function enqueueSentence(sentence: string, isFirst: boolean) {
        const spokenText = cleanForSpeech(sentence) || sentence;
        if (!spokenText.trim()) return;

        ttsQueueRef.current.enqueue(async () => {
          if (isFirst) setMode('speaking');
          setCurrentSentence(sentence);
          await ttsProvider.speak({
            text: spokenText,
            volume: settings.ttsVolume,
            signal: ttsAbortRef.current?.signal,
            onStart: () => {
              setMode('speaking');
              setVoiceEnergy(0.72);
            },
            onAmplitude: (amp) => { playbackEnergyRef.current = amp; },
            onEnd: () => {
              playbackEnergyRef.current = 0.08;
            },
            onError: () => { /* continua con la prossima frase */ },
          });
        });
      }

      let sentenceCount = 0;
      await onSendVoice(text, {
        onStart: () => setMode('thinking'),
        onFirstToken: () => {
          firstTokenMs = performance.now() - llmStartedAt;
        },
        onToken: (accumulated, token) => {
          fullText = accumulated;
          setMode('thinking');
          // Buffer il token e verifica se abbiamo una frase completa
          const newSentences = sentenceBufferRef.current.add(token);
          for (const sentence of newSentences) {
            enqueueSentence(sentence, sentenceCount === 0);
            sentenceCount++;
          }
        },
        onDone: (completeText) => {
          fullText = completeText;
          const llmMs = performance.now() - llmStartedAt;

          // Flush del buffer residuo
          const remaining = sentenceBufferRef.current.flush();
          if (remaining) {
            enqueueSentence(remaining, sentenceCount === 0);
            sentenceCount++;
          }

          // Se nessuna frase è stata accodata (risposta cortissima), parla tutto
          if (sentenceCount === 0) {
            setAnswer('');
            void speak(fullText, totalStartedAt, { ...timingBase, sttMs, firstTokenMs, llmMs });
            return;
          }

          // Quando la coda finisce, aggiorna lo stato
          const waitForQueue = async () => {
            while (ttsQueueRef.current.isRunning || ttsQueueRef.current.size > 0) {
              await new Promise((r) => setTimeout(r, 100));
            }
            setMode('idle');
            setCurrentSentence('');
            setAnswer(fullText);
            setVoiceTiming({
              ...timingBase,
              sttMs,
              firstTokenMs,
              llmMs,
              ttsMs: performance.now() - llmStartedAt,
              totalMs: performance.now() - totalStartedAt,
            });
          };
          void waitForQueue();
        },
        onStop: () => {
          ttsQueueRef.current.stop();
          sentenceBufferRef.current.reset();
          setMode('idle');
          setAnswer('Risposta fermata.');
          setCurrentSentence('');
        },
        onError: (message) => {
          ttsQueueRef.current.stop();
          sentenceBufferRef.current.reset();
          setError(message);
          setMode('idle');
          setCurrentSentence('');
        }
      });
    } catch (sttError) {
      requestAbortRef.current = null;
      setMode('idle');
      if (isAbortError(sttError)) {
        setAnswer('Voce fermata.');
        return;
      }
      setError(sttError instanceof Error ? sttError.message : 'Trascrizione non riuscita');
    }
  }

  async function handleMicClick() {
    if (mode === 'speaking' || mode === 'thinking') {
      stopAll();
      return;
    }

    if (isRecording) {
      const audio = await stopRecording();
      await processAudio(audio);
      return;
    }

    await startRecording();
  }

  return (
    <div className="voice-desktop-shell relative min-h-screen overflow-hidden px-3 pb-4 pt-4 md:px-10 md:pb-8 md:pt-8">
      <button className="absolute left-4 top-4 z-30 rounded-full border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/70 backdrop-blur transition hover:text-white md:hidden" onClick={onBack}>
        ←
      </button>
      <div className="voice-stage mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-cyan-300/15 bg-black/95 md:min-h-[calc(100vh-4rem)] md:rounded-[2rem]">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(169,201,255,0.18),transparent_23%),radial-gradient(circle_at_50%_56%,rgba(139,92,246,0.12),transparent_42%),linear-gradient(180deg,#020407,#040816_60%,#020407)]" />
          <div className="absolute right-4 top-4 z-10 rounded-full border border-cyan-300/15 bg-black/35 px-3 py-2 text-xs text-white/55 backdrop-blur">
            {piperReady ? 'Piper locale' : 'TTS non pronto'}
            {piperReady === null ? ' ...' : piperReady ? ' ✓' : ' ✗'}
          </div>
          <div className="absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-full border border-sky-300/15 bg-black/35 px-4 py-2 text-xs uppercase tracking-[0.24em] text-white/65 md:top-6">
            {statusLabel}
          </div>
          <div className="relative z-0 h-[60vh] w-full max-w-5xl md:h-[43rem]">
            <CognitiveOrb mode={isRecording ? 'listening' : mode} energy={voiceEnergy} performanceMode={settings.performanceMode} />
          </div>
        </div>

        <div className="relative z-10 border-t border-cyan-300/10 bg-kira-void/90 p-4 backdrop-blur-xl md:p-5">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4">
            <button
              className={`mic-button ${isRecording ? 'mic-button-active' : ''}`}
              onClick={() => void handleMicClick()}
              disabled={!canSend && !isRecording}
            >
              {isRecording ? 'Invia' : mode === 'thinking' ? 'Stop' : mode === 'speaking' ? 'Ferma' : 'Parla'}
            </button>

            {(isRecording || mode === 'thinking' || mode === 'speaking') ? (
              <button className="voice-button" onClick={stopAll}>Stop</button>
            ) : null}

            {isRecording ? (
              <div className="voice-visualizer" aria-hidden="true">
                {Array.from({ length: BAR_COUNT }).map((_, index) => (
                  <span key={index} ref={(element) => { barsRef.current[index] = element; }} />
                ))}
              </div>
            ) : null}

            {userText ? <p className="max-w-2xl text-center text-xs leading-5 text-white/35">{userText}</p> : null}
            {mode === 'speaking' && currentSentence ? (
              <p className="max-w-2xl text-center text-xs leading-5 text-cyan-200/50 italic animate-pulse">
                &ldquo;{currentSentence}&rdquo;
              </p>
            ) : null}
            {voiceTiming ? (
              <div className="grid gap-1 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] px-4 py-3 text-center text-xs text-white/50 md:grid-cols-3">
                <span>Tempo risposta: {seconds(voiceTiming.totalMs)}</span>
                <span>Voce locale: {seconds(voiceTiming.ttsMs)}</span>
                <span>Piper offline</span>
              </div>
            ) : null}
            <p className="min-h-16 max-w-3xl whitespace-pre-wrap text-center text-sm leading-7 text-white/70">
              {answer || 'Premi Parla. Kira ascolta, risponde e parla con Piper locale.'}
            </p>
            {(error || globalError) ? <p className="text-center text-sm text-red-200">{error || globalError}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
