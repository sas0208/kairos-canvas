/**
 * Kira Sound Manager — sound design "divino/etereo" sintetizzato via Web Audio API.
 * Niente file esterni: campane di vetro inarmoniche, aria filtrata, sub morbidi,
 * il tutto su una catena master con riverbero convolver generato + compressore.
 * Disabilitabile da Settings.
 */

let _ctx: AudioContext | null = null;
let _enabled = true;
let _master: GainNode | null = null;
let _reverbSend: GainNode | null = null;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') void _ctx.resume();
  return _ctx;
}

export function setSoundEnabled(v: boolean) { _enabled = v; }
export function isSoundEnabled() { return _enabled; }

// ── Catena master: master gain → compressor → destination, con bus riverbero ──

// Impulse response sintetica: hall morbida ~1.8s con decay esponenziale,
// leggermente più lunga sulle alte per il carattere "cattedrale di vetro"
function buildImpulse(ac: AudioContext, seconds = 1.8, decay = 3.2): AudioBuffer {
  const rate = ac.sampleRate;
  const len = Math.round(rate * seconds);
  const buf = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function master(ac: AudioContext): { dry: GainNode; wet: GainNode } {
  if (!_master || !_reverbSend) {
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(ac.destination);

    _master = ac.createGain();
    _master.gain.value = 0.9;
    _master.connect(comp);

    const convolver = ac.createConvolver();
    convolver.buffer = buildImpulse(ac);
    const wetGain = ac.createGain();
    wetGain.gain.value = 0.5;
    convolver.connect(wetGain);
    wetGain.connect(comp);

    _reverbSend = ac.createGain();
    _reverbSend.gain.value = 1;
    _reverbSend.connect(convolver);
  }
  return { dry: _master, wet: _reverbSend };
}

// ── Primitive ──────────────────────────────────────────────────────────────────

interface ToneOpts {
  type?: OscillatorType;
  freqEnd?: number;
  attack?: number;
  /** quota mandata al riverbero (0..1.5) */
  reverb?: number;
  /** frequenza del lowpass; default nessun filtro */
  lowpass?: number;
  detune?: number;
}

function tone(ac: AudioContext, freq: number, gain: number, start: number, dur: number, o: ToneOpts = {}) {
  const { dry, wet } = master(ac);
  const g = ac.createGain();
  const atk = o.attack ?? 0.012;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + atk);
  g.gain.exponentialRampToValueAtTime(0.0008, start + dur);

  let head: AudioNode = g;
  if (o.lowpass) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    f.Q.value = 0.6;
    g.connect(f);
    head = f;
  }
  head.connect(dry);
  if (o.reverb) {
    const send = ac.createGain();
    send.gain.value = o.reverb;
    head.connect(send);
    send.connect(wet);
  }

  const osc = ac.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, start);
  if (o.detune) osc.detune.value = o.detune;
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, start + dur);
  osc.connect(g);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// Campana di vetro: partiali inarmonici (rapporti tipo glass harp) con decay
// scalato per partial — il suono firma di Kira
const GLASS_PARTIALS = [1, 2.32, 4.25, 6.63];
function glassBell(ac: AudioContext, freq: number, gain: number, start: number, dur: number, reverb = 0.9) {
  GLASS_PARTIALS.forEach((ratio, i) => {
    const pGain = gain * Math.pow(0.42, i);
    const pDur = dur * Math.pow(0.72, i);
    tone(ac, freq * ratio, pGain, start, pDur, {
      attack: 0.004 + i * 0.002,
      reverb: reverb * (1 - i * 0.15),
      detune: i % 2 ? 4 : -3,
    });
  });
}

// Soffio d'aria: rumore filtrato bandpass con sweep — sostituisce il vecchio "noise"
function air(ac: AudioContext, gain: number, start: number, dur: number, fromHz: number, toHz: number, reverb = 0.5) {
  const { dry, wet } = master(ac);
  const len = Math.round(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;

  const filt = ac.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(fromHz, start);
  filt.frequency.exponentialRampToValueAtTime(toHz, start + dur);
  filt.Q.value = 2.8;

  const g = ac.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + dur * 0.18);
  g.gain.exponentialRampToValueAtTime(0.0008, start + dur);

  src.connect(filt);
  filt.connect(g);
  g.connect(dry);
  const send = ac.createGain();
  send.gain.value = reverb;
  g.connect(send);
  send.connect(wet);
  src.start(start);
  src.stop(start + dur + 0.05);
}

// Sub morbido per dare corpo (sentito più che udito)
function sub(ac: AudioContext, freq: number, gain: number, start: number, dur: number, freqEnd?: number) {
  tone(ac, freq, gain, start, dur, { type: 'sine', freqEnd, attack: 0.03, lowpass: 160 });
}

// Pad shimmer: due saw detunate sotto lowpass in apertura — solo per il boot
function shimmerPad(ac: AudioContext, freq: number, gain: number, start: number, dur: number) {
  const { dry, wet } = master(ac);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0008, start + dur);

  const filt = ac.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(300, start);
  filt.frequency.exponentialRampToValueAtTime(2600, start + dur * 0.7);
  filt.Q.value = 0.8;

  g.connect(filt);
  filt.connect(dry);
  const send = ac.createGain();
  send.gain.value = 1.1;
  filt.connect(send);
  send.connect(wet);

  [-7, 6].forEach((cents) => {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = cents;
    osc.connect(g);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  });
}

