import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface LazyWidgetProps {
  /** Controls visibility — component mounts on first open=true and stays mounted */
  open: boolean;
  /** Shown before first mount when open=true */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Mounts children only on the first time open=true, then keeps them alive.
 * Hides/shows via CSS display:none — avoids expensive remounts.
 *

 */
export function LazyWidget({ open, fallback, children }: LazyWidgetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open && !mounted) setMounted(true);
  }, [open, mounted]);

  if (!mounted) {
    return open ? <>{fallback ?? null}</> : null;
  }

  return (
    <div style={{ display: open ? 'contents' : 'none' }}>
      {children}
    </div>
  );
}
