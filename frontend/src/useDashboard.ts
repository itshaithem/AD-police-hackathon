import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiPlace, type ApiPlacesScan, type ApiStats, type ApiWatchlist } from './api';
import { HIGH_RISK_THRESHOLD, LIVE_POOL, SCAN_STEPS, type Filter, type Finding, type Lang, type Screen } from './data';
import {
  caseDetailFromApi, caseItemFromApi, casesFromMock, clustersFromApi, clustersFromMock, findingFromApi, findingsFromMock,
  scanFromApi, scanFromMock, type CaseDetail, type CaseItem, type ClusterView, type FindingView, type ScanView,
} from './views';

export interface BatchState { jobId: string; total: number; done: number; status: 'running' | 'done' | 'error' }

export interface DashState {
  screen: Screen;
  lang: Lang;
  url: string;
  /** null while checking, then whether the backend answered /health. */
  online: boolean | null;
  /** Lite deployment (Vercel only): live scans, saved demo data for the other screens. */
  lite: boolean;
  scanning: boolean;
  step: number;
  /** 0→1 eased progress of the score gauge animation. */
  anim: number;
  /** Number of reasons revealed so far. */
  shown: number;
  scan: ScanView | null;
  scanError: string | null;
  /** Mock-mode "live" findings. */
  live: { row: Finding; at: number }[];
  now: number;
  demo: boolean;
  demoStep: number;
  addedTo: string | null;
  downloaded: boolean;
  csvName: string | null;
  batch: BatchState | null;
  filter: Filter;
  cluster: string;
  caseId: string;
  exported: 'pdf' | 'json' | null;
  narrow: boolean;
  // API data (online mode)
  apiFindings: FindingView[] | null;
  /** High-risk rows, filtered server-side across the whole table (the recent page rarely holds them). */
  apiHighRisk: FindingView[] | null;
  apiStats: ApiStats | null;
  apiClusters: ClusterView[] | null;
  apiCases: CaseItem[] | null;
  apiCase: CaseDetail | null;
  busy: boolean;
  // Watchlist panel (Discovery)
  wl: ApiWatchlist | null;
  wlKeywords: string;
  wlSites: string;
  wlOpen: boolean;
  wlSaving: boolean;
  wlError: string | null;
  // Maps-listing scan (Scan screen tab)
  scanMode: 'web' | 'maps';
  placesQuery: string;
  places: ApiPlacesScan | null;
  placesBusy: boolean;
  placesError: string | null;
  /** The listing opened as a full report, or null for the list view. */
  placeDetail: ApiPlace | null;
  placeBusy: boolean;
  /** Scan id once the open listing has been persisted, so its PDF/case routes apply. */
  placeScanId: string | null;
  placeCase: string | null;
}

const NARROW_BELOW = 760;
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < NARROW_BELOW;

/** Normalise user input to a bare domain: strip scheme, www and path. */
export const normalizeDomain = (u: string) =>
  u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');

const MOCK_CASES = casesFromMock();
const MOCK_CLUSTERS = clustersFromMock();

