import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Outlet, useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission, type Perm } from '@jonoprotinidhi/shared';
import { tenantApi, getActAs, setActAs, type TenantApi } from './api';
import { Shell, type NavItem, type ShellNotification } from './components/Shell';
import type { IconName } from './components/Icon';
import { ErrorBox, Loading } from './components/ui';
import { ROLE_LABEL, bnDateTime } from './format';

export type TenantInfo = {
  role: 'owner' | 'editor' | 'officer' | 'super_admin' | 'support';
  viaSuperAdmin: boolean; permissions: string[]; scope: string[];
  tenant: { id: string; slug: string; mpName: string; status: string; settings: { otpRequired: boolean; slaDays: number; complaintCategories: string[] } };
};
type Ctx = { id: string; info: TenantInfo; can: (p: Perm) => boolean; api: TenantApi };
const C = createContext<Ctx | null>(null);
export const useTenant = () => { const v = useContext(C); if (!v) throw new Error('TenantProvider missing'); return v; };

/** UI hint only: the API is the authority (a hidden button is not a security control). */
export const canDo = (perms: string[], p: Perm) => hasPermission(perms, p);

export function TenantProvider({ id, info, children }: { id: string; info: TenantInfo; children: ReactNode }) {
  const v = useMemo<Ctx>(() => ({ id, info, can: (p) => canDo(info.permissions, p), api: tenantApi(id) }), [id, info]);
  return <C.Provider value={v}>{children}</C.Provider>;
}

/* ------------------------------------------------------------------------------------------------------------------
   TENANT NAVIGATION: a plain array. Each entry is either a group heading or a page link.
     { group: 'কনটেন্ট' }
     { path: 'posts', label: 'পোস্ট ও কার্যক্রম', icon: 'posts', perm: 'posts.view' }
   `path` is relative to /t/:tenantId; `perm` is a permission or a list of permissions (any one shows the entry; a UI hint
   only, the API is the authority); `badge` shows a live count; `end` matches the path exactly. A group heading is only drawn
   when at least one entry below it is visible. Icons are names from components/Icon.tsx.

   TO ADD A PAGE: add the <Route> in App.tsx, add its line here, and add its path to KNOWN_TENANT_ROUTES in routes.ts
   (the dashboard checklist greys out links to pages that are not listed there).

   STRUCTURE: content (posts, approvals, promises, gallery, videos, events, media library), site pages (hub + one editor per
   page key under site-pages/<key>, banners & homepage order in 'site'), complaints, office (complaint-box settings, team, audit).
   The content editors live in pages/tenant/content/**.
   ------------------------------------------------------------------------------------------------------------------ */
export type NavSpec =
  | { group: string }
  | { path: string; label: string; icon: IconName; end?: boolean; perm?: Perm | Perm[]; badge?: 'approvals' | 'complaints' };

export const TENANT_NAV: NavSpec[] = [
  { path: '', label: 'ড্যাশবোর্ড', icon: 'dashboard', end: true },

  { group: 'কনটেন্ট' },
  { path: 'posts', label: 'পোস্ট ও কার্যক্রম', icon: 'posts', perm: 'posts.view' },
  { path: 'approvals', label: 'অনুমোদন', icon: 'approvals', perm: 'posts.publish', badge: 'approvals' },
  { path: 'promises', label: 'প্রতিশ্রুতি', icon: 'promises', perm: 'promises.edit' },
  { path: 'gallery', label: 'গ্যালারি', icon: 'gallery', perm: 'content.edit' },
  { path: 'videos', label: 'ভিডিও', icon: 'video', perm: 'content.edit' },
  { path: 'events', label: 'কর্মসূচি', icon: 'events', perm: 'content.edit' },
  { path: 'media', label: 'মিডিয়া লাইব্রেরি', icon: 'media', perm: 'media.upload' },

  { group: 'সাইটের পাতা' },
  { path: 'site-pages', label: 'সব পাতা', icon: 'layers', perm: 'content.edit', end: true },
  { path: 'site-pages/home', label: 'হোম পেজ', icon: 'home', perm: 'content.edit' },
  { path: 'site-pages/profile', label: 'পরিচিতি ও জীবনী', icon: 'profile', perm: 'content.edit' },
  { path: 'site-pages/area', label: 'নির্বাচনী এলাকা', icon: 'area', perm: 'content.edit' },
  { path: 'site-pages/contact', label: 'যোগাযোগ', icon: 'contact', perm: 'content.edit' },
  { path: 'site-pages/complaint', label: 'অভিযোগ পেজ', icon: 'complaints', perm: 'content.edit' },
  { path: 'site-pages/layout', label: 'হেডার ও ফুটার', icon: 'header', perm: 'content.edit' },
  { path: 'site-pages/heroes', label: 'পেজের শিরোনাম', icon: 'titles', perm: 'content.edit' },
  { path: 'site', label: 'ব্যানার ও হোমপেজ সাজানো', icon: 'banners', perm: 'site.edit' },

  { group: 'অভিযোগ' },
  { path: 'complaints', label: 'অভিযোগ', icon: 'complaints', perm: ['complaints.view_all', 'complaints.view_scoped'], badge: 'complaints' },

  { group: 'অফিস' },
  { path: 'settings', label: 'অভিযোগ বক্সের সেটিংস', icon: 'settings', perm: 'settings.edit' },
  { path: 'team', label: 'টিম ও ভূমিকা', icon: 'team', perm: 'team.manage' },
  { path: 'audit', label: 'অডিট লগ', icon: 'audit', perm: 'audit.view' },
];

