import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AreaChart, Avatar, BarList, Button, Card, DataTable, Donut, DropdownMenu, EmptyState, Icon, ProgressBar, ProgressRing, SaveBar, Sparkline, StatCard, Stepper, TabPanel, Tabs, Timeline, initialsOf, monotonePath, Chips, SearchInput, Badge, FormSection, Skeleton,
} from './index';
import { currentNav } from './Shell';
import { buildTenantNav, TENANT_NAV } from '../tenant';
import { bnAgo, bnDayLong, bnDayShort, bnGreeting, bnUntil, bnWeekday } from '../format';
import { routeExists } from '../routes';
import { renderApp } from '../test/utils';

/* The component library: accessible charts, Bangla numbers, keyboard behaviour of Tabs and menus, empty states. */

const series = Array.from({ length: 5 }, (_, i) => ({ date: `2026-09-0${i + 1}`, a: i, b: 5 - i }));

describe('charts are accessible', () => {
  it('AreaChart: role=img with a label that summarises the totals, focusable, plus a hidden data table', () => {
    renderApp(<AreaChart data={series} series={[{ key: 'a', label: 'প্রাপ্ত' }, { key: 'b', label: 'নিষ্পত্তি', tone: 'green' }]} ariaLabel="অভিযোগের গতি" />);
    const img = screen.getByRole('img', { name: /অভিযোগের গতি.*প্রাপ্ত মোট ১০.*নিষ্পত্তি মোট ১৫/ });
    expect(img).toHaveAttribute('tabindex', '0');
    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(6);
    expect(within(table).getByText('২ সেপ্টেম্বর ২০২৬')).toBeInTheDocument();
  });
  it('AreaChart: arrow keys move the active point and announce it; Escape clears', async () => {
    renderApp(<AreaChart data={series} series={[{ key: 'a', label: 'প্রাপ্ত' }]} ariaLabel="গতি" />);
    const img = screen.getByRole('img', { name: /গতি/ });
    await userEvent.tab();
    expect(img).toHaveFocus();
    const live = () => document.querySelector('.chart-fig [aria-live="polite"]')!.textContent;
    expect(live()).toContain('৫ সেপ্টেম্বর ২০২৬'); // focus starts on the latest point
    fireEvent.keyDown(img, { key: 'ArrowLeft' });
    expect(live()).toContain('৪ সেপ্টেম্বর ২০২৬: প্রাপ্ত ৩');
    fireEvent.keyDown(img, { key: 'Home' });
    expect(live()).toContain('১ সেপ্টেম্বর ২০২৬');
    expect(document.querySelector('.ac-tip')).toBeTruthy();
    fireEvent.keyDown(img, { key: 'Escape' });
    expect(document.querySelector('.ac-tip')).toBeNull();
  });
  it('AreaChart: an all-zero series still renders, with the empty message', () => {
    renderApp(<AreaChart data={series.map((s) => ({ ...s, a: 0 }))} series={[{ key: 'a', label: 'প্রাপ্ত' }]} ariaLabel="গতি" emptyText="কিছু আসেনি" />);
    expect(screen.getByText('কিছু আসেনি')).toBeInTheDocument();
  });
  it('Donut: label lists every slice with Bangla digits; zero slices are left out', () => {
    renderApp(<Donut ariaLabel="অবস্থা" data={[{ key: 'n', label: 'নতুন', value: 8 }, { key: 's', label: 'সমাধান', value: 2 }, { key: 'z', label: 'স্প্যাম', value: 0 }]} />);
    expect(screen.getByRole('img', { name: 'অবস্থা: নতুন ৮, সমাধান ২' })).toBeInTheDocument();
    expect(screen.queryByText('স্প্যাম')).not.toBeInTheDocument();
    expect(screen.getAllByText('৮০%').length).toBeGreaterThan(0);
  });
  it('Donut: empty data says so', () => {
    renderApp(<Donut ariaLabel="অবস্থা" data={[]} emptyText="কিছু নেই" />);
    expect(screen.getByRole('img', { name: 'অবস্থা: কিছু নেই' })).toBeInTheDocument();
  });
  it('BarList scales bars to the largest value and can link rows; ProgressBar/Ring expose their value', () => {
    const { container } = renderApp(<><BarList ariaLabel="বিষয়" rows={[{ label: 'রাস্তা', value: 8, to: '/x' }, { label: 'বিদ্যুৎ', value: 2 }]} /><ProgressBar value={64} label="অগ্রগতি" /><ProgressRing value={80} label="প্রস্তুতি" /></>);
    const fills = container.querySelectorAll<HTMLElement>('.bl-t i');
    expect(fills[0]!.style.width).toBe('100%'); expect(fills[1]!.style.width).toBe('25%');
    expect(screen.getByRole('link', { name: /রাস্তা/ })).toHaveAttribute('href', '/x');
    expect(screen.getByRole('progressbar', { name: 'অগ্রগতি' })).toHaveAttribute('aria-valuenow', '64');
    expect(screen.getByRole('img', { name: 'প্রস্তুতি: ৮০%' })).toBeInTheDocument();
  });
  it('Sparkline is decorative unless labelled', () => {
    const { container, rerender } = renderApp(<Sparkline data={[1, 3, 2]} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    rerender(<Sparkline data={[1, 3, 2]} label="প্রবণতা" />);
    expect(screen.getByRole('img', { name: 'প্রবণতা' })).toBeInTheDocument();
  });
  it('monotonePath never dips below a flat zero run', () => {
    const d = monotonePath([[0, 10], [10, 10], [20, 10], [30, 0]]);
    expect(d.startsWith('M0,10C')).toBe(true);
    const ys = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(10.0001);
  });
});

describe('StatCard', () => {
  it('prints numbers in Bangla digits with lakh/crore grouping, unit, delta and hint', () => {
    renderApp(<StatCard label="মোট" value={743760} unit="টাকা" delta={{ value: 12, suffix: '%', label: 'গত মাসে' }} hint="সব মিলিয়ে" icon="posts" />);
    expect(screen.getByText('৭,৪৩,৭৬০')).toBeInTheDocument();
    expect(screen.getByText('টাকা')).toBeInTheDocument();
    expect(screen.getByText(/\+১২%/)).toBeInTheDocument();
    expect(screen.getByText('সব মিলিয়ে')).toBeInTheDocument();
  });
  it('shows an em dash for a missing value, marks a falling "bad" delta and keeps the .kpi hook', () => {
    const { container } = renderApp(<StatCard label="SLA" value={null} delta={{ value: -3, suffix: '%' }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/−৩%/).closest('.delta')).toHaveClass('bad');
    expect(container.querySelector('.kpi')).toBeTruthy();
  });
  it('a "down is good" delta is green, and `to` makes the whole card a link', () => {
    renderApp(<StatCard label="দেরি" value={2} to="/t/1/complaints" delta={{ value: -1, good: 'down' }} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/t/1/complaints');
    expect(screen.getByText(/−১/).closest('.delta')).toHaveClass('good');
  });
  it('loading shows a skeleton instead of the number', () => {
    const { container } = renderApp(<StatCard label="ক" value={5} loading />);
    expect(container.querySelector('.skel')).toBeTruthy(); expect(screen.queryByText('৫')).not.toBeInTheDocument();
  });
});

describe('Tabs keyboard behaviour', () => {
  const tabs = [{ key: 'a', label: 'এক' }, { key: 'b', label: 'দুই' }, { key: 'c', label: 'তিন', disabled: true }, { key: 'd', label: 'চার', badge: 3 }] as const;
  function Harness() {
    const [v, setV] = useState<'a' | 'b' | 'c' | 'd'>('a');
    return <><Tabs base="t" label="ট্যাব" tabs={[...tabs]} value={v} onChange={setV} /><TabPanel base="t" tab="a" value={v}>প্যানেল-এক</TabPanel><TabPanel base="t" tab="b" value={v}>প্যানেল-দুই</TabPanel></>;
  }
  it('roving tabindex, arrow keys skip disabled tabs and wrap, Home/End jump, panel is linked', async () => {
    renderApp(<Harness />);
    const list = screen.getByRole('tablist', { name: 'ট্যাব' });
    const a = within(list).getByRole('tab', { name: 'এক' });
    expect(a).toHaveAttribute('aria-selected', 'true'); expect(a).toHaveAttribute('tabindex', '0');
    expect(within(list).getByRole('tab', { name: 'দুই' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', a.id);
    a.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(list).getByRole('tab', { name: 'দুই' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('প্যানেল-দুই')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}'); // skips the disabled "তিন"
    expect(within(list).getByRole('tab', { name: /চার/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}'); // wraps
    expect(within(list).getByRole('tab', { name: 'এক' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{End}');
    expect(within(list).getByRole('tab', { name: /চার/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(within(list).getByRole('tab', { name: 'এক' })).toHaveAttribute('aria-selected', 'true');
    expect(within(list).getByText('৩')).toBeInTheDocument(); // badge in Bangla digits
  });
});

describe('DropdownMenu keyboard behaviour', () => {
  const setup = () => {
    const onSelect = vi.fn(), onOpenChange = vi.fn();
    renderApp(<DropdownMenu label="অ্যাকাউন্ট" trigger="মেনু" onOpenChange={onOpenChange} items={[{ heading: 'নাম' }, { label: 'প্রোফাইল', onSelect }, { separator: true }, { label: 'বন্ধ', disabled: true }, { label: 'লগআউট', onSelect: () => onSelect('out'), danger: true }, { label: 'লিংক', to: '/x', badge: 4 }]} />);
    return { onSelect, onOpenChange };
  };
  it('opens with Enter/ArrowDown on the trigger, moves with arrows (skipping disabled), Escape closes and returns focus', async () => {
    setup();
    const btn = screen.getByRole('button', { name: 'অ্যাকাউন্ট' });
    expect(btn).toHaveAttribute('aria-expanded', 'false'); expect(btn).toHaveAttribute('aria-haspopup', 'menu');
    btn.focus();
    await userEvent.keyboard('{ArrowDown}');
    const menu = await screen.findByRole('menu', { name: 'অ্যাকাউন্ট' });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: 'প্রোফাইল' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'লগআউট' })).toHaveFocus(); // disabled "বন্ধ" skipped
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /লিংক/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}'); // wraps
    expect(screen.getByRole('menuitem', { name: 'প্রোফাইল' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: /লিংক/ })).toHaveFocus();
    expect(within(menu).getByText('৪')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });
  it('Enter selects an item and closes; ArrowUp from the trigger opens on the last item; outside click closes; disabled items do nothing', async () => {
    const { onSelect, onOpenChange } = setup();
    const btn = screen.getByRole('button', { name: 'অ্যাকাউন্ট' });
    btn.focus();
    await userEvent.keyboard('{ArrowUp}');
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: /লিংক/ })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await userEvent.click(btn);
    await userEvent.click(screen.getByRole('menuitem', { name: 'বন্ধ' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'লগআউট' }));
    expect(onSelect).toHaveBeenCalledWith('out');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(btn);
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(true); expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('EmptyState, Button, Chips, SaveBar and friends', () => {
  it('EmptyState shows icon, title, text and an action', async () => {
    const on = vi.fn();
    renderApp(<EmptyState icon="gallery" title="ছবি নেই" text="প্রথম ছবিটি যোগ করুন" action={<Button variant="accent" onClick={on}>ছবি যোগ করুন</Button>} />);
    expect(screen.getByRole('heading', { name: 'ছবি নেই' })).toBeInTheDocument();
    expect(screen.getByText('প্রথম ছবিটি যোগ করুন')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ছবি যোগ করুন' }));
    expect(on).toHaveBeenCalled();
  });
  it('Button defaults to type=button, renders links for to/href, and a disabled link is not a link', () => {
    renderApp(<><Button>ক</Button><Button to="/a">খ</Button><Button href="https://x.test">গ</Button><Button to="/a" disabled>ঘ</Button><Button loading>ঙ</Button></>);
    expect(screen.getByRole('button', { name: 'ক' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('link', { name: 'খ' })).toHaveAttribute('href', '/a');
    expect(screen.getByRole('link', { name: 'গ' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('ঘ')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'ঙ' })).toBeDisabled();
  });
  it('Chips are pressable toggles and SearchInput is labelled', async () => {
    const onC = vi.fn(), onS = vi.fn();
    renderApp(<><Chips label="অবস্থা" value="a" onChange={onC} options={[{ value: 'a', label: 'সব', count: 5 }, { value: 'b', label: 'খসড়া' }]} /><SearchInput label="খুঁজুন" value="" onChange={onS} /></>);
    expect(screen.getByRole('button', { name: /সব/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'খসড়া' }));
    expect(onC).toHaveBeenCalledWith('b');
    await userEvent.type(screen.getByRole('searchbox', { name: 'খুঁজুন' }), 'ক');
    expect(onS).toHaveBeenCalledWith('ক');
  });
  it('SaveBar disables saving until something changed and reports the state politely', async () => {
    const onSave = vi.fn(), onDiscard = vi.fn();
    const { rerender } = renderApp(<SaveBar dirty={false} onSave={onSave} onDiscard={onDiscard} />);
    expect(screen.getByRole('button', { name: /সংরক্ষণ করুন/ })).toBeDisabled();
    expect(screen.getByText('সব পরিবর্তন সংরক্ষিত')).toBeInTheDocument();
    rerender(<SaveBar dirty onSave={onSave} onDiscard={onDiscard} />);
    expect(screen.getByRole('status')).toHaveTextContent('অসংরক্ষিত পরিবর্তন আছে');
    await userEvent.click(screen.getByRole('button', { name: /সংরক্ষণ করুন/ }));
    await userEvent.click(screen.getByRole('button', { name: 'পরিবর্তন বাতিল' }));
    expect(onSave).toHaveBeenCalled(); expect(onDiscard).toHaveBeenCalled();
  });
  it('Stepper marks the current step, Timeline lists items, Avatar shows initials, DataTable labels cells for mobile cards', () => {
    const { container } = renderApp(<>
      <Stepper label="ধাপ" steps={[{ key: 'a', label: 'খসড়া' }, { key: 'b', label: 'অপেক্ষা' }, { key: 'c', label: 'প্রকাশ' }]} current="b" />
      <Timeline items={[{ title: 'প্রথম', meta: 'এইমাত্র', tone: 'ok' }, { title: 'দ্বিতীয়' }]} />
      <Avatar name="ড. তাহমিনা নূর" />
      <DataTable caption="তালিকা" rowKey={(r) => r.id} rows={[{ id: '1', n: 'ক' }]} columns={[{ key: 'n', header: 'নাম', cell: (r) => r.n, primary: true }, { key: 'x', header: 'অবস্থা', cell: () => 'ঠিক' }]} />
      <Card title="শিরোনাম" sub="উপ" icon="posts">ভেতর</Card><Badge tone="ok" count={7}>নতুন</Badge><FormSection title="বিভাগ" description="বর্ণনা">ফর্ম</FormSection><Skeleton /><Icon name="bell" label="ঘণ্টা" />
    </>);
    expect(container.querySelector('li[aria-current="step"]')).toHaveTextContent('অপেক্ষা');
    expect(within(screen.getByRole('list', { name: 'কার্যক্রমের তালিকা' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'ড. তাহমিনা নূর' })).toHaveTextContent('তানূ');
    const td = screen.getByText('ঠিক').closest('td')!;
    expect(td).toHaveAttribute('data-label', 'অবস্থা');
    expect(screen.getByRole('table', { name: 'তালিকা' })).toBeInTheDocument();
    expect(screen.getByText('৭')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'ঘণ্টা' })).toBeInTheDocument();
  });
  it('initialsOf skips honorifics', () => {
    expect(initialsOf('ড. তাহমিনা নূর')).toBe('তানূ');
    expect(initialsOf('Md Rahim')).toBe('MR');
    expect(initialsOf('')).toBe('?');
  });
});

describe('navigation config and Bangla helpers', () => {
  const can = (perms: string[]) => (p: string) => perms.includes(p);
  it('the tenant nav is filtered by permission, drops empty groups and carries badges', () => {
    const owner = buildTenantNav(TENANT_NAV, 'T1', can(['posts.view', 'posts.publish', 'promises.edit', 'complaints.view_all', 'site.edit', 'team.manage', 'audit.view']) as never, { approvals: 3, complaints: 5 });
    expect(owner.filter((n) => 'group' in n).map((n) => (n as { group: string }).group)).toEqual(['কনটেন্ট', 'সাইটের পাতা', 'অভিযোগ', 'অফিস']);
    expect(owner.find((n) => 'to' in n && n.to === '/t/T1/approvals')).toMatchObject({ badge: 3 });
    expect(owner.find((n) => 'to' in n && n.to === '/t/T1')).toMatchObject({ end: true, label: 'ড্যাশবোর্ড' });
    const officer = buildTenantNav(TENANT_NAV, 'T1', can(['complaints.view_scoped']) as never, { complaints: 2 });
    expect(officer.map((n) => ('group' in n ? n.group : n.label))).toEqual(['ড্যাশবোর্ড', 'অভিযোগ', 'অভিযোগ']);
    const editor = buildTenantNav(TENANT_NAV, 'T1', can(['posts.view']) as never);
    expect(editor.some((n) => 'group' in n && n.group === 'অফিস')).toBe(false);
    // content editors (content.edit + media.upload) see the content screens and every site page, but not banners/settings (owner only)
    const content = buildTenantNav(TENANT_NAV, 'T1', can(['posts.view', 'content.edit', 'media.upload']) as never);
    const paths = content.filter((n): n is { to: string; label: string } => 'to' in n).map((n) => n.to.replace('/t/T1/', ''));
    expect(paths).toEqual(expect.arrayContaining(['gallery', 'videos', 'events', 'media', 'site-pages', 'site-pages/home', 'site-pages/profile', 'site-pages/area', 'site-pages/contact', 'site-pages/complaint', 'site-pages/layout', 'site-pages/heroes']));
    expect(paths).not.toContain('site'); expect(paths).not.toContain('settings');
    expect(officer.some((n) => 'to' in n && /gallery|videos|events|media|site-pages/.test(n.to))).toBe(false);
  });
  it('currentNav picks the longest matching entry, so /posts/new is not "posts"', () => {
    const nav = buildTenantNav(TENANT_NAV, 'T1', () => true);
    expect(currentNav(nav, '/t/T1')).toMatchObject({ label: 'ড্যাশবোর্ড' });
    expect(currentNav(nav, '/t/T1/posts/abc123')).toEqual({ group: 'কনটেন্ট', label: 'পোস্ট ও কার্যক্রম' });
    expect(currentNav(nav, '/t/T1/complaints/c9')).toMatchObject({ group: 'অভিযোগ' });
    expect(currentNav(nav, '/nowhere')).toEqual({});
  });
  it('routeExists knows the implemented pages only', () => {
    expect(routeExists('posts/new')).toBe(true); expect(routeExists('/promises/')).toBe(true); expect(routeExists('gallery')).toBe(true); expect(routeExists('site-pages/home')).toBe(true); expect(routeExists('pages/home')).toBe(false);
  });
  it('date helpers speak Bangla in Asia/Dhaka time', () => {
    expect(bnDayShort('2026-09-25')).toBe('২৫ সেপ্টে');
    expect(bnDayLong('2026-09-25')).toBe('২৫ সেপ্টেম্বর ২০২৬');
    expect(bnWeekday(Date.UTC(2026, 8, 30, 12))).toBe('বুধবার');
    expect(bnGreeting(Date.UTC(2026, 8, 30, 3))).toBe('শুভ সকাল'); // 09:00 in Dhaka
    expect(bnGreeting(Date.UTC(2026, 8, 30, 12))).toBe('শুভ সন্ধ্যা'); // 18:00 in Dhaka
    const now = Date.UTC(2026, 8, 30, 12);
    expect(bnAgo(now - 20_000, now)).toBe('এইমাত্র');
    expect(bnAgo(now - 5 * 60_000, now)).toBe('৫ মিনিট আগে');
    expect(bnAgo(now - 3 * 3600_000, now)).toBe('৩ ঘণ্টা আগে');
    expect(bnAgo(now - 2 * 86400_000, now)).toBe('২ দিন আগে');
    expect(bnAgo(now - 30 * 86400_000, now)).toBe('৩১ আগস্ট ২০২৬');
    expect(bnAgo(undefined)).toBe('—');
    expect(bnUntil(new Date(now), now)).toBe('আজ');
    expect(bnUntil(new Date(now + 86400_000), now)).toBe('আগামীকাল');
    expect(bnUntil(new Date(now + 3 * 86400_000), now)).toBe('৩ দিন পরে');
  });
});
