export type TtsProviderId = 'browser' | 'piper';

export type TtsVoice = {
  id: string;
  label: string;
  lang?: string;
  provider: TtsProviderId;
};

export type TtsRequest = {
  text: string;
  voiceId?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  modelId?: string;
  stability?: number;
  similarity?: number;
  signal?: AbortSignal;
  onStart?: () => void;
  onAmplitude?: (amplitude: number) => void;
  onProgress?: (progress: { currentTime: number; duration: number }) => void;
  onBoundary?: () => void;
  onEnd?: () => void;
  onError?: () => void;
};

export type TtsProvider = {
  id: TtsProviderId;
  label: string;
  isEnabled(): boolean;
  listVoices(): Promise<TtsVoice[]>;
  speak(request: TtsRequest): Promise<void>;
  stop(): void;
};
