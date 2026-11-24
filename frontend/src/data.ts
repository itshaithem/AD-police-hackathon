// Mock data for the ScamShield dashboard. Every bilingual value is [English, Arabic].
// Replace with API calls once the backend exists.

export type Lang = 'en' | 'ar';
export type Bi = [string, string];
export type Screen = 'scan' | 'discovery' | 'network' | 'reports';
export type Filter = 'all' | 'web' | 'maps' | 'high';
export type Source = 'cert' | 'search' | 'maps';
export type BrandKey = 'ADCB' | 'TAMM' | 'PASS' | 'ADP' | 'EAND' | 'FAB' | 'ENBD' | 'ARMX';

export const L = (v: string | Bi, lang: Lang): string =>
  Array.isArray(v) ? v[lang === 'ar' ? 1 : 0] : v;

export const DETECTED_AT: Bi = ['24 Nov 2026, 14:02 GST', '24 نوفمبر 2026، 14:02 بتوقيت الإمارات'];

const en = {
  offline: 'Offline — showing saved demo data', notFound: 'Does not exist', notFoundLine: 'This website does not exist. There is nothing to check at this address.', lookalike: 'Look-alike', batchRunning: 'Batch scan', batchDone: 'Batch scan done', downloadCsv: 'Download results',
  scanFailed: 'Scan failed', noFindings: 'No findings yet. Discovery runs automatically every few minutes.', noClusters: 'No linked domains yet. Clusters appear once two or more risky sites share an indicator.',
  noCases: 'No cases yet. Add a scan to a case or generate a cluster report.', working: 'Working…', step: 'Step',
  scan: 'Scan', discovery: 'Discovery', network: 'Network', reports: 'Reports', partner: 'Abu Dhabi Police × 42 Abu Dhabi',
  h1: 'Paste a link or website to check', placeholder: 'e.g. adcb-secure-login.com', scanBtn: 'Scan', try: 'Try', csv: 'Upload CSV for batch scan', queued: 'queued for batch scan',
  scanning: 'Scanning…', scanningSub: 'Checking domain, hosting and page content', scam: 'Scam', sus: 'Suspicious', safe: 'Safe',
  why: 'Why we flagged this', whySafe: 'Why this looks legitimate', suspPage: 'Suspicious page', scannedPage: 'Scanned page', realPage: 'Real brand page', captured: 'Captured', official: 'Official',
  domainAge: 'Domain age', hosting: 'Hosting country', ip: 'IP address', registrar: 'Registrar', detected: 'Detected at',
  download: 'Download evidence pack', downloaded: 'Evidence pack ready', addCase: 'Add to case', added: 'Added to case AD-2611',
  discSub: 'New suspicious sites and Maps listings, found automatically.', foundToday: 'Found today', highRisk: 'High risk', brands: 'Brands targeted',
  all: 'All', websites: 'Websites', maps: 'Maps listings', colDomain: 'Domain or listing', colBrand: 'Impersonating', colSource: 'Source', colRisk: 'Risk', colTime: 'Detected',
  cert: 'Certificate log', search: 'Search', mapsSrc: 'Maps', website: 'Website', listing: 'Maps listing',
  netSub: 'Scam domains linked by shared IP, phone number, registrar or page template. Select a cluster.', cluster: 'Cluster', linked: 'linked domains', shared: 'Shared indicators', domainsLabel: 'Domains', gen: 'Generate cluster report',
  legendLine: 'Lines: shared IP · phone · registrar · template', dragHint: 'Drag nodes · hover for domain · click to inspect',
  repSub: 'Investigation cases and their evidence, ready to export.', domainsN: 'domains', aiSummary: 'AI summary', evidence: 'Evidence', redirect: 'Redirect chain', ready: 'ready', opened: 'Opened', done: 'Done', newTag: 'New', justNow: 'just now', liveLabel: 'Live — new findings appear here automatically', demo: 'Demo', stopDemo: 'Stop demo', stop: 'Stop',
  demoCaps: [
    'An investigator pastes a suspicious link. ScamShield checks it in seconds.',
    'New scam sites and fake Maps listings are found automatically, before anyone reports them.',
    'Sites run by the same operator are grouped by shared IP, phone number and page template.',
    'Each case is packaged with evidence and an English + Arabic summary, ready for takedown.',
  ],
};
export type Strings = typeof en;

