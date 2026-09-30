/* Server-side settings (read at request time, never sent to the browser except where noted). */
export const env = {
  /** Base URL of the Jonoshetu API as seen from this server. */
  apiUrl: (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/+$/, ''),
  /** Tenant host used when the site is opened on localhost/127.0.0.1 (developer machines). */
  tenantHost: process.env.TENANT_HOST || 'ndp3.jonoshetu.localhost',
  /** Public origin(s) that serve uploaded media (comma separated); defaults to the API origin. */
  mediaOrigins: (process.env.MEDIA_ORIGINS || process.env.API_URL || 'http://127.0.0.1:4000').split(',').map((s) => s.trim()).filter(Boolean),
  /** Allow-listed external image hosts; keep in sync with the API's MEDIA_HOSTS. */
  imageHosts: (process.env.MEDIA_HOSTS || 'upload.wikimedia.org,thumb.wikimedia.org,cdn.jonoshetu.example').split(',').map((s) => s.trim()).filter(Boolean),
  /** Cloudflare Turnstile site key (public by design). Empty in development: the API accepts any token there. */
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
  /** Trust X-Forwarded-Host from a reverse proxy in front of this server. */
  trustProxy: process.env.TRUST_PROXY === '1',
};
