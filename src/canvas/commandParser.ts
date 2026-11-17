import { matchWidgetByCommand, WIDGET_REGISTRY } from './widgetRegistry';
import type { WidgetId } from './widgetRegistry';

export type CanvasCommand =
  | { type: 'open';        widgetId: WidgetId }
  | { type: 'close';        widgetId: WidgetId }
  | { type: 'closeAll' }
  | { type: 'hideAllExceptCore' }
  | { type: 'minimize';     widgetId: WidgetId }
  | { type: 'restore';      widgetId: WidgetId }
  | { type: 'fullscreen';   widgetId: WidgetId }
  | { type: 'move';         widgetId: WidgetId; position: 'left' | 'right' | 'center' | 'top' | 'bottom' }
  | { type: 'saveLayout';   name: string }
  | { type: 'loadLayout';   name: string }
  | { type: 'copyResume' }
  | { type: 'stopVoice' }
  | { type: 'openView'; view: 'mind' | 'forge' | 'canvas' }
  | { type: 'routine'; name: 'morning' }
  | { type: 'runAction'; action: string; label: string; endpoint: string; method?: 'POST'; body?: Record<string, unknown>; confirm?: string }
  | { type: 'help' };

/** Verb groups */
const OPEN_VERBS    = ['apri', 'mostra', 'mostrami', 'fammi vedere', 'avvia'];
const CLOSE_VERBS   = ['chiudi', 'nascondi', 'togli', 'rimuovi'];
const MIN_VERBS     = ['minimizza', 'riduci'];
const REST_VERBS    = ['ripristina', 'massimizza'];
const FULL_VERBS    = ['ingrandisci', 'espandi', 'massimizza', 'fullscreen'];

function startsWithAny(text: string, verbs: string[]): { verb: string; rest: string } | null {
  for (const v of verbs) {
    if (text.startsWith(v + ' ') || text === v) {
      return { verb: v, rest: text.slice(v.length).trim() };
    }
  }
  return null;
}

function parseMovePosition(rest: string): 'left' | 'right' | 'center' | 'top' | 'bottom' | null {
  if (/\bsinistra\b/.test(rest))     return 'left';
  if (/\bdestra\b/.test(rest))       return 'right';
  if (/\bcentro\b/.test(rest))       return 'center';
  if (/\balto\b|\bsopra\b/.test(rest)) return 'top';
  if (/\bbasso\b|\bsotto\b/.test(rest)) return 'bottom';
  return null;
}

/**
 * Parse one line of natural Italian into a canvas command, if any.
 * Returns null when input is not recognized as a canvas command (caller falls back to LLM).
 */
