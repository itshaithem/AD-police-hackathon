// View models shared by the screens, and adapters from mock data and from the API.
import type { ApiCase, ApiCluster, ApiDiscovery, ApiIndicator, ApiScan } from './api';
import { api } from './api';
import {
  BRANDS, CASES, CASE_STATUS, CLUSTERS, DETECTED_AT, FINDINGS, GENERIC_RESULT, RESULTS, type Bi, type Finding,
} from './data';

export type CaseStatusKey = 'open' | 'sent' | 'closed';

export interface Shot { kind: 'suspicious' | 'scanned' | 'real' | 'step'; url: string; img?: string; note: Bi }
export interface ScanView {
  id?: string;
  domain: string;
  /** false when the domain is not registered: there is no website to score. */
  exists: boolean;
  score: number;
  line: Bi;
  reasons: Bi[];
  brandLabel: string;
  shots: Shot[];
  facts: { age: Bi; country: Bi; ip: string; registrar: string; detected: Bi };
  pdfUrl?: string;
}
export interface FindingView {
  key: string; name: string; kind: 'web' | 'maps'; phone: string; brand: Bi;
  source: 'cert' | 'search' | 'maps' | 'lookalike'; score: number | null; detectedAt: number;
  scanId?: string;
}
export interface ClusterView {
  id: string; label: Bi; name: Bi; summary: Bi;
  nodes: [string, number][]; indicators: [Bi, string][];
  scanIds?: string[]; caseId?: string;
}
export interface CaseItem { id: string; status: CaseStatusKey; domainCount: number; date: Bi; title: Bi }
export interface CaseDetail extends CaseItem {
  summaryEn: string; summaryAr: string; evidence: [Bi, Bi][]; chain: string; pdfUrl?: string; jsonUrl?: string;
}

const same = (s: string): Bi => [s, s];
const NA = '—';

// ---------- brands ----------
export const BRAND_NAMES: Record<string, Bi> = {
  adcb: ['ADCB', 'بنك أبوظبي التجاري'], tamm: ['TAMM', 'تم'], uaepass: ['UAE PASS', 'الهوية الرقمية'],
  adpolice: ['Abu Dhabi Police', 'شرطة أبوظبي'], emiratesnbd: ['Emirates NBD', 'الإمارات دبي الوطني'],
  fab: ['FAB', 'بنك أبوظبي الأول'], adib: ['ADIB', 'مصرف أبوظبي الإسلامي'], mashreq: ['Mashreq', 'المشرق'],
  emiratespost: ['Emirates Post', 'بريد الإمارات'], salik: ['Salik', 'سالك'], etisalat: ['e&', 'e&'],
  uaegov: ['UAE Government', 'حكومة الإمارات'], aramex: ['Aramex', 'أرامكس'], saqrbank: ['Saqr Bank', 'بنك صقر'],
  rakbank: ['RAKBANK', 'بنك رأس الخيمة'], dib: ['Dubai Islamic Bank', 'بنك دبي الإسلامي'], emiratesislamic: ['Emirates Islamic', 'الإمارات الإسلامي'],
  cbd: ['CBD', 'بنك دبي التجاري'], dubaipolice: ['Dubai Police', 'شرطة دبي'], rta: ['RTA', 'هيئة الطرق والمواصلات'], dewa: ['DEWA', 'ديوا'],
  du: ['du', 'دو'], emirates: ['Emirates', 'طيران الإمارات'], etihad: ['Etihad', 'الاتحاد للطيران'], noon: ['noon', 'نون'], adnoc: ['ADNOC', 'أدنوك'],
  microsoft: ['Microsoft', 'مايكروسوفت'], paypal: ['PayPal', 'باي بال'], apple: ['Apple', 'أبل'], amazon: ['Amazon', 'أمازون'],
  netflix: ['Netflix', 'نتفليكس'], dhl: ['DHL', 'دي إتش إل'], fedex: ['FedEx', 'فيديكس'], meta: ['Meta', 'ميتا'], roblox: ['Roblox', 'روبلوكس'],
  binance: ['Binance', 'بينانس'], coinbase: ['Coinbase', 'كوين بيس'], amex: ['American Express', 'أمريكان إكسبريس'],
};
const brandName = (id?: string | null): Bi => (id ? BRAND_NAMES[id] ?? same(id.toUpperCase()) : same(NA));

