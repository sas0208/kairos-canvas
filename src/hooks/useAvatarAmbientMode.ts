// Auto-trigger degli stati ambientali dell'avatar (P6.2).
//
// Quando Kira è a riposo (voiceState === 'idle') la figura 2.5D riflette lo stato
// "di vita" del sistema, senza che serva una voce/azione esplicita:
//   - update = Kira Evolve sta girando (auto-miglioramento in corso) — attività reale, precede tutto
//   - sleep  = quiet hours (di notte Kira riposa; niente alert che pulsano fino all'alba)
//   - alert  = raccomandazioni coach urgenti/high, ma SOLO di giorno (segnale di attenzione)
// Ordine: update > sleep(quiet) > alert > idle.
//
// Razionale: i coach urgent sono spesso backlog persistente (scadenze clienti) — di notte
// devono cedere il passo alla calm-mode (sleep). Evolve è un segnale di attività reale e
// vince sempre. Di giorno, niente evolve e niente quiet → l'alert torna a comandare.
//
// NON sovrascrive mai gli stati attivi (listening/thinking/speaking/executing/error):
// si applica solo a riposo. Quando voiceState torna 'idle' il prop di
// ParticleCoreCanvas resetta modeRef a 'idle' (l'effetto figlio gira PRIMA di questo,
// che è del componente padre) → qui ri-applichiamo l'ambient corrente.

import { useEffect, useRef, useState } from 'react';
import type { VoiceMode } from '../types/voice';

export type Ambient = 'idle' | 'sleep' | 'update' | 'alert';

export interface AmbientSignals {
  evolveRunning: boolean;
  quietHours: boolean;
  alertCount: number;
}

/** Decisione pura dell'ambient mode dato lo stato del sistema. Ordine: update > sleep > alert > idle. */
export function decideAmbient(s: AmbientSignals): Ambient {
  if (s.evolveRunning) return 'update';   // attività reale: precede tutto
  if (s.quietHours) return 'sleep';        // di notte la calma vince sugli alert di backlog
  if (s.alertCount > 0) return 'alert';    // coach urgent, solo di giorno
  return 'idle';
}

async function probeAmbient(signal: AbortSignal): Promise<Ambient> {
  const signals: AmbientSignals = { evolveRunning: false, quietHours: false, alertCount: 0 };
  try {
    const r = await fetch('/api/evolve/status', { signal });
    if (r.ok) signals.evolveRunning = Boolean(((await r.json()) as { running?: boolean }).running);
  } catch { /* offline → ignora */ }
  try {
    const r = await fetch('/api/system/quiet-hours', { signal });
    if (r.ok) signals.quietHours = Boolean(((await r.json()) as { now?: boolean }).now);
  } catch { /* ignora */ }
  try {
    const r = await fetch('/api/coach/urgent', { signal });
    if (r.ok) signals.alertCount = Number(((await r.json()) as { count?: number }).count ?? 0);
  } catch { /* ignora */ }
  return decideAmbient(signals);
}

export function useAvatarAmbientMode(voiceState: VoiceMode): void {
  const [ambient, setAmbient] = useState<Ambient>('idle');
  const ambientRef = useRef<Ambient>('idle');
  useEffect(() => { ambientRef.current = ambient; }, [ambient]);

  // Polling condizioni: 60s è abbastanza (quiet hours/evolve/coach cambiano lentamente).
  useEffect(() => {
    const ctrl = new AbortController();
    let stopped = false;
    async function tick() {
      try {
        const next = await probeAmbient(ctrl.signal);
        if (!stopped && next !== ambientRef.current) setAmbient(next);
      } catch { /* ignora */ }
    }
    void tick();
    const id = window.setInterval(tick, 60_000);
    return () => { stopped = true; ctrl.abort(); window.clearInterval(id); };
  }, []);

  // Applica l'override SOLO a riposo. Quando voiceState torna 'idle' ri-applichiamo
  // (il reset del prop figlio è già avvenuto: effetti figlio < effetti padre).
  useEffect(() => {
    if (voiceState !== 'idle') return; // gli stati attivi comandano l'avatar
    const m: VoiceMode = ambient === 'idle' ? 'idle' : (ambient as VoiceMode);
    window.dispatchEvent(new CustomEvent<VoiceMode>('kira:setMode', { detail: m }));
  }, [ambient, voiceState]);
}
