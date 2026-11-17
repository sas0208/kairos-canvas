import { ParticleCoreCanvas } from './visual/ParticleCoreCanvas';
import type { KiraSettings } from '../types/settings';
import type { VoiceMode } from '../types/voice';

type CognitiveOrbProps = {
  mode?: VoiceMode;
  energy?: number;
  performanceMode?: KiraSettings['performanceMode'];
  className?: string;
};

export function CognitiveOrb({ mode = 'idle', energy = 0, performanceMode = 'medium', className = '' }: CognitiveOrbProps) {
  return (
    <div className={`pointer-events-none h-full w-full ${className}`}>
      <ParticleCoreCanvas mode={mode} amplitude={energy} performanceMode={performanceMode} />
    </div>
  );
}
