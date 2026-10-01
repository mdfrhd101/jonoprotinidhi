import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from './lib/csp';
import { env } from './lib/env';
import { HEALTH_PATH, NOINDEX_VALUE, challengeHeaders, checkGate } from './lib/demoGate';

/* 1. Private-demo gate (optional, see lib/demoGate.ts): HTTP Basic auth when SITE_BASIC_AUTH_USER/PASS are set, and
      "X-Robots-Tag: noindex" when NOINDEX=1. Both are read per request, so changing them needs a restart, not a rebuild.
   2. A fresh CSP nonce per request. Next.js reads the nonce from the request's Content-Security-Policy header and puts it
      on its own inline scripts; our layout reads `x-nonce` for the one tiny inline script it has. */
export async function middleware(req: NextRequest) {
  const noindex = process.env.NOINDEX === '1';
  const mark = <T extends NextResponse>(res: T): T => { if (noindex) res.headers.set('X-Robots-Tag', NOINDEX_VALUE); return res; };

  if (req.nextUrl.pathname === HEALTH_PATH) return mark(NextResponse.next());

  const verdict = await checkGate(req.headers.get('authorization'), { SITE_BASIC_AUTH_USER: process.env.SITE_BASIC_AUTH_USER, SITE_BASIC_AUTH_PASS: process.env.SITE_BASIC_AUTH_PASS });
  if (verdict === 'deny') return mark(new NextResponse('Authentication required', { status: 401, headers: challengeHeaders() }));

  // Router prefetches carry no HTML, so they never needed a CSP nonce; but they DO return page data, so they must pass the gate above.
  if (req.headers.has('next-router-prefetch') || req.headers.get('purpose') === 'prefetch') return mark(NextResponse.next());

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV !== 'production', mediaOrigins: env.mediaOrigins, imageHosts: env.imageHosts, turnstile: !!env.turnstileSiteKey });

  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return mark(res);
}

// Everything except build assets runs through the middleware (prefetches included: they are handled inside, above).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
