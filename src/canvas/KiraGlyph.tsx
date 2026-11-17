import type { VoiceMode } from '../types/voice';

interface KiraGlyphProps {
  size?: number;
  color?: string;
  className?: string;
  voiceState?: VoiceMode;
}

// Palette eterea: argento/azzurro pallido, mai colori squillanti.
const STATE_COLORS: Record<VoiceMode, string> = {
  idle:       '#c8d6ee',
  listening:  '#d9c9f2',
  thinking:   '#9db8e8',
  speaking:   '#f2f6ff',
  executing:  '#a5d8f0',
  error:      '#f0a0a0',
  sleep:      '#6f86b8',
  update:     '#8fe0f0',
  alert:      '#f2c189',
  briefing:   '#f4e6cf',
};

/**
 * Glifo identitario di Kira — halo di cubi digitali che si frammenta
 * (l'anello sopra il capo della presenza). Reagisce a voiceState:
 * cambia tinta + leggera pulsazione via CSS.
 */
export function KiraGlyph({ size = 24, color, className, voiceState = 'idle' }: KiraGlyphProps) {
  const resolvedColor = color ?? STATE_COLORS[voiceState];
  const isActive = voiceState !== 'idle';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={resolvedColor}
      strokeWidth="1.3"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={`${className ?? ''} ${isActive ? 'kc-glyph-active' : ''}`.trim()}
      style={{ transition: 'stroke 0.35s ease', filter: isActive ? `drop-shadow(0 0 4px ${resolvedColor}60)` : 'none' }}
      aria-hidden="true"
    >
      {/* Anello dell'halo (ellisse vista in prospettiva, aperta dove si frammenta) */}
      <path d="M5 16 A 11 5.5 0 1 1 22.5 20.2" opacity="0.95" />
      {/* Cubi che si staccano dall'anello e salgono */}
      <rect x="23.2" y="17.6" width="3.4" height="3.4" rx="0.5" transform="rotate(12 24.9 19.3)" opacity="0.9" />
      <rect x="25.6" y="12.6" width="2.6" height="2.6" rx="0.4" transform="rotate(-18 26.9 13.9)" opacity="0.7" />
      <rect x="27.0" y="8.2" width="1.9" height="1.9" rx="0.3" transform="rotate(24 27.9 9.1)" opacity="0.5" />
      {/* Frammento minore già disperso */}
      <circle cx="24.6" cy="5.6" r="0.8" fill={resolvedColor} stroke="none" opacity="0.5" />
      {/* Scintilla al centro dell'anello */}
      <path d="M14 13.4 L14.7 15.3 L16.6 16 L14.7 16.7 L14 18.6 L13.3 16.7 L11.4 16 L13.3 15.3 Z" fill={resolvedColor} stroke="none" opacity="0.85" />
    </svg>
  );
}
