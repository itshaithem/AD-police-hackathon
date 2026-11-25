// Netlify Function (lite mode): POST /api/scan {url}. Same scanner as the Vercel function.
import { runScan } from '../../api/_lib/scan.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default async (req) => {
  if (req.method !== 'POST') return json(405, { detail: 'Use POST' });
  let body;
  try { body = await req.json(); } catch { return json(400, { detail: 'Invalid JSON' }); }
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url || url.length > 2048) return json(400, { detail: 'Missing url' });
  const r = await runScan(url);
  return json(r.status, r.body);
};

export const config = { path: '/api/scan' };
