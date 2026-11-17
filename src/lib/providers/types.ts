import type { ChatMessage } from '../../types/chat';

export type ProviderId = 'ollama';

export type ProviderModel = {
  id: string;
  name: string;
  provider: ProviderId;
  local: boolean;
};

export type StreamRequest = {
  endpoint?: string;
  apiKey?: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  onToken: (token: string) => void;
};

export type ModelProvider = {
  id: ProviderId;
  label: string;
  isEnabled(settings: Record<string, string>): boolean;
  healthCheck(): Promise<boolean>;
  listModels(): Promise<ProviderModel[]>;
  generate(request: StreamRequest): Promise<string>;
  stream(request: StreamRequest): Promise<void>;
};
