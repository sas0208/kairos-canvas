export type OllamaModel = {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
};

export type OllamaModelsResponse = {
  models?: OllamaModel[];
  error?: string;
};

export type OllamaChatChunk = {
  model?: string;
  created_at?: string;
  message?: {
    role: 'assistant';
    content: string;
  };
  done?: boolean;
  error?: string;
};
