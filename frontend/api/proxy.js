// Vercel Function: forwards dashboard requests to the ScamShield backend and adds the API key server-side,
// so the key never ships in the browser bundle.
//
// The dashboard calls  /api/proxy?path=<backend path + its own query, URL-encoded>
// Environment (Vercel project settings): BACKEND_URL (e.g. https://api.example.com), API_KEY.

export const config = { runtime: 'nodejs', maxDuration: 120 };

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PATCH']);
// Request headers worth forwarding; everything else (cookies, auth, client-supplied keys) is dropped.
const FORWARD_REQUEST_HEADERS = ['content-type', 'accept', 'accept-language'];
// Response headers that must not be copied: fetch() already decoded the body and the length may change.
const DROP_RESPONSE_HEADERS = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie'];

const json = (status, detail) =>
  new Response(JSON.stringify({ detail }), { status, headers: { 'content-type': 'application/json' } });

export function targetFor(requestUrl, backendUrl) {
  const raw = new URL(requestUrl).searchParams.get('path') || '';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  const pathname = path.split('?')[0];
  if (!(pathname === '/health' || pathname.startsWith('/api/'))) return null;
  if (pathname.includes('..') || pathname.includes('//') || pathname.includes('\\')) return null;
  const target = new URL(path, backendUrl);
  return target.origin === new URL(backendUrl).origin ? target : null;
}

export default {
  async fetch(request) {
    const backend = process.env.BACKEND_URL;
    const key = process.env.API_KEY;
    if (!backend || !key) return json(500, 'Proxy is not configured: set BACKEND_URL and API_KEY on Vercel.');
    if (!ALLOWED_METHODS.has(request.method)) return json(405, 'Method not allowed');

    const target = targetFor(request.url, backend);
    if (!target) return json(404, 'Unknown path');

    const headers = new Headers({ 'x-api-key': key });
    for (const h of FORWARD_REQUEST_HEADERS) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    const hasBody = !['GET', 'HEAD'].includes(request.method);

    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        duplex: hasBody ? 'half' : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(110_000),
      });
    } catch (e) {
      return json(502, `Backend unreachable: ${e.name}`);
    }

    const out = new Headers(upstream.headers);
    for (const h of DROP_RESPONSE_HEADERS) out.delete(h);
    out.set('cache-control', 'no-store');
    // Streamed, so large PDFs and screenshots are not held in memory or capped at 4.5 MB.
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
