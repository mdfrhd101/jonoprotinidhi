import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiFail, onAuthLost, refreshSession, setAccessToken, setActAs, readCookie } from './api';

/* Session state machine: loading -> anon | authed. Login is 3 steps: password -> (enrol TOTP) -> code. */

export type Membership = { tenantId: string; slug: string; seat: string; mpName: string; tenantStatus: string; role: 'owner' | 'editor' | 'officer'; scope: string[] };
export type Me = { user: { id: string; name: string; phone?: string; email?: string; platformRole: 'super_admin' | 'support' | null; mfaEnrolled: boolean }; memberships: Membership[] };

export type LoginStep =
  | { kind: 'password' }
  | { kind: 'enroll'; mfaToken: string }
  | { kind: 'code'; mfaToken: string }
  | { kind: 'done' };

type Ctx = {
  status: 'loading' | 'anon' | 'authed';
  me: Me | null;
  reload: () => Promise<void>;
  startLogin: (identifier: string, password: string) => Promise<LoginStep>;
  completeLogin: (mfaToken: string, input: { code?: string; recoveryCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
};
const C = createContext<Ctx | null>(null);
export const useSession = () => { const v = useContext(C); if (!v) throw new Error('SessionProvider missing'); return v; };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Ctx['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const loadMe = useCallback(async () => {
    const m = await api<Me>('GET', '/auth/me');
    setMe(m); setStatus('authed');
  }, []);

  useEffect(() => {
    onAuthLost(() => { setMe(null); setStatus('anon'); });
    (async () => {
      try {
        if (readCookie('jn_csrf') && (await refreshSession())) await loadMe();
        else setStatus('anon');
      } catch { setStatus('anon'); }
    })();
    return () => onAuthLost(null);
  }, [loadMe]);

  const value = useMemo<Ctx>(() => ({
    status, me,
    reload: loadMe,
    async startLogin(identifier, password) {
      const r = await api<{ mfaRequired?: boolean; mfaEnrollRequired?: boolean; mfaToken: string; accessToken?: string }>('POST', '/auth/login', { identifier, password }, { auth: 'none' });
      if (r.accessToken) { setAccessToken(r.accessToken); await loadMe(); return { kind: 'done' }; } // server runs with MFA_REQUIRED=false (dev)
      return r.mfaEnrollRequired ? { kind: 'enroll', mfaToken: r.mfaToken } : { kind: 'code', mfaToken: r.mfaToken };
    },
    async completeLogin(mfaToken, input) {
      const r = await api<{ accessToken: string }>('POST', '/auth/mfa/totp', { mfaToken, ...input }, { auth: 'none' });
      setAccessToken(r.accessToken);
      await loadMe();
    },
    async logout() {
      try { await api('POST', '/auth/logout', {}); } catch (e) { if (!(e instanceof ApiFail)) throw e; }
      setAccessToken(null); setActAs(null); setMe(null); setStatus('anon');
    },
  }), [status, me, loadMe]);

  return <C.Provider value={value}>{children}</C.Provider>;
}
