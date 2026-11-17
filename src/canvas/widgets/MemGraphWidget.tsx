import { useEffect, useRef, useState, useCallback } from 'react';
import { WidgetSpinner, WidgetError } from '../components/WidgetStates';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  desc?: string;
  status?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  rel: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Posizione simulata per ogni nodo (force-directed semplificato)
interface NodePos {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const TYPE_COLORS: Record<string, [number, number, number]> = {
  system:           [169, 201, 255],
  component:        [99, 179, 237],
  capability:       [74, 222, 128],
  ui_paradigm:      [167, 139, 250],
  integration:      [214, 226, 246],
  agent:            [251, 146, 60],
  memory_manual:    [200, 200, 200],
  memory_auto:      [167, 139, 250],
  memory_verified:  [169, 201, 255],
  memory_promoted:  [74, 222, 128],
  memory_pending:   [245, 158, 11],
  event:            [251, 191, 36],
};

function colorForNode(n: GraphNode): [number, number, number] {
  if (n.status === 'missing')  return [239, 68, 68];
  if (n.status === 'partial')  return [245, 158, 11];
  return TYPE_COLORS[n.type] ?? [150, 150, 150];
}

function rgba([r, g, b]: [number, number, number], a: number) {
  return `rgba(${r},${g},${b},${a})`;
}

export function MemGraphWidget() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const hostRef    = useRef<HTMLDivElement>(null);
  const posRef     = useRef<Record<string, NodePos>>({});
  const graphRef   = useRef<GraphData | null>(null);
  const rafRef     = useRef(0);
  const hoverRef   = useRef<string | null>(null);
  const dragRef    = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const panRef     = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const viewRef    = useRef({ x: 0, y: 0, scale: 1 });

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [hovered, setHovered]   = useState<GraphNode | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  // Lazy edge rendering: nasconde gli archi quando il nodo count supera la soglia
  // (a meno che hover/drag non punti a un nodo specifico — allora mostra i suoi archi)
  const LAZY_EDGE_THRESHOLD = 120;
  // Filtri cluster: l'utente può limitare quali "type" mostrare
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [allEdges, setAllEdges] = useState<boolean>(true); // toggle forzato
  const hiddenTypesRef = useRef<Set<string>>(new Set());
  const allEdgesRef = useRef<boolean>(true);
  useEffect(() => { hiddenTypesRef.current = hiddenTypes; }, [hiddenTypes]);
  useEffect(() => { allEdgesRef.current = allEdges; }, [allEdges]);

