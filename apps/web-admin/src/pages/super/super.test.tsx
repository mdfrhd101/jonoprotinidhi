import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ApiFail } from '../../api';
import { renderApp } from '../../test/utils';
import type { SuperDash, TenantRow } from './shared';

/* Super Admin screens: dashboard, tenant list filtering, the new-tenant wizard (consent required), the domain verify flow,
   act-as and the audit diff. The session and the platform API are fakes; no network. */

const h = vi.hoisted(() => ({ session: { me: null as unknown, status: 'authed', logout: vi.fn(), reload: vi.fn() } }));
vi.mock('../../session', () => ({ useSession: () => h.session, SessionProvider: ({ children }: { children: unknown }) => children }));
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), setActAs: vi.fn() }));
vi.mock('../../api', async (orig) => ({ ...(await orig<typeof import('../../api')>()), papi: { get: m.get, post: m.post }, setActAs: m.setActAs }));

import { SuperDashboard, attentionText } from './Dashboard';
import { TenantsList, filterTenants } from './Tenants';
import { NewTenant, validateStep, EMPTY_FORM, toBody } from './NewTenant';
import { TenantDetail } from './TenantDetail';
import { SuperAudit, diffRows } from './Audit';

const asRole = (platformRole: 'super_admin' | 'support') => { h.session.me = { user: { id: 'u1', name: 'রুট অ্যাডমিন', platformRole, mfaEnrolled: true }, memberships: [] }; };
const route = (map: Record<string, unknown>) => (path: string) => {
  const key = Object.keys(map).find((k) => path === k || path.startsWith(k + '?'));
  const v = key ? map[key] : undefined;
  if (v instanceof Error) return Promise.reject(v);
  return Promise.resolve(typeof v === 'function' ? (v as (p: string) => unknown)(path) : v);
};
const Where = () => { const l = useLocation(); return <p data-testid="where">{l.pathname}</p>; };

const tenant = (over: Partial<TenantRow>): TenantRow => ({
  id: 'a'.repeat(24), slug: 'ndp3', mpName: 'ড. তাহমিনা নূর', seat: 'নদীপুর-3', seatName: 'নদীপুর', seatNumber: 3, role: 'mp', ministry: '', status: 'live', plan: 'full',
  createdAt: '2026-09-01T00:00:00Z', publishedPosts: 12, postsLast30d: 4, daysSinceLastPost: 2, stale: false, complaintsLast30d: 10, openComplaints: 3, overdue: 0, slaPct: 90,
  promises: 5, ownerActive: true, lastActivityAt: '2026-09-29T00:00:00Z', domains: [{ id: 'd1', host: 'ndp3.jonoprotinidhi.localhost', type: 'platform', primary: true, dnsStatus: 'active' }], ...over,
});
const series = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, received: i === 29 ? 4 : 0, solved: i === 29 ? 1 : 0 }));
const dash = (over: Partial<SuperDash> = {}): SuperDash => ({
  generatedAt: new Date().toISOString(),
  kpis: {
    tenants: { total: 3, live: 1, setup: 1, suspended: 1, ministers: 0, newLast30d: 3 },
    complaints: { last30d: 1234, prev30d: 1000, open: 57, overdue: 4, resolvedLast30d: 20, slaPct: 70, slaTarget: 80 },
    posts: { publishedLast30d: 9, prev30d: 3, publishedTotal: 40 },
    media: { imageBytes: 3 * 1024 * 1024, videoBytes: 1024 * 1024, imageFiles: 12, videoFiles: 1 },
    sms: { today: 19, month: 300, failedToday: 0, capPerTenant: 500, dailyCapacity: 1000, busiest: null },
    domains: { custom: 2, pending: 1, error: 0, sslExpiringSoon: 0 },
  },
  series, openByTenant: [{ id: 'a'.repeat(24), mpName: 'ড. তাহমিনা নূর', seatName: 'নদীপুর', seatNumber: 3, status: 'live', open: 57, overdue: 4 }],
  attention: [
    { kind: 'suspended', tone: 'bad', tenantId: 'b'.repeat(24), mpName: 'বন্ধ সাইট', seatName: 'বন্ধপুর', seatNumber: 1, slug: 'off1', since: '2026-09-20T00:00:00Z' },
    { kind: 'sla', tone: 'bad', tenantId: 'a'.repeat(24), mpName: 'ড. তাহমিনা নূর', seatName: 'নদীপুর', seatNumber: 3, slug: 'ndp3', slaPct: 70, target: 80, overdue: 4 },
  ],
  activity: [{ id: 'x1', action: 'tenant.act_as', label: 'ড. তাহমিনা নূর', actorName: 'রুট অ্যাডমিন', viaSuperAdmin: true, at: new Date().toISOString(), tenantId: 'a'.repeat(24), tenantName: 'ড. তাহমিনা নূর' }],
  ...over,
});

