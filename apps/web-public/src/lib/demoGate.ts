/* Private-demo gate for the public site (used by src/middleware.ts, runs in the Edge runtime: Web APIs only).

   SITE_BASIC_AUTH_USER + SITE_BASIC_AUTH_PASS  both set  -> every page needs HTTP Basic credentials
                                                neither   -> gate is off (normal public site)
                                                only one  -> misconfiguration: fail CLOSED (nobody gets in), never open
   NOINDEX=1                                    -> every response carries "X-Robots-Tag: noindex, nofollow"

   Removing the gate later = delete the two SITE_BASIC_AUTH_* variables in the host's dashboard (docs/10-DEPLOY-RENDER.md). */

export type GateEnv = { SITE_BASIC_AUTH_USER?: string; SITE_BASIC_AUTH_PASS?: string };
export type GateVerdict = 'off' | 'ok' | 'deny';

/** Liveness probe for the host platform: answers without credentials and touches no data. */
export const HEALTH_PATH = '/healthz';
export const GATE_REALM = 'Jonoprotinidhi demo';
export const NOINDEX_VALUE = 'noindex, nofollow';

const enc = new TextEncoder();

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Constant-time equality: both sides are hashed to 32 bytes first, so neither content nor length leaks through timing. */
export async function safeEqualStr(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/** "Authorization: Basic base64(user:pass)" -> { user, pass }; null for anything that is not a well-formed Basic header. */
export function parseBasicAuth(header: string | null | undefined): { user: string; pass: string } | null {
  const m = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header ?? '');
  if (!m) return null;
  let raw: string;
  try {
    const bin = atob(m[1]!);
    raw = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return null; }
  const i = raw.indexOf(':'); // the user name cannot contain ':', the password can
  return i < 0 ? null : { user: raw.slice(0, i), pass: raw.slice(i + 1) };
}

export async function checkGate(authorization: string | null | undefined, e: GateEnv): Promise<GateVerdict> {
  const user = e.SITE_BASIC_AUTH_USER ?? '', pass = e.SITE_BASIC_AUTH_PASS ?? '';
  if (!user && !pass) return 'off';
  if (!user || !pass) return 'deny'; // half-configured gate: closed, not open
  const got = parseBasicAuth(authorization);
  if (!got) return 'deny';
  // evaluate both comparisons so a wrong user name takes as long as a wrong password
  const [u, p] = await Promise.all([safeEqualStr(got.user, user), safeEqualStr(got.pass, pass)]);
  return u && p ? 'ok' : 'deny';
}

export const challengeHeaders = (): Record<string, string> => ({
  'WWW-Authenticate': `Basic realm="${GATE_REALM}", charset="UTF-8"`,
  'Cache-Control': 'no-store',
  'Content-Type': 'text/plain; charset=utf-8',
});
