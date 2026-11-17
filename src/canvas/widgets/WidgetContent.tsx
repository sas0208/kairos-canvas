import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import type { WidgetId } from '../widgetRegistry';
import { WidgetSpinner } from '../components/WidgetStates';

// Lazy-load: ogni widget è un chunk caricato solo all'apertura.
// Avvio più leggero (niente bundle di tutti i widget all'avvio); WidgetErrorBoundary
// (in WidgetWindow) cattura eventuali fallimenti di import.
const named = <K extends string>(p: Promise<Record<K, ComponentType>>, key: K) =>
  p.then((m) => ({ default: m[key] }));

const WeatherWidget = lazy(() => named(import('./WeatherWidget'), 'WeatherWidget'));
const ChatWidget = lazy(() => named(import('./ChatWidget'), 'ChatWidget'));
const ActivityWidget = lazy(() => named(import('./ActivityWidget'), 'ActivityWidget'));
const MemoryWidget = lazy(() => named(import('./MemoryWidget'), 'MemoryWidget'));
const MediaWidget = lazy(() => named(import('./MediaWidget'), 'MediaWidget'));
const CalendarWidget = lazy(() => named(import('./CalendarWidget'), 'CalendarWidget'));
const VoiceWidget = lazy(() => named(import('./VoiceWidget'), 'VoiceWidget'));
const LongRunWidget = lazy(() => named(import('./LongRunWidget'), 'LongRunWidget'));
const NotesWidget = lazy(() => named(import('./NotesWidget'), 'NotesWidget'));
const MemGraphWidget = lazy(() => named(import('./MemGraphWidget'), 'MemGraphWidget'));
const CapabilityWidget = lazy(() => named(import('./CapabilityWidget'), 'CapabilityWidget'));
const PermissionsWidget = lazy(() => named(import('./PermissionsWidget'), 'PermissionsWidget'));
const NotificationsWidget = lazy(() => named(import('./NotificationsWidget'), 'NotificationsWidget'));
const PomodoroWidget = lazy(() => named(import('./PomodoroWidget'), 'PomodoroWidget'));
const SettingsWidget = lazy(() => named(import('./SettingsWidget'), 'SettingsWidget'));
const AgentFlowWidget = lazy(() => named(import('./AgentFlowWidget'), 'AgentFlowWidget'));
const NewsWidget = lazy(() => named(import('./NewsWidget'), 'NewsWidget'));
const AutomationWidget = lazy(() => named(import('./AutomationWidget'), 'AutomationWidget'));
const TurboWidget = lazy(() => named(import('./TurboWidget'), 'TurboWidget'));
const McpWidget = lazy(() => named(import('./McpWidget'), 'McpWidget'));
const SupermemoryWidget = lazy(() => named(import('./SupermemoryWidget'), 'SupermemoryWidget'));
const BriefingPlayerWidget = lazy(() => named(import('./BriefingPlayerWidget'), 'BriefingPlayerWidget'));
const StatusKiraWidget = lazy(() => named(import('./StatusKiraWidget'), 'StatusKiraWidget'));
const ModelsWidget = lazy(() => named(import('./ModelsWidget'), 'ModelsWidget'));
const OperationsWidget = lazy(() => named(import('./OperationsWidget'), 'OperationsWidget'));

interface WidgetContentProps {
  widgetId: WidgetId;
  instanceId: string;
}

function renderWidget(widgetId: WidgetId) {
  switch (widgetId) {
    case 'weather':  return <WeatherWidget />;
    case 'chat':     return <ChatWidget />;
    case 'activity': return <ActivityWidget />;
    case 'operations': return <OperationsWidget />;
    case 'briefingplayer': return <BriefingPlayerWidget />;
    case 'statuskira': return <StatusKiraWidget />;
    case 'models':     return <ModelsWidget />;
    case 'memory':   return <MemoryWidget />;
    case 'media':    return <MediaWidget />;
    case 'calendar': return <CalendarWidget />;
    case 'voice':    return <VoiceWidget />;
    case 'longrun':  return <LongRunWidget />;
    case 'notes':    return <NotesWidget />;
    case 'memgraph':    return <MemGraphWidget />;
    case 'capability':  return <CapabilityWidget />;
    case 'permissions':    return <PermissionsWidget />;
    case 'notifications':  return <NotificationsWidget />;
    case 'news':           return <NewsWidget />;
    case 'automation':     return <AutomationWidget />;
    case 'turbo':          return <TurboWidget />;
    case 'mcp':            return <McpWidget />;
    case 'supermemory':    return <SupermemoryWidget />;
    case 'pomodoro':       return <PomodoroWidget />;
    case 'settings':       return <SettingsWidget />;
    case 'agentflow':      return <AgentFlowWidget />;
    default:               return <WidgetPlaceholder widgetId={widgetId} />;
  }
}

export function WidgetContent({ widgetId }: WidgetContentProps) {
  return (
    <Suspense fallback={<WidgetSpinner label="Carico…" fullHeight />}>
      {renderWidget(widgetId)}
    </Suspense>
  );
}

function WidgetPlaceholder({ widgetId }: { widgetId: WidgetId }) {
  return (
    <div className="kc-widget-placeholder">
      <span className="kc-widget-placeholder-id">{widgetId}</span>
      <span className="kc-widget-placeholder-hint">contenuto in arrivo</span>
    </div>
  );
}