beforeEach(() => { vi.clearAllMocks(); asRole('super_admin'); });

describe('platform dashboard', () => {
  it('shows KPIs in Bangla digits, the needs-attention reasons, open complaints by site and platform activity', async () => {
    m.get.mockImplementation(route({ '/super/dashboard': dash() }));
    renderApp(<SuperDashboard />, '/super');
    expect(await screen.findByText('১,২৩৪')).toBeInTheDocument(); // lakh grouping, Bangla digits
    expect(screen.getAllByText('৪ MB').length).toBeGreaterThan(0); // 3 MB images + 1 MB video
    expect(screen.getByText(/সময়মতো নিষ্পত্তি ৭০% \(লক্ষ্য ৮০%\)/)).toBeInTheDocument();
    expect(screen.getByText(/সাইট স্থগিত আছে/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /বন্ধ সাইট/ })).toHaveAttribute('href', `/super/tenants/${'b'.repeat(24)}`);
    expect(screen.getByText(/সাইটের অ্যাডমিনে প্রবেশ \(act-as\)/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /নতুন MP যোগ করুন/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /গত ৩০ দিনে সব সাইটে/ })).toBeInTheDocument();
  });

  it('support staff get the same numbers but no "add MP" actions; an all-clear state when nothing needs attention', async () => {
    asRole('support');
    m.get.mockImplementation(route({ '/super/dashboard': dash({ attention: [] }) }));
    renderApp(<SuperDashboard />, '/super');
    expect(await screen.findByText('সব সাইট ঠিকঠাক চলছে')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /নতুন MP যোগ করুন/ })).not.toBeInTheDocument();
  });

  it('first run: no tenants yet shows an actionable empty state; errors offer a retry', async () => {
    m.get.mockImplementationOnce(route({ '/super/dashboard': dash({ kpis: { ...dash().kpis, tenants: { total: 0, live: 0, setup: 0, suspended: 0, ministers: 0, newLast30d: 0 } } }) }));
    const r = renderApp(<SuperDashboard />, '/super');
    expect(await screen.findByText('প্রথম MP যোগ করুন')).toBeInTheDocument();
    r.unmount();
    m.get.mockRejectedValueOnce(new ApiFail(500, 'INTERNAL', 'সার্ভারে সমস্যা হয়েছে'));
    renderApp(<SuperDashboard />, '/super');
    expect(await screen.findByText(/সার্ভারে সমস্যা হয়েছে/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' })).toBeInTheDocument();
  });

  it('attention sentences cover every kind', () => {
    const base = { tenantId: 't', mpName: 'x', seatName: 'y', seatNumber: 1, slug: 's', tone: 'warn' as const };
    expect(attentionText({ ...base, kind: 'stale', daysSinceLastPost: null })).toMatch(/এখনো কোনো পোস্ট/);
    expect(attentionText({ ...base, kind: 'stale', daysSinceLastPost: 21 })).toBe('২১ দিন ধরে নতুন পোস্ট নেই');
    expect(attentionText({ ...base, kind: 'domain', hosts: ['a.example'], sslExpiring: [] })).toBe('ডোমেইন যাচাই বাকি: a.example');
    expect(attentionText({ ...base, kind: 'setup', ownerActive: false })).toMatch(/আমন্ত্রণ গ্রহণ/);
    expect(attentionText({ ...base, kind: 'unpublished', profilePublished: false })).toMatch(/প্রোফাইল/);
  });
});

