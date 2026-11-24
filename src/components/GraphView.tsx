import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';

export interface GraphNode { cluster: string; name: string; score: number; color: string; hub: boolean }
export interface GraphEdge { s: number; t: number; weak?: boolean; cross?: boolean }
export interface GraphCluster { id: string; ax: number; ay: number; label: string }

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  selected: string;
  onSelect: (id: string) => void;
}

interface SimNode { x: number; y: number; vx: number; vy: number }
interface Sim { t: number; drag: { i: number; x: number; y: number } | null; hover: number | null; nodes: SimNode[] }

const W = 800;
const H = 520;
const FONT = "Inter,'IBM Plex Sans Arabic',sans-serif";

/**
 * Force-directed graph of scam clusters. The simulation writes positions straight
 * to SVG attributes every frame, so React only re-renders on hover/selection.
 */
export default function GraphView(props: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const els = useRef<{ l: (SVGLineElement | null)[]; n: (SVGCircleElement | null)[]; lab: Record<string, SVGTextElement | null>; ring: Record<string, SVGCircleElement | null>; tip: SVGGElement | null }>(
    { l: [], n: [], lab: {}, ring: {}, tip: null },
  );
  const pr = useRef(props);
  pr.current = props;
  const [hover, setHover] = useState<number | null>(null);

  const sim = useRef<Sim | null>(null);
  if (!sim.current) {
    sim.current = {
      t: 0, drag: null, hover: null,
      nodes: props.nodes.map((n, i) => {
        const c = props.clusters.find((c) => c.id === n.cluster)!;
        const a = i * 2.39996;
        return { x: c.ax + (n.hub ? 0 : Math.cos(a) * 70), y: c.ay + (n.hub ? 0 : Math.sin(a) * 70), vx: 0, vy: 0 };
      }),
    };
  }
  const S = sim.current;

  useEffect(() => {
    let raf = 0;
    const phase: Record<string, number> = {};
    pr.current.clusters.forEach((c, i) => (phase[c.id] = i * 1.7));

    const step = () => {
      const P = pr.current, N = S.nodes, E = P.edges, el = els.current;
      S.t += 1 / 60;

      // Repulsion between every pair (stronger across clusters).
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
        const a = N[i], b = N[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 30), d = Math.sqrt(d2);
        const f = (P.nodes[i].cluster === P.nodes[j].cluster ? 700 : 2600) / d2;
        dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }

      // Springs along edges.
      E.forEach((e) => {
        const a = N[e.s], b = N[e.t], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const len = e.cross ? 230 : e.weak ? 80 : 68, k = e.cross ? 0.002 : e.weak ? 0.006 : 0.028, f = (d - len) * k;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      });

      // Pull towards slowly drifting cluster anchors.
      const cen: Record<string, { ax: number; ay: number; sx: number; sy: number; n: number; r: number; maxY: number }> = {};
      P.clusters.forEach((c) => {
        cen[c.id] = { ax: c.ax + 16 * Math.sin(S.t * 0.32 + phase[c.id]), ay: c.ay + 11 * Math.cos(S.t * 0.27 + phase[c.id]), sx: 0, sy: 0, n: 0, r: 0, maxY: 0 };
      });
      N.forEach((n, i) => {
        const m = P.nodes[i], c = cen[m.cluster], k = m.hub ? 0.012 : 0.0025;
        n.vx += (c.ax - n.x) * k + (Math.random() - 0.5) * 0.06;
        n.vy += (c.ay - n.y) * k + (Math.random() - 0.5) * 0.06;
        n.vx *= 0.86; n.vy *= 0.86;
        if (S.drag && S.drag.i === i) { n.x = S.drag.x; n.y = S.drag.y; n.vx = n.vy = 0; }
        else { n.x = Math.min(W - 16, Math.max(16, n.x + n.vx)); n.y = Math.min(H - 16, Math.max(16, n.y + n.vy)); }
        c.sx += n.x; c.sy += n.y; c.n++;
      });

      // Write positions to the DOM.
      E.forEach((e, i) => {
        const l = el.l[i]; if (!l) return;
        l.setAttribute('x1', String(N[e.s].x)); l.setAttribute('y1', String(N[e.s].y));
        l.setAttribute('x2', String(N[e.t].x)); l.setAttribute('y2', String(N[e.t].y));
      });
      N.forEach((n, i) => { const c = el.n[i]; if (c) { c.setAttribute('cx', String(n.x)); c.setAttribute('cy', String(n.y)); } });
      N.forEach((n, i) => {
        const c = cen[P.nodes[i].cluster], mx = c.sx / c.n, my = c.sy / c.n;
        c.r = Math.max(c.r, Math.hypot(n.x - mx, n.y - my)); c.maxY = Math.max(c.maxY, n.y);
      });
      P.clusters.forEach((cl) => {
        const c = cen[cl.id], mx = c.sx / c.n, my = c.sy / c.n;
        const rg = el.ring[cl.id]; if (rg) { rg.setAttribute('cx', String(mx)); rg.setAttribute('cy', String(my)); rg.setAttribute('r', String(c.r + 26)); }
        const lb = el.lab[cl.id]; if (lb) { lb.setAttribute('x', String(mx)); lb.setAttribute('y', String(Math.min(H - 6, c.maxY + 34))); }
      });
      if (el.tip && S.hover != null) { const n = N[S.hover]; el.tip.setAttribute('transform', `translate(${n.x},${n.y - 18})`); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [S]);

  const toSvg = (e: RPointerEvent) => {
    const svg = svgRef.current!, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const onMove = (e: RPointerEvent) => { if (!S.drag) return; const q = toSvg(e); S.drag.x = q.x; S.drag.y = q.y; };
  const onUp = () => { S.drag = null; };

  const { nodes, edges, clusters, selected } = props;
  const tipNode = hover != null ? nodes[hover] : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none' }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      {clusters.map((c) => (
        <circle key={'r' + c.id} ref={(x) => { els.current.ring[c.id] = x; }} cx={c.ax} cy={c.ay} r={90} fill="none" stroke="#2E4A62"
          strokeWidth={1} strokeDasharray="2 5" opacity={selected === c.id ? 0.6 : 0} style={{ transition: 'opacity .4s' }} />
      ))}
      {edges.map((e, i) => {
        const on = nodes[e.s].cluster === selected || nodes[e.t].cluster === selected;
        return (
          <line key={'l' + i} ref={(x) => { els.current.l[i] = x; }} x1={S.nodes[e.s].x} y1={S.nodes[e.s].y} x2={S.nodes[e.t].x} y2={S.nodes[e.t].y}
            stroke={e.cross ? '#B9B3A6' : '#D9D4C9'} strokeWidth={1} strokeDasharray={e.cross ? '3 5' : e.weak ? '1 4' : undefined}
            opacity={on ? 1 : 0.45} style={{ transition: 'opacity .4s' }} />
        );
      })}
      {nodes.map((n, i) => (
        <circle key={'n' + i} ref={(x) => { els.current.n[i] = x; }} cx={S.nodes[i].x} cy={S.nodes[i].y}
          r={(n.hub ? 10 : 7) + (hover === i ? 2 : 0)} fill={n.color} stroke="#fff" strokeWidth={2}
          opacity={n.cluster === selected ? 1 : 0.4} style={{ cursor: 'grab', transition: 'opacity .4s, r .2s' }}
          onPointerDown={(e) => {
            e.preventDefault();
            svgRef.current?.setPointerCapture?.(e.pointerId);
            const q = toSvg(e);
            S.drag = { i, x: q.x, y: q.y };
            pr.current.onSelect(n.cluster);
          }}
          onPointerEnter={() => { S.hover = i; setHover(i); }}
          onPointerLeave={() => { S.hover = null; setHover(null); }} />
      ))}
      {clusters.map((c) => (
        <text key={'t' + c.id} ref={(x) => { els.current.lab[c.id] = x; }} x={c.ax} y={c.ay + 110} textAnchor="middle" fontSize={14} fontFamily={FONT}
          fill={selected === c.id ? '#1F1F1F' : '#8A8A85'} style={{ cursor: 'pointer' }} onClick={() => pr.current.onSelect(c.id)}>
          {c.label}
        </text>
      ))}
      {tipNode && hover != null && (
        <g ref={(x) => { els.current.tip = x; }} transform={`translate(${S.nodes[hover].x},${S.nodes[hover].y - 18})`} style={{ pointerEvents: 'none' }}>
          <text textAnchor="middle" fontSize={13} fontFamily={FONT} fill="#1F1F1F" stroke="#fff" strokeWidth={4} paintOrder="stroke">
            {`${tipNode.name} · ${tipNode.score}`}
          </text>
        </g>
      )}
    </svg>
  );
}
