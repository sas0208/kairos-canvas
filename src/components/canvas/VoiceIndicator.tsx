import { useVoiceState } from '../../contexts/VoiceStateContext';

/**
 * VoiceIndicator — full-screen HUD overlay while listening.
 * Corner brackets + ambient radial wash + animated rings + waveform.
 * Pointer-events: none — never intercepts clicks.
 */
export function VoiceIndicator() {
  const { voiceState } = useVoiceState();
  const visible = voiceState === 'listening';

  return (
    <div className={`kc-vi ${visible ? 'kc-vi-on' : ''}`} aria-hidden="true">
      {/* Full-screen ambient red wash */}
      <div className="kc-vi-ambient" />

      {/* Edge brackets */}
      <span className="kc-vi-corner kc-vi-corner-tl" />
      <span className="kc-vi-corner kc-vi-corner-tr" />
      <span className="kc-vi-corner kc-vi-corner-bl" />
      <span className="kc-vi-corner kc-vi-corner-br" />

      {/* Edge labels */}
      <div className="kc-vi-label kc-vi-label-top">◉  ASCOLTO IN CORSO  ◉</div>
      <div className="kc-vi-label kc-vi-label-bottom">PARLA ORA</div>

      {/* Bottom waveform — full width subtle */}
      <div className="kc-vi-wave">
        {Array.from({ length: 48 }).map((_, i) => (
          <span key={i} style={{ animationDelay: `${i * 35}ms` }} />
        ))}
      </div>
    </div>
  );
}
