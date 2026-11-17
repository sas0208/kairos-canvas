import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { WIDGET_REGISTRY } from './widgetRegistry';
import type { WidgetId, WidgetDefinition } from './widgetRegistry';
import { ensureLayoutSeeds } from './layoutPresets';
import { playWidgetOpen } from '../lib/soundManager';

export type WindowState = 'open' | 'minimized' | 'fullscreen';

export interface WidgetInstance {
  /** Unique instance id (allows multi-instance widgets like browser). */
  id: string;
  widgetId: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  state: WindowState;
  zIndex: number;
  /** Saved pre-fullscreen geometry, restored on toggle. */
  savedRect?: { x: number; y: number; w: number; h: number };
  /** Posizione nel batch d'apertura (per stagger d'ingresso quando si carica un workspace). */
  spawnIndex?: number;
}

export interface SavedLayout {
  id: string;
  name: string;
  widgets: Array<Omit<WidgetInstance, 'zIndex'>>;
  /** Nota semantica dell'utente: a cosa serve questo workspace. */
  note?: string;
  createdAt: number;
  updatedAt: number;
}

interface CanvasState {
  widgets: WidgetInstance[];
  focusedId: string | null;
  /** Visible state — when false the canvas falls back to Legacy Cockpit. */
  enabled: boolean;
}

interface CanvasCtxValue extends CanvasState {
  openWidget: (widgetId: WidgetId, opts?: Partial<Pick<WidgetInstance, 'x' | 'y' | 'w' | 'h'>>) => string | null;
  closeWidget: (instanceId: string) => void;
  closeAll: () => void;
  minimizeWidget: (instanceId: string) => void;
  restoreWidget: (instanceId: string) => void;
  toggleFullscreen: (instanceId: string) => void;
  focusWidget: (instanceId: string) => void;
  moveWidget: (instanceId: string, x: number, y: number) => void;
  resizeWidget: (instanceId: string, w: number, h: number) => void;
  hideAllExceptCore: () => void;
  setEnabled: (v: boolean) => void;
  saveLayout: (name: string) => void;
  loadLayout: (name: string) => boolean;
  listLayouts: () => SavedLayout[];
  deleteLayout: (name: string) => void;
  setLayoutNote: (name: string, note: string) => void;
  /** Lookup helper */
  getInstance: (instanceId: string) => WidgetInstance | undefined;
  getDefinition: (instanceId: string) => WidgetDefinition | undefined;
}

const CanvasContext = createContext<CanvasCtxValue | null>(null);

const LAYOUT_STORAGE_KEY = 'kira-canvas-layouts';
const STATE_STORAGE_KEY = 'kira-canvas-state';
/** Workspace attivo (nome + nota) — letto da App.tsx per iniettare il contesto nelle chat. */
export const ACTIVE_WORKSPACE_KEY = 'kira-active-workspace';

/** Nota del workspace attivo, o '' se nessuno/senza nota. Usata per il contesto LLM. */
export function getActiveWorkspaceNote(): string {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { note?: string };
    return parsed.note?.trim() || '';
  } catch { return ''; }
}

function loadLayouts(): Record<string, SavedLayout> {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function persistLayouts(layouts: Record<string, SavedLayout>) {
  try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layouts)); } catch { /* noop */ }
}

function layoutIdFromName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function readActiveWorkspaceName(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name || null;
  } catch { return null; }
}

function writeActiveWorkspace(layout: Pick<SavedLayout, 'name' | 'note'>): void {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify({ name: layout.name, note: layout.note || '' }));
  } catch { /* ignore */ }
}

function clearActiveWorkspaceIf(name: string): void {
  try {
    const activeName = readActiveWorkspaceName();
    if (activeName && layoutIdFromName(activeName) === layoutIdFromName(name)) {
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    }
  } catch { /* ignore */ }
}

function emitLayoutChanged(action: string, layout?: Pick<SavedLayout, 'name' | 'note'>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kira:layoutChanged', {
    detail: { action, name: layout?.name, note: layout?.note || '' },
  }));
}

// Sync con il backend (non-blocking, best-effort)
async function syncLayoutToServer(layout: SavedLayout): Promise<void> {
  try {
    await fetch('/api/canvas/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: layout.name, widgets: layout.widgets, note: layout.note }),
    });
  } catch { /* non-blocking */ }
}

async function deleteLayoutFromServer(id: string): Promise<void> {
  try { await fetch(`/api/canvas/layout/${id}`, { method: 'DELETE' }); }
  catch { /* non-blocking */ }
}

