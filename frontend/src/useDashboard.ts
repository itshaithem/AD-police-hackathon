import { useCallback, useEffect, useRef, useState } from 'react';
import { FINDINGS, GENERIC_RESULT, LIVE_POOL, RESULTS, SCAN_STEPS, type Filter, type Finding, type Lang, type Screen } from './data';

export interface DashState {
  screen: Screen;
  lang: Lang;
  url: string;
  /** Domain whose result is shown, or null. */
  result: string | null;
  /** Current scan step index. */
  step: number;
  /** 0→1 eased progress of the score gauge animation. */
  anim: number;
  /** Number of reasons revealed so far. */
  shown: number;
  live: { row: Finding; at: number }[];
  now: number;
  demo: boolean;
  demoStep: number;
  scanning: boolean;
  added: boolean;
  downloaded: boolean;
  csvName: string | null;
  filter: Filter;
  cluster: string;
  caseId: string;
  exported: 'pdf' | 'json' | null;
  narrow: boolean;
}

const NARROW_BELOW = 760;
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < NARROW_BELOW;

/** Normalise user input to a bare domain: strip scheme, www and path. */
export const normalizeDomain = (u: string) =>
  u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');

export function useDashboard(initial?: { screen?: Screen; lang?: Lang }) {
  const [state, setFull] = useState<DashState>(() => ({
    screen: initial?.screen ?? 'scan', lang: initial?.lang ?? 'en',
    url: 'adcb-secure-login.com', result: 'adcb-secure-login.com',
    step: 0, anim: 1, shown: 99, live: [], now: Date.now(), demo: false, demoStep: 0,
    scanning: false, added: false, downloaded: false, csvName: null, filter: 'all', cluster: 'A', caseId: 'AD-2611', exported: null,
    narrow: isNarrow(),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const set = useCallback((patch: Partial<DashState> | ((s: DashState) => Partial<DashState>)) => {
    setFull((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  // Timer handles
  const t = useRef<{ si?: number; ri?: number; raf?: number; typer?: number; demo: number[] }>({ demo: [] });

  const stopScan = useCallback(() => {
    clearInterval(t.current.si); clearInterval(t.current.ri);
    if (t.current.raf) cancelAnimationFrame(t.current.raf);
  }, []);

  /** Animate score gauge, then reveal reasons one by one. */
  const animateResult = useCallback((domain: string) => {
    const r = RESULTS[domain] ?? GENERIC_RESULT, n = r.reasons.length, t0 = performance.now();
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

  const runScan = useCallback((input: string) => {
    const d = normalizeDomain(input);
    if (!d) return;
    stopScan();
    const N = SCAN_STEPS.length;
    set({ url: d, scanning: true, step: 0, result: null, added: false, downloaded: false, screen: 'scan' });
    let i = 0;
    t.current.si = window.setInterval(() => {
      i++;
      if (i >= N) {
        clearInterval(t.current.si);
        set({ scanning: false, result: d, step: N, anim: 0, shown: 0 });
        animateResult(d);
      } else set({ step: i });
    }, 430);
  }, [set, stopScan, animateResult]);

  const addLive = useCallback(() => {
    set((s) => {
      const n = s.live.length;
      if (n >= LIVE_POOL.length) return {};
      return { live: [{ row: LIVE_POOL[n], at: Date.now() }, ...s.live], now: Date.now() };
    });
  }, [set]);

  const stopDemo = useCallback((silent?: boolean) => {
    t.current.demo.forEach(clearTimeout);
    clearInterval(t.current.typer);
    t.current.demo = [];
    if (!silent) set({ demo: false });
  }, [set]);

  /** Scripted ~35s walkthrough of all four screens. */
  const startDemo = useCallback(() => {
    stopDemo(true); stopScan();
    const at = (ms: number, fn: () => void) => t.current.demo.push(window.setTimeout(fn, ms));
    const target = 'adcb-secure-login.com';
    set({ demo: true, demoStep: 0, screen: 'scan', url: '', result: null, scanning: false, live: [] });
    at(700, () => {
      let i = 0;
      t.current.typer = window.setInterval(() => {
        i++; set({ url: target.slice(0, i) });
        if (i >= target.length) { clearInterval(t.current.typer); at(350, () => runScan(target)); }
      }, 45);
    });
    at(11000, () => set({ screen: 'discovery', demoStep: 1, filter: 'all' }));
    at(12500, addLive); at(15000, addLive);
    at(18000, () => set({ screen: 'network', demoStep: 2, cluster: 'A' }));
    at(21500, () => set({ cluster: 'C' })); at(24500, () => set({ cluster: 'B' }));
    at(27500, () => set({ screen: 'reports', demoStep: 3, caseId: 'AD-2611', exported: null }));
    at(31500, () => set({ exported: 'pdf' }));
    at(35500, () => set({ demo: false }));
  }, [set, stopDemo, stopScan, runScan, addLive]);

  const toggleDemo = useCallback(() => (stateRef.current.demo ? stopDemo() : startDemo()), [startDemo, stopDemo]);

  // Resize, clock and live feed.
  useEffect(() => {
    const onResize = () => { const n = isNarrow(); if (n !== stateRef.current.narrow) set({ narrow: n }); };
    window.addEventListener('resize', onResize); onResize();
    const clock = window.setInterval(() => { if (stateRef.current.screen === 'discovery') set({ now: Date.now() }); }, 1000);
    const feed = window.setInterval(() => { const s = stateRef.current; if (s.screen === 'discovery' && !s.demo) addLive(); }, 8000);
    return () => {
      window.removeEventListener('resize', onResize); clearInterval(clock); clearInterval(feed);
      stopScan(); stopDemo(true);
    };
  }, [set, addLive, stopScan, stopDemo]);

  return { state, set, runScan, toggleDemo };
}

export type Dashboard = ReturnType<typeof useDashboard>;

/** Findings feed (live + seeded), newest first, with seconds since detection. */
export const feedOf = (s: DashState) => [
  ...s.live.map((l) => ({ row: l.row, sec: (s.now - l.at) / 1000 })),
  ...FINDINGS.map((f) => ({ row: f.row, sec: f.minutesAgo * 60 })),
];
