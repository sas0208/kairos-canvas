import { getDefaultLocalModel } from '../../config/models';
import type { KiraSettings } from '../../types/settings';

// Hardware di riferimento: GPU da 8GB VRAM + 16GB RAM
// Lineup aggiornato (la fonte di verità sta nel backend):
//   chat/orchestrator: qwen3.5:9b      (installato 2026-06; fallback qwen3:8b → llama3.1:8b)
//   fast/voice:        phi4-mini:3.8b  (classifier/router veloce; fallback llama3.2:3b)
//   coding:            qwen2.5-coder:7b
//   reasoning:         deepseek-r1:8b
//   vision:            qwen3-vl:8b     (fallback qwen2.5vl:7b → llava:7b)
// NB: qwen3-coder:30b e qwen2.5-coder:14b NON stanno interi in 8GB VRAM (lenti) → solo coding pesante.

export function resolveModel(settings: KiraSettings, task: 'chat' | 'voice' | 'coding' | 'reasoning' | 'vision' = 'chat') {
  if (settings.modelRoutingMode === 'manual') {
    return settings.selectedModel || getDefaultLocalModel().id;
  }

  if (task === 'coding') {
    return 'qwen2.5-coder:7b';
  }

  if (task === 'reasoning') {
    return 'deepseek-r1:8b';
  }

  if (task === 'vision') {
    // qwen3-vl:8b principale (entra in 8GB); fallback gestito lato server se assente.
    return 'qwen3-vl:8b';
  }

  if (settings.modelRoutingMode === 'fast' || task === 'voice') {
    // phi4-mini è il classifier/router veloce; resta leggerissimo per la voce.
    return 'phi4-mini:3.8b';
  }

  if (settings.modelRoutingMode === 'quality') {
    return settings.selectedModel || 'qwen3.5:9b';
  }

  // Default: qwen3.5:9b come modello principale chat/orchestrator.
  return settings.selectedModel || 'qwen3.5:9b';
}
