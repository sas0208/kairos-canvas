let currentAudio: HTMLAudioElement | null = null;
let currentUrl = '';
let currentFrame = 0;
let currentContext: AudioContext | null = null;

type PlaybackRequest = {
  blob: Blob;
  volume?: number;
  onStart?: () => void;
  onAmplitude?: (amplitude: number) => void;
  onProgress?: (progress: { currentTime: number; duration: number }) => void;
  onEnd?: () => void;
  onError?: () => void;
};

function cleanupPlayback() {
  if (currentFrame) window.cancelAnimationFrame(currentFrame);
  currentFrame = 0;
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = '';
  void currentContext?.close();
  currentContext = null;
}

function connectAnalyser(audio: HTMLAudioElement, request: PlaybackRequest) {
  if (!request.onAmplitude && !request.onProgress) return;
  try {
    const context = new AudioContext();
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.fftSize = 128;
    source.connect(analyser);
    analyser.connect(context.destination);
    currentContext = context;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      request.onAmplitude?.(Math.min(1, average / 96));
      request.onProgress?.({ currentTime: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
      currentFrame = window.requestAnimationFrame(tick);
    };
    tick();
  } catch {
    const startedAt = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      request.onAmplitude?.(0.42 + Math.sin(elapsed * 6.0) * 0.14 + Math.sin(elapsed * 13.0) * 0.05);
      request.onProgress?.({ currentTime: audio.currentTime || elapsed, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
      currentFrame = window.requestAnimationFrame(tick);
    };
    tick();
  }
}

export async function playAudioBlob(request: PlaybackRequest) {
  stopAudioPlayback();
  const url = URL.createObjectURL(request.blob);
  const audio = new Audio(url);
  currentAudio = audio;
  currentUrl = url;
  audio.volume = request.volume ?? 1;
  connectAnalyser(audio, request);
  audio.onended = () => {
    cleanupPlayback();
    if (currentAudio === audio) currentAudio = null;
    request.onEnd?.();
  };
  audio.onerror = () => {
    cleanupPlayback();
    if (currentAudio === audio) currentAudio = null;
    request.onError?.();
  };
  request.onStart?.();
  await audio.play();
}

export function stopAudioPlayback() {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio = null;
  cleanupPlayback();
}
