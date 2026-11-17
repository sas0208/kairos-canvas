// Workspace presets contestuali: scene tematiche che aprono i widget canonici
// senza richiedere salvataggio manuale. Permettono di passare istantaneamente
// tra setup di lavoro tipici.

import type { WidgetId } from './widgetRegistry';

export interface WorkspacePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  widgets: WidgetId[];
  /** Hint orario per auto-suggest (24h). Es. [6, 12] = suggerisci mattina. */
  hours?: [number, number];
}

export const WORKSPACE_PRESETS: WorkspacePreset[] = [
  {
    id: 'mattina',
    name: 'Mattina',
    icon: '🌅',
    description: 'Calendar · Weather · News · Pomodoro',
    widgets: ['calendar', 'weather', 'news', 'pomodoro'],
    hours: [6, 11],
  },
  {
    id: 'comunicazione',
    name: 'Comunicazione',
    icon: '💬',
    description: 'Chat · Voce · Notifiche',
    widgets: ['chat', 'voice', 'notifications'],
  },
  {
    id: 'sistema',
    name: 'Sistema',
    icon: '🖥️',
    description: 'Stato · Modelli · Grafo · MCP',
    widgets: ['statuskira', 'models', 'memgraph', 'mcp'],
  },
  {
    id: 'focus',
    name: 'Focus',
    icon: '◉',
    description: 'Pomodoro · Notes · Activity',
    widgets: ['pomodoro', 'notes', 'activity'],
    hours: [9, 18],
  },
  {
    id: 'sera',
    name: 'Sera',
    icon: '🌙',
    description: 'Notes · Media · Memory',
    widgets: ['notes', 'media', 'memory'],
    hours: [20, 23],
  },
  {
    id: 'ricerca',
    name: 'Ricerca',
    icon: '🔎',
    description: 'News · Briefing · Memory · Notes',
    widgets: ['news', 'briefingplayer', 'memory', 'notes'],
  },
  {
    id: 'engine',
    name: 'Engine Room',
    icon: '⚙',
    description: 'Activity · LongRun · Capability · Notifications',
    widgets: ['activity', 'longrun', 'capability', 'notifications'],
  },
];

export function suggestPresetForHour(hour: number): WorkspacePreset | null {
  for (const p of WORKSPACE_PRESETS) {
    if (p.hours && hour >= p.hours[0] && hour < p.hours[1]) return p;
  }
  return null;
}
