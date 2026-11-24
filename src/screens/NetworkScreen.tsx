import { useMemo } from 'react';
import GraphView, { type GraphEdge, type GraphNode } from '../components/GraphView';
import { CLUSTERS, CROSS_LINKS, L, LEVEL_COLOR, T, colorOf } from '../data';
import type { Dashboard } from '../useDashboard';

/** Nodes and edges never change, so build them once. */
function buildGraph() {
  const nodes: GraphNode[] = [], edges: GraphEdge[] = [], offset: Record<string, number> = {};
  CLUSTERS.forEach((c) => {
    const base = (offset[c.id] = nodes.length);
    c.nodes.forEach(([name, score], i) => {
      nodes.push({ cluster: c.id, name, score, color: colorOf(score), hub: i === 0 });
      if (i) edges.push({ s: base, t: base + i });
      if (i > 1) edges.push({ s: base + i - 1, t: base + i, weak: true });
    });
  });
  CROSS_LINKS.forEach(([a, i, b, j]) => edges.push({ s: offset[a] + i, t: offset[b] + j, cross: true }));
  return { nodes, edges };
}
const GRAPH = buildGraph();

export default function NetworkScreen({ dash }: { dash: Dashboard }) {
  const { state: s, set } = dash;
  const t = T[s.lang];
  const sc = CLUSTERS.find((c) => c.id === s.cluster)!;
  const clusters = useMemo(() => CLUSTERS.map((c) => ({ id: c.id, ax: c.cx, ay: c.cy, label: L(c.short, s.lang) })), [s.lang]);
  const legend = [{ color: LEVEL_COLOR.scam, label: t.scam }, { color: LEVEL_COLOR.sus, label: t.sus }, { color: LEVEL_COLOR.safe, label: t.safe }];

  return (
    <div className="wide-page">
      <div className="page-head">
        <h1>{t.network}</h1>
        <p>{t.netSub}</p>
      </div>
      <div className="split">
        <div className="card graph-card">
          <div className="graph-box">
            <GraphView nodes={GRAPH.nodes} edges={GRAPH.edges} clusters={clusters} selected={s.cluster} onSelect={(id) => set({ cluster: id })} />
          </div>
          <div className="legend">
            {legend.map((l) => (
              <span key={l.label}><span className="dot" style={{ background: l.color }} />{l.label}</span>
            ))}
            <span>{t.legendLine}</span>
            <span className="hint">{t.dragHint}</span>
          </div>
        </div>

        <aside className="card cluster-panel">
          <div className="stack-8">
            <span className="label">{`${t.cluster} ${sc.id}`}</span>
            <h2>{L(sc.name, s.lang)}</h2>
            <p className="summary">{L(sc.summary, s.lang)}</p>
          </div>
          <div className="count-row">
            <span className="big-num" style={{ color: colorOf(Math.max(...sc.nodes.map((n) => n[1]))) }}>{sc.nodes.length}</span>
            <span className="label">{t.linked}</span>
          </div>
          <div className="stack-12">
            <span className="label">{t.shared}</span>
            {sc.indicators.map(([label, value]) => (
              <div className="kv" key={label[0]}>
                <span>{L(label, s.lang)}</span>
                <span dir="ltr">{value}</span>
              </div>
            ))}
          </div>
          <div className="stack-10">
            <span className="label">{t.domainsLabel}</span>
            {sc.nodes.map(([name, score]) => (
              <div className="domain-row" key={name}>
                <span className="dot" style={{ background: colorOf(score) }} />
                <span className="name">{name}</span>
                <span className="tabular" style={{ color: colorOf(score) }}>{score}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => set({ screen: 'reports', caseId: sc.caseId, exported: null })}>{t.gen}</button>
        </aside>
      </div>
    </div>
  );
}
