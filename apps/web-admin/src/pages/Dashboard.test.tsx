import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiFail } from '../api';
import { renderApp, fakeTenant, type FakeTenant } from '../test/utils';

/* Dashboard: each role sees only the sections the API sent (BUG-2026-011), charts are accessible, empty and full states render. */

const h = vi.hoisted(() => ({ tenant: null as null | FakeTenant }));
vi.mock('../tenant', () => ({ useTenant: () => h.tenant, canDo: () => true }));

import Dashboard from './tenant/Dashboard';

const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, received: i % 4 === 0 ? 3 : 1, solved: i % 5 === 0 ? 2 : 0 }));
const complaints = {
  total: 20, open: 8, byStatus: { new: 5, verify: 1, progress: 2, solved: 10, closed: 2 }, slaPct: 80, resolvedLast30d: 10, overdue: 2, avgResolutionDays: 3.5, series: days,
  byCategory: [{ name: 'রাস্তা-ঘাট ও সেতু', count: 9 }, { name: 'বিদ্যুৎ', count: 4 }], byUpazila: [{ name: 'চরকান্দি', count: 12, open: 5 }, { name: 'শালবাগান', count: 8, open: 0 }],
  latest: [{ id: 'c1', trackingId: 'NDP3-2026-00010', category: 'হয়রানি বা দুর্নীতি', upazila: 'নতুনহাট', status: 'new', createdAt: new Date(Date.now() - 3600_000).toISOString() }],
};
const posts = { total: 14, byStatus: { published: 12, review: 1, draft: 1 }, last30d: 4, recent: [{ id: 'p9', title: 'কাশবনে বীজ বিতরণ', status: 'published', eventDate: '2026-09-20', updatedAt: new Date().toISOString() }] };
const promises = { total: 6, byStatus: { done: 2, ongoing: 3, late: 1 }, avgPct: 55, late: [{ id: 'm1', name: 'হাসপাতাল ভবন', pct: 20 }] };
const approvals = { total: 2, items: [{ id: 'p1', title: 'গণশুনানির খবর', authorName: 'সম্পাদক', submittedAt: new Date(Date.now() - 7200_000).toISOString() }, { id: 'p2', title: 'বন্যা প্রস্তুতি', authorName: 'সম্পাদক', submittedAt: new Date().toISOString() }] };
const content = { gallery: 0, videos: 0, events: 1, readinessPct: 42, pages: [{ key: 'home', label: 'হোম পেজ', ready: true }, { key: 'contact', label: 'যোগাযোগ', ready: false }] };
const events = { upcoming: [{ id: 'e1', title: 'গণশুনানি', date: new Date(Date.now() + 2 * 86400_000).toISOString(), place: 'কাশবন' }] };
const activity = { items: [{ action: 'post.approve', label: 'পোস্ট প্রকাশ করা হয়েছে: বীজ', actorName: 'MP', at: new Date().toISOString() }] };

const open = (role: 'owner' | 'editor' | 'officer', data: unknown, extra: Record<string, unknown> = {}) => {
  h.tenant = fakeTenant(role, { 'GET /dashboard': data, 'POST /posts/p1/approve': {}, 'POST /posts/p1/reject': {}, ...extra });
  return renderApp(<Dashboard />);
};
beforeEach(() => { vi.clearAllMocks(); h.tenant = null; });

