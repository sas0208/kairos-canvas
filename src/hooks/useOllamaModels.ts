import { useEffect, useState } from 'react';
import { OLLAMA_UNREACHABLE } from '../lib/constants';
import { fetchModels } from '../lib/ollamaClient';
import type { OllamaModel } from '../types/ollama';

export function useOllamaModels(endpoint: string) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function refresh() {
    setIsLoading(true);
    setError('');

    try {
      setModels(await fetchModels(endpoint));
    } catch {
      setModels([]);
      setError(OLLAMA_UNREACHABLE);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [endpoint]);

  return { models, error, isLoading, refresh };
}
