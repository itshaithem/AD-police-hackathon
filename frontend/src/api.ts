// API client for the ScamShield backend (BUILD.md section 10).
// Configure with VITE_API_URL / VITE_API_KEY at build time, or window.SCAMSHIELD_API / SCAMSHIELD_KEY at runtime.
// VITE_API_URL=proxy (Vercel): requests go through the /api/proxy function, which adds the key server-side,
// so no key is shipped to the browser.

declare global {
  interface Window { SCAMSHIELD_API?: string; SCAMSHIELD_KEY?: string }
}

const BASE = (window.SCAMSHIELD_API || import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const PROXY = BASE === 'proxy';
const LITE = BASE === 'lite'; // Vercel-only deployment: /api/scan and /api/health on the same origin
const KEY = PROXY || LITE ? '' : window.SCAMSHIELD_KEY || import.meta.env.VITE_API_KEY || 'change-me';

/** Full URL for a backend path (which may carry its own query string). */
const urlFor = (path: string) => (PROXY ? `/api/proxy?path=${encodeURIComponent(path)}` : LITE ? (path === '/health' ? '/api/health' : path) : BASE + path);

export interface Reason { id: string; weight: number; reason_en: string; reason_ar: string }
export interface Screenshot { index: number; label: string; url: string; path: string }
export interface ApiBrand { id: string; name?: { en: string; ar: string }; official_domain?: string }
export interface ApiScan {
  id: string; url: string; final_url: string; domain: string; score: number;
  verdict: 'scam' | 'suspicious' | 'safe' | 'not_found' | 'blocked'; brand: ApiBrand | null; source: string;
  site_status?: 'online' | 'offline' | 'not_registered' | 'blocked' | 'unchecked';
  reasons: Reason[]; redirect_chain: string[];
  intel: {
    whois?: { created?: string; age_days?: number; registrar?: string; abuse_email?: string; error?: string };
    hosting?: { ip?: string; country?: string; asn?: number; org?: string };
    tls?: { issuer?: string; not_before?: string; cert_age_days?: number };
  };
  content?: { asks_for: string[]; phones: string[]; language: string };
  visual?: { best_brand?: string | null; similarity?: number };
  llm?: { intent?: string; summary_en?: string; summary_ar?: string; error?: string } | null;
  screenshots: Screenshot[];
  evidence_manifest: { file: string; sha256: string }[];
  sandbox_error?: string | null;
  created_at: string; completed_at: string;
}
export type ApiScanSummary = Pick<ApiScan, 'id' | 'url' | 'final_url' | 'domain' | 'score' | 'verdict' | 'brand' | 'source' | 'created_at'>;
export interface ApiDiscovery {
  id: string; source: string; kind: 'domain' | 'url' | 'listing'; item: string; brand: string | null;
  detected_at: string; scan_id: string | null; score: number | null; verdict: string | null;
  meta: { name?: string; phone?: string; website?: string; listing_score?: number; [k: string]: unknown };
}
export interface ApiStats { found_today: number; high_risk: number; brands_targeted: number; scans_total: number; by_source: Record<string, number> }
export interface ApiIndicator { type: string; label: string; value: string; domains: number }
export interface ApiCluster {
  id: string; domains: { name: string; score: number; scan_id: string }[]; scan_ids: string[];
  shared_indicators: ApiIndicator[]; max_score: number; brand: string | null;
}
export interface ApiGraph { nodes: unknown[]; edges: unknown[]; clusters: ApiCluster[] }
export type ApiCaseStatus = 'open' | 'sent_for_takedown' | 'closed';
export interface ApiCase {
  id: string; title: string; status: ApiCaseStatus; created_at: string; scan_ids: string[]; cluster_id: string | null;
  domain_count: number; max_score: number;
  summary_en?: string; summary_ar?: string; scans?: ApiScanSummary[]; shared_indicators?: ApiIndicator[];
  evidence?: { screenshots: number; whois_records: number; registrars: string[]; hosting: string[]; first_seen: string | null; files: number };
  redirect_chain?: string[];
}
export interface ApiJob { id: string; status: 'running' | 'done' | 'error'; total: number; done: number }
export interface ApiHealth { backend: string; sandbox?: string; llm: string; visual?: string; discovery?: string; mode?: 'lite' }

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const r = await fetch(urlFor(path), {
    ...opts,
    headers: { ...(KEY ? { 'X-API-Key': KEY } : {}), ...(opts.body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  health: async (): Promise<ApiHealth> => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(urlFor('/health'), { signal: ctl.signal });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    } finally { clearTimeout(t); }
  },
  scan: (url: string, agent = false) => req<ApiScan>('/api/scan', { method: 'POST', body: JSON.stringify({ url, agent }) }),
  scanById: (id: string) => req<ApiScan>(`/api/scans/${id}`),
  batch: (file: File) => { const f = new FormData(); f.append('file', file); return req<{ job_id: string; total: number }>('/api/scan/batch', { method: 'POST', body: f }); },
  job: (id: string) => req<ApiJob>(`/api/jobs/${id}`),
  discovery: (q = '') => req<ApiDiscovery[]>(`/api/discovery${q}`),
  runDiscovery: () => req<{ status: string }>('/api/discovery/run', { method: 'POST' }),
  stats: () => req<ApiStats>('/api/stats'),
  graph: () => req<ApiGraph>('/api/graph'),
  cases: () => req<ApiCase[]>('/api/cases'),
  caseById: (id: string) => req<ApiCase>(`/api/cases/${id}`),
  createCase: (body: { title: string; scan_ids: string[]; cluster_id?: string }) =>
    req<ApiCase>('/api/cases', { method: 'POST', body: JSON.stringify(body) }),
  addToCase: (id: string, scanIds: string[]) =>
    req<ApiCase>(`/api/cases/${id}`, { method: 'PATCH', body: JSON.stringify({ add_scan_ids: scanIds }) }),
  /** URL for <img> tags and downloads (backend also accepts ?key=). */
  file: (path: string) => (PROXY ? urlFor(path) : `${BASE}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(KEY)}`),
};