describe('tenants list', () => {
  const rows = [
    tenant({}),
    tenant({ id: 'b'.repeat(24), slug: 'sbp1', mpName: 'মো. করিম', seatName: 'শালবাগান', seatNumber: 1, status: 'suspended', openComplaints: 0, domains: [] }),
    tenant({ id: 'c'.repeat(24), slug: 'krp2', mpName: 'রহিমা খাতুন', seatName: 'করিমপুর', seatNumber: 2, status: 'setup', ownerActive: false, openComplaints: 9, stale: false, domains: [{ id: 'd9', host: 'rahima.example', type: 'custom', primary: false, dnsStatus: 'pending' }] }),
  ];
  it('filterTenants: status, "needs attention", search by name/seat (Bangla digit)/slug/domain, sort', () => {
    expect(filterTenants(rows, '', 'suspended', 'new').map((t) => t.slug)).toEqual(['sbp1']);
    expect(filterTenants(rows, '', 'attention', 'new').map((t) => t.slug).sort()).toEqual(['krp2', 'sbp1']);
    expect(filterTenants(rows, 'নদীপুর-৩', '', 'new').map((t) => t.slug)).toEqual(['ndp3']);
    expect(filterTenants(rows, 'RAHIMA.example', '', 'new').map((t) => t.slug)).toEqual(['krp2']);
    expect(filterTenants(rows, '', '', 'open').map((t) => t.slug)).toEqual(['krp2', 'ndp3', 'sbp1']);
  });

  it('search and status chips filter the table; no match offers to clear filters', async () => {
    m.get.mockImplementation(route({ '/super/tenants': rows }));
    renderApp(<TenantsList />, '/super/tenants');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('MP-র অ্যাকাউন্ট চালু হয়নি')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^স্থগিত/ }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('মো. করিম')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('খুঁজুন'), 'অজানা');
    expect(await screen.findByText('কিছু পাওয়া যায়নি')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ফিল্টার মুছুন' }));
    expect(within(await screen.findByRole('table')).getAllByRole('row')).toHaveLength(4);
    expect(screen.getAllByRole('link', { name: /বিস্তারিত/ })).toHaveLength(3);
  });
});

describe('new tenant wizard (consent required)', () => {
  const full = { ...EMPTY_FORM, mpName: 'ডেমো পরীক্ষা সাংসদ', seatName: 'পরীক্ষাপুর', seatNumber: '৯', slug: 'sa-e2e-x1', ownerPhone: '01799000111', confirmed: true, documentRef: 'পরীক্ষা-০০১' };
  it('validateStep reports only the current step; consent and its reference are mandatory; Bangla seat digits accepted', () => {
    expect(validateStep('mp', EMPTY_FORM)).toEqual({ mpName: expect.stringMatching(/পুরো নাম/) });
    expect(validateStep('seat', { ...full, slug: 'A B' }).slug).toBeTruthy();
    expect(toBody(full).seatNumber).toBe(9);
    expect(validateStep('consent', { ...full, confirmed: false, documentRef: '' })).toEqual({ confirmed: 'MP অফিসের লিখিত সম্মতি নিশ্চিত করুন', documentRef: expect.stringMatching(/রেফারেন্স/) });
    expect(validateStep('review', full)).toEqual({});
  });

  it('walks the steps, refuses to continue without consent, creates and shows the one-time invite link', async () => {
    m.get.mockImplementation(route({ '/super/slug-available': { available: true, host: 'sa-e2e-x1.jonoprotinidhi.localhost' } }));
    m.post.mockResolvedValue({ id: 'n'.repeat(24), slug: 'sa-e2e-x1', status: 'setup', inviteToken: 'TOKEN123' });
    renderApp(<NewTenant />, '/super/tenants/new');
    const next = () => userEvent.click(screen.getByRole('button', { name: 'পরের ধাপ' }));
    await next();
    expect(await screen.findByText(/পুরো নাম লিখুন/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/পুরো নাম/), full.mpName);
    await next();
    await userEvent.type(screen.getByLabelText(/আসনের নাম/), full.seatName);
    await userEvent.type(screen.getByLabelText(/আসন নম্বর/), '9');
    await userEvent.type(screen.getByLabelText(/সাবডোমেইন/), full.slug);
    expect(await screen.findByText(/খালি আছে: sa-e2e-x1\.jonoprotinidhi\.localhost/)).toBeInTheDocument();
    await next();
    await userEvent.type(screen.getByLabelText(/MP-র মোবাইল/), full.ownerPhone);
    await next();
    await next(); // consent step, nothing ticked
    expect(await screen.findByText('MP অফিসের লিখিত সম্মতি নিশ্চিত করুন')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'লিখিত সম্মতি' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /লিখিত সম্মতি পাওয়া গেছে/ }));
    await userEvent.type(screen.getByLabelText(/সম্মতিপত্রের রেফারেন্স/), full.documentRef);
    await next();
    expect(await screen.findByRole('heading', { name: 'যাচাই' })).toBeInTheDocument();
    expect(m.post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'MP তৈরি করুন' }));
    await waitFor(() => expect(m.post).toHaveBeenCalledWith('/super/tenants', expect.objectContaining({ slug: 'sa-e2e-x1', seatNumber: 9, consent: { confirmed: true, documentRef: 'পরীক্ষা-০০১' } })));
    expect(await screen.findByText(/শুধু এখন একবার দেখানো হচ্ছে/)).toBeInTheDocument();
    expect(screen.getByText(/\/invite\/TOKEN123$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'আমন্ত্রণ লিংক কপি করুন' })).toBeInTheDocument();
  });

  it('support staff cannot open the wizard', async () => {
    asRole('support');
    renderApp(<NewTenant />, '/super/tenants/new');
    expect(screen.getByText('শুধু Super Admin নতুন MP যোগ করতে পারেন')).toBeInTheDocument();
  });
});