const ar: Strings = {
  offline: 'غير متصل — تُعرض بيانات العرض المحفوظة', notFound: 'غير موجود', notFoundLine: 'هذا الموقع غير موجود. لا يوجد ما يمكن فحصه على هذا العنوان.', lookalike: 'نطاق شبيه', batchRunning: 'فحص جماعي', batchDone: 'اكتمل الفحص الجماعي', downloadCsv: 'تنزيل النتائج',
  scanFailed: 'تعذّر الفحص', noFindings: 'لا توجد نتائج بعد. يعمل الرصد تلقائيًا كل بضع دقائق.', noClusters: 'لا توجد نطاقات مترابطة بعد. تظهر المجموعات عندما يشترك موقعان خطران أو أكثر في مؤشر.',
  noCases: 'لا توجد قضايا بعد. أضف فحصًا إلى قضية أو أنشئ تقرير مجموعة.', working: 'جارٍ العمل…', step: 'خطوة',
  scan: 'الفحص', discovery: 'الرصد', network: 'الشبكة', reports: 'التقارير', partner: 'شرطة أبوظبي × 42 أبوظبي',
  h1: 'الصق رابطًا أو موقعًا للتحقق منه', placeholder: 'مثال: adcb-secure-login.com', scanBtn: 'افحص', try: 'جرّب', csv: 'رفع ملف CSV لفحص دفعة', queued: 'في قائمة الفحص الجماعي',
  scanning: 'جارٍ الفحص…', scanningSub: 'نتحقق من النطاق والاستضافة ومحتوى الصفحة', scam: 'احتيال', sus: 'مشبوه', safe: 'آمن',
  why: 'لماذا تم الإبلاغ عنه', whySafe: 'لماذا يبدو موثوقًا', suspPage: 'الصفحة المشبوهة', scannedPage: 'الصفحة المفحوصة', realPage: 'صفحة العلامة الحقيقية', captured: 'التُقطت', official: 'رسمي',
  domainAge: 'عمر النطاق', hosting: 'دولة الاستضافة', ip: 'عنوان IP', registrar: 'جهة التسجيل', detected: 'وقت الرصد',
  download: 'تنزيل حزمة الأدلة', downloaded: 'حزمة الأدلة جاهزة', addCase: 'إضافة إلى قضية', added: 'أُضيف إلى القضية AD-2611',
  discSub: 'مواقع وقوائم خرائط مشبوهة جديدة، تُرصد تلقائيًا.', foundToday: 'رُصد اليوم', highRisk: 'عالي الخطورة', brands: 'علامات مستهدفة',
  all: 'الكل', websites: 'المواقع', maps: 'قوائم الخرائط', colDomain: 'النطاق أو القائمة', colBrand: 'الجهة المنتحَلة', colSource: 'المصدر', colRisk: 'الخطورة', colTime: 'الرصد',
  cert: 'سجل الشهادات', search: 'البحث', mapsSrc: 'الخرائط', website: 'موقع', listing: 'قائمة خرائط',
  netSub: 'نطاقات احتيالية مترابطة عبر عنوان IP أو رقم هاتف أو جهة تسجيل أو قالب مشترك. اختر مجموعة.', cluster: 'مجموعة', linked: 'نطاقات مرتبطة', shared: 'مؤشرات مشتركة', domainsLabel: 'النطاقات', gen: 'إنشاء تقرير المجموعة',
  legendLine: 'الخطوط: IP · هاتف · جهة تسجيل · قالب مشترك', dragHint: 'اسحب العُقد · مرّر للاطلاع على النطاق · انقر للتفاصيل',
  repSub: 'قضايا التحقيق وأدلتها، جاهزة للتصدير.', domainsN: 'نطاقات', aiSummary: 'ملخص الذكاء الاصطناعي', evidence: 'الأدلة', redirect: 'سلسلة إعادة التوجيه', ready: 'جاهز', opened: 'فُتحت', done: 'تم', newTag: 'جديد', justNow: 'الآن', liveLabel: 'مباشر — تظهر النتائج الجديدة هنا تلقائيًا', demo: 'عرض توضيحي', stopDemo: 'إيقاف العرض', stop: 'إيقاف',
  demoCaps: [
    'يلصق المحقق رابطًا مشبوهًا، ويفحصه ScamShield خلال ثوانٍ.',
    'تُرصد مواقع الاحتيال وقوائم الخرائط المزيفة تلقائيًا قبل أن يبلّغ عنها أحد.',
    'تُجمع المواقع التي يديرها المشغّل نفسه حسب عنوان IP والهاتف وقالب الصفحة.',
    'تُجهَّز كل قضية بالأدلة وملخص بالعربية والإنجليزية، جاهزة لطلب الإزالة.',
  ],
};

