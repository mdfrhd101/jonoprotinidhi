import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiFail, refreshSession, setAccessToken, getAccessToken, setActAs, onAuthLost, tenantApi, readCookie } from './api';

const json = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;
const calls = () => fetchMock.mock.calls.map(([u, o]) => ({ url: String(u), method: (o as RequestInit)?.method, headers: (o as RequestInit)?.headers as Record<string, string>, body: (o as RequestInit)?.body }));

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken(null); setActAs(null); onAuthLost(null);
  await new Promise((r) => setTimeout(r, 5)); // let a previous test's single-flight slot clear
});
afterEach(() => { vi.unstubAllGlobals(); document.cookie = 'jn_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

describe('api client', () => {
  it('sends the bearer token and JSON body, returns parsed JSON', async () => {
    setAccessToken('tok-1');
    fetchMock.mockResolvedValueOnce(json(200, { ok: 1 }));
    expect(await api('POST', '/x', { a: 1 })).toEqual({ ok: 1 });
    const c = calls()[0]!;
    expect(c.url).toBe('/api/v1/x'); expect(c.headers.Authorization).toBe('Bearer tok-1'); expect(c.headers['Content-Type']).toBe('application/json'); expect(c.body).toBe('{"a":1}');
  });

  it('does not send credentials-less requests with an Authorization header when auth is "none"', async () => {
    setAccessToken('tok-1'); fetchMock.mockResolvedValueOnce(json(200, {}));
    await api('POST', '/auth/login', {}, { auth: 'none' });
    expect(calls()[0]!.headers.Authorization).toBeUndefined();
  });

  it('maps API errors to ApiFail with code, message and field errors', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: { code: 'VALIDATION_FAILED', message: 'ইনপুট সঠিক নয়', details: { fieldErrors: { title: ['খুব ছোট'] } } } }));
    const e = await api('POST', '/x', {}).catch((x) => x);
    expect(e).toBeInstanceOf(ApiFail); expect(e.status).toBe(400); expect(e.code).toBe('VALIDATION_FAILED'); expect(e.fieldErrors).toEqual({ title: ['খুব ছোট'] });
  });

  it('reports network failure as a friendly ApiFail(0)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('failed to fetch'));
    const e = await api('GET', '/x').catch((x) => x);
    expect(e).toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('204 resolves to undefined; non-JSON error bodies still produce an ApiFail', async () => {
    fetchMock.mockResolvedValueOnce(json(204));
    expect(await api('DELETE', '/x')).toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }));
    expect(await api('GET', '/x').catch((e) => e)).toMatchObject({ status: 502, code: 'ERROR' });
  });
});

describe('silent refresh (access token in memory, refresh cookie + CSRF header)', () => {
  it('on 401 refreshes once with the CSRF header, then retries the request with the new token', async () => {
    document.cookie = 'jn_csrf=csrf-abc; path=/';
    setAccessToken('old');
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
      .mockResolvedValueOnce(json(200, { accessToken: 'new' }))
      .mockResolvedValueOnce(json(200, { data: 1 }));
    expect(await api('GET', '/thing')).toEqual({ data: 1 });
    const c = calls();
    expect(c[1]!.url).toBe('/api/v1/auth/refresh'); expect(c[1]!.headers['X-CSRF']).toBe('csrf-abc');
    expect(c[2]!.headers.Authorization).toBe('Bearer new'); expect(getAccessToken()).toBe('new');
  });

  it('many parallel 401s share ONE refresh call (single flight)', async () => {
    document.cookie = 'jn_csrf=c1; path=/'; setAccessToken('old');
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) { await new Promise((r) => setTimeout(r, 10)); return json(200, { accessToken: 'fresh' }); }
      const auth = (fetchMock.mock.calls.at(-1)?.[1] as RequestInit).headers as Record<string, string>;
      return auth.Authorization === 'Bearer fresh' ? json(200, { ok: true }) : json(401, {});
    });
    const out = await Promise.all([api('GET', '/a'), api('GET', '/b'), api('GET', '/c')]);
    expect(out).toHaveLength(3);
    expect(calls().filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('a failed refresh clears the token, notifies the app once, and throws 401 (no retry loop)', async () => {
    document.cookie = 'jn_csrf=c1; path=/'; setAccessToken('old');
    const lost = vi.fn(); onAuthLost(lost);
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, {}));
    const e = await api('GET', '/x').catch((x) => x);
    expect(e).toMatchObject({ status: 401 }); expect(getAccessToken()).toBeNull(); expect(lost).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + one refresh, nothing more
  });

  it('never tries to refresh without the CSRF cookie, and never for auth:none calls', async () => {
    expect(await refreshSession()).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 5));
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'ভুল তথ্য' } }));
    const e = await api('POST', '/auth/login', {}, { auth: 'none' }).catch((x) => x);
    expect(e).toMatchObject({ status: 401, message: 'ভুল তথ্য' }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('readCookie decodes values and returns empty for missing cookies', () => {
    document.cookie = 'foo=a%20b; path=/';
    expect(readCookie('foo')).toBe('a b'); expect(readCookie('nope')).toBe('');
  });
});

