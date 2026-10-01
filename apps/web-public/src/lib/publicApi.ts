/* Where the browser sends its few public API calls (complaint, OTP, tracking).
   Normally the site's own same-origin proxy (app/api/public/[...path]), which picks the tenant from this site's host.
   A static export (GitHub Pages) has no server and so no proxy: NEXT_PUBLIC_API_ORIGIN is set at build time and the browser
   calls the API directly (CORS is allowed for that site's origin only, see PUBLIC_SITE_ORIGINS in the API). */
export function publicApiUrl(path: string, origin: string | undefined = process.env.NEXT_PUBLIC_API_ORIGIN): string {
  const base = (origin ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/api/v1/public/${path}` : `/api/public/${path}`;
}
