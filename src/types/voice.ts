export type VoiceMode =
  | 'idle' | 'listening' | 'thinking' | 'speaking' | 'executing' | 'error'
  | 'sleep' | 'update' | 'alert' | 'briefing';

export type VoiceSendHooks = {
  onStart?: () => void;
  onFirstToken?: () => void;
  onToken?: (fullText: string, token: string) => void;
  onDone?: (fullText: string) => void;
  onError?: (message: string) => void;
  onStop?: () => void;
};
