// Netlify Function (lite mode): tells the dashboard that live scanning is available.
export default async () => new Response(
  JSON.stringify({ backend: 'ok', mode: 'lite', llm: process.env.ANTHROPIC_API_KEY ? 'ok' : 'down' }),
  { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
);

export const config = { path: '/api/health' };
