import type { Config } from '../config.js';

/* Public URL of an uploaded image, and the check that a URL really is one of THIS tenant's uploads. */

const prefix = (cfg: Config, tenantId: unknown) => `${cfg.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/v1/public/media/${String(tenantId)}/`;

export const mediaUrl = (cfg: Config, tenantId: unknown, assetId: unknown, ext: 'webp' | 'mp4' | 'webm' = 'webp') => `${prefix(cfg, tenantId)}${String(assetId)}.${ext}`;

export function isOwnMediaUrl(cfg: Config, tenantId: unknown, url: string): boolean {
  const p = prefix(cfg, tenantId);
  return url.startsWith(p) && /^[a-f0-9]{24}\.webp$/.test(url.slice(p.length));
}

/** A post/banner image is acceptable when it is an upload of this tenant, or on an allow-listed external host. */
export function mediaUrlAllowed(cfg: Config, tenantId: unknown, url: string): boolean {
  if (isOwnMediaUrl(cfg, tenantId, url)) return true;
  try { return cfg.mediaHosts.includes(new URL(url).hostname.toLowerCase()); } catch { return false; }
}
