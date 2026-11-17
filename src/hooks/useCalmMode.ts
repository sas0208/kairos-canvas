// Calm Mode — durante quiet hours la UI cambia aria:
// - Palette desaturata (CSS vars override)
// - ParticleCore: speed ridotta, intensity bassa (la sensazione è "respiro lento")
// - Glow ridotto, bordi più morbidi
//
// Si attiva polling /api/system/quiet-hours ogni 5 min (la fascia oraria non
// cambia spesso) + sempre check al tick :00 per essere sincronizzati.

import { useEffect, useState } from 'react';

export function useCalmMode(): boolean {
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const r = await fetch('/api/system/quiet-hours');
        if (!r.ok || cancelled) return;
        const j = await r.json() as { now?: boolean };
        const next = Boolean(j.now);
        if (!cancelled) setCalm(next);
      } catch { /* offline → niente calm forzato */ }
    }
    void check();
    // Polling — 5 min è abbastanza, la fascia oraria cambia raramente
    const id = window.setInterval(check, 5 * 60_000);
    // Tick :00 → check immediato per essere allineati al cambio fascia
    const minuteTick = window.setInterval(() => {
      if (new Date().getSeconds() < 5) void check();
    }, 30_000);
    return () => { cancelled = true; window.clearInterval(id); window.clearInterval(minuteTick); };
  }, []);

  // Applica la classe `calm-mode` su <html> così CSS globali la possono usare
  useEffect(() => {
    if (calm) document.documentElement.classList.add('calm-mode');
    else document.documentElement.classList.remove('calm-mode');
    return () => { document.documentElement.classList.remove('calm-mode'); };
  }, [calm]);

  return calm;
}
