import { fetchModels, streamChat } from '../ollamaClient';
import type { ModelProvider } from './types';

export const ollamaProvider: ModelProvider = {
  id: 'ollama',
  label: 'Ollama Local',
  isEnabled: () => true,
  async healthCheck() {
    try {
      await fetch('/api/health');
      return true;
    } catch {
      return false;
    }
  },
  async listModels() {
    const models = await fetchModels('http://localhost:11434');
    return models.map((model) => ({ id: model.name, name: model.name, provider: 'ollama', local: true }));
  },
  async generate(request) {
    let output = '';
    await streamChat({ ...request, endpoint: request.endpoint || 'http://localhost:11434', onToken: (token) => { output += token; } });
    return output;
  },
  async stream(request) {
    await streamChat({ ...request, endpoint: request.endpoint || 'http://localhost:11434' });
  }
};
