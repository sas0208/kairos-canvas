import { useEffect, useMemo } from 'react';
import { KiraCore } from './KiraCore';
import { StatusRail } from './StatusRail';
import { NowBar } from './NowBar';
import { WidgetWindow } from './WidgetWindow';
import { WidgetErrorBoundary } from './WidgetErrorBoundary';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { WorkspaceTabs } from './WorkspaceTabs';
import { BootSequence } from './BootSequence';
import { CommandPalette } from './CommandPalette';
import { NotificationHud } from './NotificationHud';
import { useVoiceState } from '../contexts/VoiceStateContext';
import { useCanvas } from './canvasStore';
import { WIDGET_REGISTRY, type WidgetId } from './widgetRegistry';
import { WidgetContent } from './widgets/WidgetContent';
import type { KiraSettings } from '../types/settings';
import type { KiraAttachment } from './KiraCore';

interface CanvasShellProps {
  onSend: (text: string, attachment?: KiraAttachment) => void;
  onStop: () => void;
  isThinking: boolean;
  canSend: boolean;
  performanceMode?: KiraSettings['performanceMode'];
}

export function CanvasShell({ onSend, onStop, isThinking, canSend, performanceMode }: CanvasShellProps) {
  const canvas = useCanvas();
  const widgets = useMemo(() => canvas.widgets, [canvas.widgets]);
  const { voiceState } = useVoiceState();

  // Listener cross-component: il router (in App.tsx) o un altro widget può
  // emettere `kira:openWidget` / `kira:closeWidget`.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { widgetId?: string } | null;
      if (!detail?.widgetId) return;
      const wid = detail.widgetId as WidgetId;
      if (!WIDGET_REGISTRY[wid]) return;
      const existing = canvas.widgets.find((w) => w.widgetId === wid);
      if (existing) {
        if (existing.state === 'minimized') canvas.restoreWidget(existing.id);
        canvas.focusWidget(existing.id);
      } else {
        canvas.openWidget(wid);
      }
      // Pulse del core quando si apre un widget — feedback visivo di "connessione"
      window.dispatchEvent(new CustomEvent('kira:eventPulse', { detail: { kind: 'system', level: 'info' } }));
    };
    const onClose = (e: Event) => {
      const detail = (e as CustomEvent).detail as { widgetId?: string } | null;
      if (!detail?.widgetId) return;
      const inst = canvas.widgets.find((w) => w.widgetId === detail.widgetId);
      if (inst) canvas.closeWidget(inst.id);
    };
    window.addEventListener('kira:openWidget', onOpen);
    window.addEventListener('kira:closeWidget', onClose);
    return () => {
      window.removeEventListener('kira:openWidget', onOpen);
      window.removeEventListener('kira:closeWidget', onClose);
    };
  }, [canvas]);

  return (
    <div className="kc-shell" role="application" aria-label="Kira Canvas" data-voice={voiceState}>
      <div className="kc-shell-bg" aria-hidden="true">
        <div className="kc-shell-bg-grid" />
        <div className="kc-shell-bg-radial" />
      </div>

      <KiraCore
        onSend={onSend}
        onStop={onStop}
        isThinking={isThinking}
        canSend={canSend}
        performanceMode={performanceMode}
      />

      <div className="kc-shell-widgets" aria-label="Widget layer">
        {widgets.map((instance) => {
          const def = WIDGET_REGISTRY[instance.widgetId];
          if (!def) return null;
          return (
            <WidgetWindow key={instance.id} instance={instance} definition={def}>
              <WidgetErrorBoundary widgetId={instance.widgetId} widgetName={def.name}>
                <WidgetContent widgetId={instance.widgetId} instanceId={instance.id} />
              </WidgetErrorBoundary>
            </WidgetWindow>
          );
        })}
      </div>

      <WorkspaceTabs />
      <NowBar />
      <StatusRail />
      <WorkspaceSwitcher />
      <CommandPalette />
      <NotificationHud />
      <BootSequence />
    </div>
  );
}
