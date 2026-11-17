// Componenti uniformi per stati di caricamento ed empty in tutti i widget.
// Sostituiscono i vari "Caricamento…" sparsi e gli empty-state ad-hoc.

import type { ReactNode } from 'react';

export function WidgetSkeleton({ variant = 'list', rows = 3 }: { variant?: 'list' | 'card' | 'stats'; rows?: number }) {
  if (variant === 'card') {
    return (
      <div className="kc-w-skeleton kc-w-skeleton-card">
        <div className="kc-w-skel-line kc-w-skel-line-title" />
        <div className="kc-w-skel-line" />
        <div className="kc-w-skel-line kc-w-skel-line-short" />
      </div>
    );
  }
  if (variant === 'stats') {
    return (
      <div className="kc-w-skeleton kc-w-skeleton-stats">
        <div className="kc-w-skel-block" />
        <div className="kc-w-skel-block" />
        <div className="kc-w-skel-block" />
      </div>
    );
  }
  // list
  return (
    <div className="kc-w-skeleton kc-w-skeleton-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="kc-w-skel-row">
          <div className="kc-w-skel-line kc-w-skel-line-title" />
          <div className="kc-w-skel-line kc-w-skel-line-short" />
        </div>
      ))}
    </div>
  );
}

// Spinner indeterminato — rotella che gira.
// Usalo per operazioni puntuali (refresh, submit, fetch breve) o accanto a un testo.
export function WidgetSpinner({
  size = 16,
  label,
  inline = false,
  fullHeight = false,
}: {
  size?: number;
  label?: string;
  inline?: boolean;
  fullHeight?: boolean;
}) {
  const ring = (
    <span
      className="kc-loader-spinner"
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 8)) }}
      role="status"
      aria-label={label || 'Caricamento'}
    />
  );
  if (inline && !label) return ring;
  if (inline) {
    return (
      <span className="kc-loader-inline">
        {ring}
        <span className="kc-loader-inline-label">{label}</span>
      </span>
    );
  }
  return (
    <div className={`kc-loader-block ${fullHeight ? 'kc-loader-block-full' : ''}`}>
      {ring}
      {label && <span className="kc-loader-block-label">{label}</span>}
    </div>
  );
}

// Barra di progresso con percentuale. Per operazioni con avanzamento noto (download, build, batch).
// Se `percent` è undefined o NaN, mostra una barra indeterminata che scorre.
export function WidgetProgress({
  percent,
  label,
  detail,
  variant = 'cyan',
}: {
  percent?: number;
  label?: string;
  detail?: string;
  variant?: 'cyan' | 'violet' | 'green' | 'amber';
}) {
  const isIndeterminate = percent === undefined || Number.isNaN(percent);
  const clamped = isIndeterminate ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className={`kc-loader-progress kc-loader-progress-${variant}`}>
      {(label || !isIndeterminate) && (
        <div className="kc-loader-progress-head">
          {label && <span className="kc-loader-progress-label">{label}</span>}
          {!isIndeterminate && <span className="kc-loader-progress-pct">{Math.round(clamped)}%</span>}
        </div>
      )}
      <div className="kc-loader-progress-track">
        {isIndeterminate ? (
          <div className="kc-loader-progress-bar-indet" />
        ) : (
          <div className="kc-loader-progress-bar" style={{ width: `${clamped}%` }} />
        )}
      </div>
      {detail && <div className="kc-loader-progress-detail">{detail}</div>}
    </div>
  );
}

// Stato di errore uniforme con retry opzionale.
// Sostituisce i vari `<div className="kc-w-empty kc-w-empty-err">⚠ …</div>` ad-hoc,
// dando all'utente un modo per riprovare senza chiudere/riaprire il widget.
export function WidgetError({
  message,
  onRetry,
  icon = '⚠',
  detail,
}: {
  message?: string;
  onRetry?: () => void;
  icon?: string;
  detail?: string;
}) {
  return (
    <div className="kc-w-error-state" role="alert">
      <div className="kc-w-error-icon" aria-hidden="true">{icon}</div>
      <div className="kc-w-error-msg">{message || 'Qualcosa è andato storto'}</div>
      {detail && <div className="kc-w-error-detail">{detail}</div>}
      {onRetry && (
        <button type="button" className="kc-w-error-retry" onClick={onRetry}>↻ Riprova</button>
      )}
    </div>
  );
}

export function WidgetEmpty({
  icon = '◯',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="kc-w-empty-state">
      <div className="kc-w-empty-icon">{icon}</div>
      <div className="kc-w-empty-title">{title}</div>
      {hint && <div className="kc-w-empty-hint-text">{hint}</div>}
      {action && <div className="kc-w-empty-action">{action}</div>}
    </div>
  );
}