// Scala di riferimento: La maggiore add9 — l'accordo "di Kira"
const A4 = 440, Cs5 = 554.37, E5 = 659.25, B5 = 987.77, A5 = 880, E6 = 1318.5;

// ── Sound Events ───────────────────────────────────────────────────────────────

/** Apertura widget — campana di vetro ascendente con soffio d'aria */
export function playWidgetOpen() {
  if (!_enabled) return;
  try {
    const ac = ctx();
    const t = ac.currentTime;
    glassBell(ac, A5, 0.07, t, 0.5, 0.8);
    glassBell(ac, E6, 0.045, t + 0.07, 0.42, 0.9);
    air(ac, 0.03, t, 0.22, 900, 3800, 0.6);
  } catch { /* AudioContext non disponibile — ignora */ }
}

/** Chiusura widget — campana discendente, più scura */
export function playWidgetClose() {
  if (!_enabled) return;
  try {
    const ac = ctx();
    const t = ac.currentTime;
    glassBell(ac, E5, 0.055, t, 0.4, 0.7);
    glassBell(ac, A4, 0.04, t + 0.06, 0.36, 0.6);
    air(ac, 0.02, t, 0.18, 2600, 700, 0.4);
  } catch { /* ignore */ }
}

/** Minimizzazione widget — tick di vetro smorzato */
export function playWidgetMinimize() {
  if (!_enabled) return;
  try {
    const ac = ctx();
    const t = ac.currentTime;
    tone(ac, Cs5, 0.06, t, 0.16, { freqEnd: A4, reverb: 0.4, lowpass: 2400 });
    air(ac, 0.015, t, 0.1, 1800, 600, 0.3);
  } catch { /* ignore */ }
}

/** Conferma / successo — quinta cristallina */
export function playConfirm() {
  if (!_enabled) return;
  try {
    const ac = ctx();
    const t = ac.currentTime;
    glassBell(ac, A5, 0.06, t, 0.4, 0.8);
    glassBell(ac, E6, 0.05, t + 0.09, 0.5, 1.0);
  } catch { /* ignore */ }
}

/** Notifica — motivo a tre note, gentile ma presente */
export function playNotify() {
  if (!_enabled) return;
  try {
    const ac = ctx();
    const t = ac.currentTime;
    glassBell(ac, E5, 0.06, t, 0.35, 0.7);
    glassBell(ac, B5, 0.055, t + 0.12, 0.4, 0.85);
    glassBell(ac, E6, 0.04, t + 0.26, 0.55, 1.1);
    sub(ac, 90, 0.05, t, 0.3);
  } catch { /* ignore */ }
}

/** Errore — corpo scuro + dissonanza breve, mai stridulo */
export function playError() {
  if (!_enabled) return;
  try {
    const ac = ctx();
    const t = ac.currentTime;
    sub(ac, 110, 0.12, t, 0.4, 70);
    tone(ac, 233, 0.07, t, 0.35, { type: 'triangle', lowpass: 900, reverb: 0.5 });
    tone(ac, 247, 0.05, t + 0.05, 0.3, { type: 'triangle', lowpass: 800, reverb: 0.5 });
    air(ac, 0.03, t, 0.25, 500, 150, 0.4);
  } catch { /* ignore */ }
}

/**
 * Boot — "il respiro di Kira": sub che sale, pad shimmer che si apre,
 * arpeggio di campane sull'accordo di La add9, fioritura finale. ~3s con coda.
 */
export function playBootSequence() {
  if (!_enabled) return;
  try {
    const ac = ctx();
    const t = ac.currentTime;
    // Respiro profondo
    sub(ac, 55, 0.16, t, 1.6, 110);
    air(ac, 0.04, t, 1.2, 250, 1800, 0.9);
    // Il pad si apre come un velo
    shimmerPad(ac, 220, 0.05, t + 0.3, 2.2);
    // Arpeggio divino
    glassBell(ac, A4, 0.06, t + 0.9, 0.8, 1.0);
    glassBell(ac, Cs5, 0.06, t + 1.15, 0.8, 1.0);
    glassBell(ac, E5, 0.06, t + 1.4, 0.9, 1.1);
    glassBell(ac, B5, 0.05, t + 1.65, 1.0, 1.2);
    // Fioritura finale
    glassBell(ac, A5, 0.075, t + 2.0, 1.4, 1.3);
    air(ac, 0.025, t + 2.0, 0.9, 2000, 6000, 1.0);
    sub(ac, 110, 0.07, t + 2.0, 0.9);
  } catch { /* ignore */ }
}

/** Kira inizia ad ascoltare — shimmer d'aria ascendente con nota sospesa */
export function playListeningStart() {
  if (!_enabled) return;
  try {
    const ac = ctx();
    const t = ac.currentTime;
    air(ac, 0.035, t, 0.3, 1200, 5200, 0.8);
    tone(ac, E5, 0.05, t + 0.04, 0.45, { freqEnd: A5, reverb: 1.0, attack: 0.05 });
  } catch { /* ignore */ }
}
