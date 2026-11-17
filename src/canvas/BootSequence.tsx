import { USER_NAME } from '../config/user';
import { useEffect, useState } from 'react';
import { KiraGlyph } from './KiraGlyph';
import { playBootSequence } from '../lib/soundManager';

// Voce di Kira — saluto al boot.
// File congelato in public/voice/. Default ON; disattivabile da Settings (kira-voice-greeting).
function playGreetingVoice() {
  try {
    if (localStorage.getItem('kira-voice-greeting') === '0') return;
    const audio = new Audio('/voice/kira-greeting.wav');
    audio.volume = 0.9;
    // l'orb reagisce alla voce mentre saluta
    audio.addEventListener('play', () => window.dispatchEvent(new CustomEvent('kira:amplitude', { detail: { value: 0.6 } })));
    audio.addEventListener('ended', () => window.dispatchEvent(new CustomEvent('kira:amplitude', { detail: { value: 0 } })));
    void audio.play().catch(() => { /* autoplay bloccato nel browser: ok, in app parte */ });
  } catch { /* no audio */ }
}

const COLD_LINES = [
  { text: '> initializing kira canvas os',     delay: 0,   color: 'cyan' },
  { text: '> loading particle core ........ ok', delay: 180, color: 'cyan' },
  { text: '> mounting widget registry ...... ok', delay: 320, color: 'cyan' },
  { text: '> binding voice context ......... ok', delay: 460, color: 'cyan' },
  { text: '> linking memory store .......... ok', delay: 600, color: 'cyan' },
  { text: '> agent layer online',                  delay: 740, color: 'gold' },
] as const;

// Shown when there is a previous canvas session (widgets were saved)
const WARM_LINES = [
  { text: '> kira canvas os',                   delay: 0,   color: 'cyan' },
  { text: '> restoring workspace ........... ok', delay: 200, color: 'cyan' },
  { text: `> welcome back, ${USER_NAME}`,                 delay: 400, color: 'welcome' },
  { text: '> agent layer online',                  delay: 600, color: 'gold' },
] as const;

/**
 * BootSequence — cinematic overlay at first mount.
 * Shows once per session (sessionStorage gated), ~1.5s total, fade.
 * Shows "Welcome back" variant when a previous canvas session exists.
 */
export function BootSequence() {
  const [phase, setPhase] = useState<'showing' | 'fading' | 'done'>(
    () => {
      if (typeof window !== 'undefined' && sessionStorage.getItem('kc-boot-shown') === '1') return 'done';
      return 'showing';
    }
  );

  const isWarmBoot = typeof window !== 'undefined' && !!localStorage.getItem('kira-canvas-state');

  useEffect(() => {
    if (phase === 'done') return;
    // Boot sound — ritardato di 200ms per dare tempo all'AudioContext di avviarsi
    const soundT = window.setTimeout(() => playBootSequence(), 150);
    // Kira saluta con la sua voce vera (dopo il rintocco di boot)
    const voiceT = window.setTimeout(() => playGreetingVoice(), 700);
    const fadeT = window.setTimeout(() => setPhase('fading'), 1250);
    const doneT = window.setTimeout(() => {
      setPhase('done');
      sessionStorage.setItem('kc-boot-shown', '1');
    }, 1750);
    return () => { window.clearTimeout(soundT); window.clearTimeout(voiceT); window.clearTimeout(fadeT); window.clearTimeout(doneT); };
  }, [phase]);

  if (phase === 'done') return null;

  const LINES = isWarmBoot ? WARM_LINES : COLD_LINES;

  return (
    <div className={`kc-boot ${phase === 'fading' ? 'kc-boot-fading' : ''}`} aria-hidden="true">
      <div className="kc-boot-scan" />
      <div className="kc-boot-content">
        <div className="kc-boot-brand">
          <span className="kc-boot-brand-mark"><KiraGlyph size={32} color="#a9c9ff" /></span>
          <span className="kc-boot-brand-name">KIRA</span>
          <span className="kc-boot-brand-ver">CANVAS OS</span>
        </div>
        <div className="kc-boot-lines">
          {LINES.map((line, i) => (
            <div
              key={i}
              className={`kc-boot-line kc-boot-line-${line.color}`}
              style={{ animationDelay: `${line.delay}ms` }}
            >
              {line.text}
            </div>
          ))}
        </div>
        <div className="kc-boot-progress">
          <div className="kc-boot-progress-fill" />
        </div>
        <div className="kc-boot-foot">{isWarmBoot ? 'WORKSPACE RESTORED' : 'SYSTEM ONLINE'}</div>
      </div>
    </div>
  );
}
