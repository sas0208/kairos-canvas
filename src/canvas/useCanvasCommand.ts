import { USER_NAME } from '../config/user';
import { useCallback } from 'react';
import { useCanvas } from './canvasStore';
import { useToast } from '../contexts/ToastContext';
import { parseCommand, rectForPosition, commandHelpText } from './commandParser';
import { WIDGET_REGISTRY } from './widgetRegistry';
import type { CanvasCommand } from './commandParser';

interface DispatchResult {
  /** Whether the input was consumed as a canvas command. */
  handled: boolean;
  /** Optional message to display (success/error/info). */
  message?: string;
}

/**
 * Returns an async function that tries to interpret `input` as a canvas command.
 * If handled, performs the action via canvasStore + toast.
 * If not handled, returns { handled: false } so callers can fall back to LLM.
 */
export function useCanvasCommand() {
  const canvas = useCanvas();
  const { success, error, info } = useToast();

  return useCallback(async (input: string): Promise<DispatchResult> => {
    const cmd = parseCommand(input);
    if (!cmd) return { handled: false };

    // ── Async canvas actions ──────────────────────────────────────────────
    if (cmd.type === 'stopVoice') {
      try {
        await fetch('/api/voice/stop', { method: 'POST' });
        success('Voce fermata');
      } catch {
        error('Stop voce fallito');
      }
      return { handled: true, message: 'Voce fermata' };
    }

    if (cmd.type === 'copyResume') {
      info('Caricamento resume…');
      try {
        const r1 = await fetch('/api/runs/last');
        const d1 = await r1.json() as { ok: boolean; run?: { id: string } };
        if (!d1.ok || !d1.run) {
          error('Nessun long run trovato');
          return { handled: true };
        }
        const r2 = await fetch(`/api/runs/${d1.run.id}/resume-prompt`);
        const d2 = await r2.json() as { ok: boolean; resumePrompt?: string };
        if (!d2.ok || !d2.resumePrompt) {
          error('Resume prompt non disponibile');
          return { handled: true };
        }
        await navigator.clipboard.writeText(d2.resumePrompt);
        success('📋 Resume prompt copiato');
      } catch {
        error('Copia resume fallita');
      }
      return { handled: true };
    }

    if (cmd.type === 'routine' && cmd.name === 'morning') {
      // 1) Apri il workspace del mattino (meteo, calendario, news, pomodoro)
      const loaded = canvas.loadLayout('mattina');
      if (!loaded) {
        // Fallback: apri i widget chiave singolarmente se il seed manca
        (['weather', 'calendar', 'news', 'pomodoro'] as const).forEach((w) => canvas.openWidget(w));
      }
      info(`☀️ Buongiorno ${USER_NAME} — avvio la mattina…`);
      // 2) Innesca la routine mattutina + briefing parlato (TTS del browser di riserva)
      try {
        const r = await fetch('/api/home/routine/morning', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speak: true }),
        });
        const d = await r.json().catch(() => null) as { ok?: boolean; message?: string; spoken?: string; announced?: boolean } | null;
        // Se il backend non ha parlato, legge Kira dal browser.
        if (d?.spoken && !d.announced && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            const u = new SpeechSynthesisUtterance(d.spoken);
            u.lang = 'it-IT';
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
          } catch { /* TTS non disponibile */ }
        }
        if (d?.ok) success(`☀️ Routine mattutina avviata${d.message ? ` · ${d.message}` : ''}`);
        else info(d?.message || 'Workspace mattina pronto');
      } catch {
        info('Workspace mattina pronto (backend non raggiunto)');
      }
      return { handled: true, message: 'Routine mattutina' };
    }

    if (cmd.type === 'runAction') {
      // Conferma per azioni sensibili (es. disattiva Gaming Mode)
      if (cmd.confirm && typeof window !== 'undefined' && !window.confirm(cmd.confirm)) {
        return { handled: true, message: 'Annullato' };
      }
      // Apri subito il Centro Operazioni: l'utente segue lì stato/errore/esito.
      window.dispatchEvent(new CustomEvent('kira:openWidget', { detail: { widgetId: 'operations' } }));
      info(`${cmd.label}: avvio…`);
      try {
        const r = await fetch(cmd.endpoint, {
          method: cmd.method || 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(cmd.body || {}),
        });
        const d = await r.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string; blocked?: boolean };
        if (r.ok && d.ok !== false) {
          success(`${cmd.label}: ${d.message || 'avviato'}. Lo segui nel Centro Operazioni.`);
        } else if (d.blocked) {
          error(`${cmd.label}: ${d.error || 'bloccato'}. Vedi il Centro Operazioni per come sbloccare.`);
        } else {
          error(`${cmd.label}: ${d.error || 'non riuscito'}. Dettagli nel Centro Operazioni.`);
        }
      } catch {
        error(`${cmd.label}: non sono riuscita a contattare il backend.`);
      }
      return { handled: true, message: cmd.label };
    }

    if (cmd.type === 'openView') {
      window.dispatchEvent(new CustomEvent('kira:setView', { detail: { view: cmd.view } }));
      const label = cmd.view === 'mind' ? '🧠 La Mente' : cmd.view === 'forge' ? '⚒ Officina' : 'Canvas';
      success(`${label} aperto`);
      return { handled: true, message: `${label} aperto` };
    }

    const result = execute(cmd, canvas);
    if (result.toast === 'success') success(result.message);
    else if (result.toast === 'error') error(result.message);
    else if (result.toast === 'info') info(result.message);
    return { handled: true, message: result.message };
  }, [canvas, success, error, info]);
}

