// MindScreen — "La Mente di Kira".
// Vista a tutto schermo che mostra TUTTA la memoria come costellazione viva.
// I ricordi sono pallini che orbitano attorno al nucleo Kira; quando la memoria
// si popola (nuovi canonical entries / eventi), i nuovi nodi APPAIONO con
// un'animazione di nascita (flash + anello che si espande). Sorgente dati reale:
// /api/memory/graph (gli stessi nodi del MemGraphWidget, ma resi in modo cinematico).

import { useEffect, useRef, useState, useCallback } from 'react';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  status?: string;
}
interface GraphData {
  nodes: GraphNode[];
  edges: { from: string; to: string; rel: string }[];
}

const TYPE_COLORS: Record<string, [number, number, number]> = {
  system: [169, 201, 255],
  component: [99, 179, 237],
  capability: [74, 222, 128],
  ui_paradigm: [167, 139, 250],
  integration: [214, 226, 246],
  agent: [251, 146, 60],
  manual: [203, 213, 225],
  memory: [148, 163, 184],
  personale: [244, 114, 182],
  manager: [251, 146, 60],
  worker: [245, 158, 11],
  task: [96, 165, 250],
  job: [169, 201, 255],
  platform: [45, 212, 191],
  ai: [167, 139, 250],
  orchestrazione: [192, 132, 252],
  core: [169, 201, 255],
  memory_manual: [203, 213, 225],
  memory_auto: [167, 139, 250],
  memory_verified: [169, 201, 255],
  memory_promoted: [74, 222, 128],
  event: [251, 191, 36],
};

const TYPE_LABEL: Record<string, string> = {
  system: 'sistema',
  component: 'componenti',
  capability: 'capacità',
  ui_paradigm: 'paradigmi UI',
  integration: 'integrazioni',
  agent: 'agenti',
  manual: 'ricordi manuali',
  memory: 'memoria',
  personale: 'profilo personale',
  manager: 'manager agentici',
  worker: 'worker agentici',
  task: 'task',
  job: 'job',
  platform: 'piattaforma',
  ai: 'modelli AI',
  orchestrazione: 'orchestrazione',
  core: 'nucleo',
  memory_manual: 'ricordi manuali',
  memory_auto: 'ricordi automatici',
  memory_verified: 'ricordi verificati',
  memory_promoted: 'ricordi promossi',
  event: 'eventi recenti',
};

function colorForNode(n: GraphNode): [number, number, number] {
  return TYPE_COLORS[n.type] ?? [148, 163, 184];
}

interface Star {
  node: GraphNode;
  x: number;
  y: number;
  // orbita
  orbit: number;
  angle: number;
  speed: number;
  size: number;
  twinkle: number;
  born: number; // timestamp nascita (per spawn animation)
}

const POLL_MS = 7000;
const SPAWN_MS = 2600;

