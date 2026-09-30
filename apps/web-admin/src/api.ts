/* API client. The access token lives in memory only (never localStorage). The refresh token is an httpOnly cookie the
   browser sends by itself; refreshing also needs the readable double-submit CSRF cookie in an X-CSRF header. */

export class ApiFail extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiFail';
  }
  /** Field errors from a zod-flattened VALIDATION_FAILED response, if any. */
  get fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return d?.fieldErrors ?? {};
  }
}

type State = { access: string | null; actAs: { tenantId: string; token: string; expiresAt: number } | null; onAuthLost: (() => void) | null };
const state: State = { access: null, actAs: null, onAuthLost: null };

export const setAccessToken = (t: string | null) => { state.access = t; };
export const getAccessToken = () => state.access;
export const setActAs = (a: { tenantId: string; token: string; expiresAt: number } | null) => { state.actAs = a; };
export const getActAs = () => state.actAs;
export const onAuthLost = (fn: (() => void) | null) => { state.onAuthLost = fn; };

export function readCookie(name: string): string {
  const m = document.cookie.split('; ').find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}

let refreshing: Promise<boolean> | null = null;
/** Single-flight: many parallel 401s trigger one refresh. Returns false when the session is really gone. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const csrf = readCookie('jn_csrf');
        if (!csrf) return false;
        const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'X-CSRF': csrf } });
        if (!r.ok) return false;
        const j = (await r.json()) as { accessToken: string };
        state.access = j.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

export type Opts = { auth?: 'access' | 'none'; tenantId?: string; blob?: boolean; retried?: boolean };

/** The bearer token for a request: the act-as token when a Super Admin is acting in this tenant, else the user's own. */
function bearerFor(tenantId?: string): string | null {
  const useAct = state.actAs && tenantId === state.actAs.tenantId && state.actAs.expiresAt > Date.now();
  return useAct ? state.actAs!.token : state.access;
}

export async function api<T = any>(method: string, path: string, body?: unknown, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const isFile = typeof Blob !== 'undefined' && body instanceof Blob; // uploads send the raw file
  if (body !== undefined) headers['Content-Type'] = isFile ? (body as Blob).type : 'application/json';
  if (opts.auth !== 'none') {
    const tok = bearerFor(opts.tenantId);
    if (tok) headers.Authorization = `Bearer ${tok}`;
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, credentials: 'include', body: body === undefined ? undefined : isFile ? (body as Blob) : JSON.stringify(body) });
  } catch {
    throw new ApiFail(0, 'NETWORK', 'ইন্টারনেট সংযোগ নেই বা সার্ভার পাওয়া যাচ্ছে না');
  }
  if (res.status === 401 && opts.auth !== 'none' && !opts.retried) {
    if (await refreshSession()) return api<T>(method, path, body, { ...opts, retried: true });
    state.access = null; state.actAs = null;
    state.onAuthLost?.();
    throw new ApiFail(401, 'UNAUTHORIZED', 'সেশন শেষ হয়েছে, আবার লগইন করুন');
  }
  if (res.status === 204) return undefined as T;
  if (opts.blob && res.ok) return (await res.blob()) as unknown as T;
  let json: any = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiFail(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'কিছু ভুল হয়েছে', json?.error?.details);
  return json as T;
}

export type UploadProgress = (loaded: number, total: number) => void;

/** Raw file upload with real progress (XMLHttpRequest `upload.onprogress`; fetch cannot report upload progress).
    Same auth as `api()`: bearer (or act-as) token, one silent refresh + retry on 401, ApiFail on errors.
    Pass an AbortSignal to cancel; a cancelled upload rejects with code ABORTED. */
export function uploadWithProgress<T = any>(path: string, file: Blob, opts: { tenantId?: string; onProgress?: UploadProgress; signal?: AbortSignal; retried?: boolean } = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => new ApiFail(0, 'ABORTED', 'আপলোড বাতিল করা হয়েছে');
    if (opts.signal?.aborted) { reject(aborted()); return; }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/v1${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    const tok = bearerFor(opts.tenantId);
    if (tok) xhr.setRequestHeader('Authorization', `Bearer ${tok}`);
    const onAbort = () => xhr.abort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => opts.signal?.removeEventListener('abort', onAbort);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total); };
    xhr.onabort = () => { done(); reject(aborted()); };
    xhr.onerror = () => { done(); reject(new ApiFail(0, 'NETWORK', 'ইন্টারনেট সংযোগ নেই বা সার্ভার পাওয়া যাচ্ছে না')); };
    xhr.onload = async () => {
      done();
      if (xhr.status === 401 && !opts.retried) {
        if (await refreshSession()) { uploadWithProgress<T>(path, file, { ...opts, retried: true }).then(resolve, reject); return; }
        state.access = null; state.actAs = null;
        state.onAuthLost?.();
        reject(new ApiFail(401, 'UNAUTHORIZED', 'সেশন শেষ হয়েছে, আবার লগইন করুন'));
        return;
      }
      let json: any = null;
      try { json = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) { opts.onProgress?.(file.size, file.size); resolve(json as T); return; }
      if (xhr.status === 413) { reject(new ApiFail(413, 'FILE_TOO_LARGE', 'ফাইলটি অনেক বড়')); return; }
      reject(new ApiFail(xhr.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'আপলোড হয়নি, আবার চেষ্টা করুন', json?.error?.details));
    };
    xhr.send(file);
  });
}

/** Helpers bound to one tenant's admin API. */
export const tenantApi = (tenantId: string) => {
  const base = `/admin/tenants/${tenantId}`;
  const o = { tenantId };
  return {
    get: <T = any>(p: string) => api<T>('GET', base + p, undefined, o),
    post: <T = any>(p: string, b?: unknown) => api<T>('POST', base + p, b ?? {}, o),
    patch: <T = any>(p: string, b: unknown) => api<T>('PATCH', base + p, b, o),
    put: <T = any>(p: string, b: unknown) => api<T>('PUT', base + p, b, o),
    del: <T = any>(p: string) => api<T>('DELETE', base + p, undefined, o),
    /** Raw file upload (the Content-Type is the file's own type). */
    upload: <T = any>(p: string, file: Blob) => api<T>('POST', base + p, file, o),
    /** Raw file upload with a progress callback (see uploadWithProgress). */
    uploadProgress: <T = any>(p: string, file: Blob, onProgress?: UploadProgress, signal?: AbortSignal) => uploadWithProgress<T>(base + p, file, { tenantId, onProgress, signal }),
    blob: (p: string) => api<Blob>('GET', base + p, undefined, { ...o, blob: true }),
  };
};
export type TenantApi = ReturnType<typeof tenantApi>;

/** Platform (super admin) API: no tenant in the path. */
export const papi = {
  get: <T = any>(p: string) => api<T>('GET', p),
  post: <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {}),
};