describe('tenant detail: domains and act-as', () => {
  const id = 'a'.repeat(24);
  const detail = {
    tenant: { id, slug: 'ndp3', status: 'live', plan: 'full', createdAt: '2026-09-01T00:00:00Z', mp: { name: 'ড. তাহমিনা নূর', role: 'mp', seatName: 'নদীপুর', seatNumber: 3 },
      settings: { slaDays: 7, otpRequired: false, complaintBoxEnabled: true, dailySmsCap: 500 }, consent: { documentRef: 'DOC-1', receivedAt: '2026-09-01T00:00:00Z' }, statusHistory: [] },
    summary: tenant({}), dnsTarget: 'sites.jonoprotinidhi.localhost',
    domains: [{ _id: 'd1', host: 'ndp3.jonoprotinidhi.localhost', type: 'platform', primary: true, dnsStatus: 'active', sslStatus: 'active' },
      { _id: 'd2', host: 'noor.example', type: 'custom', primary: false, dnsStatus: 'pending', sslStatus: 'pending', verification: { txtName: '_jonoprotinidhi.noor.example', txtValue: 'jonoprotinidhi-verify=abc' } }],
    team: { owner: { name: 'ড. তাহমিনা নূর', status: 'active' }, byRole: { owner: { active: 1, invited: 0 }, editor: { active: 1, invited: 1 }, officer: { active: 2, invited: 0 } } },
    content: { pages: [{ key: 'profile', label: 'পরিচিতি', ready: true }], gallery: 3, videos: 1, events: 2, publishedPosts: 12, promises: 5, readinessPct: 70 },
    usage: { imageBytes: 1024, videoBytes: 0, imageFiles: 1, videoFiles: 0, smsToday: 2, smsMonth: 40, smsDailyCap: 500 },
    complaints: { last30d: 10, open: 3, overdue: 0, resolvedLast30d: 5, slaPct: 80 }, audit: [],
  };
  const renderDetail = () => renderApp(<Routes><Route path="/super/tenants/:id" element={<TenantDetail />} /><Route path="/t/:tid" element={<Where />} /></Routes>, `/super/tenants/${id}`);

  it('verify: calls the API, shows the server error when DNS is not ready, and the TXT instructions are copyable', async () => {
    m.get.mockImplementation(route({ [`/super/tenants/${id}`]: detail }));
    m.post.mockRejectedValueOnce(new ApiFail(422, 'DNS_NOT_READY', 'DNS রেকর্ড এখনো পাওয়া যায়নি'));
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'যাচাই করুন: noor.example' }));
    expect(m.post).toHaveBeenCalledWith('/super/domains/d2/verify', {});
    expect(await screen.findByText('DNS রেকর্ড এখনো পাওয়া যায়নি')).toBeInTheDocument();
    m.post.mockResolvedValueOnce({});
    await userEvent.click(screen.getByRole('button', { name: 'যাচাই করুন: noor.example' }));
    expect(await screen.findByText('ডোমেইন যাচাই হয়েছে, SSL চালু')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'DNS নির্দেশনা' }));
    const dlg = await screen.findByRole('dialog', { name: 'DNS নির্দেশনা' });
    expect(within(dlg).getByText('jonoprotinidhi-verify=abc')).toBeInTheDocument();
    expect(within(dlg).getByText('sites.jonoprotinidhi.localhost')).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'TXT রেকর্ডের মান কপি করুন' })).toBeInTheDocument();
    expect(screen.getByText(/শুধু রেফারেন্স/)).toBeInTheDocument(); // consent shown as a reference only
  });

  it('support staff see the site but no domain or status controls', async () => {
    asRole('support');
    m.get.mockImplementation(route({ [`/super/tenants/${id}`]: detail }));
    renderDetail();
    expect(await screen.findByText('শুধু Super Admin অবস্থা বদলাতে পারেন।')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /যাচাই করুন/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'কাস্টম ডোমেইন যোগ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'সাইটের অ্যাডমিনে ঢুকুন' })).toBeInTheDocument();
  });

  it('act-as: needs a reason of 10+ characters, then stores the token and opens the tenant panel', async () => {
    m.get.mockImplementation(route({ [`/super/tenants/${id}`]: detail }));
    m.post.mockResolvedValueOnce({ actAsToken: 'ACT', expiresAt: new Date(Date.now() + 1800_000).toISOString(), tenantId: id });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'সাইটের অ্যাডমিনে ঢুকুন' }));
    const reason = screen.getByLabelText(/কী কারণে ঢুকছেন \(অডিট লগে যাবে\)/);
    await userEvent.type(reason, 'কম');
    await userEvent.click(screen.getByRole('button', { name: 'ঢুকুন' }));
    expect(await screen.findByText('কমপক্ষে ১০ অক্ষরে লিখুন')).toBeInTheDocument();
    expect(m.post).not.toHaveBeenCalled();
    await userEvent.type(reason, ' ব্যানারের ছবি ঠিক করছি');
    await userEvent.click(screen.getByRole('button', { name: 'ঢুকুন' }));
    await waitFor(() => expect(m.post).toHaveBeenCalledWith(`/super/tenants/${id}/act-as`, { reason: 'কম ব্যানারের ছবি ঠিক করছি' }));
    expect(m.setActAs).toHaveBeenCalledWith(expect.objectContaining({ tenantId: id, token: 'ACT' }));
    expect(await screen.findByTestId('where')).toHaveTextContent(`/t/${id}`);
  });

  it('going live needs the content/consent check before the API is called', async () => {
    m.get.mockImplementation(route({ [`/super/tenants/${id}`]: { ...detail, tenant: { ...detail.tenant, status: 'setup' } } }));
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'লাইভ করুন' }));
    await userEvent.type(screen.getByLabelText(/কারণ \(অডিট লগে যাবে\)/), 'সব যাচাই শেষ');
    const dlg = screen.getByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'লাইভ করুন' }));
    expect(await within(dlg).findByText(/কনটেন্ট ও সম্মতি যাচাই নিশ্চিত করুন/)).toBeInTheDocument();
    expect(m.post).not.toHaveBeenCalled();
  });
});

