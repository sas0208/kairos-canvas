import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { LazyWidget } from '../components/canvas/LazyWidget';
import { useCanvas } from './canvasStore';
import type { WidgetInstance } from './canvasStore';
import { playWidgetOpen, playWidgetClose, playWidgetMinimize } from '../lib/soundManager';
import type { WidgetDefinition } from './widgetRegistry';

interface WidgetWindowProps {
  instance: WidgetInstance;
  definition: WidgetDefinition;
  children: ReactNode;
}

/**
 * Draggable + resizable widget chrome. Custom (no library) — mouse events directly.
 * - Drag from header
 * - Resize from bottom-right corner
 * - Z-index managed via canvas store
 * - Minimize hides body, leaves a bar
 * - Fullscreen overlays the canvas
 */
export function WidgetWindow({ instance, definition, children }: WidgetWindowProps) {
  const canvas = useCanvas();
  const dragStartRef = useRef<{ x: number; y: number; mx: number; my: number } | null>(null);
  const resizeStartRef = useRef<{ w: number; h: number; mx: number; my: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [justReleased, setJustReleased] = useState(false);

  const startDrag = useCallback((e: React.MouseEvent) => {
    if (instance.state === 'fullscreen') return;
    e.preventDefault();
    canvas.focusWidget(instance.id);
    dragStartRef.current = { x: instance.x, y: instance.y, mx: e.clientX, my: e.clientY };
    setDragging(true);

    const SNAP_PX = 14;
    const sidebarOffsetPx = (() => {
      const s = getComputedStyle(document.documentElement).getPropertyValue('--kc-sidebar-offset').trim();
      if (s.endsWith('rem')) return parseFloat(s) * 16;
      if (s.endsWith('px')) return parseFloat(s);
      return 0;
    })();
    const viewport = {
      left: sidebarOffsetPx,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight - 30, // exclude StatusRail
      cx: (sidebarOffsetPx + window.innerWidth) / 2,
      cy: (window.innerHeight - 30) / 2,
    };

    // Snapshot of other open widgets at drag start (avoid re-reading store mid-drag)
    const otherWidgets = canvas.widgets.filter((w) => w.id !== instance.id && w.state !== 'minimized');

    // Kira accompagna il widget mentre lo trascini: il core ascolta kira:flyTo
    let lastFlyPulse = 0;

    function onMove(ev: MouseEvent) {
      if (!dragStartRef.current) return;
      const dx = ev.clientX - dragStartRef.current.mx;
      const dy = ev.clientY - dragStartRef.current.my;
      let nx = dragStartRef.current.x + dx;
      let ny = dragStartRef.current.y + dy;
      // Snap to edges of viewport
      if (Math.abs(nx - viewport.left) < SNAP_PX) nx = viewport.left + 8;
      if (Math.abs(nx + instance.w - viewport.right) < SNAP_PX) nx = viewport.right - instance.w - 8;
      if (Math.abs(ny - viewport.top) < SNAP_PX) ny = viewport.top + 8;
      if (Math.abs(ny + instance.h - viewport.bottom) < SNAP_PX) ny = viewport.bottom - instance.h - 8;
      // Snap to center of viewport
      const widgetCx = nx + instance.w / 2;
      const widgetCy = ny + instance.h / 2;
      if (Math.abs(widgetCx - viewport.cx) < SNAP_PX) nx = viewport.cx - instance.w / 2;
      if (Math.abs(widgetCy - viewport.cy) < SNAP_PX) ny = viewport.cy - instance.h / 2;
      // Snap to other open widgets (edges + left/right/top/bottom alignment)
      for (const other of otherWidgets) {
        const ol = other.x, ot = other.y, or_ = other.x + other.w, ob = other.y + other.h;
        const wl = nx, wt = ny, wr = nx + instance.w, wb = ny + instance.h;
        // Right edge of dragged → left edge of other
        if (Math.abs(wr - ol) < SNAP_PX) nx = ol - instance.w;
        // Left edge of dragged → right edge of other
        if (Math.abs(wl - or_) < SNAP_PX) nx = or_;
        // Bottom edge of dragged → top edge of other
        if (Math.abs(wb - ot) < SNAP_PX) ny = ot - instance.h;
        // Top edge of dragged → bottom edge of other
        if (Math.abs(wt - ob) < SNAP_PX) ny = ob;
        // Left-align (both left edges)
        if (Math.abs(wl - ol) < SNAP_PX) nx = ol;
        // Right-align (both right edges)
        if (Math.abs(wr - or_) < SNAP_PX) nx = or_ - instance.w;
        // Top-align
        if (Math.abs(wt - ot) < SNAP_PX) ny = ot;
        // Bottom-align
        if (Math.abs(wb - ob) < SNAP_PX) ny = ob - instance.h;
      }
      // Clamp finale: l'header deve restare sempre afferrabile (niente widget persi
      // fuori schermo). Teniamo l'header interamente in verticale e ≥120px in orizzontale.
      const HEADER_H = 44;
      const KEEP_X = 120;
      nx = Math.min(Math.max(nx, viewport.left - instance.w + KEEP_X), viewport.right - KEEP_X);
      ny = Math.min(Math.max(ny, viewport.top), viewport.bottom - HEADER_H);
      canvas.moveWidget(instance.id, nx, ny);

      const nowMs = performance.now();
      if (nowMs - lastFlyPulse > 90) {
        lastFlyPulse = nowMs;
        const fx = Math.max(-1, Math.min(1, ((nx + instance.w / 2) / Math.max(1, window.innerWidth)) * 2 - 1));
        const fy = Math.max(-1, Math.min(1, ((ny + instance.h / 2) / Math.max(1, window.innerHeight)) * 2 - 1));
        window.dispatchEvent(new CustomEvent('kira:flyTo', { detail: { x: fx, y: fy, hold: 420 } }));
      }
    }
    function onUp() {
      dragStartRef.current = null;
      setDragging(false);
      setJustReleased(true);
      window.setTimeout(() => setJustReleased(false), 380);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [canvas, instance.id, instance.state, instance.x, instance.y, instance.w, instance.h]);

  const startResize = useCallback((e: React.MouseEvent) => {
    if (instance.state === 'fullscreen') return;
    e.preventDefault();
    e.stopPropagation();
    canvas.focusWidget(instance.id);
    resizeStartRef.current = { w: instance.w, h: instance.h, mx: e.clientX, my: e.clientY };
    setResizing(true);

    // Tetto: non far crescere il widget oltre il bordo visibile del viewport.
    const maxW = Math.max(definition.minSize.w, window.innerWidth - instance.x - 8);
    const maxH = Math.max(definition.minSize.h, window.innerHeight - 30 - instance.y - 8);

    function onMove(ev: MouseEvent) {
      if (!resizeStartRef.current) return;
      const dw = ev.clientX - resizeStartRef.current.mx;
      const dh = ev.clientY - resizeStartRef.current.my;
      const nw = Math.min(resizeStartRef.current.w + dw, maxW);
      const nh = Math.min(resizeStartRef.current.h + dh, maxH);
      canvas.resizeWidget(instance.id, nw, nh);
    }
    function onUp() {
      resizeStartRef.current = null;
      setResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [canvas, instance.id, instance.state, instance.w, instance.h, instance.x, instance.y, definition.minSize.w, definition.minSize.h]);

  // Cleanup safety on unmount
  useEffect(() => {
    return () => {
      dragStartRef.current = null;
      resizeStartRef.current = null;
    };
  }, []);

  // Minimized: render only the title bar at the bottom (taskbar Jarvis-style)
  if (instance.state === 'minimized') {
    const minimized = canvas.widgets.filter((w) => w.state === 'minimized');
    const total = minimized.length;
    const idx = Math.max(0, minimized.findIndex((w) => w.id === instance.id));
    const itemW = 168;
    const gap = 8;
    // Group centered horizontally above StatusRail
    const offsetFromCenter = (idx - (total - 1) / 2) * (itemW + gap);
    return (
      <button
        type="button"
        className="kc-widget-minbar"
        onClick={() => canvas.restoreWidget(instance.id)}
        title={`Apri ${definition.name}`}
        style={{
          position: 'fixed',
          bottom: 52,
          left: `calc(50% + ${offsetFromCenter}px)`,
          transform: 'translateX(-50%)',
          zIndex: 700,
        }}
      >
        <span className="kc-widget-minbar-icon">{definition.icon}</span>
        <span className="kc-widget-minbar-name">{definition.name}</span>
        <span className="kc-widget-minbar-arrow" aria-hidden="true">↑</span>
      </button>
    );
  }

  const isFullscreen = instance.state === 'fullscreen';
  const isFocused = canvas.focusedId === instance.id;

  // Stagger d'ingresso: i widget di un workspace entrano a cascata (max ~525ms).
  const spawnDelay = instance.spawnIndex && instance.spawnIndex > 0
    ? Math.min(instance.spawnIndex, 7) * 0.075
    : 0;

  const style: CSSProperties = {
    position: 'fixed',
    left: instance.x,
    top: instance.y,
    width: instance.w,
    height: instance.h,
    ...(spawnDelay ? { animationDelay: `${spawnDelay}s`, ['--kc-spawn-delay' as string]: `${spawnDelay}s` } as CSSProperties : null),
    // Tetto allo z: il contatore di focus cresce all'infinito; lo limitiamo così
    // i widget restano sempre SOTTO i modali (conferma 10010, palette 10002, boot
    // 10001, workspace 10000). Senza tetto, dopo molti focus coprirebbero i dialog.
    zIndex: 200 + Math.min(instance.zIndex, 8000),
  };

  return (
    <div
      className={`kc-widget ${isFocused ? 'kc-widget-focus' : ''} ${isFullscreen ? 'kc-widget-fs' : ''} ${dragging ? 'kc-widget-dragging' : ''} ${resizing ? 'kc-widget-resizing' : ''} ${justReleased ? 'kc-widget-just-released' : ''}`}
      style={style}
      onMouseDown={() => canvas.focusWidget(instance.id)}
    >
      {/* Focus brackets — visible only when widget has focus */}
      {isFocused && !isFullscreen && (
        <>
          <span className="kc-widget-focus-corner kc-widget-focus-corner-tl" aria-hidden="true" />
          <span className="kc-widget-focus-corner kc-widget-focus-corner-tr" aria-hidden="true" />
          <span className="kc-widget-focus-corner kc-widget-focus-corner-bl" aria-hidden="true" />
          <span className="kc-widget-focus-corner kc-widget-focus-corner-br" aria-hidden="true" />
        </>
      )}

      {/* Header (drag handle) */}
      <div className="kc-widget-header" onMouseDown={startDrag}>
        <span className="kc-widget-header-icon">{definition.icon}</span>
        <span className="kc-widget-header-title">{definition.name}</span>
        <span className="kc-widget-header-id" aria-hidden="true">W-{definition.id.toUpperCase().slice(0, 4)}</span>
        <span className="kc-widget-header-spacer" />
        <button
          type="button"
          className="kc-widget-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); playWidgetMinimize(); canvas.minimizeWidget(instance.id); }}
          title="Minimizza"
          aria-label="Minimizza"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
            <line x1="1.5" y1="7.5" x2="8.5" y2="7.5" />
          </svg>
        </button>
        <button
          type="button"
          className="kc-widget-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); canvas.toggleFullscreen(instance.id); }}
          title={isFullscreen ? 'Ripristina' : 'Espandi'}
          aria-label="Fullscreen"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
            {isFullscreen ? (
              <>
                <path d="M1 4 L4 4 L4 1" /><path d="M9 6 L6 6 L6 9" />
              </>
            ) : (
              <>
                <path d="M1.5 4 L1.5 1.5 L4 1.5" /><path d="M8.5 6 L8.5 8.5 L6 8.5" />
              </>
            )}
          </svg>
        </button>
        <button
          type="button"
          className="kc-widget-btn kc-widget-btn-close"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); playWidgetClose(); canvas.closeWidget(instance.id); }}
          title="Chiudi"
          aria-label="Chiudi"
          disabled={definition.persistent}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
            <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" />
            <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="kc-widget-body">
        <LazyWidget open>{children}</LazyWidget>
      </div>

      {/* Resize handle bottom-right (hidden in fullscreen) */}
      {!isFullscreen && (
        <div
          className="kc-widget-resize"
          onMouseDown={startResize}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

