/* Links and media URLs typed in the CMS (banner buttons, notice bar, social links, images) are checked before they
   reach an href/src. Pure and browser-safe (no dependencies). */

/** A link from the CMS, or '' when it is not safe for href: http(s), mailto:, tel:, "#…" or a site path "/…" (not "//…"). */
export function safeHref(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim();
  if (!s || /[\u0000-\u001F\u007F]/.test(s) || /\s/.test(s)) return '';
  if (s.startsWith('/')) return s.startsWith('//') || s.startsWith('/\\') ? '' : s;
  if (s.startsWith('#')) return s;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!m) return '';
  const scheme = m[1]!.toLowerCase();
  if (scheme === 'mailto' || scheme === 'tel') return s;
  if (scheme === 'http' || scheme === 'https') { try { new URL(s); return s; } catch { return ''; } }
  return '';
}

export const isExternalHref = (href: string): boolean => /^https?:\/\//i.test(href);

/** An image/video URL for src: absolute http(s) only (the API allow-lists the hosts, the CSP enforces them again). */
export function safeMediaUrl(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; }
}