export const T: Record<Lang, Strings> = { en, ar };

export interface ScanResult {
  score: number;
  line: Bi;
  brand: string;
  real: string | null;
  ip: string;
  reg: string;
  age: Bi;
  country: Bi;
  reasons: Bi[];
}

export const RESULTS: Record<string, ScanResult> = {
  'adcb-secure-login.com': { score: 94, line: ['Do not open. This page copies the ADCB login to steal card details and OTP codes.', 'لا تفتحه. هذه الصفحة تنسخ صفحة دخول بنك أبوظبي التجاري لسرقة بيانات البطاقة ورموز التحقق.'], brand: 'ADCB', real: 'adcb.com', ip: '185.234.72.14', reg: 'NameSilo, LLC', age: ['2 days', 'يومان'], country: ['Netherlands', 'هولندا'], reasons: [
    ['Domain registered 2 days ago', 'تم تسجيل النطاق قبل يومين'],
    ['94% visually similar to the real ADCB login page', 'تشابه بصري بنسبة 94% مع صفحة الدخول الحقيقية لبنك أبوظبي التجاري'],
    ['Page asks for card number and OTP', 'الصفحة تطلب رقم البطاقة ورمز التحقق'],
    ['Redirected 3 times through a short link', 'أُعيد توجيهه 3 مرات عبر رابط مختصر'],
    ['Shares a server with 6 other known scam sites', 'يشترك في خادم واحد مع 6 مواقع احتيالية معروفة']] },
  'tamm-fines-pay.net': { score: 88, line: ['Do not pay. This is a fake TAMM page collecting card payments for traffic fines.', 'لا تدفع. هذه صفحة تم مزيفة تجمع مدفوعات البطاقات للمخالفات المرورية.'], brand: 'TAMM', real: 'tamm.abudhabi', ip: '91.215.85.40', reg: 'Hostinger International', age: ['5 days', '5 أيام'], country: ['Germany', 'ألمانيا'], reasons: [
    ['Uses TAMM branding on a non-government domain', 'يستخدم هوية تم على نطاق غير حكومي'],
    ['Asks to pay a traffic fine by card, without UAE PASS login', 'يطلب دفع مخالفة مرورية بالبطاقة دون الدخول بالهوية الرقمية'],
    ['Domain registered 5 days ago', 'تم تسجيل النطاق قبل 5 أيام'],
    ['Same page template as 4 other fine-payment scams', 'قالب الصفحة نفسه في 4 مواقع احتيال أخرى لدفع المخالفات']] },
  'uaepass-verify.info': { score: 67, line: ['Treat with caution. It looks staged to imitate UAE PASS, but is not active yet.', 'تعامل بحذر. يبدو مُجهّزًا لانتحال الهوية الرقمية لكنه غير نشط بعد.'], brand: 'UAE PASS', real: 'uaepass.ae', ip: '104.21.33.7', reg: 'Namecheap, Inc.', age: ['21 days', '21 يومًا'], country: ['United States', 'الولايات المتحدة'], reasons: [
    ['Name imitates UAE PASS but is not a government domain', 'الاسم يحاكي الهوية الرقمية لكنه ليس نطاقًا حكوميًا'],
    ['Login form sends data to a third-party server', 'نموذج الدخول يرسل البيانات إلى خادم طرف ثالث'],
    ['Domain registered 3 weeks ago', 'تم تسجيل النطاق قبل 3 أسابيع'],
    ['No live phishing content yet — may be staged', 'لا يوجد محتوى تصيّد نشط بعد — قد يكون قيد التجهيز']] },
  'adcb.com': { score: 4, line: ['This is the official ADCB website.', 'هذا هو الموقع الرسمي لبنك أبوظبي التجاري.'], brand: 'ADCB', real: 'adcb.com', ip: '94.200.12.81', reg: 'MarkMonitor Inc.', age: ['28 years', '28 عامًا'], country: ['United Arab Emirates', 'الإمارات'], reasons: [
    ['Registered in 1998 and owned by ADCB', 'مسجّل منذ 1998 ومملوك لبنك أبوظبي التجاري'],
    ['Certificate issued to Abu Dhabi Commercial Bank PJSC', 'الشهادة صادرة لبنك أبوظبي التجاري ش.م.ع'],
    ['Hosted in the UAE', 'مستضاف في الإمارات'],
    ['Matches our reference copy of the official site', 'يطابق النسخة المرجعية للموقع الرسمي']] },
  'tamm.abudhabi': { score: 2, line: ['This is the official TAMM government portal.', 'هذه هي بوابة تم الحكومية الرسمية.'], brand: 'TAMM', real: 'tamm.abudhabi', ip: '185.93.245.10', reg: 'Abu Dhabi Digital Authority', age: ['9 years', '9 أعوام'], country: ['United Arab Emirates', 'الإمارات'], reasons: [
    ['Official .abudhabi government domain', 'نطاق حكومي رسمي تحت ‎.abudhabi'],
    ['Certificate issued to the Abu Dhabi Government', 'الشهادة صادرة لحكومة أبوظبي'],
    ['Hosted in the UAE', 'مستضاف في الإمارات'],
    ['Payments go through the official government gateway', 'تتم المدفوعات عبر البوابة الحكومية الرسمية']] },
};

