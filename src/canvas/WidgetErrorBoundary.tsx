import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  widgetId: string;
  widgetName: string;
  onReset?: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorCount: number;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Non-fatal: log to console + ship to server best-effort
    console.error(`[Widget ${this.props.widgetId}] crash:`, error, info?.componentStack);
    try {
      fetch('/api/notifications/log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'widget-error',
          type: 'error',
          message: error?.message || String(error),
          detail: `Widget ${this.props.widgetName} (${this.props.widgetId})\n${info?.componentStack?.slice(0, 800) || ''}`.trim(),
        }),
      }).catch(() => undefined);
    } catch {
      /* swallow */
    }
  }

  reset = () => {
    this.setState((s) => ({ error: null, errorCount: s.errorCount + 1 }));
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const tooManyResets = this.state.errorCount >= 3;
    return (
      <div className="kc-widget-error-boundary" role="alert">
        <div className="kc-widget-error-icon" aria-hidden="true">!</div>
        <div className="kc-widget-error-title">
          Widget <strong>{this.props.widgetName}</strong> ha un errore
        </div>
        <div className="kc-widget-error-msg">{this.state.error.message || 'errore sconosciuto'}</div>
        {!tooManyResets && (
          <button type="button" className="kc-widget-error-retry" onClick={this.reset}>
            Riprova
          </button>
        )}
        {tooManyResets && (
          <div className="kc-widget-error-hint">Errore persistente. Chiudi il widget e riaprilo, oppure controlla i log.</div>
        )}
      </div>
    );
  }
}
