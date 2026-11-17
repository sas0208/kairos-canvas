import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { VoiceMode } from '../types/voice';

interface VoiceStateCtxValue {
  voiceState: VoiceMode;
  setVoiceState: (s: VoiceMode) => void;
  /** Set a temporary state, then auto-revert to idle after `ms` milliseconds */
  temporaryState: (s: VoiceMode, ms: number) => void;
  /** true when voiceState !== 'idle' */
  isActive: boolean;
}

const VoiceStateContext = createContext<VoiceStateCtxValue | null>(null);

export function VoiceStateProvider({ children }: { children: ReactNode }) {
  const [voiceState, setStateRaw] = useState<VoiceMode>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setVoiceState = useCallback((s: VoiceMode) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setStateRaw(s);
  }, []);

  const temporaryState = useCallback((s: VoiceMode, ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStateRaw(s);
    timerRef.current = setTimeout(() => setStateRaw('idle'), ms);
  }, []);

  return (
    <VoiceStateContext.Provider value={{
      voiceState,
      setVoiceState,
      temporaryState,
      isActive: voiceState !== 'idle',
    }}>
      {children}
    </VoiceStateContext.Provider>
  );
}

export function useVoiceState(): VoiceStateCtxValue {
  const ctx = useContext(VoiceStateContext);
  if (!ctx) throw new Error('useVoiceState must be inside VoiceStateProvider');
  return ctx;
}