/** Fallback result for domains not in RESULTS. */
export const GENERIC_RESULT: ScanResult = { score: 41, line: ['Not enough evidence either way. Monitor before trusting it.', 'لا توجد أدلة كافية. راقبه قبل الوثوق به.'], brand: '', real: null, ip: '172.67.144.23', reg: 'GoDaddy.com, LLC', age: ['3 weeks', '3 أسابيع'], country: ['United States', 'الولايات المتحدة'], reasons: [
  ['Not yet in our threat index', 'غير موجود في قاعدة بيانات التهديدات بعد'],
  ['Domain registered 3 weeks ago', 'تم تسجيل النطاق قبل 3 أسابيع'],
  ['WHOIS owner is hidden behind a privacy service', 'هوية المالك مخفية خلف خدمة خصوصية'],
  ['No brand impersonation detected on the page', 'لم يُرصد انتحال لأي علامة في الصفحة']] };

export const BRANDS: Record<BrandKey, Bi> = {
  ADCB: ['ADCB', 'بنك أبوظبي التجاري'], TAMM: ['TAMM', 'تم'], PASS: ['UAE PASS', 'الهوية الرقمية'], ADP: ['Abu Dhabi Police', 'شرطة أبوظبي'],
  EAND: ['e&', 'e&'], FAB: ['FAB', 'بنك أبوظبي الأول'], ENBD: ['Emirates NBD', 'الإمارات دبي الوطني'], ARMX: ['Aramex', 'أرامكس'],
};

