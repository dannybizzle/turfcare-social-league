// Cloudflare Pages Function: /api/nhl?date=YYYY-MM-DD
// Proxies the public NHL game-day scores endpoint from the server side.
// No API key is required and no credentials are exposed.
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || '';
  if (!/^20\d\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)) {
    return Response.json({ error: 'Use date=YYYY-MM-DD' }, { status: 400 });
  }
  const target = `https://api-web.nhle.com/v1/score/${date}`;
  try {
    const upstream = await fetch(target, {
      headers: { Accept: 'application/json' },
      cf: { cacheEverything: true, cacheTtl: 120 }
    });
    if (!upstream.ok) return Response.json({ error: 'NHL data temporarily unavailable' }, { status: 502 });
    const payload = await upstream.json();
    return Response.json({ games: Array.isArray(payload.games) ? payload.games : [] }, {
      headers: { 'Cache-Control': 'public, max-age=120' }
    });
  } catch (error) {
    console.error('NHL score proxy failed:', error);
    return Response.json({ error: 'NHL scores could not be retrieved' }, { status: 502 });
  }
}