export function MindScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<Map<string, Star>>(new Map());
  const rafRef = useRef(0);
  const rotRef = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const edgesRef = useRef<GraphData['edges']>([]);
  const dustRef = useRef<{ x: number; y: number; z: number }[]>([]);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [pulse, setPulse] = useState(0); // n. nuovi nodi nell'ultimo poll
  const [ready, setReady] = useState(false);

  // Ordine "anello" per tipo: ricordi vicini al centro, sistema/struttura fuori
  const orbitForType = useCallback((type: string): number => {
    const rings: Record<string, number> = {
      memory_promoted: 0.16,
      memory_verified: 0.24,
      memory_manual: 0.33,
      memory_auto: 0.42,
      event: 0.52,
      capability: 0.62,
      agent: 0.70,
      integration: 0.78,
      component: 0.86,
      ui_paradigm: 0.92,
      system: 0.97,
    };
    return rings[type] ?? 0.6;
  }, []);

  const ingest = useCallback((data: GraphData) => {
    const stars = starsRef.current;
    const seen = new Set<string>();
    let newCount = 0;
    const newLabels: string[] = [];
    const now = performance.now();
    // nodi per tipo → distribuisce gli angoli
    const byType = new Map<string, GraphNode[]>();
    for (const n of data.nodes) {
      if (!byType.has(n.type)) byType.set(n.type, []);
      byType.get(n.type)!.push(n);
    }
    for (const [type, nodes] of byType) {
      const ringBase = orbitForType(type);
      nodes.forEach((n, i) => {
        seen.add(n.id);
        if (stars.has(n.id)) return;
        // nuovo nodo: distribuito su una BANDA attorno all'anello del tipo,
        // così i ricordi formano una nebulosa piena invece di un anello sottile.
        const within = nodes.length > 1 ? (i / (nodes.length - 1) - 0.5) : 0; // -0.5..0.5
        const orbit = Math.max(0.12, Math.min(0.99, ringBase + within * 0.13 + (Math.random() - 0.5) * 0.06));
        // angolo "a spirale" per evitare allineamenti netti
        const angle = (i * 2.399963) + Math.random() * 0.5; // golden angle
        stars.set(n.id, {
          node: n,
          x: 0, y: 0,
          orbit,
          angle,
          speed: (0.00005 + Math.random() * 0.00009) * (orbit < 0.5 ? 1 : 0.6),
          size: type.startsWith('memory') ? 2.6 + Math.random() * 1.8 : 2.1 + Math.random() * 1.3,
          twinkle: Math.random() * Math.PI * 2,
          born: now,
        });
        newCount++;
        if (newLabels.length < 6) newLabels.push(n.label);
      });
    }
    // rimuovi nodi spariti
    for (const id of [...stars.keys()]) if (!seen.has(id)) stars.delete(id);
    edgesRef.current = data.edges || [];
    if (selectedRef.current && !stars.has(selectedRef.current)) {
      selectedRef.current = null;
      setSelected(null);
    }

    // stats
    const c: Record<string, number> = {};
    for (const n of data.nodes) c[n.type] = (c[n.type] || 0) + 1;
    setCounts(c);
    setTotal(data.nodes.length);
    if (newLabels.length) setRecent((prev) => [...newLabels, ...prev].slice(0, 8));
    if (ready && newCount > 0) {
      setPulse(newCount);
      window.setTimeout(() => setPulse(0), 3200);
    }
    setReady(true);
  }, [orbitForType, ready]);

  const load = useCallback(() => {
    fetch('/api/memory/graph')
      .then((r) => r.json() as Promise<GraphData & { ok?: boolean }>)
      .then((j) => { if (j.nodes) ingest(j); })
      .catch(() => { /* offline: la costellazione resta com'è */ });
  }, [ingest]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, cx = 0, cy = 0, R = 0;
    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      cx = w / 2; cy = h / 2;
      R = Math.min(w, h) * 0.46;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // polvere stellare di sfondo
      if (dustRef.current.length === 0) {
        dustRef.current = Array.from({ length: 90 }, () => ({
          x: Math.random(), y: Math.random(), z: Math.random(),
        }));
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      rotRef.current += 1;
      const t = performance.now();
      ctx.clearRect(0, 0, w, h);

      // sfondo radiale profondo
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.4);
      bg.addColorStop(0, 'rgba(12,20,40,0.55)');
      bg.addColorStop(0.5, 'rgba(6,10,24,0.25)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // polvere
      for (const d of dustRef.current) {
        const px = d.x * w, py = d.y * h;
        const a = 0.04 + d.z * 0.10 + Math.sin(t * 0.0006 + d.x * 20) * 0.03;
        ctx.beginPath();
        ctx.arc(px, py, d.z * 1.3 + 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,200,255,${Math.max(0, a)})`;
        ctx.fill();
      }

      // anelli orbitali tenui
      ctx.strokeStyle = 'rgba(120,160,220,0.05)';
      ctx.lineWidth = 1;
      for (const orb of [0.24, 0.42, 0.62, 0.86]) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * orb, 0, Math.PI * 2);
        ctx.stroke();
      }

      const stars = starsRef.current;
      const hovId = hoverRef.current;
      const selId = selectedRef.current;

      // archi sottili dal nucleo verso i ricordi (solo memory_*) per dare senso di "ramificazione"
      ctx.lineWidth = 0.6;
      for (const s of stars.values()) {
        if (!s.node.type.startsWith('memory')) continue;
        s.angle += s.speed * 16;
        const r = R * s.orbit;
        const x = cx + Math.cos(s.angle) * r;
        const y = cy + Math.sin(s.angle) * r * 0.92;
        s.x = x; s.y = y;
        const grad = ctx.createLinearGradient(cx, cy, x, y);
        const col = colorForNode(s.node);
        grad.addColorStop(0, 'rgba(169,201,255,0.0)');
        grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0.07)`);
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // stelle (nodi)
      for (const s of stars.values()) {
        if (s.node.type.startsWith('memory')) {
          // posizione già calcolata sopra
        } else {
          s.angle += s.speed * 16;
          const r = R * s.orbit;
          s.x = cx + Math.cos(s.angle) * r;
          s.y = cy + Math.sin(s.angle) * r * 0.92;
        }
        const col = colorForNode(s.node);
        const isHov = hovId === s.node.id || selId === s.node.id;
        const age = t - s.born;
        const spawn = Math.min(1, age / SPAWN_MS); // 0→1
        const ease = 1 - Math.pow(1 - spawn, 3);
        const tw = 0.6 + Math.sin(t * 0.002 + s.twinkle) * 0.4;
        const baseR = s.size * (0.4 + ease * 0.6) * (isHov ? 1.8 : 1);

        // nodo selezionato: anello di selezione che respira
        if (selId === s.node.id) {
          const selR = baseR + 7 + Math.sin(t * 0.004) * 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, selR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.75)`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }

        // animazione di nascita: anello che si espande + flash
        if (spawn < 1) {
          const ringR = baseR + (1 - spawn) * 26 + 6;
          ctx.beginPath();
          ctx.arc(s.x, s.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${(1 - spawn) * 0.6})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }

        // glow
        const glowR = baseR * (isHov ? 6 : 4) * (0.7 + tw * 0.3) + (1 - spawn) * 10;
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glowR);
        glow.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${(isHov ? 0.5 : 0.28) * (0.5 + ease * 0.5)})`);
        glow.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(s.x, s.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // core
        ctx.beginPath();
        ctx.arc(s.x, s.y, baseR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.85 * ease})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${(isHov ? 0.7 : 0.25) * ease})`;
        ctx.lineWidth = isHov ? 1.2 : 0.5;
        ctx.stroke();

        if (isHov) {
          const label = s.node.label.length > 30 ? s.node.label.slice(0, 29) + '…' : s.node.label;
          ctx.font = '600 11px "JetBrains Mono", monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.textAlign = 'center';
          ctx.fillText(label, s.x, s.y - baseR - 10);
        }
      }

      // costellazione del nodo selezionato: i suoi legami si accendono
      if (selId) {
        const sel = stars.get(selId);
        if (sel) {
          ctx.lineWidth = 0.9;
          for (const e of edgesRef.current) {
            if (e.from !== selId && e.to !== selId) continue;
            const other = stars.get(e.from === selId ? e.to : e.from);
            if (!other) continue;
            const oc = colorForNode(other.node);
            const grad = ctx.createLinearGradient(sel.x, sel.y, other.x, other.y);
            grad.addColorStop(0, 'rgba(210,236,255,0.45)');
            grad.addColorStop(1, `rgba(${oc[0]},${oc[1]},${oc[2]},0.30)`);
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(sel.x, sel.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
            // il legame respira: un punto di luce viaggia lungo il filo
            const k = (Math.sin(t * 0.0016 + other.twinkle) + 1) / 2;
            const px = sel.x + (other.x - sel.x) * k;
            const py = sel.y + (other.y - sel.y) * k;
            ctx.beginPath();
            ctx.arc(px, py, 1.4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(210,236,255,0.8)';
            ctx.fill();
          }
        }
      }

      // nucleo Kira
      const corePulse = 1 + Math.sin(t * 0.0018) * 0.08;
      const coreR = 18 * corePulse;
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 5);
      coreGlow.addColorStop(0, 'rgba(169,201,255,0.55)');
      coreGlow.addColorStop(0.4, 'rgba(124,58,237,0.18)');
      coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220,250,255,0.92)';
      ctx.fill();
    };

    draw();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best: string | null = null;
    let bestD = 22 * 22;
    for (const s of starsRef.current.values()) {
      const dx = mx - s.x, dy = my - s.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = s.node.id; }
    }
    hoverRef.current = best;
    if (best !== hovered?.id) {
      setHovered(best ? (starsRef.current.get(best)?.node ?? null) : null);
    }
  }, [hovered]);

  const onClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best: Star | null = null;
    let bestD = 26 * 26;
    for (const s of starsRef.current.values()) {
      const dx = mx - s.x, dy = my - s.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = s; }
    }
    selectedRef.current = best ? best.node.id : null;
    setSelected(best ? best.node : null);
  }, []);

  const selectNodeById = useCallback((id: string) => {
    const star = starsRef.current.get(id);
    if (!star) return;
    selectedRef.current = id;
    setSelected(star.node);
  }, []);

  // legami del nodo selezionato (per il pannello dettaglio)
  const connections = selected
    ? edgesRef.current
        .filter((e) => e.from === selected.id || e.to === selected.id)
        .map((e) => {
          const otherId = e.from === selected.id ? e.to : e.from;
          const other = starsRef.current.get(otherId)?.node;
          return other ? { rel: e.rel, other, out: e.from === selected.id } : null;
        })
        .filter((c): c is { rel: string; other: GraphNode; out: boolean } => c !== null)
        .slice(0, 14)
    : [];

  const memoryTotal = (counts.memory_manual || 0) + (counts.memory_auto || 0)
    + (counts.memory_verified || 0) + (counts.memory_promoted || 0)
    + (counts.manual || 0) + (counts.memory || 0) + (counts.personale || 0);

  return (
    <div className="kc-mind" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="kc-mind-canvas"
        onMouseMove={onMove}
        onClick={onClick}
        onMouseLeave={() => { hoverRef.current = null; setHovered(null); }}
        style={{ cursor: hovered ? 'pointer' : 'default' }}
      />

      {/* HUD titolo */}
      <div className="kc-mind-title">
        <div className="kc-mind-title-main">LA MENTE DI KIRA</div>
        <div className="kc-mind-title-sub">{total} nodi · {memoryTotal} ricordi vivi</div>
      </div>

      {/* Pulse "nuova memoria" */}
      {pulse > 0 && (
        <div className="kc-mind-pulse">
          ✦ {pulse === 1 ? 'Nuovo ricordo formato' : `${pulse} nuovi nodi formati`}
        </div>
      )}

      {/* Breakdown per tipo */}
      <div className="kc-mind-legend">
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([type, n]) => {
            const c = TYPE_COLORS[type] ?? [148, 163, 184];
            return (
              <div key={type} className="kc-mind-leg-row">
                <span className="kc-mind-leg-dot" style={{ background: `rgb(${c[0]},${c[1]},${c[2]})`, boxShadow: `0 0 8px rgba(${c[0]},${c[1]},${c[2]},0.7)` }} />
                <span className="kc-mind-leg-label">{TYPE_LABEL[type] || type}</span>
                <span className="kc-mind-leg-count">{n}</span>
              </div>
            );
          })}
      </div>

      {/* Ticker ultimi ricordi */}
      {recent.length > 0 && (
        <div className="kc-mind-recent">
          <div className="kc-mind-recent-head">FLUSSO MEMORIA</div>
          {recent.map((r, i) => (
            <div key={i} className="kc-mind-recent-row" style={{ opacity: 1 - i * 0.1 }}>
              <span className="kc-mind-recent-tick">✦</span>{r}
            </div>
          ))}
        </div>
      )}

      {/* Dettaglio hover (solo se non c'è una selezione attiva) */}
      {hovered && !selected && (
        <div className="kc-mind-detail">
          <div className="kc-mind-detail-type">{TYPE_LABEL[hovered.type] || hovered.type}</div>
          <div className="kc-mind-detail-label">{hovered.label}</div>
          {hovered.status && <div className="kc-mind-detail-status">{hovered.status}</div>}
        </div>
      )}

      {/* Pannello del nodo selezionato: identità + costellazione dei legami */}
      {selected && (
        <div className="kc-mind-panel">
          <button
            type="button"
            className="kc-mind-panel-close"
            onClick={() => { selectedRef.current = null; setSelected(null); }}
            aria-label="Chiudi dettaglio"
          >✕</button>
          <div className="kc-mind-detail-type">{TYPE_LABEL[selected.type] || selected.type}</div>
          <div className="kc-mind-panel-label">{selected.label}</div>
          {selected.status && <div className="kc-mind-detail-status">{selected.status}</div>}
          {connections.length > 0 ? (
            <div className="kc-mind-panel-links">
              <div className="kc-mind-panel-links-head">LEGAMI · {connections.length}</div>
              {connections.map((c, i) => (
                <button
                  key={`${c.other.id}-${i}`}
                  type="button"
                  className="kc-mind-panel-link"
                  onClick={() => selectNodeById(c.other.id)}
                  title={`Vai a ${c.other.label}`}
                >
                  <span className="kc-mind-panel-link-rel">{c.out ? '→' : '←'} {c.rel}</span>
                  <span className="kc-mind-panel-link-label">{c.other.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="kc-mind-panel-empty">Nessun legame registrato — una stella solitaria.</div>
          )}
        </div>
      )}
    </div>
  );
}
