import { OLLAMA_UNREACHABLE } from './constants';
import type { ChatMessage } from '../types/chat';
import type { OllamaChatChunk, OllamaModelsResponse } from '../types/ollama';

type StreamMessage = {
  role: string;
  content: string;
};

export async function fetchModels(endpoint: string) {
  const response = await fetch(`/api/models?endpoint=${encodeURIComponent(endpoint)}`);
  const data = (await response.json()) as OllamaModelsResponse;

  if (!response.ok) {
    throw new Error(data.error || OLLAMA_UNREACHABLE);
  }

  return data.models || [];
}

export async function streamChat(params: {
  endpoint: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  messageOverride?: StreamMessage[];
  onToken: (token: string) => void;
  signal?: AbortSignal;
}) {
  const messages = params.messageOverride?.length
    ? params.messageOverride.map((message) => ({ role: message.role, content: message.content }))
    : [
        { role: 'system', content: params.systemPrompt },
        ...params.messages.map((message) => ({ role: message.role, content: message.content }))
      ];

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      endpoint: params.endpoint,
      model: params.model,
      keepAlive: '30m',
      messages
    }),
    signal: params.signal
  });

  if (!response.ok || !response.body) {
    let error = OLLAMA_UNREACHABLE;

    try {
      const body = (await response.json()) as { error?: string };
      error = body.error || error;
    } catch {
      // Keep the default human-readable message.
    }

    throw new Error(error);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      const chunk = JSON.parse(trimmed) as OllamaChatChunk;

      if (chunk.error) {
        throw new Error(chunk.error);
      }

      if (chunk.message?.content) {
        params.onToken(chunk.message.content);
        // il core anima la bocca di Kira anche quando risponde per iscritto
        window.dispatchEvent(new CustomEvent('kira:speakPulse', {
          detail: { energy: Math.min(1, 0.35 + chunk.message.content.length * 0.06) },
        }));
      }
    }
  }
}
