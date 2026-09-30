import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PageKey } from '@jonoprotinidhi/shared';
import { ApiFail, type TenantApi } from '../../../api';
import { Button, Dialog, type IconName } from '../../../components';
import { ImagePicker } from '../../../components/ImagePicker';
import { toBn } from '../../../format';

/* Shared helpers for the content screens (site pages, gallery, videos, events, media library). */

export const CONTENT_STATUS: Record<string, [string, string]> = { draft: ['খসড়া', 'plain'], published: ['প্রকাশিত', 'ok'] };
export const PAGE_STATUS: Record<string, [string, string]> = { empty: ['এখনো লেখা হয়নি', 'plain'], draft: ['খসড়া', 'warn'], published: ['প্রকাশিত', 'ok'] };

/** What each site page edits, where it shows on the public site, and its icon. */
export const PAGE_META: Record<PageKey, { icon: IconName; desc: string; path: string }> = {
  home: { icon: 'home', desc: 'হিরো লেখা, সংখ্যায় কাজ, প্রতিটি অংশের শিরোনাম আর অভিযোগের আহ্বান।', path: '/' },
  profile: { icon: 'profile', desc: 'প্রতিকৃতি, পরিচিতি, জীবনের গল্প, মাইলফলক, শিক্ষা, পেশা, রাজনীতি, সম্মাননা।', path: '/about' },
  area: { icon: 'area', desc: 'এলাকার পরিচিতি, মোট হিসাব, ভোটার, উপজেলা ও ইউনিয়নের তালিকা।', path: '/area' },
  contact: { icon: 'contact', desc: 'অফিসের ঠিকানা ও সময়, যোগাযোগের মাধ্যম, হটলাইন।', path: '/contact' },
  complaint: { icon: 'complaints', desc: 'অভিযোগ বক্সের ভূমিকা, কীভাবে কাজ করে, গোপনীয়তা, প্রশ্নোত্তর।', path: '/complaint' },
  layout: { icon: 'header', desc: 'ঘোষণা বার, ট্যাগলাইন, ফুটারের লেখা, ছবির কৃতজ্ঞতা, সোশ্যাল লিংক।', path: '/' },
  heroes: { icon: 'titles', desc: 'প্রতিটি ভেতরের পাতার ওপরের ছোট লেখা, শিরোনাম আর ভূমিকা।', path: '/about' },
};
export const PAGE_ORDER: PageKey[] = ['home', 'profile', 'area', 'contact', 'complaint', 'layout', 'heroes'];

export const errText = (e: unknown) => (e instanceof ApiFail ? e.message : 'কিছু ভুল হয়েছে, আবার চেষ্টা করুন');

/* ---------- zod issues -> Bangla messages keyed by dotted path ---------- */
type Issue = { code: string; path: (string | number)[]; message: string; type?: string; minimum?: number | bigint; maximum?: number | bigint; validation?: unknown };
export function bnIssue(i: Issue): string {
  const n = (v?: number | bigint) => toBn(Number(v ?? 0));
  switch (i.code) {
    case 'too_small':
      if (i.type === 'string') return Number(i.minimum) <= 1 ? 'এই ঘরটি পূরণ করুন' : `কমপক্ষে ${n(i.minimum)} অক্ষর লিখুন`;
      if (i.type === 'array') return `কমপক্ষে ${n(i.minimum)}টি দিন`;
      return 'মান খুব ছোট';
    case 'too_big':
      if (i.type === 'string') return `সর্বোচ্চ ${n(i.maximum)} অক্ষর লেখা যায়`;
      if (i.type === 'array') return `সর্বোচ্চ ${n(i.maximum)}টি দেওয়া যায়`;
      return 'মান খুব বড়';
    case 'invalid_string': return i.validation === 'url' ? 'সঠিক লিংক দিন (https:// দিয়ে শুরু)' : 'সঠিক মান দিন';
    case 'invalid_date': return 'সঠিক তারিখ দিন';
    case 'invalid_enum_value': return 'তালিকা থেকে একটি বাছুন';
    case 'custom': return i.message === 'invalid characters' ? 'এতে অবৈধ অক্ষর আছে' : i.message;
    default: return /[ঀ-৿]/.test(i.message) ? i.message : 'সঠিক মান দিন';
  }
}
/** First message per dotted path ("stats.0.n"). */
export function issuesToErrors(issues: Issue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) { const k = i.path.join('.'); if (!(k in out)) out[k] = bnIssue(i); }
  return out;
}

