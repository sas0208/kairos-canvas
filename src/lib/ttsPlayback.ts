// TTS playback helper — riproduce una stringa via Piper locale, con fallback
// al motore vocale del browser (Web Speech `speechSynthesis`, voce italiana di
// Windows) quando Piper non è installato/raggiungibile. Così Kira parla
// sempre, in locale e a costo zero, anche senza il binario piper.exe.
//
// Quiet hours: prima di parlare verifica /api/system/quiet-hours. Se quiet
// attivo → no-op (nessun audio). Cached 60s per non bombardare il server.

let currentAudio: HTMLAudioElement | null = null;
let quietCache: { quiet: boolean; ts: number } | null = null;
let synthActive = false;

async function isQuiet(): Promise<boolean> {
  const now = Date.now();
  if (quietCache && now - quietCache.ts < 60_000) return quietCache.quiet;
  try {
    const r = await fetch('/api/system/quiet-hours');
    if (!r.ok) return false;
    const j = await r.json();
    const quiet = Boolean(j?.now);
    quietCache = { quiet, ts: now };
    return quiet;
  } catch {
    return false;
  }
}

function stopCurrent() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = '';
    } catch { /* ignore */ }
    currentAudio = null;
  }
}

async function playFromEndpoint(endpoint: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return false;
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('audio/')) return false;
    const blob = await r.blob();
    if (blob.size < 100) return false;
    const url = URL.createObjectURL(blob);
    stopCurrent();
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    currentAudio = audio;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

// Fallback: motore vocale del browser (Web Speech API). Disponibile su Chrome/
// Edge con le voci italiane di Windows. Mentre parla emette un inviluppo
// d'ampiezza sintetico così l'orb reagisce alla voce.
function speakViaBrowser(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT';
    u.rate = 1.0;
    u.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const itVoice = voices.find((v) => /it[-_]?IT/i.test(v.lang))
      || voices.find((v) => /italian|italiano/i.test(v.name));
    if (itVoice) u.voice = itVoice;

    let raf = 0;
    const startedAt = performance.now();
    const pulse = () => {
      const el = (performance.now() - startedAt) / 1000;
      const amp = 0.32 + 0.26 * Math.abs(Math.sin(el * 6.2));
      window.dispatchEvent(new CustomEvent('kira:amplitude', { detail: { value: amp } }));
      raf = window.requestAnimationFrame(pulse);
    };
    const stopPulse = () => { if (raf) window.cancelAnimationFrame(raf); raf = 0; synthActive = false; };
    u.onstart = () => { synthActive = true; raf = window.requestAnimationFrame(pulse); };
    u.onend = stopPulse;
    u.onerror = stopPulse;

    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

/**
 * Speak the given text via Piper TTS locale, con fallback al motore del browser.
 * Returns true if playback started successfully. Non-blocking failures = silent.
 */
export async function speak(text: string): Promise<boolean> {
  if (!text || text.trim().length === 0) return false;
  if (await isQuiet()) return false;
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')        // strip code blocks
    .replace(/\*\*([^*]+)\*\*/g, '$1')     // strip bold
    .replace(/\*([^*]+)\*/g, '$1')         // strip italic
    .replace(/`([^`]+)`/g, '$1')           // strip inline code
    .replace(/#{1,6}\s+/g, '')             // strip markdown headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip markdown links
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned) return false;
  // Prova Piper locale (qualità migliore); se manca/non risponde → voce browser.
  const piperOk = await playFromEndpoint('/api/tts/piper', cleaned);
  if (piperOk) return true;
  return speakViaBrowser(cleaned);
}

export function stopSpeaking() {
  stopCurrent();
  if (synthActive && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    synthActive = false;
  }
}
