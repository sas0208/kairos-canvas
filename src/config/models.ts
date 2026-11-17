export type ModelCategory = 'Core' | 'Fast' | 'Reasoning' | 'Coding' | 'Unfiltered' | 'Experimental' | 'Cloud Frontier';

export type ModelProfile = {
  id: string;
  displayName: string;
  provider: 'ollama';
  category: ModelCategory;
  strengths: string[];
  weaknesses: string[];
  recommendedUse: string;
  estimatedSpeed: 'low' | 'medium' | 'high';
  estimatedQuality: 'baseline' | 'good' | 'strong' | 'frontier';
  compatibility: 'local' | 'cloud' | 'hybrid';
  performance?: {
    responseTime: string;
    tokensPerSecond?: number;
    quality: 'bassa' | 'media' | 'buona' | 'forte' | 'instabile';
    inputTokens: string;
    outputTokens: string;
    verdict: 'tieni' | 'testa' | 'solo se serve' | 'evita';
    note: string;
  };
  default?: boolean;
  enabledByDefault?: boolean;
};

export const MODEL_PROFILES: ModelProfile[] = [
  {
    id: 'qwen3.5:9b',
    displayName: 'Qwen3.5 9B',
    provider: 'ollama',
    category: 'Core',
    strengths: ['miglior locale 2026 in 8GB VRAM', 'italiano eccellente', 'context 256K', 'istruzioni complesse'],
    weaknesses: ['~6.6GB: con KV-cache lunga può spillare', 'non frontier'],
    recommendedUse: 'Modello principale chat/orchestrator di Kira.',
    estimatedSpeed: 'medium',
    estimatedQuality: 'strong',
    compatibility: 'local',
    performance: {
      responseTime: '~105s cold, ~29s warm per 738 token',
      tokensPerSecond: 25.7,
      quality: 'forte',
      inputTokens: '4K-16K consigliati su GPU da 8 GB; oltre aumenta il rischio spill',
      outputTokens: '700-1400 per analisi; 300-600 per chat',
      verdict: 'tieni',
      note: 'Miglior output del test: concreto, realistico sui limiti e utile per decisioni.',
    },
    default: true,
    enabledByDefault: true
  },
  {
    id: 'qwen3:8b',
    displayName: 'Qwen3 8B',
    provider: 'ollama',
    category: 'Core',
    strengths: ['chat e orchestrazione', 'buon italiano', 'istruzioni complesse', 'entra in 8GB VRAM'],
    weaknesses: ['non frontier', 'ragionamento profondo inferiore al cloud'],
    recommendedUse: 'Fallback chat e loop agentici (resta residente in VRAM).',
    estimatedSpeed: 'medium',
    estimatedQuality: 'strong',
    compatibility: 'local',
    performance: {
      responseTime: '~49s cold, ~9s warm per 603 token',
      tokensPerSecond: 69.6,
      quality: 'buona',
      inputTokens: '4K-8K per agent loop; 16K se serve contesto',
      outputTokens: '500-1000',
      verdict: 'tieni',
      note: 'Miglior compromesso velocita/qualita per uso interattivo e tool-calling locale.',
    },
    enabledByDefault: true
  },
  {
    id: 'phi4-mini:3.8b',
    displayName: 'Phi-4 Mini 3.8B',
    provider: 'ollama',
    category: 'Fast',
    strengths: ['classificazione rapida', 'routing intent', 'molto leggero'],
    weaknesses: ['poco adatto a risposte lunghe/creative'],
    recommendedUse: 'Classifier/router veloce e risposte brevi.',
    estimatedSpeed: 'high',
    estimatedQuality: 'good',
    compatibility: 'local',
    performance: {
      responseTime: '~32s cold, ~7s warm per 750 token',
      tokensPerSecond: 111.6,
      quality: 'media',
      inputTokens: '1K-4K',
      outputTokens: '100-400',
      verdict: 'tieni',
      note: 'Ottimo per routing/voce. Nel coding lungo tende a inventare API e duplicare sezioni.',
    },
    enabledByDefault: true
  },
  {
    id: 'finalend/hermes-3-llama-3.1:latest',
    displayName: 'Hermes 3 Llama 3.1 8B',
    provider: 'ollama',
    category: 'Core',
    strengths: ['chat generale', 'tono naturale', 'istruzioni complesse', 'continuita conversazionale'],
    weaknesses: ['non e un modello frontier', 'ragionamento profondo limitato rispetto a cloud/top local'],
    recommendedUse: 'Fallback chat locale (equilibrio qualita/stile).',
    estimatedSpeed: 'medium',
    estimatedQuality: 'strong',
    compatibility: 'local',
    enabledByDefault: true
  },
  {
    id: 'llama3.2:3b',
    displayName: 'Llama 3.2 3B',
    provider: 'ollama',
    category: 'Fast',
    strengths: ['risposte rapide', 'voce/conversazione breve', 'task semplici'],
    weaknesses: ['meno profondita', 'meno adatto a analisi lunghe'],
    recommendedUse: 'Modalita voce rapida, appunti, domande semplici.',
    estimatedSpeed: 'high',
    estimatedQuality: 'baseline',
    compatibility: 'local',
    enabledByDefault: true
  },
  {
    id: 'deepseek-r1:8b',
    displayName: 'DeepSeek R1 8B',
    provider: 'ollama',
    category: 'Reasoning',
    strengths: ['ragionamento locale', 'analisi tecnica', 'coding leggero'],
    weaknesses: ['piu lento dei modelli chat piccoli', 'non e un modello principale conversazionale'],
    recommendedUse: 'DeepSeek locale consigliato per reasoning/coding su Ollama.',
    estimatedSpeed: 'medium',
    estimatedQuality: 'strong',
    compatibility: 'local'
  },
  {
    id: 'qwen3-coder:30b',
    displayName: 'Qwen3-Coder 30B A3B',
    provider: 'ollama',
    category: 'Coding',
    strengths: ['coding agentico', '256K context nativo', 'MoE 3.3B attivi', 'miglior candidato heavy locale'],
    weaknesses: ['18GB: non sta in 8GB VRAM', 'load ~3 minuti', 'generazione ~7 tok/s nel test medio'],
    recommendedUse: 'Solo coding pesante occasionale: refactor complessi, piani tecnici, repository grandi.',
    estimatedSpeed: 'low',
    estimatedQuality: 'strong',
    compatibility: 'local',
    performance: {
      responseTime: '~242s cold per 239 token; load ~192s',
      tokensPerSecond: 6.9,
      quality: 'buona',
      inputTokens: '2K-8K su questo PC; 32K+ solo con molta pazienza',
      outputTokens: '200-600',
      verdict: 'solo se serve',
      note: 'Installato e funzionante, ma troppo lento per chat. Kimi K3 non e pratico locale su GPU da 8 GB.',
    },
  },
  {
    id: 'qwen2.5-coder:7b',
    displayName: 'Qwen2.5 Coder 7B',
    provider: 'ollama',
    category: 'Coding',
    strengths: ['coding locale', 'fix mirati', 'spiegazione diff', 'handoff tecnici'],
    weaknesses: ['non va usato come default conversazionale', 'tool-calling da verificare con OpenClaw'],
    recommendedUse: 'Modello locale consigliato per task coding, revisione patch e supporto OpenCode/OpenClaw controllato.',
    estimatedSpeed: 'medium',
    estimatedQuality: 'strong',
    compatibility: 'local',
    performance: {
      responseTime: '~40s cold, ~5s warm per 402 token',
      tokensPerSecond: 75.3,
      quality: 'buona',
      inputTokens: '4K-8K',
      outputTokens: '400-1000',
      verdict: 'tieni',
      note: 'Profilo base di local-coder. Molto buono per patch mirate e risposte tecniche veloci.',
    },
  },
  {
    id: 'local-coder:latest',
    displayName: 'Local Coder',
    provider: 'ollama',
    category: 'Coding',
    strengths: ['alias pronto per CLI locali', 'veloce', 'buono su patch piccole'],
    weaknesses: ['meno profondo dei 9B/30B', 'puo semplificare troppo architetture Windows'],
    recommendedUse: 'Default coding locale rapido per fix, script e refactor piccoli.',
    estimatedSpeed: 'high',
    estimatedQuality: 'good',
    compatibility: 'local',
    enabledByDefault: true,
    performance: {
      responseTime: '~40s cold, ~5s warm per 402 token',
      tokensPerSecond: 75.3,
      quality: 'buona',
      inputTokens: '4K-8K',
      outputTokens: '400-1000',
      verdict: 'tieni',
      note: 'Uno dei tre da lasciare per coding software quotidiano.',
    },
  },
  {
    id: 'local-coder-pro:latest',
    displayName: 'Local Coder Pro',
    provider: 'ollama',
    category: 'Coding',
    strengths: ['modello piu grande', 'output lungo', 'buono per brainstorming tecnico'],
    weaknesses: ['load molto lento', 'nel test e stato generico', 'qualita inferiore al costo tempo'],
    recommendedUse: 'Solo confronto o task specifici dove DeepSeek Coder V2 serve davvero.',
    estimatedSpeed: 'low',
    estimatedQuality: 'good',
    compatibility: 'local',
    performance: {
      responseTime: '~129s cold, ~20s warm per 750 token',
      tokensPerSecond: 36.9,
      quality: 'media',
      inputTokens: '4K-8K',
      outputTokens: '500-1200',
      verdict: 'testa',
      note: 'Non batte qwen3.5 o local-coder nel test OBS/game. Da non usare come default.',
    },
  }
];

export function getModelProfile(id: string) {
  return MODEL_PROFILES.find((model) => model.id === id);
}

export function getDefaultLocalModel() {
  return MODEL_PROFILES.find((model) => model.default && model.compatibility === 'local') || MODEL_PROFILES[0];
}