/* ---------- small formatting helpers ---------- */
export function bnBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${toBn(n)} বাইট`;
  if (n < 1024 * 1024) return `${toBn(Math.round(n / 1024))} কিলোবাইট`;
  return `${toBn((n / 1024 / 1024).toFixed(1))} মেগাবাইট`;
}
/** Today in Asia/Dhaka as YYYY-MM-DD. */
export function dhakaToday(now = Date.now()): string { return new Date(now + 6 * 3600_000).toISOString().slice(0, 10); }
/** An ISO date (stored as UTC midnight or Dhaka morning) -> YYYY-MM-DD in Dhaka, for <input type=date>. */
export function isoDay(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = new Date(v); if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 6 * 3600_000).toISOString().slice(0, 10);
}
/** YYYY-MM-DD from a date input -> ISO string at 10:00 Dhaka (04:00 UTC), so the day never shifts across time zones. */
export const dayToIso = (day: string) => (day ? `${day}T04:00:00.000Z` : undefined);

/** Loads every page of an admin collection (limit 100 per request, at most `maxPages`). */
export async function fetchAll<T>(api: Pick<TenantApi, 'get'>, path: string, maxPages = 5): Promise<{ items: T[]; counts: Record<string, number>; total: number }> {
  const sep = path.includes('?') ? '&' : '?';
  const first = await api.get<{ items: T[]; totalPages?: number; total?: number; counts?: Record<string, number> }>(`${path}${sep}limit=100&page=1`);
  const items = [...(first?.items ?? [])];
  for (let p = 2; p <= Math.min(first?.totalPages ?? 1, maxPages); p++) items.push(...((await api.get<{ items: T[] }>(`${path}${sep}limit=100&page=${p}`))?.items ?? []));
  return { items, counts: first?.counts ?? {}, total: first?.total ?? items.length };
}

/* ---------- character counter ---------- */
export function CharCount({ n, max }: { n: number; max: number }) {
  const pct = n / max;
  return <span className={`ct-count${pct >= 1 ? ' over' : pct >= 0.9 ? ' near' : ''}`} aria-hidden>{toBn(n)}/{toBn(max)}</span>;
}

/* ---------- confirm dialog ---------- */
export function Confirm({ open, title, children, confirmLabel = 'নিশ্চিত করুন', danger, busy, onConfirm, onClose }: { open: boolean; title: string; children?: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog title={title} open={open} onClose={onClose} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>বাতিল</Button><Button variant={danger ? 'danger' : 'accent'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>
      {children}
    </Dialog>
  );
}

/* ---------- leaving with unsaved changes ---------- */
/** Warns before in-app navigation (clicks on internal links) and before closing/reloading the tab while `dirty`.
    Returns a dialog element to render. BrowserRouter has no navigation blocker, so internal link clicks are intercepted. */
export function useLeaveGuard(dirty: boolean): ReactNode {
  const nav = useNavigate();
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const next = url.pathname + url.search + url.hash;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault(); e.stopPropagation();
      setTo(next);
    };
    window.addEventListener('beforeunload', before);
    document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', before); document.removeEventListener('click', click, true); };
  }, [dirty]);
  return (
    <Confirm open={to !== null} title="অসংরক্ষিত পরিবর্তন আছে" confirmLabel="পরিবর্তন ফেলে চলে যান" danger
      onClose={() => setTo(null)} onConfirm={() => { const t = to; setTo(null); if (t) setTimeout(() => nav(t), 0); }}>
      <p>এই পাতায় আপনার কিছু পরিবর্তন এখনো সংরক্ষণ হয়নি। চলে গেলে সেগুলো হারিয়ে যাবে।</p>
    </Confirm>
  );
}

/* ---------- reordering (drag & drop + keyboard buttons) ---------- */
/** Local order of a list of ids with move helpers and HTML5 drag & drop handlers. `dirty` is true after a change. */
export function useReorder(ids: string[]) {
  const [order, setOrder] = useState<string[]>(ids);
  const key = ids.join(',');
  const base = useRef(key);
  useEffect(() => { base.current = key; setOrder(ids); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const move = useCallback((id: string, delta: number) => setOrder((o) => {
    const i = o.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= o.length) return o;
    const n = [...o]; n.splice(i, 1); n.splice(j, 0, id); return n;
  }), []);
  const dropOn = useCallback((target: string, src: string | null) => setOrder((o) => {
    if (!src || src === target) return o;
    const n = o.filter((x) => x !== src); const j = n.indexOf(target);
    n.splice(o.indexOf(src) < o.indexOf(target) ? j + 1 : j, 0, src); return n;
  }), []);
  const dnd = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* old browsers */ } },
    onDragEnd: () => { setDragging(null); setOver(null); },
    onDragOver: (e: DragEvent) => { if (!dragging) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== id) setOver(id); },
    onDragLeave: () => { if (over === id) setOver(null); },
    onDrop: (e: DragEvent) => { e.preventDefault(); dropOn(id, dragging); setDragging(null); setOver(null); },
    'data-dragging': dragging === id ? '' : undefined,
    'data-over': over === id && dragging !== id ? '' : undefined,
  });
  return { order, setOrder, move, dnd, dirty: order.join(',') !== base.current, reset: () => setOrder(base.current ? base.current.split(',') : []) };
}

/** One optional image (poster, banner photo): a preview with "change"/"remove" when set, otherwise the upload/library picker. */
export function SingleImage({ url, onChange, label, alt = '', error, ratio = '16/9', noPreview }: { url: string; onChange: (url: string, credit?: string) => void; label: string; alt?: string; error?: string; ratio?: string; /** the caller already shows the image */ noPreview?: boolean }) {
  if (url) {
    return (
      <div className="ct-single">
        {!noPreview && <img src={url} alt={alt || label} style={{ aspectRatio: ratio }} />}
        <div className="ct-single-a"><Button size="sm" icon="refresh" onClick={() => onChange('')} aria-label={`${label} বদলান`}>বদলান</Button><Button size="sm" variant="danger" icon="trash" onClick={() => onChange('')} aria-label={`${label} সরান`}>সরান</Button></div>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
    );
  }
  return <ImagePicker max={1} value={[]} error={error} onChange={(v) => { if (v[0]) onChange(v[0].url, v[0].credit); }} />;
}

/** Progress bar for one upload (0..1). */
export function UploadBar({ label, value, state, onCancel }: { label: string; value: number; state: 'up' | 'ok' | 'bad'; onCancel?: () => void }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`ct-up ${state}`}>
      <div className="ct-up-t"><span className="grow">{label}</span><b className="num">{state === 'bad' ? 'ব্যর্থ' : state === 'ok' ? 'সম্পন্ন' : `${toBn(pct)}%`}</b>
        {onCancel && state === 'up' && <button type="button" className="link" onClick={onCancel}>বাতিল</button>}</div>
      <div className="ct-up-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