export interface Finding {
  name: string;
  kind: 'web' | 'maps';
  phone: string;
  brand: BrandKey;
  source: Source;
  score: number;
}

const f = (name: string, kind: 'web' | 'maps', phone: string, brand: BrandKey, source: Source, score: number): Finding =>
  ({ name, kind, phone, brand, source, score });

/** Existing findings, with minutes since detection. */
export const FINDINGS: { row: Finding; minutesAgo: number }[] = [
  { row: f('adcb-secure-login.com', 'web', '', 'ADCB', 'cert', 94), minutesAgo: 12 },
  { row: f('tamm-fines-pay.net', 'web', '', 'TAMM', 'search', 88), minutesAgo: 26 },
  { row: f('ADCB Customer Care 24/7', 'maps', '+971 52 418 7730', 'ADCB', 'maps', 91), minutesAgo: 41 },
  { row: f('uaepass-verify.info', 'web', '', 'PASS', 'cert', 67), minutesAgo: 58 },
  { row: f('adpolice-fines.com', 'web', '', 'ADP', 'cert', 90), minutesAgo: 74 },
  { row: f('e& Support Center Al Wahda', 'maps', '+971 55 302 1194', 'EAND', 'maps', 72), minutesAgo: 118 },
  { row: f('fab-update-kyc.com', 'web', '', 'FAB', 'search', 85), minutesAgo: 131 },
  { row: f('emiratesnbd-rewards.co', 'web', '', 'ENBD', 'cert', 63), minutesAgo: 176 },
  { row: f('Abu Dhabi Police Fines Office', 'maps', '+971 56 771 0482', 'ADP', 'maps', 78), minutesAgo: 232 },
  { row: f('aramex-uae-delivery.com', 'web', '', 'ARMX', 'search', 58), minutesAgo: 290 },
  { row: f('adcb.com', 'web', '', 'ADCB', 'search', 4), minutesAgo: 305 },
  { row: f('tamm.abudhabi', 'web', '', 'TAMM', 'cert', 2), minutesAgo: 340 },
];

/** Findings that "arrive live" on the Discovery screen, one at a time. */
export const LIVE_POOL: Finding[] = [
  f('adcb-cardverify.online', 'web', '', 'ADCB', 'cert', 92),
  f('tamm-violation-pay.com', 'web', '', 'TAMM', 'search', 87),
  f('ADCB Head Office Helpdesk', 'maps', '+971 52 418 7731', 'ADCB', 'maps', 89),
  f('uaepass-renew.net', 'web', '', 'PASS', 'cert', 71),
  f('eand-bill-refund.com', 'web', '', 'EAND', 'search', 81),
  f('fab-secure-otp.net', 'web', '', 'FAB', 'cert', 90),
];

export interface Cluster {
  id: string;
  cx: number;
  cy: number;
  short: Bi;
  name: Bi;
  caseId: string;
  summary: Bi;
  nodes: [string, number][];
  indicators: [Bi, string][];
}

