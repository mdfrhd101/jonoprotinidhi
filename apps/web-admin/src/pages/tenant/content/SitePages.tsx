import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PageKey } from '@jonoshetu/shared';
import { useTenant, publicPageUrl } from '../../../tenant';
import { Badge, Button, Card, EmptyState, Icon, PageHead, PillOf, ProgressBar, SectionHeader, Skeleton, useToast, type IconName } from '../../../components';
import { bnAgo, bnDateTime, toBn } from '../../../format';
import { PAGE_META, PAGE_ORDER, PAGE_STATUS, errText } from './common';

/* Hub of the site pages: one card per page with its state, links to the editors, and (for the owner) one-click publish. */

type PageRow = { key: PageKey; label: string; status: 'empty' | 'draft' | 'published'; hasUnpublishedChanges: boolean; updatedAt: string | null; publishedAt: string | null };

export default function SitePages() {
  const { api, id, can, info } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['tenant', id, 'pages'], queryFn: () => api.get<PageRow[]>('/pages') });
  const [busy, setBusy] = useState<string | null>(null);
  const canPublish = can('content.publish');

  const publish = async (k: PageKey) => {
    setBusy(k);
    try {
      await api.post(`/pages/${k}/publish`);
      await qc.invalidateQueries({ queryKey: ['tenant', id, 'pages'] });
      void qc.invalidateQueries({ queryKey: ['tenant', id, 'page', k] });
      toast('প্রকাশ হয়েছে, পাবলিক সাইটে দেখা যাচ্ছে', 'ok');
    } catch (e) { toast(errText(e), 'bad'); } finally { setBusy(null); }
  };

  const rows = PAGE_ORDER.map((k) => q.data?.find((r) => r.key === k)).filter((r): r is PageRow => !!r);
  const published = rows.filter((r) => r.status === 'published' || (r.status === 'draft' && r.publishedAt)).length;
  const pending = rows.filter((r) => r.hasUnpublishedChanges && r.status !== 'empty').length;

  return (
    <>
      <PageHead kicker="সাইটের পাতা" icon="layers" title="ওয়েবসাইটের সব লেখা" sub="পাবলিক সাইটের প্রতিটি পাতার লেখা এখান থেকে বদলানো যায়। খসড়া সংরক্ষণ করলে সাইট বদলায় না; প্রকাশ করলে তবেই বদলায়।"
        actions={<Button href={publicPageUrl(info.tenant.slug, '/')} icon="external">লাইভ সাইট দেখুন ↗</Button>} />
      {q.isError ? (
        <div className="card"><EmptyState icon="alert" title="পাতার তালিকা লোড হয়নি" text={errText(q.error)} action={<Button icon="refresh" onClick={() => q.refetch()}>আবার চেষ্টা করুন</Button>} /></div>
      ) : (
        <>
          <Card className="ct-hub-sum" pad="md">
            {q.isLoading ? <Skeleton h={40} /> : (
              <div className="ct-hub-sum-in">
                <div className="grow"><b className="num">{toBn(published)}/{toBn(rows.length)}</b> পাতা প্রকাশিত{pending > 0 && <> · <span className="ct-warn">{toBn(pending)}টিতে প্রকাশের অপেক্ষায় পরিবর্তন</span></>}
                  <ProgressBar value={rows.length ? (published / rows.length) * 100 : 0} tone="green" label="প্রকাশিত পাতা" /></div>
                {pending > 0 && !canPublish && <p className="muted ct-small">MP প্রকাশ করলে পরিবর্তনগুলো সাইটে যাবে।</p>}
              </div>
            )}
          </Card>
          <div className="ct-hub">
            {q.isLoading ? Array.from({ length: 6 }, (_, i) => <div className="card ct-page" key={i}><Skeleton w={44} h={44} r={12} /><Skeleton w="50%" h={20} /><Skeleton h={14} /><Skeleton h={14} w="70%" /></div>)
              : rows.map((r) => {
                const m = PAGE_META[r.key];
                return (
                  <article className={`card ct-page${r.hasUnpublishedChanges && r.status !== 'empty' ? ' pending' : ''}`} key={r.key}>
                    <div className="ct-page-h">
                      <span className="chip-ico"><Icon name={m.icon} size={20} /></span>
                      <PillOf map={PAGE_STATUS} k={r.status === 'draft' && r.publishedAt ? 'published' : r.status} />
                    </div>
                    <h2 className="h2"><Link to={r.key} className="ct-page-link">{r.label}</Link></h2>
                    <p className="muted">{m.desc}</p>
                    {r.hasUnpublishedChanges && r.status !== 'empty' && <Badge tone="warn" icon="clock">অপ্রকাশিত পরিবর্তন আছে</Badge>}
                    <dl className="ct-page-d">
                      <div><dt>শেষ সংরক্ষণ</dt><dd title={r.updatedAt ? bnDateTime(r.updatedAt) : undefined}>{r.updatedAt ? bnAgo(r.updatedAt) : '—'}</dd></div>
                      <div><dt>শেষ প্রকাশ</dt><dd title={r.publishedAt ? bnDateTime(r.publishedAt) : undefined}>{r.publishedAt ? bnAgo(r.publishedAt) : 'কখনো নয়'}</dd></div>
                    </dl>
                    <div className="acts ct-page-a">
                      <Button to={r.key} variant="primary" size="sm" icon="edit" aria-label={`${r.label} সম্পাদনা করুন`}>সম্পাদনা</Button>
                      {canPublish && r.hasUnpublishedChanges && r.status !== 'empty' && <Button size="sm" variant="accent" icon="rocket" loading={busy === r.key} aria-label={`${r.label} প্রকাশ করুন`} onClick={() => void publish(r.key)}>প্রকাশ করুন</Button>}
                      <Button size="sm" variant="quiet" href={publicPageUrl(info.tenant.slug, m.path)} icon="external" aria-label={`${r.label} লাইভ সাইটে দেখুন`}>দেখুন</Button>
                    </div>
                  </article>
                );
              })}
          </div>
        </>
      )}
      <SectionHeader title="আরও যা সম্পাদনা করা যায়" sub="সাইটের বাকি সব কনটেন্ট।" icon="sparkles" />
      <div className="ct-more">
        {([
          can('site.edit') && ['site', 'banners', 'ব্যানার ও হোমপেজ সাজানো', 'হোমপেজের বড় ছবি, স্লোগান, অংশের ক্রম'],
          ['../gallery', 'gallery', 'গ্যালারি', 'ছবি, অ্যালবাম, স্লাইডার'],
          ['../videos', 'video', 'ভিডিও', 'YouTube লিংক বা নিজের ভিডিও'],
          ['../events', 'events', 'কর্মসূচি', 'আসন্ন অনুষ্ঠান ও গণশুনানি'],
          can('posts.view') && ['../posts', 'posts', 'পোস্ট ও কার্যক্রম', 'খবর, ছবি, প্রতিবেদন'],
          can('promises.edit') && ['../promises', 'promises', 'প্রতিশ্রুতি', 'অগ্রগতির হিসাব'],
          can('media.upload') && ['../media', 'media', 'মিডিয়া লাইব্রেরি', 'আপলোড করা সব ছবি ও ভিডিও'],
        ].filter(Boolean) as Array<[string, IconName, string, string]>).map(([to, icon, label, sub]) => (
          <Link key={to} to={to === 'site' ? '../site' : to} relative="path" className="card ct-more-i">
            <span className="chip-ico sm"><Icon name={icon} size={17} /></span><span className="grow"><b>{label}</b><small>{sub}</small></span><Icon name="arrowRight" size={16} />
          </Link>
        ))}
      </div>
    </>
  );
}