export function parseCommand(input: string): CanvasCommand | null {
  const text = input.toLowerCase().trim().replace(/[?!.]+$/g, '');
  if (!text) return null;

  // ── Global commands first ─────────────────────────────────────────────
  if (/^(chiudi|nascondi)\s+tutt[oi]$/.test(text)) {
    return { type: 'closeAll' };
  }

  // ── Stop voice ────────────────────────────────────────────────────────
  if (/^(stop|ferma|smetti|blocca)\s+(voce|tts|audio|il\s+parlato)/.test(text)
   || /\bstop\s+voce\b/.test(text)
   || /\bferma\s+(la\s+)?voce\b/.test(text)) {
    return { type: 'stopVoice' };
  }

  // ── Copy resume prompt ────────────────────────────────────────────────
  if (/\bcopi[a]\s+(il\s+)?(resume|resume\s+prompt|prompt\s+di\s+ripresa)\b/.test(text)
   || /\b(prendi|copia)\s+resume\b/.test(text)
   || text === 'copia resume') {
    return { type: 'copyResume' };
  }
  if (/(nascondi|chiudi)\s+tutt[oi]\s+tranne\s+(kira|il\s+core|core|centro)/.test(text)
   || /solo\s+(kira|il\s+core|core)/.test(text)) {
    return { type: 'hideAllExceptCore' };
  }
  if (/^(aiuto|help|cosa\s+puoi\s+fare)\b/.test(text)) {
    return { type: 'help' };
  }

  // ── Azioni operative dal Centro Operazioni (chat che AGISCE) ──────────
  // "aggiorna Kira", "avvia worker", "cura memoria", "disattiva gaming mode", ecc.
  if (/\baggiorna\s+kira\b/.test(text) || /\baggiorna\s+il\s+sistema\b/.test(text) || /\bavvia\s+(l['’]?\s*)?update\b/.test(text) || /\bfai\s+un\s+aggiornamento\b/.test(text)) {
    return { type: 'runAction', action: 'update', label: 'Aggiorna Kira ora', endpoint: '/api/evolve/start', body: { once: true } };
  }
  if (/\b(avvia|fai|lancia|nuovo)\b.*\b(ciclo|giro)\b.*\bworker\b/.test(text) || /\bavvia\s+(il\s+)?worker\b/.test(text) || /\bnuovo\s+ciclo\s+worker\b/.test(text)) {
    return { type: 'runAction', action: 'worker-start', label: 'Nuovo ciclo worker', endpoint: '/api/ops-stack/worker/start' };
  }
  if (/\bcontrolla\s+(il\s+)?worker\b/.test(text) || /\bstato\s+(del\s+)?worker\b/.test(text) || /\bverifica\s+(il\s+)?worker\b/.test(text)) {
    return { type: 'runAction', action: 'worker-check', label: 'Controlla worker', endpoint: '/api/ops-stack/worker/check' };
  }
  if (/\bcura\s+(la\s+)?memoria\b/.test(text) || /\bcuratela\s+memoria\b/.test(text) || /\bcura\s+il\s+backlog\b/.test(text)) {
    return { type: 'runAction', action: 'memory-curate', label: 'Cura memoria', endpoint: '/api/memory/supermemory/curate' };
  }
  if (/\b(reindicizza|reindex|ricostruisci)\s+(la\s+)?memoria\b/.test(text) || /\bricostruisci\s+memoria\b/.test(text)) {
    return { type: 'runAction', action: 'memory-reindex', label: 'Ricostruisci memoria', endpoint: '/api/memory/supermemory/reindex' };
  }
  if (/\b(disattiva|spegni|togli|esci\s+da)\b.*\bgaming\s*mode\b/.test(text) || /\bferma\s+(la\s+)?modalit[àa]\s+gioco\b/.test(text)) {
    return { type: 'runAction', action: 'gaming-off', label: 'Disattiva Gaming Mode', endpoint: '/api/ops-stack/gaming/off', confirm: 'Disattivo il Gaming Mode? Kira riaccende worker e viewer.' };
  }

  // ── Centro Operazioni (observability) ─────────────────────────────────
  // Domande naturali su cosa Kira sta facendo / cos'è fallito / cosa ha prodotto.
  if (/\bcentro\s+operazioni\b/.test(text)
   || /\baction\s+center\b/.test(text)
   || /\boperazioni\s+(in\s+corso|attive|recenti)\b/.test(text)
   || /\bmostra(?:mi)?\s+(le\s+)?operazioni\b/.test(text)
   || /\bmostra(?:mi)?\s+(gli\s+)?(output|errori|risultati)\b/.test(text)
   || /\bcosa\s+(stai|sta\s+facendo|state)\s+facendo\b/.test(text)
   || /\bcosa\s+sta\s+(succedendo|facendo\s+kira)\b/.test(text)
   || /\bcos[aà']?\s*[èe']\s+(fallit|andat[oa]\s+stort)/.test(text)
   || /\bcosa\s+(hai|ha)\s+(prodotto|fatto)\s+(oggi|adesso|ora|prima)\b/.test(text)
   || /\bcosa\s+[èe']\s+success[oa]\b/.test(text)
   || /\bcosa\s+devo\s+fare\s+(adesso|ora)\b/.test(text)
   || /\bperch[ée']?\s+(non\s+si\s+apre\s+(il\s+)?viewer|.*gaming\s*mode)/.test(text)
   || /\bgaming\s*mode\b/.test(text)
   || /\bcome\s+verifico\b/.test(text)) {
    return { type: 'open', widgetId: 'operations' };
  }

  // ── Schermi a tutto schermo (La Mente / Officina) ─────────────────────
  // "apri la mente", "mostra la memoria viva", "costellazione"
  if (/\bmemoria\s+viva\b/.test(text) || /\bcostellazione\b/.test(text)
   || /\b(la\s+)?mente\s+di\s+kira\b/.test(text)
   || /^(?:apri|mostra(?:mi)?|fammi\s+vedere|avvia)\s+(?:la\s+)?mente\b/.test(text)) {
    return { type: 'openView', view: 'mind' };
  }
  // "apri officina", "sala macchine", "codice live"
  if (/\bofficina\b/.test(text) || /\bsala\s+macchine\b/.test(text) || /\bcodice\s+live\b/.test(text)) {
    return { type: 'openView', view: 'forge' };
  }

  // ── Routine mattutina ─────────────────────────────────────────────
  // Frasi esplicite + "buongiorno"/"good morning" quando è il saluto da solo
  // (non dirotta una frase lunga tipo "buongiorno, mi ricordi la riunione?").
  if (/\broutine\s+(?:della?\s+)?mattin[ao]\b/.test(text)
   || /\broutine\s+(?:del\s+)?mattino\b/.test(text)
   || /\bmodalit[àa]\s+mattin[ao]\b/.test(text)
   || /\bavvia\s+(?:la\s+)?mattin[ao]\b/.test(text)
   || /^(?:ok\s+)?(?:buongiorno|good\s+morning|buondì)(?:\s+kira)?$/.test(text)) {
    return { type: 'routine', name: 'morning' };
  }

  // ── Workspace layouts ─────────────────────────────────────────────────
  {
    const saveMatch = text.match(/^salva\s+(?:questo\s+)?layout(?:\s+come)?\s+(.+)$/);
    if (saveMatch) return { type: 'saveLayout', name: saveMatch[1].trim() };
  }
  {
    const loadMatch = text.match(/^(?:carica|apri)\s+(?:canvas|layout|workspace)\s+(.+)$/);
    if (loadMatch) return { type: 'loadLayout', name: loadMatch[1].trim() };
  }
  // Direct shorthand: "canvas lavoro", "workspace anime"
  {
    const directMatch = text.match(/^(?:canvas|workspace)\s+(\w+)$/);
    if (directMatch) return { type: 'loadLayout', name: directMatch[1] };
  }

  // ── Move (porta X a destra) ───────────────────────────────────────────
  {
    const moveMatch = text.match(/^(?:porta|sposta|metti)\s+(?:la\s+|il\s+|lo\s+)?(.+?)\s+a\s+(.+)$/);
    if (moveMatch) {
      const widget = matchWidgetByCommand(moveMatch[1]);
      const pos = parseMovePosition(moveMatch[2]);
      if (widget && pos) return { type: 'move', widgetId: widget.id, position: pos };
    }
  }

  // ── Fullscreen ────────────────────────────────────────────────────────
  {
    const full = startsWithAny(text, FULL_VERBS);
    if (full && full.rest) {
      const widget = matchWidgetByCommand(full.rest);
      if (widget) return { type: 'fullscreen', widgetId: widget.id };
    }
  }

  // ── Minimize ──────────────────────────────────────────────────────────
  {
    const min = startsWithAny(text, MIN_VERBS);
    if (min && min.rest) {
      const widget = matchWidgetByCommand(min.rest);
      if (widget) return { type: 'minimize', widgetId: widget.id };
    }
  }

  // ── Restore ───────────────────────────────────────────────────────────
  {
    const rest = startsWithAny(text, REST_VERBS);
    if (rest && rest.rest) {
      const widget = matchWidgetByCommand(rest.rest);
      if (widget) return { type: 'restore', widgetId: widget.id };
    }
  }

  // ── Close ─────────────────────────────────────────────────────────────
  {
    const close = startsWithAny(text, CLOSE_VERBS);
    if (close && close.rest) {
      const widget = matchWidgetByCommand(close.rest);
      if (widget) return { type: 'close', widgetId: widget.id };
    }
  }

  // ── Open ──────────────────────────────────────────────────────────────
  {
    const open = startsWithAny(text, OPEN_VERBS);
    if (open && open.rest) {
      const widget = matchWidgetByCommand(open.rest);
      if (widget) return { type: 'open', widgetId: widget.id };
    }
  }

  return null;
}

/** Helper: derive viewport rect for `position` keyword. */
function canvasViewportBounds(): { left: number; top: number; right: number; bottom: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  if (typeof window === 'undefined') {
    return { left: 24, top: 56, right: vw - 24, bottom: vh - 56 };
  }

  let sidebarOffsetPx = 0;
  try {
    const root = getComputedStyle(document.documentElement);
    const raw = root.getPropertyValue('--kc-sidebar-offset').trim()
      || root.getPropertyValue('--sidebar-offset').trim();
    if (raw.endsWith('rem')) sidebarOffsetPx = parseFloat(raw) * 16;
    else if (raw.endsWith('px')) sidebarOffsetPx = parseFloat(raw);
    else {
      const sidebar = document.querySelector('[data-kc-sidebar]') as HTMLElement | null;
      sidebarOffsetPx = sidebar ? sidebar.getBoundingClientRect().width : 0;
    }
  } catch { /* ignore */ }

  const desktopLeft = Math.round(sidebarOffsetPx) + 16;
  const left = vw >= 768 ? Math.max(24, desktopLeft) : 12;
  return { left, top: 56, right: vw - 24, bottom: vh - 56 };
}

export function rectForPosition(
  pos: 'left' | 'right' | 'center' | 'top' | 'bottom',
  size: { w: number; h: number },
): { x: number; y: number } {
  const bounds = canvasViewportBounds();
  const areaW = Math.max(0, bounds.right - bounds.left);
  const areaH = Math.max(0, bounds.bottom - bounds.top);
  const centerX = bounds.left + (areaW - size.w) / 2;
  const centerY = bounds.top + (areaH - size.h) / 2;
  switch (pos) {
    case 'left':   return { x: bounds.left,             y: centerY };
    case 'right':  return { x: bounds.right - size.w,   y: centerY };
    case 'top':    return { x: centerX,                 y: bounds.top };
    case 'bottom': return { x: centerX,                 y: bounds.bottom - size.h };
    case 'center':
    default:       return { x: centerX,                 y: centerY };
  }
}

/** Human-readable command list for the "help" command. */
export function commandHelpText(): string {
  const widgetNames = Object.values(WIDGET_REGISTRY).map((w) => `${w.icon} ${w.name}`).join(', ');
  return [
    'Comandi del canvas:',
    '• apri/chiudi <widget>   (es. "apri meteo", "chiudi attività")',
    '• minimizza/ingrandisci <widget>',
    '• porta <widget> a destra|sinistra|centro|alto|basso',
    '• chiudi tutto',
    '• nascondi tutto tranne Kira',
    '• salva layout <nome>',
    '• apri canvas <nome>   (es. "apri canvas lavoro")',
    '• buongiorno / routine del mattino   (workspace mattina + briefing)',
    '• apri la mente   (schermo memoria viva)',
    '• apri officina   (schermo codice/agenti live)',
    '• copia resume prompt',
    '• stop voce',
    '',
    `Widget disponibili: ${widgetNames}`,
  ].join('\n');
}