// All'avvio, recupera i layout dal server se localStorage è vuoto
async function hydrateLayoutsFromServer(): Promise<void> {
  const local = loadLayouts();
  if (Object.keys(local).length > 0) return; // già presenti in locale
  try {
    const r = await fetch('/api/canvas/layout');
    if (!r.ok) return;
    const j = await r.json() as { ok: boolean; layouts?: SavedLayout[] };
    if (!j.ok || !j.layouts?.length) return;
    const record: Record<string, SavedLayout> = {};
    for (const l of j.layouts) record[l.id] = l;
    persistLayouts(record);
    emitLayoutChanged('hydrated');
  } catch { /* noop */ }
}

function persistCurrentState(widgets: WidgetInstance[], enabled: boolean) {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify({
      widgets: widgets.map(({ zIndex: _z, ...rest }) => rest),
      enabled,
    }));
  } catch { /* noop */ }
}

function loadPersistedState(): { widgets: WidgetInstance[]; enabled: boolean } {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return { widgets: [], enabled: false };
    const parsed = JSON.parse(raw) as { widgets?: WidgetInstance[]; enabled?: boolean };
    return {
      widgets: (parsed.widgets || []).map((w, i) => ({ ...w, zIndex: i + 1 })),
      enabled: Boolean(parsed.enabled),
    };
  } catch { return { widgets: [], enabled: false }; }
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Posizione di apertura: cascata diagonale a destra del core, con wrap per non
 *  ammucchiare i widget nello stesso punto e clearance dalla Chat (seed a destra). */
