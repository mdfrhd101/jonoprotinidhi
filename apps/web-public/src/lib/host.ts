/* Which tenant does this request belong to? The public API selects the tenant by Host header.
   In production the incoming Host (the MP's own domain or <slug>.jonoshetu.com) is forwarded as-is. On a developer
   machine the site is opened on localhost / 127.0.0.1, which is not a tenant host, so we fall back to TENANT_HOST. */

const LOCAL = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/** Lower-cased host name without port, or '' when it is not a syntactically valid host name. */
export function normaliseHost(raw: string | null | undefined): string {
  let h = String(raw ?? '').trim().toLowerCase();
  if (!h) return '';
  if (h.includes(',')) h = h.split(',')[0]!.trim(); // a proxy chain: the first value is the client-facing host
  if (h.startsWith('[')) { const end = h.indexOf(']'); return end > 0 ? h.slice(0, end + 1) : ''; } // IPv6 literal
  h = h.replace(/:\d+$/, '').replace(/\.$/, '');
  if (h.length > 253 || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(h)) return '';
  return h;
}

export const isLocalHost = (host: string): boolean => LOCAL.has(host) || /^127\.\d+\.\d+\.\d+$/.test(host);

/** The tenant host to send to the API: the request's own host unless it is a local/invalid one, then the fallback. */
export function resolveTenantHost(requestHost: string | null | undefined, fallback: string): string {
  const h = normaliseHost(requestHost);
  if (!h || isLocalHost(h)) return normaliseHost(fallback) || fallback;
  return h;
}
