import { useMemo } from 'react';
import GraphView, { type GraphEdge, type GraphNode } from '../components/GraphView';
import { CROSS_LINKS, L, LEVEL_COLOR, T, colorOf } from '../data';
import type { Dashboard } from '../useDashboard';
import type { ClusterView } from '../views';

/** Anchor positions (in the 800×520 graph space) for up to six clusters. */
const ANCHORS: [number, number][] = [[230, 195], [575, 150], [565, 385], [215, 415], [400, 290], [690, 280]];

function buildGraph(clusters: ClusterView[], mock: boolean) {
  const nodes: GraphNode[] = [], edges: GraphEdge[] = [], offset: Record<string, number> = {};
  clusters.forEach((c) => {
    const base = (offset[c.id] = nodes.length);
    c.nodes.forEach(([name, score], i) => {
      nodes.push({ cluster: c.id, name, score, color: colorOf(score), hub: i === 0 });
      if (i) edges.push({ s: base, t: base + i });
      if (i > 1) edges.push({ s: base + i - 1, t: base + i, weak: true });
    });
  });
  if (mock) CROSS_LINKS.forEach(([a, i, b, j]) => edges.push({ s: offset[a] + i, t: offset[b] + j, cross: true }));
  return { nodes, edges };
}

export default function NetworkScreen({ dash }: { dash: Dashboard }) {
  const { state: s, set, clusters, generateReport } = dash;
  const t = T[s.lang];
  const signature = clusters.map((c) => c.id + ':' + c.nodes.map((n) => n[0]).join(',')).join('|');
  const graph = useMemo(() => buildGraph(clusters, !s.online), [signature, s.online]);
  const anchors = useMemo(() => clusters.map((c, i) => ({ id: c.id, ax: ANCHORS[i % ANCHORS.length][0], ay: ANCHORS[i % ANCHORS.length][1], label: L(c.label, s.lang) })),
      [signature, s.lang]);
  const sc = clusters.find((c) => c.id === s.cluster) ?? clusters[0];
  const legend = [{ color: LEVEL_COLOR.scam, label: t.scam }, { color: LEVEL_COLOR.sus, label: t.sus }, { color: LEVEL_COLOR.safe, label: t.safe }];

  return (
    <div className="wide-page">
      <div className="page-head">
        <h1>{t.network}</h1>
        <p>{t.netSub}</p>
      </div>
      {!sc ? (
        <div className="card empty">{s.online && s.apiClusters === null ? t.working : t.noClusters}</div>
      ) : (
        <div className="split">
          <div className="card graph-card">
            <div className="graph-box">
              {/* Remount when the cluster set changes: the simulation seeds positions once. */}
              <GraphView key={signature} nodes={graph.nodes} edges={graph.edges} clusters={anchors} selected={sc.id} onSelect={(id) => set({ cluster: id })} />
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
                <div className="kv" key={label[0] + value}>
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
            <button className="btn btn-primary" disabled={s.busy} onClick={() => { void generateReport(); }}>{s.busy ? t.working : t.gen}</button>
          </aside>
        </div>
      )}
    </div>
  );
}
