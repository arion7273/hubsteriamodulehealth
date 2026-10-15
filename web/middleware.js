/**
 * Vercel Edge: proxy scan API to a Playwright host so the static UI can use same-origin /api.
 * Set SCANNER_API_ORIGIN on the Vercel project (e.g. https://your-app.up.railway.app).
 */
export const config = {
  matcher: ['/api/:path*', '/evidence/:path*', '/fixtures/:path*'],
};

export default async function middleware(request) {
  const origin = process.env.SCANNER_API_ORIGIN?.replace(/\/$/, '');
  if (!origin) {
    return new Response(
      JSON.stringify({
        ok: false,
        service: 'hubsteriamodulehealth',
        error: 'SCANNER_API_ORIGIN is not set on this Vercel project',
        hint: 'Deploy the Dockerfile (Railway/Render/Fly) and set SCANNER_API_ORIGIN to that URL, then redeploy.',
      }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }

  const url = new URL(request.url);
  const target = `${origin}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete('host');

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  return fetch(target, init);
}