describe('act-as token routing', () => {
  it('is used only for its own tenant and only until it expires', async () => {
    setAccessToken('normal');
    setActAs({ tenantId: 'T1', token: 'act-token', expiresAt: Date.now() + 60_000 });
    fetchMock.mockResolvedValue(json(200, {}));
    await tenantApi('T1').get('/posts'); await tenantApi('T2').get('/posts'); await api('GET', '/auth/me');
    const h = calls().map((c) => c.headers.Authorization);
    expect(h).toEqual(['Bearer act-token', 'Bearer normal', 'Bearer normal']);
    setActAs({ tenantId: 'T1', token: 'act-token', expiresAt: Date.now() - 1 });
    await tenantApi('T1').get('/posts');
    expect(calls().at(-1)!.headers.Authorization).toBe('Bearer normal');
  });

  it('tenantApi builds the admin paths and verbs', async () => {
    setAccessToken('t'); fetchMock.mockResolvedValue(json(200, {}));
    const t = tenantApi('abc');
    await t.get('/x'); await t.post('/x', { a: 1 }); await t.patch('/x', { a: 1 }); await t.put('/x', { a: 1 }); await t.del('/x');
    expect(calls().map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/v1/admin/tenants/abc/x', 'POST /api/v1/admin/tenants/abc/x', 'PATCH /api/v1/admin/tenants/abc/x', 'PUT /api/v1/admin/tenants/abc/x', 'DELETE /api/v1/admin/tenants/abc/x']);
  });
});

/* uploadWithProgress (XMLHttpRequest, because fetch cannot report upload progress) */
class FakeXHR {
  static all: FakeXHR[] = [];
  static script: Array<{ status: number; body: unknown }> = [];
  method = ''; url = ''; headers: Record<string, string> = {}; sent: unknown = null; withCredentials = false;
  status = 0; responseText = '';
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null;
  constructor() { FakeXHR.all.push(this); }
  open(m: string, u: string) { this.method = m; this.url = u; }
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  abort() { this.onabort?.(); }
  send(b: unknown) {
    this.sent = b;
    const next = FakeXHR.script.shift();
    if (!next) return; // left pending (tests abort it)
    setTimeout(() => { this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 }); this.status = next.status; this.responseText = JSON.stringify(next.body); this.onload?.(); }, 0);
  }
}

describe('uploadWithProgress', () => {
  beforeEach(() => { FakeXHR.all = []; FakeXHR.script = []; vi.stubGlobal('XMLHttpRequest', FakeXHR); });

  it('posts the raw file with its type and the bearer token, reports progress and returns the JSON', async () => {
    setAccessToken('tok-9');
    FakeXHR.script.push({ status: 201, body: { id: 'v1', url: '/m/v1.webm' } });
    const seen: number[] = [];
    const file = new File(['0123456789'], 'a.webm', { type: 'video/webm' });
    const r = await tenantApi('T1').uploadProgress('/media/video?name=a.webm', file, (l, t) => seen.push(l / t));
    expect(r).toEqual({ id: 'v1', url: '/m/v1.webm' });
    const x = FakeXHR.all[0]!;
    expect(x.method).toBe('POST'); expect(x.url).toBe('/api/v1/admin/tenants/T1/media/video?name=a.webm');
    expect(x.headers['Content-Type']).toBe('video/webm'); expect(x.headers.Authorization).toBe('Bearer tok-9'); expect(x.withCredentials).toBe(true);
    expect(x.sent).toBe(file);
    expect(seen).toEqual([0.5, 1]);
  });

  it('refreshes once on 401 and retries; maps API errors to ApiFail; abort rejects with ABORTED', async () => {
    document.cookie = 'jn_csrf=c1; path=/';
    setAccessToken('old');
    fetchMock.mockResolvedValueOnce(json(200, { accessToken: 'new' }));
    FakeXHR.script.push({ status: 401, body: {} }, { status: 201, body: { ok: 1 } });
    expect(await tenantApi('T1').uploadProgress('/media', new Blob(['x'], { type: 'image/png' }))).toEqual({ ok: 1 });
    expect(FakeXHR.all[1]!.headers.Authorization).toBe('Bearer new');

    FakeXHR.script.push({ status: 422, body: { error: { code: 'FILE_TOO_LARGE', message: 'ভিডিও সর্বোচ্চ ১৫০ মেগাবাইট' } } });
    const e = await tenantApi('T1').uploadProgress('/media/video', new Blob(['x'], { type: 'video/mp4' })).catch((x) => x);
    expect(e).toBeInstanceOf(ApiFail); expect(e).toMatchObject({ status: 422, code: 'FILE_TOO_LARGE' });

    const ac = new AbortController();
    const p = tenantApi('T1').uploadProgress('/media/video', new Blob(['x'], { type: 'video/mp4' }), undefined, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
