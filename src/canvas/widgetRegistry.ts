/**
 * Widget Registry — catalogo statico di tutti i widget disponibili nel Canvas OS.
 * Fonte di verità per id, dimensioni e comandi dei widget.
 */

export type WidgetId =
  | 'chat' | 'voice' | 'weather' | 'calendar'
  | 'memory'
  | 'media' | 'activity' | 'longrun'
  | 'notes' | 'memgraph' | 'capability' | 'permissions'
  | 'notifications' | 'pomodoro' | 'settings'
  | 'agentflow' | 'news' | 'automation' | 'turbo' | 'mcp' | 'supermemory' | 'briefingplayer' | 'statuskira' | 'models' | 'operations';

export interface WidgetDefinition {
  id: WidgetId;
  name: string;
  icon: string;           // emoji / glyph
  /** Priority for command routing: higher wins (10=system, 8=home/cal, 7=meteo/devices, 6=chat/voice, 5=media/memory, 4=browser). */
  priority: number;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** Only one open instance at a time when true. */
  singleton: boolean;
  /** Cannot be closed (e.g. Kira Core). */
  persistent: boolean;
  /** Natural-language tokens this widget matches in command routing. */
  commands: string[];
  /** Short description shown in Command Palette. */
  description: string;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
  chat: {
    id: 'chat',
    name: 'Chat',
    icon: '💬',
    priority: 6,
    defaultSize: { w: 480, h: 600 },
    minSize: { w: 320, h: 360 },
    singleton: true,
    persistent: false,
    commands: ['chat', 'conversazione', 'messaggi kira', 'scrivi'],
    description: 'Conversazione con Kira — history e contesto',
  },
  voice: {
    id: 'voice',
    name: 'Voce',
    icon: '🎙️',
    priority: 6,
    defaultSize: { w: 400, h: 400 },
    minSize: { w: 320, h: 320 },
    singleton: true,
    persistent: false,
    commands: ['voce', 'voice', 'parla', 'audio', 'microfono', 'ascolto'],
    description: 'Modalità voce — trascrizione live e waveform',
  },
  weather: {
    id: 'weather',
    name: 'Meteo',
    icon: '🌤️',
    priority: 7,
    defaultSize: { w: 320, h: 280 },
    minSize: { w: 260, h: 220 },
    singleton: true,
    persistent: false,
    commands: ['meteo', 'tempo', 'weather', 'che tempo fa'],
    description: 'Meteo locale + forecast 7 giorni',
  },
  calendar: {
    id: 'calendar',
    name: 'Calendario',
    icon: '📅',
    priority: 8,
    defaultSize: { w: 360, h: 320 },
    minSize: { w: 280, h: 240 },
    singleton: true,
    persistent: false,
    commands: ['calendario', 'agenda', 'eventi', 'impegni', 'calendar', 'prossimo evento'],
    description: 'Eventi oggi + countdown prossimo impegno',
  },
  statuskira: {
    id: 'statuskira',
    name: 'Stato Kira',
    icon: '📊',
    priority: 5,
    defaultSize: { w: 440, h: 520 },
    minSize: { w: 320, h: 360 },
    singleton: true,
    persistent: false,
    commands: ['stato kira', 'stato', 'overview', 'sistema', 'dashboard', 'salute sistema'],
    description: 'Cruscotto a colpo d\'occhio su tutti i sottosistemi di Kira',
  },
  models: {
    id: 'models',
    name: 'Modelli',
    icon: '⊞',
    priority: 5,
    defaultSize: { w: 440, h: 540 },
    minSize: { w: 340, h: 380 },
    singleton: true,
    persistent: false,
    commands: ['modelli', 'models', 'ollama', 'llm', 'vram'],
    description: 'Modelli Ollama: copertura ruoli, pull, warmup/unload VRAM',
  },
  briefingplayer: {
    id: 'briefingplayer',
    name: 'Rassegna Kira',
    icon: '🎧',
    priority: 6,
    defaultSize: { w: 380, h: 460 },
    minSize: { w: 300, h: 320 },
    singleton: true,
    persistent: false,
    commands: ['rassegna', 'briefing', 'notizie del giorno', 'player', 'novità', 'leggimi le notizie'],
    description: 'Rassegna parlata del giorno (AI/cyber/ecommerce/paper) + news→idea',
  },
  memory: {
    id: 'memory',
    name: 'Memoria · Lista',
    icon: '☰',
    priority: 2,
    defaultSize: { w: 480, h: 500 },
    minSize: { w: 320, h: 360 },
    singleton: true,
    persistent: false,
    commands: ['memoria lista', 'memory list', 'lista ricordi', 'elenco memoria'],
    description: 'Lista canonical entries — manuali, auto, verified, promoted',
  },
  media: {
    id: 'media',
    name: 'Media',
    icon: '🎬',
    priority: 5,
    defaultSize: { w: 480, h: 400 },
    minSize: { w: 320, h: 280 },
    singleton: true,
    persistent: false,
    commands: ['media', 'crunchyroll', 'plex', 'youtube', 'spotify', 'film', 'anime', 'musica'],
    description: 'Launcher per Crunchyroll, Plex, YouTube, Spotify',
  },
  operations: {
    id: 'operations',
    name: 'Operazioni',
    icon: '🛰',
    priority: 10,
    defaultSize: { w: 460, h: 600 },
    minSize: { w: 340, h: 380 },
    singleton: true,
    persistent: false,
    commands: [
      'operazioni', 'centro operazioni', 'action center', 'cosa stai facendo', 'cosa sta facendo kira',
      'cosa è fallito', "cosa e' fallito", 'cosa è andato storto', 'mostrami le operazioni',
      'operazioni in corso', 'cosa hai prodotto', 'cosa hai fatto oggi', 'cosa è successo', 'stato operazioni',
    ],
    description: 'Centro Operazioni — tutto ciò che Kira sta facendo, in chiaro: in corso, completate, fallite, da gestire. Errori spiegati in italiano.',
  },
  activity: {
    id: 'activity',
    name: 'Attività',
    icon: '⚙️',
    priority: 9,
    defaultSize: { w: 400, h: 500 },
    minSize: { w: 320, h: 320 },
    singleton: true,
    persistent: false,
    commands: ['attività', 'jobs', 'activity', 'operatore', 'agenti'],
    description: 'Job attivi, agenti, approvazioni',
  },
  longrun: {
    id: 'longrun',
    name: 'Long Run',
    icon: '🧭',
    priority: 8,
    defaultSize: { w: 420, h: 460 },
    minSize: { w: 320, h: 320 },
    singleton: true,
    persistent: false,
    commands: ['long run', 'longrun', 'checkpoint', 'resume', 'riprendi', 'ultimo checkpoint'],
    description: 'Ultimo long run: stato, fase, prossimo step, resume prompt',
  },
  notes: {
    id: 'notes',
    name: 'Note',
    icon: '📝',
    priority: 5,
    defaultSize: { w: 380, h: 480 },
    minSize: { w: 300, h: 360 },
    singleton: true,
    persistent: false,
    commands: ['note', 'appunti', 'blocco note', 'annota', 'nota rapida', 'scrivi nota', 'notepad'],
    description: 'Note veloci con tag, pin e ricerca',
  },
  supermemory: {
    id: 'supermemory',
    name: 'Supermemoria',
    icon: '🧠',
    priority: 5,
    defaultSize: { w: 360, h: 460 },
    minSize: { w: 300, h: 380 },
    singleton: true,
    persistent: false,
    commands: ['supermemoria', 'super memoria', 'curatore memoria', 'reindex memoria', 'stato memoria', 'ingest stato', 'memoria profonda'],
    description: 'Supermemoria — stato ingest/curator, fatti promossi vs pending, curate/reindex on-demand + giro notturno',
  },
  memgraph: {
    id: 'memgraph',
    name: 'Memoria · Grafo',
    icon: '◈',
    priority: 6,
    defaultSize: { w: 720, h: 520 },
    minSize: { w: 480, h: 320 },
    singleton: true,
    persistent: false,
    commands: ['memoria', 'memory', 'grafo', 'ricordi', 'memory graph', 'knowledge graph', 'grafo memoria', 'mappa concettuale', 'connessioni', 'cervello kira'],
    description: 'Grafo interattivo della memoria — nodi (ricordi, capability, eventi) e relazioni. Vista principale della memoria.',
  },
  capability: {
    id: 'capability',
    name: 'Capacità',
    icon: '📊',
    priority: 3,
    defaultSize: { w: 420, h: 520 },
    minSize: { w: 320, h: 380 },
    singleton: true,
    persistent: false,
    commands: ['capacità', 'capability', 'copertura', 'gap', 'funzionalità', 'cosa sai fare', 'cosa puoi fare'],
    description: 'Registry capacità Kira — stato, gap e saturation',
  },
  permissions: {
    id: 'permissions',
    name: 'Permessi',
    icon: '🛡️',
    priority: 3,
    defaultSize: { w: 460, h: 520 },
    minSize: { w: 360, h: 380 },
    singleton: true,
    persistent: false,
    commands: ['permessi', 'permission', 'autorizzazioni', 'autonomia', 'cosa puoi fare da solo', 'tier'],
    description: 'Gestione permessi — cosa Kira fa in autonomia vs con conferma',
  },
  notifications: {
    id: 'notifications',
    name: 'Notifiche',
    icon: '📋',
    priority: 4,
    defaultSize: { w: 420, h: 480 },
    minSize: { w: 320, h: 320 },
    singleton: true,
    persistent: false,
    commands: ['notifiche', 'log azioni', 'storico', 'cosa hai fatto', 'log kira', 'azioni recenti'],
    description: 'Log storico di tutte le azioni eseguite da Kira',
  },
  pomodoro: {
    id: 'pomodoro',
    name: 'Pomodoro',
    icon: '🍅',
    priority: 6,
    defaultSize: { w: 300, h: 420 },
    minSize: { w: 260, h: 360 },
    singleton: true,
    persistent: false,
    commands: ['pomodoro', 'timer', 'focus timer', 'concentrazione', 'lavoro timer', 'pausa timer', 'ciclo pomodoro'],
    description: 'Timer Pomodoro — 25/5 min cicli con pausa lunga ogni 4',
  },
  settings: {
    id: 'settings',
    name: 'Impostazioni',
    icon: '⚙️',
    priority: 3,
    defaultSize: { w: 460, h: 580 },
    minSize: { w: 360, h: 400 },
    singleton: true,
    persistent: false,
    commands: ['impostazioni', 'settings', 'config', 'configurazione', 'integrazioni', 'env', 'chiavi api setup', 'collega', 'configura'],
    description: 'Stato e configurazione di tutte le integrazioni',
  },
  automation: {
    id: 'automation',
    name: 'Automazioni',
    icon: '🔗',
    priority: 4,
    defaultSize: { w: 400, h: 480 },
    minSize: { w: 320, h: 340 },
    singleton: true,
    persistent: false,
    commands: ['automazioni', 'n8n', 'workflow', 'flussi automatici', 'automazione'],
    description: 'Motore automazioni n8n — stato, workflow e trigger via webhook (rete locale)',
  },
  turbo: {
    id: 'turbo',
    name: 'Turbo',
    icon: '⚡',
    priority: 4,
    defaultSize: { w: 360, h: 460 },
    minSize: { w: 300, h: 360 },
    singleton: true,
    persistent: false,
    commands: ['turbo', 'modalità turbo', 'libera memoria', 'libera vram', 'libera gpu', 'boost gpu', 'più fluido', 'velocizza kira', 'chiudi superfluo'],
    description: 'Modalità Turbo — libera VRAM/GPU chiudendo le app non essenziali + power plan prestazioni',
  },
  mcp: {
    id: 'mcp',
    name: 'MCP',
    icon: '🔌',
    priority: 4,
    defaultSize: { w: 400, h: 480 },
    minSize: { w: 320, h: 340 },
    singleton: true,
    persistent: false,
    commands: ['mcp', 'model context protocol', 'tool esterni', 'server mcp', 'tool modulari'],
    description: 'Server MCP locali — tool modulari (filesystem, web…) che Kira può usare. Configurati sul backend',
  },
  news: {
    id: 'news',
    name: 'Notizie',
    icon: '📰',
    priority: 5,
    defaultSize: { w: 420, h: 520 },
    minSize: { w: 320, h: 360 },
    singleton: true,
    persistent: false,
    commands: ['notizie', 'news', 'giornale', 'cosa succede nel mondo', 'attualità', 'titoli', 'rassegna stampa', 'ultime notizie'],
    description: 'Notizie da RSS pubblici — Mondo, Italia, Tech con filtro ultime 24h',
  },
  agentflow: {
    id: 'agentflow',
    name: 'Agent Flow',
    icon: '🔀',
    priority: 4,
    defaultSize: { w: 520, h: 480 },
    minSize: { w: 380, h: 320 },
    singleton: true,
    persistent: false,
    commands: ['agent flow', 'flusso agenti', 'pipeline', 'agenti grafo', 'flow', 'lavoro agenti'],
    description: 'Visualizzazione grafico del flusso job/agent — vedi avanzamento e blocchi',
  },
};

/** Tutte le definizioni come array (ordinato per priority desc). */
export const WIDGET_LIST: WidgetDefinition[] = Object
  .values(WIDGET_REGISTRY)
  .sort((a, b) => b.priority - a.priority);

/** Lookup helper con type safety. */
export function getWidgetDefinition(id: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[id as WidgetId];
}

/**
 * Match a free-text command to a widget id, by priority.
 * Returns the highest-priority widget whose `commands` includes any token from the input.
 */
export function matchWidgetByCommand(input: string): WidgetDefinition | null {
  const text = input.toLowerCase();
  let best: WidgetDefinition | null = null;
  for (const def of WIDGET_LIST) {
    for (const cmd of def.commands) {
      if (text.includes(cmd)) {
        if (!best || def.priority > best.priority) best = def;
        break;
      }
    }
  }
  return best;
}
