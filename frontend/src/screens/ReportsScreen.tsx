import { L, T } from '../data';
import type { Dashboard } from '../useDashboard';
import { statusInfo } from '../views';

export default function ReportsScreen({ dash }: { dash: Dashboard }) {
  const { state: s, set, caseList, caseDetail: k, exportCase } = dash;
  const t = T[s.lang];

  return (
    <div className="wide-page">
      <div className="page-head">
        <h1>{t.reports}</h1>
        <p>{t.repSub}</p>
      </div>
      {caseList.length === 0 ? (
        <div className="card empty">{s.online && s.apiCases === null ? t.working : t.noCases}</div>
      ) : (
        <div className="split">
          <div className="card case-list">
            {caseList.map((c) => {
              const cs = statusInfo(c.status), on = s.caseId === c.id;
              return (
                <button key={c.id} className={`case-item${on ? ' on' : ''}`} aria-current={on} onClick={() => set({ caseId: c.id, exported: null })}>
                  <span className="case-title">{L(c.title, s.lang)}</span>
                  <span className="case-meta">
                    <span>{L(c.date, s.lang)}</span>
                    <span>{`${c.domainCount} ${t.domainsN}`}</span>
                    <span className="with-dot"><span className="dot" style={{ background: cs.dot }} />{L(cs.label, s.lang)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {!k ? (
            <article className="card case-detail"><span className="label">{t.working}</span></article>
          ) : (
            <article className="card case-detail">
              <div className="stack-10">
                <span className="case-id-row">
                  <span dir="ltr">{k.id}</span>
                  <span className="with-dot"><span className="dot" style={{ background: statusInfo(k.status).dot }} />{L(statusInfo(k.status).label, s.lang)}</span>
                </span>
                <h2>{L(k.title, s.lang)}</h2>
                <span className="label" style={{ fontSize: 13 }}>{`${t.opened} ${L(k.date, s.lang)} · ${k.domainCount} ${t.domainsN}`}</span>
              </div>

              <div className="stack-12" style={{ gap: 14 }}>
                <span className="label">{t.aiSummary}</span>
                <div className="summaries">
                  <div className="summary-box" dir="ltr" lang="en">
                    <span className="lang-tag">ENGLISH</span>
                    <p>{k.summaryEn}</p>
                  </div>
                  <div className="summary-box ar" dir="rtl" lang="ar">
                    <span className="lang-tag">العربية</span>
                    <p>{k.summaryAr}</p>
                  </div>
                </div>
              </div>

              <div className="stack-8" style={{ gap: 4 }}>
                <span className="label" style={{ marginBottom: 8 }}>{t.evidence}</span>
                {k.evidence.map(([label, value]) => (
                  <div className="evidence-row" key={label[0]}>
                    <span>{L(label, s.lang)}</span>
                    <span>{L(value, s.lang)}</span>
                  </div>
                ))}
                <div className="evidence-row">
                  <span>{t.redirect}</span>
                  <span className="chain" dir="ltr">{k.chain}</span>
                </div>
              </div>

              <div className="actions">
                <button className="btn btn-primary" style={{ padding: '0 26px' }} onClick={() => exportCase('pdf')}>PDF</button>
                <button className="btn btn-secondary" style={{ padding: '0 26px' }} onClick={() => exportCase('json')}>JSON</button>
                <span className="label" style={{ fontSize: 13 }}>{s.exported ? `${k.id}.${s.exported} — ${t.ready}` : ''}</span>
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