function defaultPlacement(index: number, def: WidgetDefinition): { x: number; y: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  const n = index % 6;            // wrap ogni 6 così non scappa fuori schermo
  const offset = 40 * n;          // passo più ampio → meno sovrapposizione
  // Anchor più a sinistra di prima (+120 invece di +220) e partenza in alto:
  // i widget si distribuiscono in verticale invece di impilarsi al centro.
  const x = Math.max(24, Math.min(vw - def.defaultSize.w - 24, vw / 2 + 120 + offset));
  const y = Math.max(56, Math.min(vh - def.defaultSize.h - 24, Math.round(vh * 0.16) + offset));
  return { x, y };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function CanvasStoreProvider({ children }: { children: ReactNode }) {
  const initial = loadPersistedState();
  // Onboarding: se il canvas è vuoto, apri ChatWidget di default così l'utente vede subito
  // la chat unificata accanto al Kira Core.
  const seedIfEmpty = (existing: WidgetInstance[]): WidgetInstance[] => {
    if (existing.length > 0) return existing;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const w = 380;
    const h = Math.min(540, Math.max(360, vh - 200));
    return [{
      id: `chat-${Date.now().toString(36)}`,
      widgetId: 'chat' as WidgetId,
      x: Math.max(24, vw - w - 24),
      y: Math.max(80, Math.round((vh - h) / 2)),
      w,
      h,
      state: 'open',
      zIndex: 1,
    }];
  };
  const [widgets, setWidgets] = useState<WidgetInstance[]>(seedIfEmpty(initial.widgets));
  const [focusedId, setFocusedId] = useState<string | null>(initial.widgets.at(-1)?.id ?? null);
  const [enabled, setEnabledRaw] = useState<boolean>(initial.enabled);
  const zCounterRef = useRef<number>(Math.max(1, initial.widgets.length));

  // Seed dei layout preset + hydrate dal server: una sola volta al mount.
  // (Prima giravano nel corpo del componente → side-effect a ogni render.)
  useEffect(() => {
    ensureLayoutSeeds();
    void hydrateLayoutsFromServer();
  }, []);

  // persist on changes (debounced minimally)
  useEffect(() => {
    const id = window.setTimeout(() => persistCurrentState(widgets, enabled), 200);
    return () => window.clearTimeout(id);
  }, [widgets, enabled]);

  const nextZ = useCallback(() => {
    zCounterRef.current += 1;
    return zCounterRef.current;
  }, []);

  const openWidget = useCallback((widgetId: WidgetId, opts?: Partial<Pick<WidgetInstance, 'x' | 'y' | 'w' | 'h'>>): string | null => {
    const def = WIDGET_REGISTRY[widgetId];
    if (!def) return null;

    let createdId: string | null = null;
    let flyCenter: { x: number; y: number } | null = null;
    setWidgets((curr) => {
      // singleton: bring existing to front + open if minimized
      if (def.singleton) {
        const existing = curr.find((w) => w.widgetId === widgetId);
        if (existing) {
          createdId = existing.id;
          flyCenter = { x: existing.x + existing.w / 2, y: existing.y + existing.h / 2 };
          return curr.map((w) => {
            if (w.id !== existing.id) return w;
            return {
              ...w,
              state: w.state === 'minimized' ? 'open' : w.state,
              zIndex: nextZ(),
            };
          });
        }
      }

      const id = randomId(widgetId);
      createdId = id;
      const placement = defaultPlacement(curr.length, def);
      const instance: WidgetInstance = {
        id,
        widgetId,
        x: opts?.x ?? placement.x,
        y: opts?.y ?? placement.y,
        w: opts?.w ?? def.defaultSize.w,
        h: opts?.h ?? def.defaultSize.h,
        state: 'open',
        zIndex: nextZ(),
      };
      flyCenter = { x: instance.x + instance.w / 2, y: instance.y + instance.h / 2 };
      return [...curr, instance];
    });

    if (createdId) {
      setFocusedId(createdId);
      playWidgetOpen();
      if (flyCenter) {
        // Kira plana verso il widget appena aperto (il core ascolta kira:flyTo)
        const nx = Math.max(-1, Math.min(1, ((flyCenter as { x: number; y: number }).x / Math.max(1, window.innerWidth)) * 2 - 1));
        const ny = Math.max(-1, Math.min(1, ((flyCenter as { x: number; y: number }).y / Math.max(1, window.innerHeight)) * 2 - 1));
        window.dispatchEvent(new CustomEvent('kira:flyTo', { detail: { x: nx, y: ny } }));
      }
    }
    return createdId;
  }, [nextZ]);

  const closeWidget = useCallback((instanceId: string) => {
    setWidgets((curr) => curr.filter((w) => w.id !== instanceId));
    setFocusedId((f) => (f === instanceId ? null : f));
  }, []);

  const closeAll = useCallback(() => {
    setWidgets([]);
    setFocusedId(null);
  }, []);

  const minimizeWidget = useCallback((instanceId: string) => {
    setWidgets((curr) => curr.map((w) => w.id === instanceId ? { ...w, state: 'minimized' } : w));
  }, []);

  const restoreWidget = useCallback((instanceId: string) => {
    setWidgets((curr) => curr.map((w) => {
      if (w.id !== instanceId) return w;
      if (w.savedRect) {
        return {
          ...w,
          state: 'open',
          x: w.savedRect.x,
          y: w.savedRect.y,
          w: w.savedRect.w,
          h: w.savedRect.h,
          savedRect: undefined,
          zIndex: nextZ(),
        };
      }
      return { ...w, state: 'open', zIndex: nextZ() };
    }));
    setFocusedId(instanceId);
  }, [nextZ]);

  const toggleFullscreen = useCallback((instanceId: string) => {
    setWidgets((curr) => curr.map((w) => {
      if (w.id !== instanceId) return w;
      if (w.state === 'fullscreen') {
        const rect = w.savedRect || { x: w.x, y: w.y, w: w.w, h: w.h };
        return { ...w, state: 'open', x: rect.x, y: rect.y, w: rect.w, h: rect.h, savedRect: undefined };
      }
      // Calcola fullscreen RISPETTANDO sidebar e status rail.
      const vw = window.innerWidth, vh = window.innerHeight;
      const sidebarOffsetPx = (() => {
        try {
          const s = getComputedStyle(document.documentElement).getPropertyValue('--kc-sidebar-offset').trim() ||
                    getComputedStyle(document.documentElement).getPropertyValue('--sidebar-offset').trim();
          if (s.endsWith('rem')) return parseFloat(s) * 16;
          if (s.endsWith('px')) return parseFloat(s);
        } catch { /* ignore */ }
        // Fallback: legge la width effettiva della sidebar dal DOM se presente
        const sb = document.querySelector('[data-kc-sidebar]') as HTMLElement | null;
        return sb ? sb.getBoundingClientRect().width : 0;
      })();
      // Mobile (no sidebar): occupa tutto. Desktop: sotto la sidebar.
      const isMobile = vw < 768;
      const left = isMobile ? 12 : Math.round(sidebarOffsetPx) + 16;
      const right = vw - 16;
      const top = isMobile ? 60 : 16;
      const bottom = vh - 40; // sopra status rail
      return {
        ...w,
        state: 'fullscreen',
        savedRect: { x: w.x, y: w.y, w: w.w, h: w.h },
        x: left,
        y: top,
        w: Math.max(320, right - left),
        h: Math.max(240, bottom - top),
        zIndex: nextZ(),
      };
    }));
  }, [nextZ]);

  const focusWidget = useCallback((instanceId: string) => {
    setFocusedId(instanceId);
    setWidgets((curr) => curr.map((w) => w.id === instanceId ? { ...w, zIndex: nextZ() } : w));
  }, [nextZ]);

  const moveWidget = useCallback((instanceId: string, x: number, y: number) => {
    setWidgets((curr) => curr.map((w) => {
      if (w.id !== instanceId) return w;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
      return {
        ...w,
        x: clamp(x, -w.w + 80, vw - 80),
        y: clamp(y, 0, vh - 40),
      };
    }));
  }, []);

  const resizeWidget = useCallback((instanceId: string, w: number, h: number) => {
    setWidgets((curr) => curr.map((it) => {
      if (it.id !== instanceId) return it;
      const def = WIDGET_REGISTRY[it.widgetId];
      const minW = def?.minSize.w ?? 200;
      const minH = def?.minSize.h ?? 160;
      return { ...it, w: Math.max(minW, w), h: Math.max(minH, h) };
    }));
  }, []);

  const hideAllExceptCore = useCallback(() => {
    setWidgets((curr) => curr.map((w) => ({ ...w, state: 'minimized' })));
  }, []);

  const setEnabled = useCallback((v: boolean) => setEnabledRaw(v), []);

  const saveLayout = useCallback((name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const layouts = loadLayouts();
    const id = layoutIdFromName(cleanName);
    const layout: SavedLayout = {
      id,
      name: cleanName,
      widgets: widgets.map(({ zIndex: _z, ...rest }) => rest),
      note: layouts[id]?.note,
      createdAt: layouts[id]?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    layouts[id] = layout;
    persistLayouts(layouts);
    writeActiveWorkspace(layout);
    emitLayoutChanged('saved', layout);
    void syncLayoutToServer(layout);
  }, [widgets]);

  const loadLayout = useCallback((name: string): boolean => {
    const layouts = loadLayouts();
    const id = layoutIdFromName(name);
    const layout = layouts[id];
    if (!layout) return false;
    setWidgets(layout.widgets.map((w, i) => ({ ...w, zIndex: i + 1, spawnIndex: i })));
    zCounterRef.current = layout.widgets.length;
    setFocusedId(layout.widgets.at(-1)?.id ?? null);
    writeActiveWorkspace(layout);
    emitLayoutChanged('loaded', layout);
    return true;
  }, []);

  const listLayouts = useCallback((): SavedLayout[] => {
    return Object.values(loadLayouts()).sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);

  const deleteLayout = useCallback((name: string) => {
    const layouts = loadLayouts();
    const id = layoutIdFromName(name);
    delete layouts[id];
    persistLayouts(layouts);
    clearActiveWorkspaceIf(name);
    emitLayoutChanged('deleted', { name, note: '' });
    void deleteLayoutFromServer(id);
  }, []);

  const setLayoutNote = useCallback((name: string, note: string) => {
    const layouts = loadLayouts();
    const id = layoutIdFromName(name);
    const layout = layouts[id];
    if (!layout) return;
    const updated: SavedLayout = { ...layout, note: note.trim() || undefined, updatedAt: Date.now() };
    layouts[id] = updated;
    persistLayouts(layouts);
    // Se è il workspace attivo, aggiorna subito il contesto usato nelle chat
    try {
      const activeName = readActiveWorkspaceName();
      if (activeName && layoutIdFromName(activeName) === layoutIdFromName(updated.name)) {
        writeActiveWorkspace(updated);
      }
    } catch { /* ignore */ }
    emitLayoutChanged('note-updated', updated);
    void syncLayoutToServer(updated);
  }, []);

  const getInstance = useCallback((instanceId: string) => widgets.find((w) => w.id === instanceId), [widgets]);
  const getDefinition = useCallback((instanceId: string) => {
    const inst = widgets.find((w) => w.id === instanceId);
    return inst ? WIDGET_REGISTRY[inst.widgetId] : undefined;
  }, [widgets]);

  const value: CanvasCtxValue = {
    widgets, focusedId, enabled,
    openWidget, closeWidget, closeAll,
    minimizeWidget, restoreWidget, toggleFullscreen,
    focusWidget, moveWidget, resizeWidget,
    hideAllExceptCore, setEnabled,
    saveLayout, loadLayout, listLayouts, deleteLayout, setLayoutNote,
    getInstance, getDefinition,
  };

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}

export function useCanvas(): CanvasCtxValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be inside CanvasStoreProvider');
  return ctx;
}
