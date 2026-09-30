import type { ReactNode } from 'react';
import { useSession } from '../../session';
import type { IconName } from '../../components';
import { toBn } from '../../format';
import '../../super.css';

/* Shared bits of the Super Admin screens: API response types, Bangla labels for audit actions, byte formatting. */

export type DomainLite = { id: string; host: string; type: 'platform' | 'custom'; primary: boolean; dnsStatus: 'pending' | 'active' | 'error'; sslStatus?: string };
export type TenantRow = {
  id: string; slug: string; mpName: string; seat: string; seatName: string; seatNumber: number; role: string; ministry: string; status: 'live' | 'setup' | 'suspended'; plan: 'basic' | 'full';
  createdAt: string; publishedPosts: number; postsLast30d: number; daysSinceLastPost: number | null; stale: boolean; complaintsLast30d: number; openComplaints: number; overdue: number;
  slaPct: number | null; promises: number; ownerActive: boolean; lastActivityAt: string | null; domains: DomainLite[];
};
export type AuditLine = { id: string; action: string; label: string | null; actorName: string | null; viaSuperAdmin: boolean; at: string; tenantId?: string | null; tenantName?: string | null };
export type Attention = {
  kind: 'suspended' | 'domain' | 'sla' | 'stale' | 'unpublished' | 'setup'; tone: 'bad' | 'warn' | 'info'; tenantId: string; mpName: string; seatName: string; seatNumber: number; slug: string;
  since?: string | null; hosts?: string[]; sslExpiring?: string[]; slaPct?: number | null; target?: number; overdue?: number; daysSinceLastPost?: number | null;
  pagesReady?: number; pagesTotal?: number; profilePublished?: boolean; ownerActive?: boolean;
};
export type SuperDash = {
  generatedAt: string;
  kpis: {
    tenants: { total: number; live: number; setup: number; suspended: number; ministers: number; newLast30d: number };
    complaints: { last30d: number; prev30d: number; open: number; overdue: number; resolvedLast30d: number; slaPct: number | null; slaTarget: number };
    posts: { publishedLast30d: number; prev30d: number; publishedTotal: number };
    media: { imageBytes: number; videoBytes: number; imageFiles: number; videoFiles: number };
    sms: { today: number; month: number; failedToday: number; capPerTenant: number; dailyCapacity: number; busiest: { tenantId: string; mpName: string; used: number; cap: number } | null };
    domains: { custom: number; pending: number; error: number; sslExpiringSoon: number };
  };
  series: Array<{ date: string; received: number; solved: number }>;
  openByTenant: Array<{ id: string; mpName: string; seatName: string; seatNumber: number; status: string; open: number; overdue: number }>;
  attention: Attention[];
  activity: AuditLine[];
};

export const MP_ROLE_LABEL: Record<string, string> = { mp: 'সংসদ সদস্য', minister: 'মন্ত্রী', state_minister: 'প্রতিমন্ত্রী', deputy_minister: 'উপমন্ত্রী' };
export const PLAN_LABEL: Record<string, string> = { full: 'পূর্ণ প্যাকেজ', basic: 'মৌলিক প্যাকেজ' };
export const DNS_LABEL: Record<string, [string, string]> = { active: ['যাচাই হয়েছে', 'ok'], pending: ['যাচাই বাকি', 'warn'], error: ['DNS পাওয়া যায়নি', 'bad'] };

/** "নদীপুর-৩" (Bangla digit; BUG-2026-016 style). */
export const seatOf = (x: { seatName: string; seatNumber: number }) => `${x.seatName}-${toBn(x.seatNumber)}`;

export function useIsSuper() {
  const { me } = useSession();
  return me?.user.platformRole === 'super_admin';
}

/** Bytes in Bangla with a binary unit: "১২.৪ MB". */
export function formatBytes(n: number): string {
  if (!n) return '০ B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${toBn(v >= 100 || i === 0 ? Math.round(v) : Math.round(v * 10) / 10)} ${u[i]}`;
}

