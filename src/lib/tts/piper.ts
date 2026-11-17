import { playAudioBlob, stopAudioPlayback } from './audioPlayback';
import type { TtsProvider } from './types';

const audioCache = new Map<string, Blob>();

function cacheKey(text: string) {
  return text.trim().replace(/\s+/g, ' ').slice(0, 900);
}

export const piperProvider: TtsProvider = {
  id: 'piper',
  label: 'Piper locale',
  isEnabled: () => typeof window !== 'undefined' && typeof Audio !== 'undefined',
  async listVoices() { return []; },
  async speak(request) {
    const text = request.text.trim();
    if (!text) return;
    this.stop();

    const key = cacheKey(text);
    let blob = audioCache.get(key);
    if (!blob) {
      const response = await fetch('/api/tts/piper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: request.signal
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Piper TTS locale non disponibile' })) as { error?: string };
        request.onError?.();
        throw new Error(data.error || 'Piper TTS locale non disponibile');
      }

      blob = await response.blob();
      audioCache.set(key, blob);
      if (audioCache.size > 40) {
        const oldest = audioCache.keys().next().value;
        if (oldest) audioCache.delete(oldest);
      }
    }

    await playAudioBlob({ blob, volume: request.volume, onStart: request.onStart, onAmplitude: request.onAmplitude, onProgress: request.onProgress, onEnd: request.onEnd, onError: request.onError });
  },
  stop() {
    stopAudioPlayback();
  }
};
