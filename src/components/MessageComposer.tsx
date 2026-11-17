import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MutableRefObject } from 'react';
import { transcribeAudio } from '../lib/sttClient';

const BAR_COUNT = 16;

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

export function MessageComposer(props: {
  disabled: boolean;
  isThinking: boolean;
  onSend: (value: string) => void;
  onStop: () => void;
  onOpenVoice: () => void;
}) {
  const [value, setValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef(0);
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => () => cleanupRecording(), []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = value.trim();

    if (props.isThinking) {
      props.onStop();
      return;
    }

    if (!content || props.disabled) {
      return;
    }

    setValue('');
    setError('');
    props.onSend(content);
  }

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

  function animateBars() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) sum += data[index];
      const average = sum / data.length / 255;
      barsRef.current.forEach((bar, index) => {
        if (!bar) return;
        const sample = data[(index * 4) % data.length] / 255;
        bar.style.transform = `scaleY(${Math.max(0.16, sample * 0.9 + average * 0.35).toFixed(3)})`;
      });
      frameRef.current = window.requestAnimationFrame(tick);
    };
    tick();
  }

  async function startDictation() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microfono non disponibile.');
      return;
    }

    try {
      setError('');
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
      animateBars();
    } catch (micError) {
      cleanupRecording();
      setIsRecording(false);
      setError(readableMicError(micError));
    }
  }

  function stopDictation() {
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

  async function handleDictation() {
    if (isTranscribing) return;

    if (isRecording) {
      const audio = await stopDictation();
      if (!audio.size) return;
      setIsTranscribing(true);
      try {
        const text = await transcribeAudio(audio);
        if (text) setValue((current) => `${current}${current.trim() ? ' ' : ''}${text}`);
      } catch (dictationError) {
        setError(dictationError instanceof Error ? dictationError.message : 'Trascrizione non riuscita');
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    await startDictation();
  }

  return (
    <form onSubmit={handleSubmit} className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-kira-void/85 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl md:left-[var(--sidebar-offset)] md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        {(isRecording || isTranscribing || error) ? (
          <div className="flex min-h-6 items-center justify-center gap-3 text-xs text-white/45">
            {isRecording ? <MiniVisualizer barsRef={barsRef} /> : null}
            {isTranscribing ? <span>Trascrizione...</span> : null}
            {error ? <span className="text-red-200">{error}</span> : null}
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-2 shadow-glow">
          <button
            type="button"
            title="Detta testo"
            onClick={() => void handleDictation()}
            disabled={props.disabled || props.isThinking || isTranscribing}
            className={`composer-icon-button ${isRecording ? 'composer-icon-button-active' : ''}`}
          >
            {isRecording ? 'Stop' : 'Mic'}
          </button>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            placeholder="Invia un pensiero a Kira..."
            disabled={props.isThinking}
            className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-white/28"
          />
          <button type="button" title="Passa alla voce" onClick={props.onOpenVoice} disabled={props.isThinking} className="composer-icon-button">
            Voce
          </button>
          <button
            type={props.isThinking ? 'button' : 'submit'}
            onClick={props.isThinking ? props.onStop : undefined}
            disabled={!props.isThinking && (props.disabled || !value.trim())}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${props.isThinking ? 'border-red-300/30 bg-red-500/18 text-red-100 hover:bg-red-500/25' : 'border-white/10 bg-white text-black hover:bg-white/90'}`}
          >
            {props.isThinking ? 'Stop' : 'Invia'}
          </button>
        </div>
      </div>
    </form>
  );
}

function MiniVisualizer({ barsRef }: { barsRef: MutableRefObject<Array<HTMLSpanElement | null>> }) {
  return (
    <div className="composer-visualizer" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, index) => (
        <span key={index} ref={(element) => { barsRef.current[index] = element; }} />
      ))}
    </div>
  );
}
