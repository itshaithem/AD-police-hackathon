import { BRANDS, HIGH_RISK_THRESHOLD, L, T, colorOf, type Filter } from '../data';
import { feedOf, type Dashboard } from '../useDashboard';

export default function DiscoveryScreen({ dash }: { dash: Dashboard }) {
  const { state: s, set, runScan } = dash;
  const t = T[s.lang], ar = s.lang === 'ar', wide = !s.narrow;

  const ago = (m: number) => {
    if (m < 60) return ar ? `منذ ${m} دقيقة` : `${m} min ago`;
    const h = Math.round(m / 60);
    return ar ? (h === 1 ? 'منذ ساعة' : h === 2 ? 'منذ ساعتين' : `منذ ${h} ساعات`) : `${h} h ago`;
  };
  const agoS = (sec: number) => (sec < 60 ? t.justNow : ago(Math.round(sec / 60)));
  const srcLabel = { cert: t.cert, search: t.search, maps: t.mapsSrc };

  const rows = feedOf(s).filter(({ row: r }) =>
    s.filter === 'all' || (s.filter === 'web' && r.kind === 'web') || (s.filter === 'maps' && r.kind === 'maps') || (s.filter === 'high' && r.score >= HIGH_RISK_THRESHOLD));

  const liveHigh = s.live.filter((l) => l.row.score >= HIGH_RISK_THRESHOLD).length;
  const stats = [
    { value: 47 + s.live.length, label: t.foundToday, color: '#1F1F1F' },
    { value: 19 + liveHigh, label: t.highRisk, color: '#C8442F' },
    { value: 11, label: t.brands, color: '#1F1F1F' },
  ];
  const tabs: [Filter, string][] = [['all', t.all], ['web', t.websites], ['maps', t.maps], ['high', t.highRisk]];

  return (
    <div className="discovery">
      <div className="page-head">
        <h1>{t.discovery}</h1>
        <p>{t.discSub}</p>
        <span className="live">
          <span className="dot" style={{ opacity: Math.floor(s.now / 1000) % 2 ? 1 : 0.35 }} />
          {t.liveLabel}
        </span>
      </div>

      <div className="stats">
        {stats.map((st) => (
          <div className="stat" key={st.label}>
            <span className="big-num" style={{ color: st.color }}>{st.value}</span>
            <span className="label">{st.label}</span>
          </div>
        ))}
      </div>

      <div className="stack-12" style={{ gap: 20 }}>
        <div className="tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={s.filter === k} className={s.filter === k ? 'on' : ''} onClick={() => set({ filter: k })}>{label}</button>
          ))}
        </div>
        <div className="card table">
          {wide && (
            <div className="table-head">
              <span>{t.colDomain}</span><span>{t.colBrand}</span><span>{t.colSource}</span><span>{t.colRisk}</span><span>{t.colTime}</span>
            </div>
          )}
          {rows.map(({ row: r, sec }) => {
            const brand = L(BRANDS[r.brand], s.lang), c = colorOf(r.score), time = agoS(sec), web = r.kind === 'web';
            const sub = wide ? (web ? t.website : `${t.listing} · ${r.phone}`) : `${brand} · ${time}`;
            return (
              <div key={r.name} className={`table-row${web ? ' clickable' : ''}${sec < 5 ? ' flash' : ''}`} onClick={web ? () => runScan(r.name) : undefined}>
                <div style={{ minWidth: 0 }}>
                  <div className="row-name">
                    <span>{r.name}</span>
                    {sec < 90 && <span className="new-tag">{t.newTag}</span>}
                  </div>
                  <div className="row-sub">{sub}</div>
                </div>
                <span className="wide-only" style={{ fontSize: 14 }}>{brand}</span>
                <span className="wide-only label" style={{ fontSize: 13 }}>{srcLabel[r.source]}</span>
                <span className="risk-pill" style={{ color: c, borderColor: c + '66' }}>{r.score}</span>
                <span className="wide-only label" style={{ fontSize: 13 }}>{time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
