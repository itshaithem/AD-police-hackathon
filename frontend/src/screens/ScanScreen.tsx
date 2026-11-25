import { useState } from 'react';
import { api } from '../api';
import { L, LEVEL_COLOR, SAMPLE_DOMAINS, SCAN_STEPS, T, colorOf, levelOf, type Strings } from '../data';
import type { Dashboard } from '../useDashboard';
import type { ScanView, Shot } from '../views';

const CIRC = 2 * Math.PI * 60;
const NA = '—';
const LIVE_SAMPLES = ['http://saqrbank-secure-login.test/', 'http://saqrbank.test/r/abc', 'adcb.com', 'saqrbank.test'];
// Lite (Vercel) can't reach the local demo sites: real look-alikes found by discovery, plus an official site.
const LITE_SAMPLES = ['adcb-update.info', 'adcb-ae.com', 'mysalik.com', 'adcb.com'];

// Saqr Bank is the repo's fictional brand: it returns fictional listings, so the scoring is demonstrable
// even when no real impersonation happens to exist on Google Maps today.
const MAPS_SAMPLES = ['Saqr Bank', 'ADCB customer service', 'e& Etisalat store Hamdan'];

function PlaceResult({ dash }: { dash: Dashboard }) {
  const { state: s, openPlace, runScan, set, downloadPlace, addPlaceToCase } = dash;
  const t = T[s.lang], r = s.places, p = s.placeDetail!;
  const lv = levelOf(p.score), c = LEVEL_COLOR[lv];
  const facts: [string, string][] = [
    [t.mapsAddress, p.address || NA], [t.mapsPhone, p.phone || NA], [t.mapsOfficialPhone, r?.official_phones || NA],
    [t.mapsSite, p.website || NA], [t.mapsOfficialSite, (r?.official_domains || []).join(', ') || NA],
    [t.mapsUsesBrand, p.claims_brand ? t.mapsClaimsYes : t.mapsClaimsNo],
  ];

  return (
    <section className="card result">
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => openPlace(null)}>
        ← {t.mapsBack}
      </button>
      <div className="result-top">
        <div className="gauge-col">
          <div className="gauge">
            <svg width="132" height="132" viewBox="0 0 132 132">
              <circle cx="66" cy="66" r="60" fill="none" stroke="#EEEAE2" strokeWidth="1.5" />
              <circle cx="66" cy="66" r="60" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"
                strokeDasharray={`${((CIRC * p.score) / 100).toFixed(1)} ${CIRC.toFixed(1)}`} />
            </svg>
            <div className="gauge-center">
              <span className="gauge-score" style={{ color: c }} dir="ltr">{p.score}</span>
              <span className="gauge-of" dir="ltr">/ 100</span>
            </div>
          </div>
          <span className="verdict" style={{ color: c }}>{t[lv]}</span>
        </div>

        <div className="result-body">
          <div className="stack-8" style={{ gap: 4 }}>
            <span className="result-domain">{p.name}</span>
            {p.demo && <span className="new-tag" style={{ alignSelf: 'flex-start' }}>{t.mapsDemo}</span>}
            <span className="label" style={{ marginTop: 14 }}>{p.score ? t.why : t.whySafe}</span>
          </div>
          <ul className="reasons">
            {p.reasons.length === 0 && <li><span className="bullet" style={{ background: c }} /><span>{t.mapsNothingWrong}</span></li>}
            {p.reasons.map((x) => (
              <li key={x.id}><span className="bullet" style={{ background: c }} /><span>{L([x.reason_en, x.reason_ar], s.lang)}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <dl className="facts">
        {facts.map(([label, value]) => (
          <div key={label} style={{ minWidth: 0 }}><dt>{label}</dt><dd dir="ltr">{value}</dd></div>
        ))}
      </dl>

      <div className="actions">
        <button className="btn btn-primary" disabled={s.placeBusy} onClick={() => { void downloadPlace(); }}>
          {s.placeBusy ? t.working : t.mapsListingPdf}
        </button>
        <button className="btn btn-secondary" disabled={s.placeBusy} onClick={() => { void addPlaceToCase(); }}>
          {s.placeCase ? `${t.added.replace(/AD-\d+$/, '')}${s.placeCase}` : t.addCase}
        </button>
        {p.maps_url && <a className="link-btn" href={p.maps_url} target="_blank" rel="noopener noreferrer">{t.mapsOpen}</a>}
        {p.website && <button type="button" className="link-btn" onClick={() => { set({ scanMode: 'web' }); runScan(p.website!); }}>{t.mapsScanSite}</button>}
        {s.placesError && <span className="label">{s.placesError}</span>}
      </div>
    </section>
  );
}

function PlacesPanel({ dash }: { dash: Dashboard }) {
  const { state: s, set, scanPlaces, openPlace } = dash;
  const t = T[s.lang];
  const r = s.places;
  const flagText: Partial<Record<string, string>> = {
    website_not_official: t.mapsFlagSite, phone_not_official: t.mapsFlagPhone, mobile_number_for_bank: t.mapsFlagMobile,
  };
  const flagged = r?.places.filter((p) => p.score > 0) ?? [];

  return (
    <>
      <form className="scan-form" onSubmit={(e) => { e.preventDefault(); void scanPlaces(s.placesQuery); }}>
        <input value={s.placesQuery} onChange={(e) => set({ placesQuery: e.target.value })}
               placeholder={t.mapsPlaceholder} spellCheck={false} aria-label={t.mapsH1} />
        <button type="submit" className="btn btn-primary" disabled={s.placesBusy}>
          {s.placesBusy ? t.working : t.mapsBtn}
        </button>
      </form>
      <div className="scan-hints">
        <div className="samples">
          <span>{t.try}</span>
          {MAPS_SAMPLES.map((q) => (
            <button key={q} type="button" className="link-btn" onClick={() => { void scanPlaces(q); }}>{q}</button>
          ))}
        </div>
      </div>

      {s.placesBusy && <div className="card empty">{t.mapsChecking}</div>}
      {s.placesError && !s.placeDetail && <div className="card empty">{s.placesError}</div>}

      {s.placeDetail && !s.placesBusy && <PlaceResult dash={dash} />}

      {r && !s.placesBusy && !s.placeDetail && (
        <section className="stack-12" style={{ gap: 14 }}>
          <div className="places-head">
            <span className="label">
              {r.demo ? `${t.mapsDemo} · ` : ''}
              {r.status !== 'ok' ? t.mapsNoKeyLong
                : r.brand_name ? `${t.mapsBrand}: ${r.brand_name}`
                : t.mapsNoBrand}
            </span>
            {r.official_domains?.length ? (
              <span className="label" dir="ltr">{t.mapsOfficial}: {r.official_domains.join(', ')}</span>
            ) : null}
            {r.sweep_id && r.status === 'ok' && (
              <a className="link-btn" href={api.file(`/api/scan/places/${r.sweep_id}/report.pdf`)}
                 target="_blank" rel="noopener noreferrer">{t.mapsSweepPdf}</a>
            )}
          </div>
          {r.status === 'ok' && r.places.length === 0 && <div className="card empty">{t.mapsNone}</div>}
          {r.status === 'ok' && r.places.length > 0 && flagged.length === 0 && <div className="card empty">{t.mapsClean}</div>}
          {r.places.map((p) => {
            const c = p.score > 0 ? colorOf(p.score) : '#6B8E5A';
            return (
              <article key={p.id} className="card place clickable" style={{ opacity: p.score > 0 ? 1 : 0.72 }}
                       role="button" tabIndex={0} onClick={() => openPlace(p)}
                       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlace(p); } }}>
                <div className="place-main">
                  <div className="stack-8" style={{ gap: 4, minWidth: 0 }}>
                    <span className="place-name">{p.name}</span>
                    {p.address && <span className="label">{p.address}</span>}
                    <span className="label" dir="ltr">
                      {[p.phone || t.mapsNoPhone, p.website || t.mapsNoSite].join('  ·  ')}
                    </span>
                  </div>
                  <span className="risk-pill" style={{ color: c, borderColor: c + '66' }}>{p.score}</span>
                </div>
                {(p.flags.length > 0 || p.claims_brand) && (
                  <ul className="place-flags">
                    {p.claims_brand && p.score > 0 && <li>{t.mapsClaims}</li>}
                    {p.flags.map((f) => <li key={f}>{flagText[f] ?? f}</li>)}
                  </ul>
                )}
                <div className="place-acts" onClick={(e) => e.stopPropagation()}>
                  {p.maps_url && <a className="link-btn" href={p.maps_url} target="_blank" rel="noopener noreferrer">{t.mapsOpen}</a>}
                  <button type="button" className="link-btn" onClick={() => openPlace(p)}>{t.mapsListingPdf}</button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

export default function ScanScreen({ dash }: { dash: Dashboard }) {
  const { state: s, set, runScan, uploadCsv } = dash;
  const t = T[s.lang];
  const progress = `${Math.round(Math.min(1, (s.step + 0.5) / SCAN_STEPS.length) * 100)}%`;
  const samples = s.lite ? LITE_SAMPLES : s.online ? LIVE_SAMPLES : SAMPLE_DOMAINS;
  const maps = s.scanMode === 'maps';

  return (
    <div className="scan">
      <div className="scan-top">
        {s.online && (
          <div className="tabs" role="tablist" style={{ justifyContent: 'center' }}>
            {([['web', t.tabWeb], ['maps', t.tabMaps]] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={s.scanMode === k} className={s.scanMode === k ? 'on' : ''}
                      onClick={() => set({ scanMode: k })}>{label}</button>
            ))}
          </div>
        )}
        <h1>{maps ? t.mapsH1 : t.h1}</h1>
        {maps && <PlacesPanel dash={dash} />}
        {!maps && (<>
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
        </>)}
      </div>

      {!maps && s.scanning && (
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

      {!maps && s.scanError && (
        <section className="card scan-progress" role="alert">
          <span className="label">{t.scanFailed}</span>
          <span style={{ fontSize: 15 }}>{s.scanError}</span>
        </section>
      )}

      {!maps && s.scan && !s.scanning && <Result dash={dash} view={s.scan} />}
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
          <span className="verdict" style={{ color: '#8A8A85' }}>{r.blocked ? t.notScanned : t.notFound}</span>
        </div>
        <div className="result-body">
          <div className="stack-8" style={{ gap: 4 }}>
            <span className="result-domain">{r.domain}</span>
            <p className="result-line">{r.blocked ? L(r.reasons[0], dash.state.lang) : t.notFoundLine}</p>
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