export const CLUSTERS: Cluster[] = [
  { id: 'A', cx: 230, cy: 195, short: ['ADCB login kit', 'صفحات دخول ADCB'], name: ['ADCB online-banking login kit', 'مجموعة صفحات دخول مزيفة لبنك أبوظبي التجاري'], caseId: 'AD-2611',
    summary: ['One operator, one server. All seven pages copy the ADCB login and collect card details and OTP.', 'مشغّل واحد وخادم واحد. تنسخ الصفحات السبع صفحة دخول بنك أبوظبي التجاري وتجمع بيانات البطاقة ورمز التحقق.'],
    nodes: [['adcb-secure-login.com', 94], ['adcb-verify.top', 92], ['adcb-online-update.com', 90], ['adcbank-login.net', 89], ['adcb-card-secure.info', 87], ['my-adcb-rewards.com', 81], ['adcb-otp-check.xyz', 93]],
    indicators: [[['Shared IP', 'عنوان IP مشترك'], '185.234.72.14'], [['Registrar', 'جهة التسجيل'], 'NameSilo, LLC'], [['Page template', 'قالب الصفحة'], 'adcb-login-v3'], [['Phone number', 'رقم الهاتف'], '+971 52 418 7730']] },
  { id: 'B', cx: 575, cy: 150, short: ['TAMM fines', 'مخالفات تم'], name: ['TAMM traffic-fine payment pages', 'صفحات دفع مخالفات مرورية باسم تم'], caseId: 'AD-2604',
    summary: ['Fake traffic-fine pages using TAMM and Abu Dhabi Police branding, pushed through search ads.', 'صفحات مخالفات مرورية مزيفة تستخدم هوية تم وشرطة أبوظبي، وتُروَّج عبر إعلانات البحث.'],
    nodes: [['tamm-fines-pay.net', 88], ['tamm-pay-fines.com', 86], ['adpolice-fines.com', 90], ['tamm-traffic-ae.net', 79], ['fines-tamm-gov.info', 84]],
    indicators: [[['Page template', 'قالب الصفحة'], 'tamm-pay-2'], [['Registrar', 'جهة التسجيل'], 'Hostinger International'], [['IP range', 'نطاق IP'], '91.215.85.0/24']] },
  { id: 'C', cx: 565, cy: 385, short: ['Fake helplines', 'أرقام دعم مزيفة'], name: ['Fake helplines on Google Maps', 'أرقام خدمة عملاء مزيفة على خرائط Google'], caseId: 'AD-2598',
    summary: ['Maps listings that route callers to the same mobile numbers printed on the ADCB phishing pages.', 'قوائم على الخرائط توجّه المتصلين إلى أرقام الهاتف نفسها المنشورة في صفحات تصيّد بنك أبوظبي التجاري.'],
    nodes: [['ADCB Customer Care 24/7', 91], ['ADCB Card Services Office', 84], ['Abu Dhabi Police Fines Office', 78], ['e& Support Center Al Wahda', 72]],
    indicators: [[['Phone number', 'رقم الهاتف'], '+971 52 418 7730'], [['WhatsApp', 'واتساب'], '+971 55 302 1194']] },
  { id: 'D', cx: 215, cy: 415, short: ['UAE PASS lure', 'استدراج الهوية الرقمية'], name: ['UAE PASS look-alike domains', 'نطاقات شبيهة بالهوية الرقمية'], caseId: 'AD-2590',
    summary: ['Staged look-alike domains. No live phishing content yet — worth watching.', 'نطاقات شبيهة مُجهّزة مسبقًا. لا يوجد محتوى تصيّد نشط بعد — تستحق المراقبة.'],
    nodes: [['uaepass-verify.info', 67], ['uaepass-login.app', 62], ['verify-uaepass.net', 58]],
    indicators: [[['Registrar', 'جهة التسجيل'], 'Namecheap, Inc.'], [['Name servers', 'خوادم الأسماء'], 'Cloudflare'], [['Page template', 'قالب الصفحة'], 'uaepass-v1']] },
];

/** Links between clusters: [clusterA, nodeIndexA, clusterB, nodeIndexB]. */
export const CROSS_LINKS: [string, number, string, number][] = [['A', 2, 'C', 0], ['B', 2, 'C', 2]];

export const SCAN_STEPS: Bi[] = [
  ['Looking up domain registration', 'البحث في سجل تسجيل النطاق'],
  ['Checking hosting and IP reputation', 'فحص الاستضافة وسمعة عنوان IP'],
  ['Capturing a screenshot of the page', 'التقاط صورة للصفحة'],
  ['Comparing with real brand pages', 'المقارنة مع صفحات العلامات الحقيقية'],
  ['Reading forms and requested data', 'قراءة النماذج والبيانات المطلوبة'],
  ['Calculating risk score', 'حساب درجة الخطورة'],
];