// ---------- dates ----------
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const gst = (iso: string) => new Date(new Date(iso).getTime() + 4 * 3600 * 1000); // UTC+4, read with getUTC*
export function dateBi(iso: string, withTime = false): Bi {
  const d = gst(iso);
  const day = d.getUTCDate(), m = d.getUTCMonth(), y = d.getUTCFullYear();
  const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const en = `${day} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${y}`;
  const ar = `${day} ${MONTHS_AR[m]} ${y}`;
  return withTime ? [`${en}, ${hm} GST`, `${ar}، ${hm} بتوقيت الإمارات`] : [en, ar];
}
const timeOf = (iso: string) => { const d = gst(iso); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

function ageBi(days?: number): Bi {
  if (days == null) return same(NA);
  if (days >= 730) { const y = Math.floor(days / 365); return [`${y} years`, `${y} عامًا`]; }
  if (days >= 60) { const m = Math.floor(days / 30); return [`${m} months`, `${m} شهرًا`]; }
  return [`${days} days`, `${days} يومًا`];
}

// ---------- scans ----------
function defaultLine(s: ApiScan): Bi {
  const b = brandName(s.brand?.id);
  if (s.verdict === 'scam') return ['Do not open. Strong signs this site is a scam.', 'لا تفتحه. توجد مؤشرات قوية على أن هذا الموقع احتيالي.'];
  if (s.verdict === 'suspicious') return ['Treat with caution. Some warning signs were found.', 'تعامل بحذر. رُصدت بعض المؤشرات المقلقة.'];
  if (s.reasons[0]?.id === 'official_domain') return [`This is an official ${b[0]} website.`, `هذا موقع رسمي لـ${b[1]}.`];
  return ['No strong warning signs found.', 'لم تُرصد مؤشرات خطر قوية.'];
}

export function scanFromApi(s: ApiScan): ScanView {
  const intel = s.intel || {}, w = intel.whois || {}, h = intel.hosting || {};
  const lm = s.llm && !s.llm.error ? s.llm : null;
  const safe = s.verdict === 'safe';
  const shots: Shot[] = s.screenshots.map((sh, i) => ({
    kind: i === 0 ? (safe ? 'scanned' : 'suspicious') : 'step',
    url: sh.url, img: api.file(sh.path),
    note: i === 0 ? [`Captured ${timeOf(s.created_at)}`, `التُقطت ${timeOf(s.created_at)}`] : [sh.label.replace(/_/g, ' '), sh.label.replace(/_/g, ' ')],
  }));
  if (s.brand && !safe) {
    shots.push({ kind: 'real', url: s.brand.official_domain || brandName(s.brand.id)[0], img: api.file(`/api/references/${s.brand.id}.png`), note: ['Official', 'رسمي'] });
  }
  return {
    id: s.id, domain: s.domain, score: s.score, exists: s.verdict !== 'not_found',
    line: lm?.summary_en && lm?.summary_ar ? [lm.summary_en, lm.summary_ar] : defaultLine(s),
    reasons: s.reasons.map((r) => [r.reason_en, r.reason_ar] as Bi),
    brandLabel: s.brand ? brandName(s.brand.id)[0].toUpperCase() : '',
    shots,
    facts: {
      age: ageBi(w.age_days), country: same(h.country || NA), ip: h.ip || NA, registrar: w.registrar || NA,
      detected: dateBi(s.created_at, true),
    },
    pdfUrl: api.file(`/api/scans/${s.id}/report.pdf`),
  };
}

export function scanFromMock(domain: string): ScanView {
  const r = RESULTS[domain] ?? GENERIC_RESULT;
  const safe = r.score < 40;
  const shots: Shot[] = [{ kind: safe ? 'scanned' : 'suspicious', url: domain, note: ['Captured 14:02', 'التُقطت 14:02'] }];
  if (r.real) shots.push({ kind: 'real', url: r.real, note: ['Official', 'رسمي'] });
  return {
    domain, exists: true, score: r.score, line: r.line, reasons: r.reasons, brandLabel: r.brand, shots,
    facts: { age: r.age, country: r.country, ip: r.ip, registrar: r.reg, detected: DETECTED_AT },
  };
}

// ---------- discovery ----------
const mockFinding = (row: Finding, detectedAt: number, key: string): FindingView => ({
  key, name: row.name, kind: row.kind, phone: row.phone, brand: BRANDS[row.brand], source: row.source, score: row.score, detectedAt,
});
export const findingsFromMock = (now: number, live: { row: Finding; at: number }[]): FindingView[] => [
  ...live.map((l) => mockFinding(l.row, l.at, 'live:' + l.row.name)),
  ...FINDINGS.map((f) => mockFinding(f.row, now - f.minutesAgo * 60000, f.row.name)),
];

const hostOf = (item: string) => {
  try { return new URL(/^[a-z]+:\/\//i.test(item) ? item : `http://${item}`).hostname.replace(/^www\./, ''); } catch { return item; }
};

export function findingFromApi(d: ApiDiscovery): FindingView {
  const maps = d.source === 'maps';
  const source = maps ? 'maps' : d.source.startsWith('search') ? 'search' : d.source === 'lookalike' ? 'lookalike' : 'cert';
  return {
    key: d.id, name: maps ? (d.meta.name || d.item) : hostOf(d.item), kind: maps ? 'maps' : 'web', phone: d.meta.phone || '',
    brand: brandName(d.brand), source, score: d.verdict === 'not_found' ? null : d.score, detectedAt: Date.parse(d.detected_at), scanId: d.scan_id || undefined,
  };
}

// ---------- clusters ----------
export const clustersFromMock = (): ClusterView[] => CLUSTERS.map((c) => ({
  id: c.id, label: c.short, name: c.name, summary: c.summary, nodes: c.nodes, indicators: c.indicators, caseId: c.caseId,
}));

const INDICATOR_NAMES: Record<string, Bi> = {
  ip: ['Shared IP', 'عنوان IP مشترك'], asn: ['Network (ASN)', 'الشبكة (ASN)'], phone: ['Phone number', 'رقم الهاتف'],
  form: ['Form template', 'قالب النموذج'], phash: ['Page look', 'مظهر الصفحة'], cert: ['TLS certificate', 'شهادة TLS'],
  ns: ['Name server', 'خادم الأسماء'],
};
/** Backend stores the last 9 digits of UAE numbers: show them as +971 5X XXX XXXX. */
const formatPhone = (d: string) => (/^\d{9}$/.test(d) ? `+971 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}` : d);
const indicatorName = (i: ApiIndicator): Bi => INDICATOR_NAMES[i.type] ?? same(i.label);

export function clustersFromApi(cs: ApiCluster[]): ClusterView[] {
  return cs.slice(0, 6).map((c, i) => {
    const letter = String.fromCharCode(65 + i), b = brandName(c.brand), n = c.domains.length;
    const kinds = [...new Set(c.shared_indicators.map((x) => x.type))].slice(0, 3).map((t) => INDICATOR_NAMES[t] ?? same(t));
    const nodes = [...c.domains].sort((a, z) => z.score - a.score).map((d) => [d.name, d.score] as [string, number]);
    return {
      id: letter,
      label: c.brand ? [`${b[0]} cluster`, `مجموعة ${b[1]}`] : [`Cluster ${letter}`, `مجموعة ${letter}`],
      name: c.brand ? [`${b[0]} impersonation network`, `شبكة انتحال ${b[1]}`] : [`Linked scam domains ${letter}`, `نطاقات احتيال مترابطة ${letter}`],
      summary: [
        `${n} domains linked by ${kinds.map((k) => k[0].toLowerCase()).join(', ')}. Likely the same operator.`,
        `${n} نطاقات مرتبطة عبر ${kinds.map((k) => k[1]).join('، ')}. على الأرجح المشغّل نفسه.`,
      ],
      nodes,
      indicators: c.shared_indicators.slice(0, 5).map((x) => [indicatorName(x), x.type === 'phone' ? formatPhone(x.value) : x.value] as [Bi, string]),
      scanIds: c.scan_ids,
    };
  });
}

// ---------- cases ----------
const statusFromApi = (s: ApiCase['status']): CaseStatusKey => (s === 'sent_for_takedown' ? 'sent' : s);

export const casesFromMock = (): CaseDetail[] => CASES.map((c) => ({
  id: c.id, status: c.status, domainCount: c.domainCount, date: c.date, title: c.title,
  summaryEn: c.summaryEn, summaryAr: c.summaryAr, evidence: c.evidence, chain: c.chain,
}));

export const caseItemFromApi = (c: ApiCase): CaseItem => ({
  id: c.id, status: statusFromApi(c.status), domainCount: c.domain_count, date: dateBi(c.created_at), title: same(c.title),
});

export function caseDetailFromApi(c: ApiCase): CaseDetail {
  const e = c.evidence;
  const evidence: [Bi, Bi][] = e ? [
    [['Screenshots', 'لقطات الشاشة'], [`${e.screenshots} captures`, `${e.screenshots} لقطة`]],
    [['WHOIS records', 'سجلات WHOIS'], same(`${e.whois_records}${e.registrars.length ? ' · ' + e.registrars.join(', ') : ''}`)],
    [['Hosting', 'الاستضافة'], same(e.hosting.join(' · ') || NA)],
    [['Evidence files', 'ملفات الأدلة'], [`${e.files} files, SHA-256 manifest`, `${e.files} ملفًا مع بصمات SHA-256`]],
    [['Timestamps', 'الطوابع الزمنية'], e.first_seen ? (dateBi(e.first_seen, true).map((x, i) => (i ? 'أول رصد ' : 'First seen ') + x) as Bi) : same(NA)],
  ] : [];
  return {
    ...caseItemFromApi(c),
    summaryEn: c.summary_en || '', summaryAr: c.summary_ar || '', evidence,
    chain: (c.redirect_chain || []).join(' → ') || NA,
    pdfUrl: api.file(`/api/cases/${c.id}/report.pdf`), jsonUrl: api.file(`/api/cases/${c.id}/report.json`),
  };
}

export const statusInfo = (s: CaseStatusKey) => CASE_STATUS[s];
