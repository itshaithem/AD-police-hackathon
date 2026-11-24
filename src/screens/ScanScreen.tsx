import { DETECTED_AT, GENERIC_RESULT, L, LEVEL_COLOR, RESULTS, SAMPLE_DOMAINS, SCAN_STEPS, T, levelOf } from '../data';
import type { Dashboard } from '../useDashboard';

const CIRC = 2 * Math.PI * 60;

export default function ScanScreen({ dash }: { dash: Dashboard }) {
  const { state: s, set, runScan } = dash;
  const t = T[s.lang];
  const progress = `${Math.round(Math.min(1, (s.step + 0.5) / SCAN_STEPS.length) * 100)}%`;

  return (
    <div className="scan">
      <div className="scan-top">
        <h1>{t.h1}</h1>
        <form className="scan-form" onSubmit={(e) => { e.preventDefault(); runScan(s.url); }}>
          <input value={s.url} onChange={(e) => set({ url: e.target.value })} placeholder={t.placeholder} spellCheck={false} aria-label={t.h1} />
          <button type="submit" className="btn btn-primary">{t.scanBtn}</button>
        </form>
        <div className="scan-hints">
          <div className="samples">
            <span>{t.try}</span>
            {SAMPLE_DOMAINS.map((name) => (
              <button key={name} type="button" className="link-btn" onClick={() => runScan(name)}>{name}</button>
            ))}
          </div>
          <label className="csv-label">
            <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) set({ csvName: f.name }); }} />
            {s.csvName ? `${s.csvName} — ${t.queued}` : t.csv}
          </label>
        </div>
      </div>

      {s.scanning && (
        <section className="card scan-progress" aria-live="polite">
          <div className="stack-8" style={{ gap: 6 }}>
            <span className="label">{t.scanning}</span>
            <span className="target">{s.url}</span>
          </div>
          <div className="progress-track"><div className="progress-bar" style={{ width: progress }} /></div>
          <ol className="steps">
            {SCAN_STEPS.map((lab, i) => {
              const done = i < s.step, active = i === s.step && s.scanning;
              return (
                <li key={i} className={done ? 'done' : active ? 'active' : ''}>
                  <span className="step-dot" />
                  <span style={{ flex: 1 }}>{L(lab, s.lang)}</span>
                  <span className="note">{done ? t.done : active ? '…' : ''}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {s.result && <Result dash={dash} domain={s.result} />}
    </div>
  );
}

function Result({ dash, domain }: { dash: Dashboard; domain: string }) {
  const { state: s, set } = dash;
  const t = T[s.lang];
  const r = RESULTS[domain] ?? GENERIC_RESULT;
  const lv = levelOf(r.score), c = LEVEL_COLOR[lv];
  const restOp = s.shown > r.reasons.length ? 1 : 0;

  const shots = [{ label: lv === 'safe' ? t.scannedPage : t.suspPage, url: domain, urlColor: lv === 'safe' ? '#1F1F1F' : c, note: `${t.captured} 14:02` }];
  if (r.real) shots.push({ label: t.realPage, url: r.real, urlColor: '#1F1F1F', note: t.official });

  const facts: [string, string][] = [
    [t.domainAge, L(r.age, s.lang)], [t.hosting, L(r.country, s.lang)], [t.ip, r.ip], [t.registrar, r.reg], [t.detected, L(DETECTED_AT, s.lang)],
  ];

  return (
    <section className="card result">
      <div className="result-top">
        <div className="gauge-col">
          <div className="gauge">
            <svg width="132" height="132" viewBox="0 0 132 132">
              <circle cx="66" cy="66" r="60" fill="none" stroke="#EEEAE2" strokeWidth="1.5" />
              <circle cx="66" cy="66" r="60" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"
                strokeDasharray={`${((CIRC * r.score * s.anim) / 100).toFixed(1)} ${CIRC.toFixed(1)}`} />
            </svg>
            <div className="gauge-center">
              <span className="gauge-score" style={{ color: c }}>{Math.round(r.score * s.anim)}</span>
              <span className="gauge-of" dir="ltr">/ 100</span>
            </div>
          </div>
          <span className="verdict" style={{ color: c }}>{t[lv]}</span>
        </div>

        <div className="result-body">
          <div className="stack-8" style={{ gap: 4 }}>
            <span className="result-domain">{domain}</span>
            <p className="result-line" style={{ opacity: restOp }}>{L(r.line, s.lang)}</p>
            <span className="label" style={{ marginTop: 14 }}>{lv === 'safe' ? t.whySafe : t.why}</span>
          </div>
          <ul className="reasons">
            {r.reasons.map((x, i) => (
              <li key={i} style={{ opacity: i < s.shown ? 1 : 0, transform: i < s.shown ? 'none' : 'translateY(6px)' }}>
                <span className="bullet" style={{ background: c }} />
                <span>{L(x, s.lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="shots fade" style={{ opacity: restOp }}>
        {shots.map((sh) => (
          <figure className="shot" key={sh.url + sh.label}>
            <div className="shot-head"><span>{sh.label}</span><span>{sh.note}</span></div>
            <div className="shot-frame">
              <div className="shot-url" dir="ltr" style={{ color: sh.urlColor }}>{sh.url}</div>
              <div className="shot-page">
                <span className="shot-brand">{r.brand}</span>
                <span className="shot-field" />
                <span className="shot-field" />
                <span className="shot-field btn-like" />
              </div>
            </div>
          </figure>
        ))}
      </div>

      <dl className="facts" style={{ opacity: restOp, transition: 'opacity .6s .15s' }}>
        {facts.map(([label, value]) => (
          <div key={label} style={{ minWidth: 0 }}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>

      <div className="actions" style={{ opacity: restOp, transition: 'opacity .6s .3s' }}>
        <button className="btn btn-primary" onClick={() => set({ downloaded: true })}>{s.downloaded ? t.downloaded : t.download}</button>
        <button className="btn btn-secondary" onClick={() => set({ added: true })}>{s.added ? t.added : t.addCase}</button>
      </div>
    </section>
  );
}