/* ---------- audit actions in Bangla ---------- */
const EXACT: Record<string, string> = {
  'tenant.create': 'নতুন MP-র সাইট তৈরি', 'tenant.act_as': 'সাইটের অ্যাডমিনে প্রবেশ (act-as)', 'tenant.status.live': 'সাইট লাইভ করা হয়েছে',
  'tenant.status.suspended': 'সাইট স্থগিত করা হয়েছে', 'tenant.status.setup': 'সাইট সেটআপে ফেরানো হয়েছে',
  'domain.add': 'কাস্টম ডোমেইন যোগ', 'domain.verify': 'ডোমেইন যাচাই সম্পন্ন', 'domain.primary': 'প্রধান ডোমেইন বদল',
  'auth.locked': 'বারবার ভুল পাসওয়ার্ড: অ্যাকাউন্ট সাময়িক লক', 'auth.logout_all': 'সব ডিভাইস থেকে লগআউট', 'auth.refresh_reuse': 'সন্দেহজনক সেশন ব্যবহার ধরা পড়েছে',
  'complaint.create': 'নতুন অভিযোগ জমা পড়েছে', 'complaint.update': 'অভিযোগের অবস্থা বা দায়িত্ব বদল', 'complaint.note': 'অভিযোগে নোট যোগ',
  'complaint.sms': 'নাগরিককে SMS পাঠানো', 'complaint.pii_view': 'দায়িত্বপ্রাপ্ত কর্মকর্তা নাগরিকের পরিচয় দেখেছেন', 'complaint.export': 'অভিযোগের রিপোর্ট নামানো',
  'complaint.pii_purge': 'মেয়াদোত্তীর্ণ পরিচয় মুছে ফেলা', 'post.approve': 'পোস্ট অনুমোদন ও প্রকাশ', 'post.schedule': 'পোস্ট নির্ধারিত সময়ে প্রকাশের জন্য রাখা',
};
const NOUN: Record<string, string> = { post: 'পোস্ট', promise: 'প্রতিশ্রুতি', complaint: 'অভিযোগ', media: 'মিডিয়া ফাইল', profile: 'প্রোফাইল', site: 'সাইটের সাজ', settings: 'সেটিংস', team: 'টিম', page: 'পেজ', gallery: 'গ্যালারির ছবি', video: 'ভিডিও', event: 'কর্মসূচি', tenant: 'সাইট', domain: 'ডোমেইন', auth: 'লগইন' };
const VERB: Record<string, string> = {
  create: 'যোগ', edit: 'এডিট', update: 'হালনাগাদ', submit: 'অনুমোদনের জন্য পাঠানো', withdraw: 'ফিরিয়ে নেওয়া', publish: 'প্রকাশ', publish_scheduled: 'নির্ধারিত সময়ে প্রকাশ',
  reject: 'ফেরত পাঠানো', unpublish: 'অপ্রকাশিত', restore: 'পুনরুদ্ধার', restore_version: 'পুরনো সংস্করণ ফেরানো', delete: 'মুছে ফেলা', upload: 'আপলোড', add_update: 'অগ্রগতির হালনাগাদ',
  invite: 'নতুন সদস্যকে আমন্ত্রণ', remove: 'সদস্য সরানো', scope: 'দায়িত্বের এলাকা বদল', reorder: 'ক্রম বদল', discard: 'খসড়া বাতিল',
};
/** Readable Bangla sentence for an audit action code; unknown codes fall back to the code itself. */
export function actionLabel(action: string): string {
  if (EXACT[action]) return EXACT[action]!;
  const [noun = '', ...rest] = action.split('.');
  const n = NOUN[noun], v = VERB[rest.join('.')];
  return n && v ? `${n}: ${v}` : n ? `${n}: ${rest.join('.') || 'পরিবর্তন'}` : action;
}
export function actionTone(action: string): { icon: IconName; tone: 'ok' | 'warn' | 'bad' | 'info' | 'brass' | 'plain' } {
  if (action === 'tenant.act_as') return { icon: 'eye', tone: 'warn' };
  if (action === 'tenant.status.suspended' || /delete|remove|reject|locked|reuse/.test(action)) return { icon: 'alert', tone: 'bad' };
  if (action === 'tenant.status.live' || /verify|approve|publish/.test(action)) return { icon: 'checkCircle', tone: 'ok' };
  if (action.startsWith('tenant.')) return { icon: 'tenants', tone: 'brass' };
  if (action.startsWith('domain.')) return { icon: 'globe', tone: 'info' };
  if (action.startsWith('complaint.')) return { icon: 'complaints', tone: 'info' };
  if (action.startsWith('auth.')) return { icon: 'lock', tone: 'plain' };
  return { icon: 'activity', tone: 'plain' };
}
export const ACTION_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'সব ধরনের কাজ' }, { value: 'tenant.act_as', label: 'অ্যাডমিনে প্রবেশ (act-as)' }, { value: 'tenant.status', label: 'সাইটের অবস্থা বদল' },
  { value: 'tenant.create', label: 'নতুন সাইট তৈরি' }, { value: 'domain', label: 'ডোমেইন' }, { value: 'auth', label: 'লগইন ও নিরাপত্তা' }, { value: 'post', label: 'পোস্ট' },
  { value: 'page', label: 'পেজ' }, { value: 'promise', label: 'প্রতিশ্রুতি' }, { value: 'complaint', label: 'অভিযোগ (শুধু কাজের ধরন)' }, { value: 'team', label: 'টিম' },
  { value: 'site', label: 'সাইটের সাজ' }, { value: 'settings', label: 'সেটিংস' }, { value: 'media', label: 'মিডিয়া' }, { value: 'gallery', label: 'গ্যালারি' }, { value: 'video', label: 'ভিডিও' }, { value: 'event', label: 'কর্মসূচি' },
];

/** Section wrapper used by the detail page: label + value rows. */
export function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return <dl className="dl sa-facts">{rows.map(([k, v]) => <div key={k} className="sa-fact"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