export type CaseStatus = 'open' | 'sent' | 'closed';

export const CASE_STATUS: Record<CaseStatus, { label: Bi; dot: string }> = {
  open: { label: ['Open', 'مفتوحة'], dot: '#2E4A62' },
  sent: { label: ['Sent for takedown', 'أُرسلت للإزالة'], dot: '#8A8A85' },
  closed: { label: ['Closed', 'مغلقة'], dot: '#D3CFC6' },
};

export interface Case {
  id: string;
  status: CaseStatus;
  domainCount: number;
  date: Bi;
  title: Bi;
  summaryEn: string;
  summaryAr: string;
  evidence: [Bi, Bi][];
  chain: string;
}

export const CASES: Case[] = [
  { id: 'AD-2611', status: 'open', domainCount: 7, date: ['24 Nov 2026', '24 نوفمبر 2026'], title: ['ADCB credential phishing — wave 3', 'تصيّد بيانات عملاء بنك أبوظبي التجاري — الموجة 3'],
    summaryEn: 'Seven domains impersonating the ADCB online-banking login were registered between 20 and 24 November through one registrar and hosted on a single server in the Netherlands. Victims arrive through SMS short links and are asked for card number, expiry date and OTP. The pages share a phone number with a fake ADCB helpline on Google Maps.',
    summaryAr: 'سبعة نطاقات تنتحل صفحة الدخول للخدمات المصرفية لبنك أبوظبي التجاري، سُجّلت بين 20 و24 نوفمبر لدى جهة تسجيل واحدة واستُضيفت على خادم واحد في هولندا. يصل الضحايا عبر روابط مختصرة في رسائل نصية، ويُطلب منهم رقم البطاقة وتاريخ الانتهاء ورمز التحقق. تشترك الصفحات في رقم هاتف مع رقم خدمة عملاء مزيف على خرائط Google.',
    evidence: [[['Screenshots', 'لقطات الشاشة'], ['14 captures', '14 لقطة']], [['WHOIS records', 'سجلات WHOIS'], ['7 records · NameSilo', '7 سجلات · NameSilo']], [['Hosting', 'الاستضافة'], ['Netherlands · 185.234.72.14', 'هولندا · 185.234.72.14']], [['Timestamps', 'الطوابع الزمنية'], ['First seen 20 Nov 2026, 09:14 GST', 'أول رصد 20 نوفمبر 2026، 09:14']]],
    chain: 'bit.ly/3Adcb-k → adcb-verify.top → adcb-secure-login.com' },
  { id: 'AD-2604', status: 'sent', domainCount: 5, date: ['19 Nov 2026', '19 نوفمبر 2026'], title: ['TAMM traffic-fine payment scam', 'احتيال دفع المخالفات المرورية باسم تم'],
    summaryEn: 'Five sites copy the TAMM fine-payment flow and Abu Dhabi Police branding. They skip UAE PASS login and take card payments directly. All use the same page template and sit in one hosting range in Germany. Takedown requests were sent to the registrar and host on 21 November.',
    summaryAr: 'خمسة مواقع تنسخ خطوات دفع المخالفات في تم وهوية شرطة أبوظبي، وتتجاوز الدخول بالهوية الرقمية لتأخذ مدفوعات البطاقة مباشرة. تستخدم جميعها القالب نفسه وتقع في نطاق استضافة واحد في ألمانيا. أُرسلت طلبات الإزالة إلى جهة التسجيل والمستضيف في 21 نوفمبر.',
    evidence: [[['Screenshots', 'لقطات الشاشة'], ['10 captures', '10 لقطات']], [['WHOIS records', 'سجلات WHOIS'], ['5 records · Hostinger', '5 سجلات · Hostinger']], [['Hosting', 'الاستضافة'], ['Germany · 91.215.85.0/24', 'ألمانيا · 91.215.85.0/24']], [['Timestamps', 'الطوابع الزمنية'], ['First seen 17 Nov 2026, 22:40 GST', 'أول رصد 17 نوفمبر 2026، 22:40']]],
    chain: 'ad.search-click.net → tamm-fines-pay.net' },
  { id: 'AD-2598', status: 'closed', domainCount: 3, date: ['15 Nov 2026', '15 نوفمبر 2026'], title: ['Fake ADCB helpline on Google Maps', 'رقم خدمة عملاء مزيف لبنك أبوظبي التجاري على خرائط Google'],
    summaryEn: 'Three Google Maps listings posed as ADCB customer care and listed a private mobile number. Callers were asked to read out OTP codes. All three listings were removed after the report.',
    summaryAr: 'ثلاث قوائم على خرائط Google انتحلت صفة خدمة عملاء بنك أبوظبي التجاري ونشرت رقم هاتف متحرك خاص. طُلب من المتصلين قراءة رموز التحقق. أُزيلت القوائم الثلاث بعد البلاغ.',
    evidence: [[['Screenshots', 'لقطات الشاشة'], ['6 captures', '6 لقطات']], [['Listing records', 'سجلات القوائم'], ['3 listings', '3 قوائم']], [['Phone number', 'رقم الهاتف'], ['+971 52 418 7730', '+971 52 418 7730']], [['Timestamps', 'الطوابع الزمنية'], ['First seen 11 Nov 2026, 16:05 GST', 'أول رصد 11 نوفمبر 2026، 16:05']]],
    chain: 'maps.google.com/?cid=… → tel:+971524187730' },
  { id: 'AD-2590', status: 'open', domainCount: 3, date: ['12 Nov 2026', '12 نوفمبر 2026'], title: ['UAE PASS verification lure', 'استدراج للتحقق من الهوية الرقمية'],
    summaryEn: 'Three look-alike UAE PASS domains have been registered but show no live phishing content yet. One has a login form that posts to an outside server. Recommend monitoring and a pre-emptive registrar notice.',
    summaryAr: 'سُجّلت ثلاثة نطاقات شبيهة بالهوية الرقمية لكنها لا تعرض محتوى تصيّد نشطًا بعد. أحدها يحتوي على نموذج دخول يرسل البيانات إلى خادم خارجي. يُوصى بالمراقبة وإخطار استباقي لجهة التسجيل.',
    evidence: [[['Screenshots', 'لقطات الشاشة'], ['3 captures', '3 لقطات']], [['WHOIS records', 'سجلات WHOIS'], ['3 records · Namecheap', '3 سجلات · Namecheap']], [['Hosting', 'الاستضافة'], ['United States · Cloudflare', 'الولايات المتحدة · Cloudflare']], [['Timestamps', 'الطوابع الزمنية'], ['First seen 3 Nov 2026, 11:52 GST', 'أول رصد 3 نوفمبر 2026، 11:52']]],
    chain: 'uaepass-verify.info' },
];

export const SAMPLE_DOMAINS = ['adcb-secure-login.com', 'tamm-fines-pay.net', 'uaepass-verify.info', 'adcb.com'];

// ---- Risk levels ----
export type Level = 'scam' | 'sus' | 'safe';
export const LEVEL_COLOR: Record<Level, string> = { scam: '#C8442F', sus: '#C99A2E', safe: '#6B8E5A' };
export const HIGH_RISK_THRESHOLD = 75;
export const levelOf = (score: number, threshold = HIGH_RISK_THRESHOLD): Level =>
  score >= threshold ? 'scam' : score >= 40 ? 'sus' : 'safe';
export const colorOf = (score: number, threshold = HIGH_RISK_THRESHOLD) => LEVEL_COLOR[levelOf(score, threshold)];
