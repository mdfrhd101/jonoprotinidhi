/* Content-Security-Policy for the public site, built per request with a fresh nonce (see middleware.ts). */

export type CspInput = {
  nonce: string;
  dev: boolean;
  /** origins that serve uploaded images/videos (the API), e.g. "http://127.0.0.1:4000" */
  mediaOrigins: string[];
  /** extra allow-listed image hosts (same list as the API's MEDIA_HOSTS) */
  imageHosts: string[];
  turnstile: boolean;
};

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/** "http://127.0.0.1:4000/api" -> "http://127.0.0.1:4000"; '' for anything that is not an http(s) URL. */
export function originOf(url: string): string {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : ''; } catch { return ''; }
}

export function buildCsp(i: CspInput): string {
  const hosts = uniq(i.imageHosts.map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+$/.test(h)).map((h) => `https://${h}`));
  const media = uniq(i.mediaOrigins.map(originOf));
  const cf = 'https://challenges.cloudflare.com';
  const d: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${i.nonce}'`, "'strict-dynamic'", ...(i.dev ? ["'unsafe-eval'"] : []), ...(i.turnstile ? [cf] : [])],
    // style attributes (progress widths, accent colours) need 'unsafe-inline'; no external stylesheets
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://i.ytimg.com', ...hosts, ...media],
    'media-src': ["'self'", 'blob:', ...media],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...(i.dev ? ['ws:', 'wss:'] : []), ...(i.turnstile ? [cf] : [])],
    'frame-src': ['https://www.youtube-nocookie.com', ...(i.turnstile ? [cf] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
  };
  const out = Object.entries(d).map(([k, v]) => `${k} ${uniq(v).join(' ')}`);
  // only when every media origin is https (a local production build still talks to http://127.0.0.1:4000)
  if (!i.dev && media.every((o) => o.startsWith('https:'))) out.push('upgrade-insecure-requests');
  return out.join('; ');
}
