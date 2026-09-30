import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { papi } from '../../api';
import { useSession } from '../../session';
import { Shell, type NavItem, type ShellNotification } from '../../components/Shell';
import { Button, Card, EmptyState } from '../../components';
import { ROLE_LABEL } from '../../format';
import type { SuperDash } from './shared';

/* Platform-owner panel (Super Admin + read-only support). Only counts and site status: never complaint text or identities.
   The screens live in their own files; this module keeps the names App.tsx imports. */

export { SuperDashboard } from './Dashboard';
export { TenantsList } from './Tenants';
export { NewTenant } from './NewTenant';
export { TenantDetail } from './TenantDetail';
export { SuperAudit } from './Audit';
export { SuperDomains } from './Domains';

export function SuperLayout() {
  const { me } = useSession();
  const role = me?.user.platformRole;
  // badge counts come from the dashboard query (same cache key as the dashboard page, so no extra request there)
  const dash = useQuery({ queryKey: ['super', 'dash'], queryFn: () => papi.get<SuperDash>('/super/dashboard'), enabled: !!role, staleTime: 60_000 });
  if (!role) {
    return <div className="content"><Card><EmptyState icon="lock" title="এই প্যানেল শুধু প্ল্যাটফর্ম টিমের জন্য" text="আপনার অ্যাকাউন্টে Super Admin বা সাপোর্টের অনুমতি নেই।" action={<Button to="/switch">আমার প্যানেলে যান</Button>} /></Card></div>;
  }
  const k = dash.data?.kpis;
  const urgent = dash.data ? new Set(dash.data.attention.filter((a) => a.kind === 'suspended' || a.kind === 'sla').map((a) => a.tenantId)).size : 0;
  const nav: NavItem[] = [
    { group: 'প্ল্যাটফর্ম' },
    { to: '/super', label: 'ড্যাশবোর্ড', icon: 'dashboard', end: true },
    { to: '/super/tenants', label: 'MP ও সাইট', icon: 'tenants', badge: k?.tenants.setup || undefined },
    { to: '/super/domains', label: 'ডোমেইন', icon: 'globe', badge: k?.domains.pending || undefined },
    { group: 'নিরাপত্তা' },
    { to: '/super/audit', label: 'অডিট লগ', icon: 'audit' },
  ];
  const notifications: ShellNotification[] = [
    { key: 'attn', label: 'জরুরি নজর দরকার এমন সাইট', count: urgent, to: '/super', icon: 'alert', hint: 'স্থগিত বা সময় পেরোনো অভিযোগ' },
    { key: 'dns', label: 'ডোমেইন যাচাইয়ের অপেক্ষায়', count: k?.domains.pending ?? 0, to: '/super/domains?f=pending', icon: 'globe' },
    { key: 'setup', label: 'সেটআপ চলছে এমন সাইট', count: k?.tenants.setup ?? 0, to: '/super/tenants?status=setup', icon: 'rocket' },
  ];
  return (
    <Shell brand={{ small: 'জনপ্রতিনিধি · SUPER ADMIN', title: 'প্ল্যাটফর্ম নিয়ন্ত্রণ', sub: 'সব MP-র সাইট এক জায়গা থেকে' }} roleLabel={ROLE_LABEL[role] ?? role}
      nav={nav} notifications={notifications} cta={role === 'super_admin' ? { label: 'নতুন MP যোগ করুন', to: '/super/tenants/new', icon: 'plus' } : undefined}>
      <Outlet />
    </Shell>
  );
}
