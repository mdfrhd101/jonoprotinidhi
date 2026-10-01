import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { apiHeaders, tenantHost } from '@/lib/api';
import { visitorIp } from '@/lib/serverHeaders';
import { httpRequest, type HttpResult } from '@/lib/http';
import { bodyLimitFor, declaredTooLarge, readBodyCapped } from '@/lib/bodyLimit';

/* Same-origin proxy for the few public API calls the browser makes (complaint form, OTP, tracking), so the browser
   never needs CORS and the tenant is chosen by this site's host. Only an explicit allow-list is forwarded. */

export const dynamic = 'force-dynamic';

const GET_OK = [/^complaint-form$/, /^complaint-stats$/, /^complaints\/[A-Za-z0-9-]{3,40}$/];
const POST_OK = [/^complaints$/, /^otp\/send$/, /^otp\/verify$/];

const deny = () => NextResponse.json({ error: { code: 'NOT_FOUND', message: 'পাওয়া যায়নি' } }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

async function forward(req: NextRequest, path: string, method: 'GET' | 'POST', body?: string) {
  // only headers we build are sent: an incoming x-site-token / x-client-ip / x-forwarded-for is never copied through
  const ip = visitorIp(req.headers, req.ip);
  let res: HttpResult;
  try {
    res = await httpRequest(`${env.apiUrl}/api/v1/public/${path}`, { method, headers: apiHeaders(tenantHost(), ip, body !== undefined), body, timeoutMs: 25_000, maxBytes: 256 * 1024 });
  } catch {
    return NextResponse.json({ error: { code: 'API_UNREACHABLE', message: 'সার্ভারের সঙ্গে যোগাযোগ করা যাচ্ছে না, একটু পরে আবার চেষ্টা করুন' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const ct = res.headers['content-type'];
  const out = new NextResponse(res.text || null, { status: res.status, headers: { 'Content-Type': (Array.isArray(ct) ? ct[0] : ct) ?? 'application/json', 'Cache-Control': 'no-store' } });
  const ra = res.headers['retry-after'];
  if (typeof ra === 'string') out.headers.set('Retry-After', ra);
  return out;
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = (params.path ?? []).join('/');
  if (!GET_OK.some((r) => r.test(path))) return deny();
  return forward(req, path.split('/').map(encodeURIComponent).join('/'), 'GET');
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = (params.path ?? []).join('/');
  if (!POST_OK.some((r) => r.test(path))) return deny();
  // writes only from our own pages (the JSON content type already forces a CORS preflight; this is belt and braces)
  const origin = req.headers.get('origin');
  if (origin) { try { if (new URL(origin).host !== req.headers.get('host')) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'এই কাজের অনুমতি নেই' } }, { status: 403 }); } catch { return deny(); } }
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'অনুরোধটি সঠিক নয়' } }, { status: 415 });
  const max = bodyLimitFor(path);
  const tooLarge = () => NextResponse.json({ error: { code: 'TOO_LARGE', message: 'পাঠানো তথ্য অনেক বড় হয়ে গেছে। ছবি বা ফাইল কমিয়ে আবার চেষ্টা করুন।' } }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
  if (declaredTooLarge(req.headers.get('content-length'), max)) return tooLarge(); // before reading a single byte
  const body = await readBodyCapped(req.body, max);
  if (body === null) return tooLarge();
  return forward(req, path, 'POST', body);
}
