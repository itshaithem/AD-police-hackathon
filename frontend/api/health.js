// Vercel Function (lite mode): tells the dashboard that live scanning is available here.
export const config = { runtime: 'nodejs' };

export default {
  fetch() {
    return new Response(JSON.stringify({ backend: 'ok', mode: 'lite', llm: process.env.ANTHROPIC_API_KEY ? 'ok' : 'down' }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  },
};
