import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createId } from '../lib/ids';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastCtxValue {
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastCtxValue | null>(null);

const TOAST_ACCENT: Record<ToastType, string> = {
  success: 'rgba(52,211,153,0.9)',
  error:   'rgba(248,113,113,0.9)',
  warning: 'rgba(214,226,246,0.9)',
  info:    'rgba(169,201,255,0.9)',
};

const TOAST_BG: Record<ToastType, string> = {
  success: 'rgba(2,26,20,0.94)',
  error:   'rgba(26,4,4,0.94)',
  warning: 'rgba(24,20,4,0.94)',
  info:    'rgba(2,16,28,0.94)',
};

const TOAST_ICON: Record<ToastType, string> = {
  success: '✓',
  error:   '✗',
  warning: '⚠',
  info:    '◈',
};

function SingleToast({ toast, onRemove }: { toast: ToastItem; onRemove: () => void }) {
  const accent = TOAST_ACCENT[toast.type];
  const bg = TOAST_BG[toast.type];
  return (
    <div
      role="alert"
      className="kc-toast"
      onClick={onRemove}
      title="Clicca per chiudere"
      style={{
        '--kc-toast-accent': accent,
        '--kc-toast-bg': bg,
        fontFamily: '-apple-system,"Segoe UI",system-ui,sans-serif',
      } as React.CSSProperties}
    >
      <span className="kc-toast-icon">{TOAST_ICON[toast.type]}</span>
      <span className="kc-toast-msg">{toast.message}</span>
      <div
        className="kc-toast-progress"
        style={{ animationDuration: `${toast.duration}ms` }}
      />
    </div>
  );
}

function ToastContainer() {
  const ctx = useContext(ToastContext);
  if (!ctx || ctx.toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 48,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        pointerEvents: 'none',
      }}
    >
      {ctx.toasts.map((toast) => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <SingleToast toast={toast} onRemove={() => ctx.removeToast(toast.id)} />
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'success', duration = 3000) => {
    const id = createId('toast');
    setToasts((curr) => [...curr, { id, message, type, duration }]);
    setTimeout(() => removeToast(id), duration + 350);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

/** Hook per mostrare toast da qualsiasi componente nel ToastProvider. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return {
    toast:   ctx.addToast,
    success: (msg: string, ms?: number) => ctx.addToast(msg, 'success', ms),
    error:   (msg: string, ms?: number) => ctx.addToast(msg, 'error',   ms),
    info:    (msg: string, ms?: number) => ctx.addToast(msg, 'info',    ms),
    warning: (msg: string, ms?: number) => ctx.addToast(msg, 'warning', ms),
  };
}
