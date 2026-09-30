import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { apiHeaders, tenantHost } from '@/lib/api';

/* Same-origin proxy for the few public API calls the browser makes (complaint form, OTP, tracking), so the browser
   never needs CORS and the tenant is chosen by this site's host. Only an explicit allow-list is forwarded. */

export const dynamic = 'force-dynamic';

const GET_OK = [/^complaint-form$/, /^complaint-stats$/, /^complaints\/[A-Za-z0-9-]{3,40}$/];
const POST_OK = [/^complaints$/, /^otp\/send$/, /^otp\/verify$/];
const MAX_BODY = 16 * 1024;

function clientIp(req: NextRequest): string {
  // the right-most X-Forwarded-For entry was added by the hop directly in front of us (our proxy / Next itself);
  // entries further left are client-supplied and could be spoofed
  const xff = req.headers.get('x-forwarded-for');
  const last = xff?.split(',').map((s) => s.trim()).filter(Boolean).pop();
  return last || req.ip || '';
}

const deny = () => NextResponse.json({ error: { code: 'NOT_FOUND', message: 'পাওয়া যায়নি' } }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

async function forward(req: NextRequest, path: string, method: 'GET' | 'POST', body?: string) {
  const extra: Record<string, string> = {};
  const ip = clientIp(req);
  if (ip) extra['x-forwarded-for'] = ip;
  if (body !== undefined) extra['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}/api/v1/public/${path}`, { method, headers: apiHeaders(tenantHost(), extra), body, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  } catch {
    return NextResponse.json({ error: { code: 'API_UNREACHABLE', message: 'সার্ভারের সঙ্গে যোগাযোগ করা যাচ্ছে না, একটু পরে আবার চেষ্টা করুন' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const text = await res.text();
  const out = new NextResponse(text || null, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' } });
  const ra = res.headers.get('retry-after');
  if (ra) out.headers.set('Retry-After', ra);
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
  const body = await req.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: { code: 'TOO_LARGE', message: 'লেখা অনেক বড় হয়ে গেছে' } }, { status: 413 });
  return forward(req, path, 'POST', body);
}