export function useDashboard(initial?: { screen?: Screen; lang?: Lang }) {
  const [state, setFull] = useState<DashState>(() => ({
    screen: initial?.screen ?? 'scan', lang: initial?.lang ?? 'en',
    url: 'adcb-secure-login.com', online: null, lite: false,
    scanning: false, step: 0, anim: 1, shown: 99, scan: scanFromMock('adcb-secure-login.com'), scanError: null,
    live: [], now: Date.now(), demo: false, demoStep: 0,
    addedTo: null, downloaded: false, csvName: null, batch: null, filter: 'all', cluster: 'A', caseId: 'AD-2611', exported: null,
    narrow: isNarrow(),
    apiFindings: null, apiHighRisk: null, apiStats: null, apiClusters: null, apiCases: null, apiCase: null, busy: false,
    wl: null, wlKeywords: '', wlSites: '', wlOpen: false, wlSaving: false, wlError: null,
    scanMode: 'web', placesQuery: 'ADCB customer service', places: null, placesBusy: false, placesError: null,
    placeDetail: null, placeBusy: false, placeScanId: null, placeCase: null,
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const set = useCallback((patch: Partial<DashState> | ((s: DashState) => Partial<DashState>)) => {
    setFull((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  const t = useRef<{ si?: number; ri?: number; raf?: number; typer?: number; job?: number; demo: number[]; scanSeq: number }>({ demo: [], scanSeq: 0 });

  const stopScan = useCallback(() => {
    clearInterval(t.current.si); clearInterval(t.current.ri);
    if (t.current.raf) cancelAnimationFrame(t.current.raf);
  }, []);

  /** Animate score gauge, then reveal reasons one by one. */
  const animateResult = useCallback((n: number) => {
    const t0 = performance.now();
    const f = (now: number) => {
      const k = Math.min(1, (now - t0) / 1000);
      set({ anim: 1 - Math.pow(1 - k, 3) });
      if (k < 1) t.current.raf = requestAnimationFrame(f);
    };
    t.current.raf = requestAnimationFrame(f);
    let s = 0;
    t.current.ri = window.setInterval(() => {
      s++; set({ shown: s });
      if (s > n) clearInterval(t.current.ri);
    }, 220);
  }, [set]);

  const showResult = useCallback((view: ScanView) => {
    set({ scanning: false, scan: view, step: SCAN_STEPS.length, anim: 0, shown: 0 });
    animateResult(view.reasons.length);
  }, [set, animateResult]);

  const runScan = useCallback((input: string) => {
    const online = stateRef.current.online || stateRef.current.lite;
    const d = online ? input.trim() : normalizeDomain(input);
    if (!d) return;
    stopScan();
    const seq = ++t.current.scanSeq;
    const N = SCAN_STEPS.length;
    set({ url: online ? d : normalizeDomain(d), scanning: true, step: 0, scan: null, scanError: null, addedTo: null, downloaded: false, screen: 'scan' });
    let i = 0;
    if (!online) {
      t.current.si = window.setInterval(() => {
        i++;
        if (i >= N) { clearInterval(t.current.si); showResult(scanFromMock(normalizeDomain(d))); }
        else set({ step: i });
      }, 430);
      return;
    }
    // Real scans take 5–30 s: walk the steps, then hold on the last one until the result arrives.
    t.current.si = window.setInterval(() => { if (i < N - 1) { i++; set({ step: i }); } }, 1400);
    api.scan(d).then(
      (r) => { if (seq === t.current.scanSeq) { clearInterval(t.current.si); showResult(scanFromApi(r)); } },
      (e: Error) => {
        if (seq !== t.current.scanSeq) return;
        clearInterval(t.current.si);
        set({ scanning: false, scanError: e.message.replace(/^\d+ /, '').slice(0, 200) });
      },
    );
  }, [set, stopScan, showResult]);

  const openScan = useCallback((scanId: string) => {
    stopScan();
    api.scanById(scanId).then((r) => set({ screen: 'scan', url: r.url, scan: scanFromApi(r), scanning: false, anim: 1, shown: 99, scanError: null, addedTo: null, downloaded: false }));
  }, [set, stopScan]);

  // ---------- actions on a result ----------
  const download = useCallback(() => {
    const s = stateRef.current;
    if (s.online && s.scan?.pdfUrl) window.open(s.scan.pdfUrl, '_blank', 'noopener');
    set({ downloaded: true });
  }, [set]);

  const addToCase = useCallback(async () => {
    const s = stateRef.current;
    if (!s.online || !s.scan?.id) { set({ addedTo: 'AD-2611' }); return; }
    const cases = await api.cases();
    const open = cases.find((c) => c.status === 'open');
    const c = open ? await api.addToCase(open.id, [s.scan.id]) : await api.createCase({ title: `${s.scan.domain} investigation`, scan_ids: [s.scan.id] });
    set({ addedTo: c.id, apiCases: null });
  }, [set]);

  const uploadCsv = useCallback(async (file: File) => {
    if (!stateRef.current.online) { set({ csvName: file.name }); return; }
    set({ csvName: file.name, batch: null });
    try {
      const { job_id, total } = await api.batch(file);
      set({ batch: { jobId: job_id, total, done: 0, status: 'running' } });
      clearInterval(t.current.job);
      t.current.job = window.setInterval(async () => {
        const j = await api.job(job_id).catch(() => null);
        if (!j) return;
        set({ batch: { jobId: job_id, total: j.total, done: j.done, status: j.status } });
        if (j.status !== 'running') clearInterval(t.current.job);
      }, 1500);
    } catch (e) {
      set({ csvName: `${file.name} — ${(e as Error).message.slice(0, 80)}` });
    }
  }, [set]);

  // ---------- network / reports ----------
  const generateReport = useCallback(async () => {
    const s = stateRef.current;
    const cl = (s.online && s.apiClusters?.length ? s.apiClusters : MOCK_CLUSTERS).find((c) => c.id === s.cluster);
    if (!cl) return;
    if (s.online && cl.scanIds) {
      set({ busy: true });
      try {
        const c = await api.createCase({ title: cl.name[0], scan_ids: cl.scanIds });
        set({ screen: 'reports', caseId: c.id, exported: null, apiCases: null, apiCase: caseDetailFromApi(c) });
      } finally { set({ busy: false }); }
    } else if (cl.caseId) {
      set({ screen: 'reports', caseId: cl.caseId, exported: null });
    }
  }, [set]);

  const exportCase = useCallback((kind: 'pdf' | 'json') => {
    const s = stateRef.current;
    const url = kind === 'pdf' ? s.apiCase?.pdfUrl : s.apiCase?.jsonUrl;
    if (s.online && url) window.open(url, '_blank', 'noopener');
    set({ exported: kind });
  }, [set]);

  // ---------- mock live feed + demo ----------
  const addLive = useCallback(() => {
    set((s) => {
      const n = s.live.length;
      if (s.online || n >= LIVE_POOL.length) return {};
      return { live: [{ row: LIVE_POOL[n], at: Date.now() }, ...s.live], now: Date.now() };
    });
  }, [set]);

  const stopDemo = useCallback((silent?: boolean) => {
    t.current.demo.forEach(clearTimeout);
    clearInterval(t.current.typer);
    t.current.demo = [];
    if (!silent) set({ demo: false });
  }, [set]);

  /** Scripted ~35 s walkthrough of all four screens. */
  const startDemo = useCallback(() => {
    stopDemo(true); stopScan();
    const at = (ms: number, fn: () => void) => t.current.demo.push(window.setTimeout(fn, ms));
    const target = stateRef.current.online ? 'http://saqrbank.test/r/abc' : 'adcb-secure-login.com';
    set({ demo: true, demoStep: 0, screen: 'scan', url: '', scan: null, scanning: false, live: [] });
    at(700, () => {
      let i = 0;
      t.current.typer = window.setInterval(() => {
        i++; set({ url: target.slice(0, i) });
        if (i >= target.length) { clearInterval(t.current.typer); at(350, () => runScan(target)); }
      }, 45);
    });
    at(15000, () => set({ screen: 'discovery', demoStep: 1, filter: 'all' }));
    at(16500, addLive); at(19000, addLive);
    at(22000, () => set({ screen: 'network', demoStep: 2, cluster: 'A' }));
    at(25500, () => set((s) => ({ cluster: (s.online ? s.apiClusters : MOCK_CLUSTERS)?.[1]?.id ?? s.cluster })));
    at(31500, () => set((s) => ({ screen: 'reports', demoStep: 3, caseId: s.online ? (s.apiCases?.[0]?.id ?? s.caseId) : 'AD-2611', exported: null })));
    at(35500, () => set({ exported: 'pdf' }));
    at(39500, () => set({ demo: false }));
  }, [set, stopDemo, stopScan, runScan, addLive]);

  const toggleDemo = useCallback(() => (stateRef.current.demo ? stopDemo() : startDemo()), [startDemo, stopDemo]);

  // ---------- lifecycle ----------
  useEffect(() => {
    const check = () => api.health().then(
      // Lite: live scanning only; the other screens keep the saved demo data (online stays false for them).
      (h) => set(h.mode === 'lite' ? { lite: true, online: false } : (s) => (s.online === null && !s.scan?.id && !s.scanning
        // First time online: drop the mock sample result so only real scans are shown.
        ? { online: true, scan: null, url: s.url === 'adcb-secure-login.com' ? '' : s.url }
        : { online: true })),
      () => set({ online: false, lite: false }),
    );
    check();
    const healthT = window.setInterval(check, 30000);
    const onResize = () => { const n = isNarrow(); if (n !== stateRef.current.narrow) set({ narrow: n }); };
    window.addEventListener('resize', onResize); onResize();
    const clock = window.setInterval(() => { if (stateRef.current.screen === 'discovery') set({ now: Date.now() }); }, 1000);
    const feed = window.setInterval(() => { const s = stateRef.current; if (s.screen === 'discovery' && !s.demo) addLive(); }, 8000);
    return () => {
      clearInterval(healthT); window.removeEventListener('resize', onResize); clearInterval(clock); clearInterval(feed); clearInterval(t.current.job);
      stopScan(); stopDemo(true);
    };
  }, [set, addLive, stopScan, stopDemo]);

  // Load screen data from the API when online.
  useEffect(() => {
    if (!state.online) return;
    let alive = true;
    const guard = (p: Partial<DashState>) => { if (alive) set(p); };
    if (state.screen === 'discovery') {
      const load = () => Promise.all([
        api.discovery('?limit=200'),
        api.stats(),
        // The score filter must span the whole table, not the newest page: thousands of unscored
        // look-alike candidates sit in front of the findings that actually matter.
        api.discovery(`?min_score=${HIGH_RISK_THRESHOLD}&limit=2000`),
      ])
        .then(([d, st, high]) => guard({
          apiFindings: d.map(findingFromApi),
          apiStats: st,
          // findingFromApi nulls the score for not_found/blocked; those don't belong in a score tab.
          apiHighRisk: high.map(findingFromApi).filter((f) => f.score != null),
          now: Date.now(),
        }))
        .catch(() => undefined);
      api.watchlist()
        .then((w) => {
          if (!alive) return;
          // Don't clobber boxes the user is mid-edit in; refresh the status either way.
          set((cur) => (cur.wlSaving || cur.wlOpen
            ? { wl: w }
            : { wl: w, wlKeywords: w.keywords.join('\n'), wlSites: w.sites.join('\n') }));
        })
        .catch(() => undefined);
      load();
      const iv = window.setInterval(load, 30000);
      return () => { alive = false; clearInterval(iv); };
    }
    if (state.screen === 'network') {
      api.graph().then((g) => {
        const cl = clustersFromApi(g.clusters);
        guard({ apiClusters: cl });
        if (cl.length && !cl.some((c) => c.id === stateRef.current.cluster)) guard({ cluster: cl[0].id });
      }).catch(() => undefined);
    }
    if (state.screen === 'reports') {
      api.cases().then((cs) => {
        const items = cs.map(caseItemFromApi);
        guard({ apiCases: items });
        if (items.length && !items.some((c) => c.id === stateRef.current.caseId)) guard({ caseId: items[0].id });
      }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [state.online, state.screen, set]);

  useEffect(() => {
    if (!state.online || state.screen !== 'reports' || !state.caseId.startsWith('AD-')) return;
    let alive = true;
    api.caseById(state.caseId).then((c) => { if (alive) set({ apiCase: caseDetailFromApi(c) }); }).catch(() => undefined);
    return () => { alive = false; };
  }, [state.online, state.screen, state.caseId, set]);

  const scanPlaces = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    set({ placesQuery: q, placesBusy: true, placesError: null, places: null, placeDetail: null, placeScanId: null, placeCase: null });
    try {
      set({ places: await api.scanPlaces(q) });
    } catch (e) {
      set({ placesError: (e as Error).message.slice(0, 160) });
    } finally {
      set({ placesBusy: false });
    }
  }, [set]);

  const openPlace = useCallback((p: ApiPlace | null) => {
    set({ placeDetail: p, placeScanId: null, placeCase: null, placesError: null });
  }, [set]);

  /** Persist the open listing once; its id then unlocks the normal report and case routes. */
  const ensurePlaceSaved = useCallback(async (): Promise<string | null> => {
    const s = stateRef.current;
    if (s.placeScanId) return s.placeScanId;
    if (!s.places?.sweep_id || !s.placeDetail) return null;
    const { scan_id } = await api.savePlace(s.places.sweep_id, s.placeDetail.id);
    set({ placeScanId: scan_id });
    return scan_id;
  }, [set]);

  const downloadPlace = useCallback(async () => {
    set({ placeBusy: true, placesError: null });
    try {
      const id = await ensurePlaceSaved();
      if (id) window.open(api.file(`/api/scans/${id}/report.pdf`), '_blank', 'noopener');
    } catch (e) {
      set({ placesError: (e as Error).message.slice(0, 160) });
    } finally {
      set({ placeBusy: false });
    }
  }, [set, ensurePlaceSaved]);

  const addPlaceToCase = useCallback(async () => {
    set({ placeBusy: true, placesError: null });
    try {
      const id = await ensurePlaceSaved();
      if (!id) return;
      const cases = await api.cases();
      const open = cases.find((c) => c.status === 'open');
      const name = stateRef.current.placeDetail?.name ?? 'Maps listing';
      const c = open ? await api.addToCase(open.id, [id]) : await api.createCase({ title: `${name} investigation`, scan_ids: [id] });
      set({ placeCase: c.id, apiCases: null });
    } catch (e) {
      set({ placesError: (e as Error).message.slice(0, 160) });
    } finally {
      set({ placeBusy: false });
    }
  }, [set, ensurePlaceSaved]);

  const saveWatchlist = useCallback(async () => {
    const { wlKeywords, wlSites } = stateRef.current;
    set({ wlSaving: true, wlError: null });
    try {
      const w = await api.saveWatchlist({ keywords: wlKeywords, sites: wlSites });
      set({ wl: w, wlKeywords: w.keywords.join('\n'), wlSites: w.sites.join('\n') });
    } catch (e) {
      set({ wlError: (e as Error).message.slice(0, 160) });
    } finally {
      set({ wlSaving: false });
    }
  }, [set]);

  // ---------- derived data (API when online, mock otherwise) ----------
  const s = state;
  const findings: FindingView[] = s.online ? (s.apiFindings ?? []) : findingsFromMock(s.now, s.live);
  const clusters: ClusterView[] = s.online ? (s.apiClusters ?? []) : MOCK_CLUSTERS;
  const caseList: CaseItem[] = s.online ? (s.apiCases ?? []) : MOCK_CASES;
  const caseDetail: CaseDetail | null = s.online
    ? (s.apiCase && s.apiCase.id === s.caseId ? s.apiCase : null)
    : (MOCK_CASES.find((c) => c.id === s.caseId) ?? null);

  return {
    state, set, runScan, openScan, toggleDemo, download, addToCase, uploadCsv, generateReport, exportCase, saveWatchlist, scanPlaces, openPlace, downloadPlace, addPlaceToCase,
    findings, clusters, caseList, caseDetail,
  };
}

export type Dashboard = ReturnType<typeof useDashboard>;
