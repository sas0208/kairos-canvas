import { WIDGET_REGISTRY } from './widgetRegistry';
import type { WidgetId } from './widgetRegistry';
import type { SavedLayout } from './canvasStore';

/** Compute initial coords/size for a preset entry (relative to viewport at seed time). */
function place(
  widgetId: WidgetId,
  spot: 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center-left' | 'center-right',
  index = 0,
): Omit<import('./canvasStore').WidgetInstance, 'zIndex'> {
  const def = WIDGET_REGISTRY[widgetId];
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const leftInset = vw >= 900 ? 280 : 24;
  const stagger = index * 18;
  let x = 24, y = 80;
  switch (spot) {
    case 'left':         x = 24;                          y = vh / 2 - def.defaultSize.h / 2 + stagger; break;
    case 'right':        x = vw - def.defaultSize.w - 24; y = vh / 2 - def.defaultSize.h / 2 + stagger; break;
    case 'top-left':     x = 24;                          y = 80 + stagger; break;
    case 'top-right':    x = vw - def.defaultSize.w - 24; y = 80 + stagger; break;
    case 'bottom-left':  x = 24;                          y = vh - def.defaultSize.h - 56 - stagger; break;
    case 'bottom-right': x = vw - def.defaultSize.w - 24; y = vh - def.defaultSize.h - 56 - stagger; break;
    case 'center-left':  x = vw / 2 - def.defaultSize.w - 240; y = vh / 2 - def.defaultSize.h / 2 + stagger; break;
    case 'center-right': x = vw / 2 + 240;                y = vh / 2 - def.defaultSize.h / 2 + stagger; break;
  }
  return {
    id: `${widgetId}-${Math.random().toString(36).slice(2, 7)}`,
    widgetId,
    x: Math.max(leftInset, x),
    y: Math.max(56, y),
    w: def.defaultSize.w,
    h: def.defaultSize.h,
    state: 'open',
  };
}

/** Layouts pre-installati. */
export function buildSeedLayouts(): SavedLayout[] {
  const now = Date.now();
  return [
    {
      id: 'default',
      name: 'default',
      widgets: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'lavoro',
      name: 'lavoro',
      note: 'Lavoro: operazioni, agenti e long run senza coprire il Core.',
      widgets: [
        place('operations', 'center-left', 0),
        place('activity', 'top-right', 0),
        place('longrun', 'bottom-right', 0),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'mattina',
      name: 'mattina',
      note: 'Risveglio: calendario, meteo, news del giorno e pomodoro.',
      widgets: [
        place('calendar', 'top-left', 0),
        place('weather', 'bottom-left', 0),
        place('news', 'center-right', 0),
        place('pomodoro', 'right', 1),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sistema',
      name: 'sistema',
      widgets: [
        place('statuskira', 'left', 0),
        place('models', 'top-right', 0),
        place('memgraph', 'center-right', 0),
        place('mcp', 'bottom-right', 0),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'anime',
      name: 'anime',
      widgets: [
        place('media', 'left', 0),
        place('chat', 'center-right', 0),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'focus',
      name: 'focus',
      widgets: [
        place('activity', 'top-right', 0),
        place('calendar', 'bottom-right', 0),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'debug',
      name: 'debug',
      widgets: [
        place('activity', 'left', 0),
        place('longrun', 'bottom-right', 0),
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

const SEED_STORAGE_KEY = 'kira-canvas-layouts';
const SEED_FLAG_KEY = 'kira-canvas-layouts-seeded-v4';

/** Seed presets in localStorage if not done yet. Non-destructive. */
export function ensureLayoutSeeds(): void {
  try {
    if (localStorage.getItem(SEED_FLAG_KEY) === '1') return;
    const raw = localStorage.getItem(SEED_STORAGE_KEY);
    const existing: Record<string, SavedLayout> = raw ? JSON.parse(raw) : {};
    const seeds = buildSeedLayouts();
    let changed = false;
    for (const seed of seeds) {
      if (!existing[seed.id]) {
        existing[seed.id] = seed;
        changed = true;
      } else if (seed.id === 'lavoro' && !existing[seed.id].widgets.some((w) => w.widgetId === 'operations')) {
        existing[seed.id] = { ...seed, createdAt: existing[seed.id].createdAt };
        changed = true;
      }
    }
    if (changed) localStorage.setItem(SEED_STORAGE_KEY, JSON.stringify(existing));
    localStorage.setItem(SEED_FLAG_KEY, '1');
  } catch { /* noop */ }
}
