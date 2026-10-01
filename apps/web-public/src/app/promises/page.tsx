import type { Metadata } from 'next';
import PromiseBoard from '@/components/PromiseBoard';
import { PageHero, PromiseSummary } from '@/components/blocks';
import { getPage, getPromises, getSite, soft, pageImage } from '@/lib/api';
import { PAGE_NAME } from '@/lib/nav';
import { SECTOR_LABEL, bnDateSafe, sectorsOf, toBn } from '@/lib/format';

export const metadata: Metadata = { title: PAGE_NAME.promises };

export default async function Promises() {
  const site = await getSite();
  const [heroes, data] = await Promise.all([soft(getPage('heroes'), null), getPromises()]);
  const img = (await pageImage(site, 'promises'));
  const items = data.items;
  const sectors = sectorsOf(items);
  const last = items.map((p) => p.lastChangedAt).filter(Boolean).sort().at(-1);
  return (
    <>
      <PageHero hero={heroes?.promises} fallbackTitle={PAGE_NAME.promises} image={img?.url} credit={img?.caption} crumbs={[{ label: PAGE_NAME.promises }]} />
      <section className="sec light"><div className="wrap">
        {items.length ? <>
          <PromiseSummary summary={data.summary} />
          <nav className="sec-sum reveal" aria-label="খাত">
            {sectors.map((k) => {
              const l = items.filter((p) => p.sector === k);
              return <a key={k} href={`#sec-${k}`}><b>{SECTOR_LABEL[k] ?? k}</b><span>{toBn(l.length)}টি · {toBn(l.filter((p) => p.status === 'done').length)}টি সম্পন্ন</span></a>;
            })}
          </nav>
          <PromiseBoard items={items} />
          {last && <p className="hint" style={{ color: 'var(--muted-dark)', marginTop: 40 }}>শেষ হালনাগাদ: {bnDateSafe(last)}। অগ্রগতির প্রতিটি পরিবর্তন কার্যালয়ের রেকর্ডে থাকে।</p>}
        </> : <p className="empty" style={{ color: 'var(--muted-dark)' }}>প্রতিশ্রুতির তালিকা শিগগিরই প্রকাশ করা হবে।</p>}
      </div></section>
    </>
  );
}
