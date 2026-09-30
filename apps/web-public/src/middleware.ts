import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from './lib/csp';
import { env } from './lib/env';

/* A fresh CSP nonce per request. Next.js reads the nonce from the request's Content-Security-Policy header and puts it
   on its own inline scripts; our layout reads `x-nonce` for the one tiny inline script it has. */
export function middleware(req: NextRequest) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV !== 'production', mediaOrigins: env.mediaOrigins, imageHosts: env.imageHosts, turnstile: !!env.turnstileSiteKey });

  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }] }],
};
