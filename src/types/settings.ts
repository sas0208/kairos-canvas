export type KiraSettings = {
  endpoint: string;
  selectedModel: string;
  activeProvider: 'ollama';
  modelRoutingMode: 'manual' | 'auto' | 'privacy' | 'quality' | 'fast';
  performanceMode: 'low' | 'medium' | 'high';
  ttsProvider: 'browser' | 'piper';
  browserVoiceURI: string;
  ttsVolume: number;
  systemPrompt: string;
};
