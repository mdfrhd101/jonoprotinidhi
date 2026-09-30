/* Headers for server-to-API calls (pure, unit-tested; BUG-2026-020).
   - the tenant is chosen by Host (production) / X-Forwarded-Host (API outside production);
   - with the shared site token the API takes X-Client-IP as the visitor's IP for rate limits and abuse keys;
   - without a token we fall back to X-Forwarded-For (honoured by the API's one trusted proxy hop).
   Client-supplied x-site-token / x-client-ip are never copied from the incoming request: only these values are sent. */
import { isIP } from 'node:net';

export type ServerHeaderInput = { host: string; ip?: string; token?: string; json?: boolean };

export function serverHeaders({ host, ip, token, json }: ServerHeaderInput): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json', host, 'x-forwarded-host': host };
  if (json) h['content-type'] = 'application/json';
  const clientIp = ip && isIP(ip.replace(/^::ffff:(?=\d+\.)/, '')) ? ip.replace(/^::ffff:(?=\d+\.)/, '') : '';
  if (token) {
    h['x-site-token'] = token;
    if (clientIp) h['x-client-ip'] = clientIp;
  } else if (clientIp) {
    h['x-forwarded-for'] = clientIp;
  }
  return h;
}

/** The visitor's IP as seen by the hop in front of us: right-most X-Forwarded-For entry (entries further left are
    client-supplied and could be spoofed), then X-Real-IP, then the socket address Next gives us. */
export function visitorIp(h: { get(name: string): string | null }, socketIp?: string): string {
  const last = h.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).pop();
  return last || h.get('x-real-ip')?.trim() || socketIp || '';
}
