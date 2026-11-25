import { HIGH_RISK_THRESHOLD, L, T, colorOf, type Filter } from '../data';
import type { Dashboard } from '../useDashboard';

function Watchlist({ dash }: { dash: Dashboard }) {
  const { state: s, set, saveWatchlist } = dash;
  const t = T[s.lang], w = s.wl;
  const count = s.wlKeywords.split('\n').filter((x) => x.trim()).length;
  const max = w?.max_entries ?? 200;
  const over = count > max;
  // Anything else (invalid_key, disabled, error) reads as "the key was rejected".
  const mapsText: Partial<Record<string, string>> = { ok: t.wlMapsOk, no_key: t.wlMapsNoKey, quota: t.wlMapsQuota, idle: '' };
  const maps = mapsText[w?.places.state ?? 'idle'] ?? t.wlMapsBad;

  return (
    <details className="card watchlist" open={s.wlOpen} onToggle={(e) => set({ wlOpen: e.currentTarget.open })}>
      <summary>
        <span>{t.watchlist}</span>
        <span className="label">{w?.brands ? `${w.brands} ${t.wlTargets}` : t.wlEmpty}{maps ? ` · ${maps}` : ''}</span>
      </summary>
      <div className="wl-body">
        <p className="label">{t.wlSub}</p>
        <div className="wl-grid">
          <label className="stack-8">
            <span className="label">{t.wlKeywords} <span dir="ltr" style={{ color: over ? '#C8442F' : undefined }}>{count} / {max}</span></span>
            <textarea value={s.wlKeywords} dir="ltr" spellCheck={false} rows={7} placeholder={t.wlKwHint}
                      onChange={(e) => set({ wlKeywords: e.target.value })} />
          </label>
          <label className="stack-8">
            <span className="label">{t.wlSites}</span>
            <textarea value={s.wlSites} dir="ltr" spellCheck={false} rows={7} placeholder={t.wlSiteHint}
                      onChange={(e) => set({ wlSites: e.target.value })} />
          </label>
        </div>
        <div className="wl-foot">
          <span className="label">
            {s.wlError ? s.wlError
              : w?.rejected?.length ? `${t.wlSkipped}: ${w.rejected.map((r) => r.value).join(', ')}`
              : w?.no_ct?.length ? `${t.wlNoCt}: ${w.no_ct.join(', ')}`
              : w?.run === 'started' ? t.wlSaved : w?.run ? t.wlRunning : ''}
          </span>
          <button className="btn btn-primary" disabled={s.wlSaving || over} onClick={() => { void saveWatchlist(); }}>
            {s.wlSaving ? t.wlSaving : t.wlSave}
          </button>
        </div>
      </div>
    </details>
  );
}

export default function DiscoveryScreen({ dash }: { dash: Dashboard }) {
  const { state: s, set, runScan, openScan, findings } = dash;
  const t = T[s.lang], ar = s.lang === 'ar', wide = !s.narrow;

  const ago = (m: number) => {
    if (m < 60) return ar ? `منذ ${m} دقيقة` : `${m} min ago`;
    const h = Math.round(m / 60);
    if (h >= 48) { const d = Math.round(h / 24); return ar ? `منذ ${d} أيام` : `${d} d ago`; }
    return ar ? (h === 1 ? 'منذ ساعة' : h === 2 ? 'منذ ساعتين' : `منذ ${h} ساعات`) : `${h} h ago`;
  };
  const agoS = (sec: number) => (sec < 60 ? t.justNow : ago(Math.round(sec / 60)));
  const srcLabel = { cert: t.cert, search: t.search, maps: t.mapsSrc, lookalike: t.lookalike };

  // High risk comes from the server (it spans the whole table); the rest filter the recent page.
  const rows = s.filter === 'high'
    ? (s.online ? (s.apiHighRisk ?? []) : findings.filter((r) => (r.score ?? 0) >= HIGH_RISK_THRESHOLD))
    : findings.filter((r) =>
        s.filter === 'all' || (s.filter === 'web' && r.kind === 'web') || (s.filter === 'maps' && r.kind === 'maps'));

  const st = s.online ? s.apiStats : null;
  const liveHigh = s.live.filter((l) => l.row.score >= HIGH_RISK_THRESHOLD).length;
  const stats = [
    { value: st ? st.found_today : 47 + s.live.length, label: t.foundToday, color: '#1F1F1F' },
    { value: st ? st.high_risk : 19 + liveHigh, label: t.highRisk, color: '#C8442F' },
    { value: st ? st.brands_targeted : 11, label: t.brands, color: '#1F1F1F' },
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

      {s.online && <Watchlist dash={dash} />}

      <div className="stats">
        {stats.map((x) => (
          <div className="stat" key={x.label}>
            <span className="big-num" style={{ color: x.color }}>{x.value}</span>
            <span className="label">{x.label}</span>
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
          {rows.length === 0 && <div className="empty">{t.noFindings}</div>}
          {rows.map((r) => {
            const sec = Math.max(0, (s.now - r.detectedAt) / 1000);
            const brand = L(r.brand, s.lang), time = agoS(sec), web = r.kind === 'web';
            const c = r.score == null ? '#8A8A85' : colorOf(r.score);
            const sub = wide ? (web ? t.website : `${t.listing} · ${r.phone}`) : `${brand} · ${time}`;
            const open = r.scanId ? () => openScan(r.scanId!) : web ? () => runScan(r.name) : undefined;
            return (
              <div key={r.key} className={`table-row${open ? ' clickable' : ''}${sec < 5 ? ' flash' : ''}`} onClick={open}>
                <div style={{ minWidth: 0 }}>
                  <div className="row-name">
                    <span>{r.name}</span>
                    {sec < 90 && <span className="new-tag">{t.newTag}</span>}
                  </div>
                  <div className="row-sub">{sub}</div>
                </div>
                <span className="wide-only" style={{ fontSize: 14 }}>{brand}</span>
                <span className="wide-only label" style={{ fontSize: 13 }}>{srcLabel[r.source]}</span>
                <span className="risk-pill" style={{ color: c, borderColor: c + '66' }}>{r.score ?? '…'}</span>
                <span className="wide-only label" style={{ fontSize: 13 }}>{time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