/** Turn the spec into what the Shell draws: filtered by permission, with live badge counts, empty groups dropped. */
export function buildTenantNav(spec: NavSpec[], tenantId: string, can: (p: Perm) => boolean, counts: { approvals?: number; complaints?: number } = {}): NavItem[] {
  const out: NavItem[] = [];
  let pending: NavItem | null = null;
  for (const n of spec) {
    if ('group' in n) { pending = { group: n.group }; continue; }
    const perms = n.perm === undefined ? [] : Array.isArray(n.perm) ? n.perm : [n.perm];
    if (perms.length && !perms.some(can)) continue;
    if (pending) { out.push(pending); pending = null; }
    out.push({ to: n.path ? `/t/${tenantId}/${n.path}` : `/t/${tenantId}`, label: n.label, icon: n.icon, end: n.end, badge: n.badge ? counts[n.badge] || undefined : undefined });
  }
  return out;
}

/** Address of the tenant's public site. Set VITE_PUBLIC_SITE_URL (optionally with {slug}) to override; otherwise admin.<domain>
    maps to <slug>.<domain>. On a developer machine (localhost) the default is the Next.js dev server at http://localhost:3000,
    which serves the local demo tenant (its TENANT_HOST) when opened on localhost. */
export const DEV_PUBLIC_SITE_URL = 'http://localhost:3000';
export function publicSiteUrl(slug: string, loc: Pick<Location, 'hostname' | 'protocol'> = window.location): string {
  const tpl = import.meta.env?.VITE_PUBLIC_SITE_URL as string | undefined;
  if (tpl) return tpl.replace('{slug}', slug);
  const h = loc.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return DEV_PUBLIC_SITE_URL;
  return `${loc.protocol}//${slug}.${h.replace(/^admin\./, '')}`;
}

/** Link to one page of the public site ("/about", "/gallery"...). */
export const publicPageUrl = (slug: string, path = '/') => `${publicSiteUrl(slug).replace(/\/+$/, '')}${path === '/' ? '/' : path}`;

export function TenantLayout() {
  const { tenantId = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tenant', tenantId, 'me'], queryFn: () => tenantApi(tenantId).get<TenantInfo>('/me'), retry: false });
  const pending = useQuery({
    queryKey: ['tenant', tenantId, 'pending'], enabled: !!q.data && canDo(q.data.permissions, 'posts.publish'),
    queryFn: async () => (await tenantApi(tenantId).get<{ total: number }>('/posts?status=review&limit=1&page=1')).total,
  });
  const openCount = useQuery({
    queryKey: ['tenant', tenantId, 'open-complaints'], enabled: !!q.data && (canDo(q.data.permissions, 'complaints.view_all') || canDo(q.data.permissions, 'complaints.view_scoped')),
    queryFn: async () => (await tenantApi(tenantId).get<{ total: number }>('/complaints?status=new&limit=1&page=1')).total,
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <Navigate to="/switch" replace />;
  const info = q.data;
  const can = (p: Perm) => canDo(info.permissions, p);
  const counts = { approvals: pending.data || 0, complaints: openCount.data || 0 };
  const nav = buildTenantNav(TENANT_NAV, tenantId, can, counts);
  const notifications: ShellNotification[] = [
    ...(can('posts.publish') ? [{ key: 'approvals', label: 'অনুমোদনের অপেক্ষায় পোস্ট', count: counts.approvals, to: `/t/${tenantId}/approvals`, icon: 'approvals' as IconName }] : []),
    ...(can('complaints.view_all') || can('complaints.view_scoped') ? [{ key: 'complaints', label: 'নতুন অভিযোগ', count: counts.complaints, to: `/t/${tenantId}/complaints`, icon: 'complaints' as IconName }] : []),
  ];
  const act = getActAs();
  const banner = info.viaSuperAdmin ? (
    <div className="imp"><span><b>Super Admin হিসেবে</b> এই সাইটে আছেন। আপনার প্রতিটি কাজ অডিট লগে "Super Admin" নামে লেখা হচ্ছে। নাগরিকের নাম-নম্বর এখানে দেখা যায় না।{act ? ` (মেয়াদ: ${bnDateTime(new Date(act.expiresAt))})` : ''}</span>
      <Link to="/super" onClick={() => { setActAs(null); qc.clear(); }}>ফিরে যান →</Link></div>
  ) : undefined;
  return (
    <TenantProvider id={tenantId} info={info}>
      <Shell brand={{ small: 'জনপ্রতিনিধি · অ্যাডমিন', title: info.tenant.mpName, sub: info.tenant.status === 'live' ? 'সাইট লাইভ' : 'সাইট এখনো প্রকাশিত নয়', live: info.tenant.status === 'live' }}
        nav={nav} banner={banner} roleLabel={ROLE_LABEL[info.role] ?? info.role} siteUrl={publicSiteUrl(info.tenant.slug)} notifications={notifications}
        cta={can('posts.create') ? { label: 'নতুন পোস্ট', to: `/t/${tenantId}/posts/new` } : undefined}>
        <Outlet />
      </Shell>
    </TenantProvider>
  );
}

export { ErrorBox };