  // Inizializza posizioni casuali e applica force-layout semplice
  const initPositions = useCallback((nodes: GraphNode[], w: number, h: number) => {
    const pos: Record<string, NodePos> = {};
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const r = Math.min(w, h) * 0.35;
      pos[n.id] = {
        x: w / 2 + Math.cos(angle) * r * (0.5 + Math.random() * 0.5),
        y: h / 2 + Math.sin(angle) * r * (0.5 + Math.random() * 0.5),
        vx: 0, vy: 0,
      };
    });
    posRef.current = pos;
  }, []);

  const loadGraph = useCallback(() => {
    fetch('/api/memory/graph')
      .then((r) => r.json() as Promise<GraphData & { ok: boolean }>)
      .then((j) => {
        if (!j.ok) { setError('Graph non disponibile'); setLoading(false); return; }
        const prevIds = new Set(graphRef.current?.nodes.map((n) => n.id) ?? []);
        const newNodes = j.nodes.filter((n) => !prevIds.has(n.id));
        // Merge: keep existing positions, add positions for new nodes only
        if (graphRef.current && newNodes.length > 0) {
          const host = hostRef.current;
          const rect = host?.getBoundingClientRect();
          const w = rect?.width || 600;
          const h = rect?.height || 400;
          const cx = w / 2, cy = h / 2;
          newNodes.forEach((n, i) => {
            const angle = (i / newNodes.length) * Math.PI * 2;
            posRef.current[n.id] = {
              x: cx + Math.cos(angle) * 80,
              y: cy + Math.sin(angle) * 80,
              vx: 0, vy: 0,
            };
          });
        } else if (!graphRef.current) {
          const host = hostRef.current;
          const rect = host?.getBoundingClientRect();
          initPositions(j.nodes, rect?.width || 600, rect?.height || 400);
        }
        graphRef.current = j;
        setNodeCount(j.nodes.length);
        setEdgeCount(j.edges.length);
        setLoading(false);
        setLastRefresh(new Date());
      })
      .catch(() => { setError('Errore caricamento graph'); setLoading(false); });
  }, [initPositions]);

  // Carica il graph al mount e auto-refresh ogni 60s
  useEffect(() => {
    loadGraph();
    const id = window.setInterval(loadGraph, 60_000);
    return () => window.clearInterval(id);
  }, [loadGraph]);

  // Render loop + force simulation
  useEffect(() => {
    if (loading || error) return;
    const canvas = canvasRef.current;
    const host   = hostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0, height = 0;
    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr  = Math.min(window.devicePixelRatio || 1, 2);
      width  = rect.width  || 600;
      height = rect.height || 400;
      canvas.width  = Math.round(width  * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const REPULSION = 2200;
    const SPRING    = 0.018;
    const REST_LEN  = 110;
    const DAMPING   = 0.78;
    const NODE_R    = 9;

    const tick = () => {
      const graph = graphRef.current;
      const pos   = posRef.current;
      if (!graph) return;

      // Force simulation step
      const nodes = graph.nodes;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        const pa = pos[a.id];
        if (!pa) continue;
        // Repulsion
        for (let j = i + 1; j < nodes.length; j++) {
          const b  = nodes[j];
          const pb = pos[b.id];
          if (!pb) continue;
          const dx = pa.x - pb.x;
          const dy = pa.y - pb.y;
          const d2 = dx * dx + dy * dy + 1;
          const f  = REPULSION / d2;
          pa.vx += f * dx / Math.sqrt(d2);
          pa.vy += f * dy / Math.sqrt(d2);
          pb.vx -= f * dx / Math.sqrt(d2);
          pb.vy -= f * dy / Math.sqrt(d2);
        }
        // Center attraction (mild)
        pa.vx += (width / 2 - pa.x) * 0.0012;
        pa.vy += (height / 2 - pa.y) * 0.0012;
      }
      // Spring (edges)
      for (const e of graph.edges) {
        const pa = pos[e.from];
        const pb = pos[e.to];
        if (!pa || !pb) continue;
        const dx   = pb.x - pa.x;
        const dy   = pb.y - pa.y;
        const d    = Math.sqrt(dx * dx + dy * dy) || 1;
        const f    = (d - REST_LEN) * SPRING;
        const fx   = f * dx / d;
        const fy   = f * dy / d;
        pa.vx += fx; pa.vy += fy;
        pb.vx -= fx; pb.vy -= fy;
      }
      // Integrate
      for (const n of nodes) {
        const p = pos[n.id];
        if (!p || dragRef.current?.id === n.id) continue;
        p.vx *= DAMPING; p.vy *= DAMPING;
        p.x  += p.vx;   p.y  += p.vy;
        p.x = Math.max(NODE_R + 4, Math.min(width  - NODE_R - 4, p.x));
        p.y = Math.max(NODE_R + 4, Math.min(height - NODE_R - 4, p.y));
      }
    };

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      tick();
      const graph = graphRef.current;
      const pos   = posRef.current;
      if (!graph) return;

      const { x: vx, y: vy, scale } = viewRef.current;

      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(vx, vy);
      ctx.scale(scale, scale);

      // Filter: hidden types
      const visibleNodes = graph.nodes.filter((n) => !hiddenTypesRef.current.has(n.type));
      const visibleIds = new Set(visibleNodes.map((n) => n.id));

      // Archi — lazy: mostra solo quelli collegati al nodo hovered se sopra soglia
      const showAllEdges = allEdgesRef.current && graph.nodes.length <= LAZY_EDGE_THRESHOLD;
      const hovId = hoverRef.current;
      ctx.lineWidth = 0.8;
      for (const e of graph.edges) {
        if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) continue;
        const isHighlight = hovId && (e.from === hovId || e.to === hovId);
        if (!showAllEdges && !isHighlight) continue;
        const pa = pos[e.from];
        const pb = pos[e.to];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = isHighlight ? 'rgba(169,201,255,0.45)' : 'rgba(255,255,255,0.08)';
        ctx.stroke();
      }

      // Nodi
      for (const n of visibleNodes) {
        const p = pos[n.id];
        if (!p) continue;
        const color = colorForNode(n);
        const isHov = hoverRef.current === n.id;
        const r     = isHov ? NODE_R + 3 : NODE_R;

        // Glow
        if (isHov) {
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.5);
          glow.addColorStop(0, rgba(color, 0.35));
          glow.addColorStop(1, rgba(color, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = rgba(color, isHov ? 0.85 : 0.55);
        ctx.fill();
        ctx.strokeStyle = rgba(color, 0.9);
        ctx.lineWidth = isHov ? 1.5 : 0.8;
        ctx.stroke();

        // Label — in viste dense mostra solo l'etichetta del nodo sotto il cursore,
        // così non si accavallano; in viste sparse le mostra tutte (troncate).
        if (isHov || visibleNodes.length <= 30) {
          const text = n.label.length > 16 ? n.label.slice(0, 15) + '…' : n.label;
          ctx.font = `${isHov ? 600 : 400} ${isHov ? 10 : 9}px "JetBrains Mono", monospace`;
          ctx.fillStyle = isHov ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
          ctx.textAlign = 'center';
          ctx.fillText(text, p.x, p.y + r + 12);
        }
      }

      ctx.restore();
    };

    draw();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [loading, error]);

  // Mouse interactions
  const worldXY = useCallback((ex: number, ey: number) => {
    const { x, y, scale } = viewRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { wx: 0, wy: 0 };
    return { wx: (ex - rect.left - x) / scale, wy: (ey - rect.top - y) / scale };
  }, []);

  const hitNode = useCallback((wx: number, wy: number): string | null => {
    const graph = graphRef.current;
    const pos   = posRef.current;
    if (!graph) return null;
    for (const n of graph.nodes) {
      if (hiddenTypesRef.current.has(n.type)) continue;
      const p = pos[n.id];
      if (!p) continue;
      const dx = wx - p.x, dy = wy - p.y;
      if (dx * dx + dy * dy <= 144) return n.id;
    }
    return null;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      const pos = posRef.current[dragRef.current.id];
      if (pos) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const { scale } = viewRef.current;
          pos.x = dragRef.current.ox + (e.clientX - dragRef.current.ox) / scale;
          pos.y = dragRef.current.oy + (e.clientY - dragRef.current.oy) / scale;
          pos.vx = 0; pos.vy = 0;
          // recalc in world coords
          const { wx, wy } = worldXY(e.clientX, e.clientY);
          pos.x = wx; pos.y = wy;
        }
      }
      return;
    }
    if (panRef.current) {
      viewRef.current.x = panRef.current.px + (e.clientX - panRef.current.ox);
      viewRef.current.y = panRef.current.py + (e.clientY - panRef.current.oy);
      return;
    }
    const { wx, wy } = worldXY(e.clientX, e.clientY);
    const hit = hitNode(wx, wy);
    hoverRef.current = hit;
    if (hit !== hovered?.id) {
      const graph = graphRef.current;
      setHovered(hit ? (graph?.nodes.find((n) => n.id === hit) ?? null) : null);
    }
  }, [hovered, hitNode, worldXY]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const { wx, wy } = worldXY(e.clientX, e.clientY);
    const hit = hitNode(wx, wy);
    if (hit) {
      dragRef.current = { id: hit, ox: wx, oy: wy };
    } else {
      panRef.current = { ox: e.clientX, oy: e.clientY, px: viewRef.current.x, py: viewRef.current.y };
    }
  }, [hitNode, worldXY]);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    panRef.current  = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.92;
    const v = viewRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    v.x = mx - (mx - v.x) * factor;
    v.y = my - (my - v.y) * factor;
    v.scale = Math.max(0.25, Math.min(3, v.scale * factor));
  }, []);

  const resetView = useCallback(() => {
    viewRef.current = { x: 0, y: 0, scale: 1 };
  }, []);

  if (loading) return <WidgetSpinner label="Caricamento knowledge graph…" fullHeight />;
  if (error)   return <WidgetError message={error} onRetry={() => { setError(''); setLoading(true); loadGraph(); }} />;

  return (
    <div className="kc-w-mg" ref={hostRef}>
      <div className="kc-w-mg-bar">
        <span className="kc-w-mg-stat">{nodeCount} nodi · {edgeCount} archi{nodeCount > LAZY_EDGE_THRESHOLD && allEdges ? ' (lazy)' : ''}</span>
        {hovered && (
          <span className="kc-w-mg-hover">
            <span className="kc-w-mg-hover-type">{hovered.type}</span>
            {hovered.label}
            {hovered.status ? <span className={`kc-w-mg-status kc-w-mg-status-${hovered.status}`}>{hovered.status}</span> : null}
          </span>
        )}
        {hovered?.desc && <span className="kc-w-mg-desc">{hovered.desc}</span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {nodeCount > LAZY_EDGE_THRESHOLD && (
            <button
              className="kc-w-mg-reset"
              onClick={() => setAllEdges((v) => !v)}
              title={allEdges ? 'Nascondi archi (solo hover)' : 'Forza tutti gli archi'}
              style={{ color: allEdges ? 'rgba(169,201,255,0.8)' : 'rgba(255,255,255,0.4)' }}
            >
              {allEdges ? '🔗' : '⤬'}
            </button>
          )}
          {lastRefresh && (
            <span style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.2)', fontFamily: 'JetBrains Mono, monospace' }}>
              {lastRefresh.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="kc-w-mg-reset" onClick={loadGraph} title="Aggiorna grafo">↻</button>
          <button className="kc-w-mg-reset" onClick={resetView} title="Reset vista">⊙</button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="kc-w-mg-canvas"
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        style={{ cursor: dragRef.current ? 'grabbing' : hovered ? 'pointer' : 'grab' }}
      />
      <div className="kc-w-mg-legend">
        {Object.entries(TYPE_COLORS).map(([type, color]) => {
          const isHidden = hiddenTypes.has(type);
          return (
            <button
              key={type}
              className="kc-w-mg-leg-item"
              style={{ opacity: isHidden ? 0.35 : 1, textDecoration: isHidden ? 'line-through' : 'none', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
              onClick={() => setHiddenTypes((prev) => {
                const next = new Set(prev);
                if (next.has(type)) next.delete(type); else next.add(type);
                return next;
              })}
              title={isHidden ? `Mostra ${type}` : `Nascondi ${type}`}
            >
              <span className="kc-w-mg-leg-dot" style={{ background: rgba(color, 0.8) }} />
              {type}
            </button>
          );
        })}
        <span className="kc-w-mg-leg-item">
          <span className="kc-w-mg-leg-dot" style={{ background: 'rgba(239,68,68,0.8)' }} />missing
        </span>
        <span className="kc-w-mg-leg-item">
          <span className="kc-w-mg-leg-dot" style={{ background: 'rgba(245,158,11,0.8)' }} />partial
        </span>
      </div>
    </div>
  );
}
