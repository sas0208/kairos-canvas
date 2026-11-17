import { useCallback, useEffect, useState } from 'react';

export type DiagnosticsState = {
  serverOk: boolean;
  ollamaOk: boolean;
  latencyMs: number | null;
  modelCount: number;
  piperConfigured: boolean;
  error: string;
  lastCheckedAt: number | null;
};

const INITIAL: DiagnosticsState = {
  serverOk: false,
  ollamaOk: false,
  latencyMs: null,
  modelCount: 0,
  piperConfigured: false,
  error: '',
  lastCheckedAt: null
};

export function useDiagnostics(endpoint: string) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>(INITIAL);
  const [isChecking, setIsChecking] = useState(false);

  const refresh = useCallback(async () => {
    setIsChecking(true);
    try {
      const response = await fetch(`/api/diagnostics?endpoint=${encodeURIComponent(endpoint)}`);
      const data = await response.json() as {
        server?: { ok?: boolean };
        ollama?: { ok?: boolean; latencyMs?: number; modelCount?: number; error?: string };
        tts?: { piperConfigured?: boolean };
      };
      setDiagnostics({
        serverOk: Boolean(data.server?.ok),
        ollamaOk: Boolean(data.ollama?.ok),
        latencyMs: data.ollama?.latencyMs ?? null,
        modelCount: data.ollama?.modelCount ?? 0,
        piperConfigured: Boolean(data.tts?.piperConfigured),
        error: data.ollama?.error || '',
        lastCheckedAt: Date.now()
      });
    } catch {
      setDiagnostics({ ...INITIAL, error: 'Server Kira non raggiungibile', lastCheckedAt: Date.now() });
    } finally {
      setIsChecking(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { diagnostics, isChecking, refresh };
}
