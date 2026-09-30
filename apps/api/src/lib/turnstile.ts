/* Cloudflare Turnstile verification behind an interface. With no secret configured (dev/test) any non-empty
   token passes; production config requires the secret (see loadConfig). */

export interface Turnstile { verify(token: string | undefined, ip?: string): Promise<boolean> }

export class DevTurnstile implements Turnstile {
  async verify(token?: string) { return !!token && token !== 'fail'; }
}

export class CloudflareTurnstile implements Turnstile {
  constructor(private secret: string, private fetchImpl: typeof fetch = fetch) {}
  async verify(token?: string, ip?: string) {
    if (!token) return false;
    try {
      const body = new URLSearchParams({ secret: this.secret, response: token });
      if (ip) body.set('remoteip', ip);
      const r = await this.fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
      const j = (await r.json()) as { success?: boolean };
      return j.success === true;
    } catch {
      return false; // fail closed
    }
  }
}

export const createTurnstile = (secret: string): Turnstile => (secret ? new CloudflareTurnstile(secret) : new DevTurnstile());
