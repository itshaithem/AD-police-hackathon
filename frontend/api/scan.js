// Vercel Function (lite mode): POST /api/scan {url} -> scan result. Needs ANTHROPIC_API_KEY for the AI analyst.
import { runScan } from './_lib/scan.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json(405, { detail: 'Use POST' });
    let body;
    try { body = await request.json(); } catch { return json(400, { detail: 'Invalid JSON' }); }
    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!url || url.length > 2048) return json(400, { detail: 'Missing url' });
    const r = await runScan(url);
    return json(r.status, r.body);
  },
};
