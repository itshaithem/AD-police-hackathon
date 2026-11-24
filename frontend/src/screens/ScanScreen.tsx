import { useState } from 'react';
import { api } from '../api';
import { L, LEVEL_COLOR, SAMPLE_DOMAINS, SCAN_STEPS, T, levelOf, type Strings } from '../data';
import type { Dashboard } from '../useDashboard';
import type { ScanView, Shot } from '../views';

const CIRC = 2 * Math.PI * 60;
const LIVE_SAMPLES = ['http://saqrbank-secure-login.test/', 'http://saqrbank.test/r/abc', 'adcb.com', 'saqrbank.test'];

export default function ScanScreen({ dash }: { dash: Dashboard }) {
  const { state: s, set, runScan, uploadCsv } = dash;
  const t = T[s.lang];
  const progress = `${Math.round(Math.min(1, (s.step + 0.5) / SCAN_STEPS.length) * 100)}%`;
  const samples = s.online ? LIVE_SAMPLES : SAMPLE_DOMAINS;

  return (
    <div className="scan">
      <div className="scan-top">
        <h1>{t.h1}</h1>
        <form className="scan-form" onSubmit={(e) => { e.preventDefault(); runScan(s.url); }}>
          <input value={s.url} onChange={(e) => set({ url: e.target.value })} placeholder={t.placeholder} spellCheck={false} aria-label={t.h1} />
          <button type="submit" className="btn btn-primary" disabled={s.scanning}>{t.scanBtn}</button>
        </form>
        <div className="scan-hints">
          <div className="samples">
            <span>{t.try}</span>
            {samples.map((name) => (
              <button key={name} type="button" className="link-btn" onClick={() => runScan(name)}>{name.replace(/^https?:\/\//, '')}</button>
            ))}
          </div>
          <CsvControl dash={dash} onFile={uploadCsv} />
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

      {s.scanError && (
        <section className="card scan-progress" role="alert">
          <span className="label">{t.scanFailed}</span>
          <span style={{ fontSize: 15 }}>{s.scanError}</span>
        </section>
      )}

      {s.scan && !s.scanning && <Result dash={dash} view={s.scan} />}
    </div>
  );
}

function CsvControl({ dash, onFile }: { dash: Dashboard; onFile: (f: File) => void }) {
  const { state: s } = dash;
  const t = T[s.lang], b = s.batch;
  if (b) {
    return b.status === 'done'
      ? <a className="csv-label" href={api.file(`/api/jobs/${b.jobId}/csv`)} download>{`${t.batchDone} · ${b.total} — ${t.downloadCsv}`}</a>
      : <span className="label" style={{ fontSize: 13 }}>{`${t.batchRunning}: ${b.done} / ${b.total}${b.status === 'error' ? ' ✕' : ''}`}</span>;
  }
  return (
    <label className="csv-label">
      <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {s.csvName ? `${s.csvName} — ${t.queued}` : t.csv}
    </label>
  );
}

const shotLabel = (sh: Shot, t: Strings) =>
  sh.kind === 'suspicious' ? t.suspPage : sh.kind === 'scanned' ? t.scannedPage : sh.kind === 'real' ? t.realPage : t.step;

function ShotFrame({ sh, brand, urlColor, t, lang }: { sh: Shot; brand: string; urlColor: string; t: Strings; lang: 'en' | 'ar' }) {
  const [broken, setBroken] = useState(false);
  return (
    <figure className="shot">
      <div className="shot-head"><span>{shotLabel(sh, t)}</span><span>{L(sh.note, lang)}</span></div>
      <div className="shot-frame">
        <div className="shot-url" dir="ltr" style={{ color: urlColor }}>{sh.url}</div>
        {sh.img && !broken ? (
          <img className="shot-img" src={sh.img} alt={`${shotLabel(sh, t)}: ${sh.url}`} loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div className="shot-page">
            <span className="shot-brand">{brand}</span>
            <span className="shot-field" />
            <span className="shot-field" />
            <span className="shot-field btn-like" />
          </div>
        )}
      </div>
    </figure>
  );
}

function NotFound({ dash, view: r }: { dash: Dashboard; view: ScanView }) {
  const t = T[dash.state.lang];
  return (
    <section className="card result" aria-live="polite">
      <div className="result-top">
        <div className="gauge-col">
          <div className="gauge not-found" aria-hidden="true"><span>—</span></div>
          <span className="verdict" style={{ color: '#8A8A85' }}>{t.notFound}</span>
        </div>
        <div className="result-body">
          <div className="stack-8" style={{ gap: 4 }}>
            <span className="result-domain">{r.domain}</span>
            <p className="result-line">{t.notFoundLine}</p>
          </div>
          <ul className="reasons">
            {r.reasons.slice(1).map((x, i) => (
              <li key={i}><span className="bullet" style={{ background: '#B5B1A8' }} /><span>{L(x, dash.state.lang)}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Result({ dash, view: r }: { dash: Dashboard; view: ScanView }) {
  const { state: s, download, addToCase } = dash;
  const t = T[s.lang];
  if (!r.exists) return <NotFound dash={dash} view={r} />;
  const lv = levelOf(r.score), c = LEVEL_COLOR[lv];
  const restOp = s.shown > r.reasons.length ? 1 : 0;
  const facts: [string, string][] = [
    [t.domainAge, L(r.facts.age, s.lang)], [t.hosting, L(r.facts.country, s.lang)], [t.ip, r.facts.ip],
    [t.registrar, r.facts.registrar], [t.detected, L(r.facts.detected, s.lang)],
  ];
  const addedLabel = s.addedTo ? `${t.added.replace(/AD-\d+$/, '')}${s.addedTo}` : t.addCase;

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
            <span className="result-domain">{r.domain}</span>
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

      {r.shots.length > 0 && (
        <div className="shots fade" style={{ opacity: restOp }}>
          {r.shots.map((sh, i) => (
            <ShotFrame key={i} sh={sh} brand={r.brandLabel} t={t} lang={s.lang}
              urlColor={sh.kind === 'suspicious' || sh.kind === 'step' ? c : '#1F1F1F'} />
          ))}
        </div>
      )}

      <dl className="facts" style={{ opacity: restOp, transition: 'opacity .6s .15s' }}>
        {facts.map(([label, value]) => (
          <div key={label} style={{ minWidth: 0 }}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>

      <div className="actions" style={{ opacity: restOp, transition: 'opacity .6s .3s' }}>
        <button className="btn btn-primary" onClick={download}>{s.downloaded ? t.downloaded : t.download}</button>
        <button className="btn btn-secondary" onClick={() => { void addToCase(); }}>{addedLabel}</button>
      </div>
    </section>
  );
}