interface ExecResult {
  toast: 'success' | 'error' | 'info';
  message: string;
}

function execute(cmd: CanvasCommand, canvas: ReturnType<typeof useCanvas>): ExecResult {
  switch (cmd.type) {
    case 'open': {
      const def = WIDGET_REGISTRY[cmd.widgetId];
      canvas.openWidget(cmd.widgetId);
      return { toast: 'success', message: `${def.icon} ${def.name} aperto` };
    }
    case 'close': {
      const def = WIDGET_REGISTRY[cmd.widgetId];
      const inst = canvas.widgets.find((w) => w.widgetId === cmd.widgetId);
      if (!inst) return { toast: 'info', message: `${def.name} non era aperto` };
      canvas.closeWidget(inst.id);
      return { toast: 'success', message: `${def.name} chiuso` };
    }
    case 'closeAll': {
      const n = canvas.widgets.length;
      canvas.closeAll();
      return { toast: 'success', message: n > 0 ? `Chiusi ${n} widget` : 'Canvas già pulito' };
    }
    case 'hideAllExceptCore': {
      const n = canvas.widgets.filter((w) => w.state !== 'minimized').length;
      canvas.hideAllExceptCore();
      return { toast: 'success', message: n > 0 ? `Minimizzati ${n} widget` : 'Solo Kira' };
    }
    case 'minimize': {
      const def = WIDGET_REGISTRY[cmd.widgetId];
      const inst = canvas.widgets.find((w) => w.widgetId === cmd.widgetId);
      if (!inst) return { toast: 'info', message: `${def.name} non aperto` };
      canvas.minimizeWidget(inst.id);
      return { toast: 'success', message: `${def.name} minimizzato` };
    }
    case 'restore': {
      const def = WIDGET_REGISTRY[cmd.widgetId];
      const inst = canvas.widgets.find((w) => w.widgetId === cmd.widgetId);
      if (!inst) {
        canvas.openWidget(cmd.widgetId);
        return { toast: 'success', message: `${def.name} aperto` };
      }
      canvas.restoreWidget(inst.id);
      return { toast: 'success', message: `${def.name} ripristinato` };
    }
    case 'fullscreen': {
      const def = WIDGET_REGISTRY[cmd.widgetId];
      const inst = canvas.widgets.find((w) => w.widgetId === cmd.widgetId);
      if (inst?.state === 'fullscreen') {
        canvas.focusWidget(inst.id);
        return { toast: 'info', message: `${def.name} gia' ingrandito` };
      }
      const id = inst?.id ?? canvas.openWidget(cmd.widgetId);
      if (!id) return { toast: 'error', message: `Impossibile aprire ${def.name}` };
      canvas.toggleFullscreen(id);
      return { toast: 'success', message: `${def.name} ingrandito` };
    }
    case 'move': {
      const def = WIDGET_REGISTRY[cmd.widgetId];
      const inst = canvas.widgets.find((w) => w.widgetId === cmd.widgetId);
      const size = inst?.state === 'fullscreen' && inst.savedRect
        ? { w: inst.savedRect.w, h: inst.savedRect.h }
        : inst ? { w: inst.w, h: inst.h } : def.defaultSize;
      const target = rectForPosition(cmd.position, size);
      const id = inst?.id ?? canvas.openWidget(cmd.widgetId, target);
      if (!id) return { toast: 'error', message: `Impossibile aprire ${def.name}` };
      if (inst?.state === 'minimized') canvas.restoreWidget(id);
      if (inst?.state === 'fullscreen') canvas.toggleFullscreen(id);
      canvas.moveWidget(id, target.x, target.y);
      canvas.focusWidget(id);
      return { toast: 'success', message: `${def.name} → ${cmd.position}` };
    }
    case 'saveLayout': {
      canvas.saveLayout(cmd.name);
      return { toast: 'success', message: `Layout "${cmd.name}" salvato` };
    }
    case 'loadLayout': {
      const ok = canvas.loadLayout(cmd.name);
      if (!ok) return { toast: 'error', message: `Layout "${cmd.name}" non trovato` };
      return { toast: 'success', message: `Layout "${cmd.name}" caricato` };
    }
    case 'help': {
      return { toast: 'info', message: commandHelpText() };
    }
    // Handled in async branch above — these cases are unreachable here
    case 'stopVoice':
    case 'copyResume':
    case 'routine':
    case 'runAction':
    case 'openView': {
      return { toast: 'info', message: '' };
    }
  }
}