describe('audit log', () => {
  it('diffRows marks changed fields and shows redacted values as hidden', () => {
    expect(diffRows({ status: 'live', phone: '[redacted]' }, { status: 'suspended', phone: '[redacted]' })).toEqual([
      { key: 'status', before: 'live', after: 'suspended', changed: true },
      { key: 'phone', before: '[গোপন, লুকানো]', after: '[গোপন, লুকানো]', changed: false },
    ]);
    expect(diffRows(undefined, undefined)).toEqual([]);
  });

  it('renders Bangla action labels, sends filters from the URL, and the drawer shows the diff', async () => {
    const items = [
      { _id: '1', tenantId: 'a'.repeat(24), tenantName: 'ড. তাহমিনা নূর', action: 'tenant.status.suspended', at: new Date().toISOString(), reason: 'চুক্তি শেষ', ip: null, actor: { name: 'রুট', role: 'super_admin', viaSuperAdmin: true }, entity: { label: 'ড. তাহমিনা নূর' }, diff: { before: { status: 'live' }, after: { status: 'suspended' } } },
      { _id: '2', tenantId: 'a'.repeat(24), tenantName: 'ড. তাহমিনা নূর', action: 'complaint.create', at: new Date().toISOString(), reason: null, ip: null, actor: null, entity: { label: 'NDP3-2026-00001' }, diff: null },
    ];
    m.get.mockImplementation(route({ '/super/audit': { items, page: 1, total: 2, totalPages: 1 }, '/super/tenants': [tenant({})] }));
    renderApp(<SuperAudit />, `/super/audit?tenantId=${'a'.repeat(24)}&action=tenant`);
    expect(await screen.findByText('সাইট স্থগিত করা হয়েছে')).toBeInTheDocument();
    expect(screen.getByText('নাগরিক (পাবলিক সাইট)')).toBeInTheDocument();
    expect(m.get).toHaveBeenCalledWith(expect.stringMatching(/^\/super\/audit\?page=1&limit=25&tenantId=a{24}&action=tenant$/));
    expect(screen.getByText(/সব ফিল্টার মুছুন \(২\)/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^বিস্তারিত: সাইট স্থগিত/ })[0]!);
    const drawer = await screen.findByRole('dialog', { name: 'অডিটের বিস্তারিত' });
    expect(within(drawer).getByText('suspended')).toBeInTheDocument();
    expect(within(drawer).queryByText('IP')).not.toBeInTheDocument();
  });
});