describe('Dashboard shows only what the role may see (BUG-2026-011)', () => {
  it('editor: content, promises, readiness; no complaint or approval blocks', async () => {
    open('editor', { generatedAt: new Date().toISOString(), posts, promises, events, content });
    expect(await screen.findByText('প্রকাশিত পোস্ট')).toBeInTheDocument();
    expect(screen.getByText('সাইট প্রস্তুতি', { selector: '.stat-label' })).toBeInTheDocument();
    expect(screen.getByText('প্রতিশ্রুতির গড় অগ্রগতি')).toBeInTheDocument();
    for (const t of ['খোলা অভিযোগ', 'অভিযোগের অবস্থা', 'সাম্প্রতিক অভিযোগ', 'সাম্প্রতিক কার্যক্রম']) expect(screen.queryByText(t)).not.toBeInTheDocument();
    expect(screen.queryByText('অনুমোদনের অপেক্ষায়', { selector: '.stat-label' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^অনুমোদন:/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/SLA/)).not.toBeInTheDocument();
  });
  it('officer: complaint blocks only', async () => {
    open('officer', { generatedAt: new Date().toISOString(), complaints });
    expect(await screen.findByText('খোলা অভিযোগ', { selector: '.stat-label' })).toBeInTheDocument();
    expect(screen.getByText(/SLA/)).toBeInTheDocument();
    for (const t of ['প্রকাশিত পোস্ট', 'প্রতিশ্রুতির অবস্থা', 'সাইট প্রস্তুতি', 'সাম্প্রতিক পোস্ট', 'আসন্ন কর্মসূচি']) expect(screen.queryByText(t)).not.toBeInTheDocument();
  });
  it('owner: everything, in Bangla digits only in the KPI numbers', async () => {
    const { container } = open('owner', { generatedAt: new Date().toISOString(), posts, promises, approvals, complaints, events, content, activity });
    await screen.findByText('খোলা অভিযোগ', { selector: '.stat-label' });
    for (const t of ['প্রকাশিত পোস্ট', 'অনুমোদনের অপেক্ষায়', 'সময়মতো নিষ্পত্তি (SLA)', 'অভিযোগের অবস্থা', 'সাম্প্রতিক অভিযোগ', 'আসন্ন কর্মসূচি', 'সাম্প্রতিক কার্যক্রম']) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    const vals = Array.from(container.querySelectorAll('.stat-val')).map((e) => e.textContent);
    expect(vals.length).toBe(4);
    expect(vals.every((v) => !/\d/.test(v ?? ''))).toBe(true);
    expect(vals.join('|')).toContain('৮০');
    expect(container.querySelectorAll('.kpi').length).toBe(4); // e2e counts .kpi cards
    expect(screen.getByText(/স্বাগতম/)).toBeInTheDocument();
  });
  it('latest complaints carry only category, id, area and status (no identity)', async () => {
    const { container } = open('owner', { generatedAt: new Date().toISOString(), complaints });
    await screen.findByText('সাম্প্রতিক অভিযোগ');
    expect(screen.getByText('NDP3-2026-00010')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/01\d{9}/);
  });
});

describe('charts and lists', () => {
  it('the area chart, donut and bar lists expose accessible labels and hidden data tables', async () => {
    open('owner', { generatedAt: new Date().toISOString(), complaints, posts, promises, approvals, events, content, activity });
    const area = await screen.findByRole('img', { name: /গত ৩০ দিনে প্রতিদিন কতটি অভিযোগ এসেছে/ });
    expect(area).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('img', { name: /অবস্থা অনুযায়ী অভিযোগ/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'বিষয় অনুযায়ী অভিযোগ' })).toBeInTheDocument();
    expect(screen.getAllByRole('table', { hidden: true }).length).toBeGreaterThanOrEqual(2);
  });
  it('approvals: approve posts to the API; reject needs a reason', async () => {
    open('owner', { generatedAt: new Date().toISOString(), approvals, posts });
    const t = h.tenant!;
    await userEvent.click(await screen.findByRole('button', { name: 'অনুমোদন: গণশুনানির খবর' }));
    await waitFor(() => expect(t.api.post).toHaveBeenCalledWith('/posts/p1/approve', {}));
    await userEvent.click(screen.getByRole('button', { name: 'ফেরত পাঠান: গণশুনানির খবর' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByRole('textbox'), 'ছবির ক্রেডিট লিখুন');
    await userEvent.click(within(dlg).getByRole('button', { name: 'ফেরত পাঠান' }));
    await waitFor(() => expect(t.api.post).toHaveBeenCalledWith('/posts/p1/reject', { reason: 'ছবির ক্রেডিট লিখুন' }));
  });
  it('every readiness item links to its editor now that the content editors exist (no "শীঘ্রই" left)', async () => {
    open('owner', { generatedAt: new Date().toISOString(), posts: { ...posts, byStatus: { draft: 1 } }, content, promises: { ...promises, total: 0 } });
    await screen.findByText('সাইট প্রস্তুতি', { selector: '.stat-label' });
    expect(screen.queryAllByText('শীঘ্রই')).toHaveLength(0);
    const links = screen.getAllByRole('link', { name: 'যোগ করুন' }).map((a) => a.getAttribute('href'));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((h) => !!h && !/\/pages\//.test(h))).toBe(true); // site pages live under site-pages/<key>
  });
});

describe('empty and error states', () => {
  it('a brand-new site shows helpful, actionable empty states instead of blanks', async () => {
    const zero = { total: 0, byStatus: {}, slaPct: null, resolvedLast30d: 0, overdue: 0, avgResolutionDays: 0, open: 0, series: days.map((d) => ({ ...d, received: 0, solved: 0 })), byCategory: [], byUpazila: [], latest: [] };
    open('owner', { generatedAt: new Date().toISOString(), complaints: zero, posts: { total: 0, byStatus: {}, last30d: 0, recent: [] }, promises: { total: 0, byStatus: {}, avgPct: 0, late: [] }, approvals: { total: 0, items: [] }, events: { upcoming: [] }, content: { gallery: 0, videos: 0, events: 0, readinessPct: 0, pages: [] }, activity: { items: [] } });
    expect(await screen.findByText('এখনো কোনো পোস্ট নেই')).toBeInTheDocument();
    expect(screen.getByText('এখনো কোনো অভিযোগ আসেনি', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('প্রতিশ্রুতি যোগ করা হয়নি')).toBeInTheDocument();
    expect(screen.getByText('সব পোস্ট দেখা হয়ে গেছে')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /নতুন পোস্ট/ }).length).toBeGreaterThan(0);
  });
  it('shows an error with a retry when the API fails', async () => {
    let calls = 0;
    open('owner', () => { calls++; if (calls === 1) throw new ApiFail(500, 'X', 'সার্ভারে সমস্যা'); return { generatedAt: new Date().toISOString(), posts }; });
    expect(await screen.findByRole('alert')).toHaveTextContent('সার্ভারে সমস্যা');
    await userEvent.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(await screen.findByText('প্রকাশিত পোস্ট')).toBeInTheDocument();
  });
  it('shows a skeleton (status role) while loading', () => {
    open('owner', () => new Promise(() => {}));
    expect(screen.getByRole('status', { name: 'লোড হচ্ছে' })).toBeInTheDocument();
  });
});
