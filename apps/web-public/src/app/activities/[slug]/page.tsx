import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AlbumTiles from '@/components/AlbumTiles';
import CopyLink from '@/components/CopyLink';
import { More, NewsCard, PageHero, SecHead } from '@/components/blocks';
import { ApiFetchError, getAllPosts, getPost, getPosts, getSite, soft } from '@/lib/api';
import { PAGE_NAME } from '@/lib/nav';
import { POST_CATEGORY_LABEL, bnDateSafe, joinParts, toBn } from '@/lib/format';
import { sanitizeBody, splitAfterFirstBlock, textOf } from '@/lib/sanitize';
import { STATIC_EXPORT } from '@/lib/staticMode';

type P = { params: { slug: string } };

// A static export needs every post's address up front. In the normal (server-rendered) site this is undefined: no change.
export const generateStaticParams = STATIC_EXPORT
  ? async () => (await getAllPosts()).items.map((p) => ({ slug: p.slug }))
  : undefined;

async function load(slug: string) {
  try { return await getPost(slug); } catch (e) { if (e instanceof ApiFetchError && e.status === 404) return null; throw e; }
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await soft(load(params.slug), null);
  if (!p) return { title: 'কার্যক্রম পাওয়া যায়নি' };
  return { title: p.title, description: p.summary || textOf(p.body ?? '', 160), openGraph: p.media?.[0]?.url ? { images: [p.media[0].url] } : undefined };
}

export default async function Activity({ params }: P) {
  const [site, p] = await Promise.all([getSite(), load(params.slug)]);
  if (!p) notFound();
  const [same, latest] = await Promise.all([soft(getPosts({ category: p.category, limit: 4 }), null), soft(getPosts({ limit: 12 }), null)]);
  const all = latest?.items ?? [];
  const idx = all.findIndex((x) => x.slug === p.slug);
  const newer = idx > 0 ? all[idx - 1] : undefined;
  const older = idx >= 0 ? all[idx + 1] : undefined;
  const related = [...(same?.items ?? []), ...all].filter((x, i, arr) => x.slug !== p.slug && arr.findIndex((y) => y.slug === x.slug) === i).slice(0, 3);
  const body = sanitizeBody(p.body);
  const [first, rest] = splitAfterFirstBlock(body);
  const media = (p.media ?? []).filter((m) => m.url);
  const cat = POST_CATEGORY_LABEL[p.category] ?? p.category;
  const date = bnDateSafe(p.eventDate);
  return (
    <>
      <PageHero long hero={{ title: p.title }} fallbackTitle={p.title} image={media[0]?.url} credit={media[0]?.credit}
        crumbs={[{ label: PAGE_NAME.activities, href: '/activities' }, { label: p.title }]}
        meta={<p className="pmeta"><span className="cat">{cat}</span>{date && <span>{date}</span>}{(p.place || p.upazila) && <span>{p.place || p.upazila}</span>}</p>} />
      <section className="sec light"><div className="wrap art-grid">
        <article>
          <div className="art-body reveal">
            {body ? <>
              <div dangerouslySetInnerHTML={{ __html: first }} />
              {p.quote && <blockquote className="pull"><p>{p.quote}</p>{site.mp.name && <cite>{site.mp.name}</cite>}</blockquote>}
              {rest && <div dangerouslySetInnerHTML={{ __html: rest }} />}
            </> : <>
              {p.summary && <p>{p.summary}</p>}
              {p.quote && <blockquote className="pull"><p>{p.quote}</p>{site.mp.name && <cite>{site.mp.name}</cite>}</blockquote>}
            </>}
          </div>
          {media.length > 0 && <>
            <div className="album-h reveal"><h2 className="h3">ছবির অ্যালবাম</h2><span>{toBn(media.length)}টি ছবি · বড় করে দেখতে ছবিতে চাপ দিন</span></div>
            <AlbumTiles items={media.map((m) => ({ url: m.url, caption: m.caption || p.title, credit: m.credit, sub: joinParts([date, p.place]) }))} />
          </>}
          {(newer || older) && (
            <nav className="pager" aria-label="অন্য কার্যক্রম">
              {newer ? <Link href={`/activities/${encodeURIComponent(newer.slug)}`}><small>← নতুন কার্যক্রম</small><b>{newer.title}</b></Link> : <span />}
              {older && <Link className="next" href={`/activities/${encodeURIComponent(older.slug)}`}><small>আগের কার্যক্রম →</small><b>{older.title}</b></Link>}
            </nav>
          )}
        </article>
        <aside className="art-side reveal" aria-label="এক নজরে">
          <p className="kicker">এক নজরে</p>
          <dl className="dl">
            {date && <><dt>তারিখ</dt><dd>{date}</dd></>}
            {p.place && <><dt>স্থান</dt><dd>{p.place}</dd></>}
            {p.upazila && <><dt>উপজেলা</dt><dd>{p.upazila}</dd></>}
            <dt>বিষয়</dt><dd>{cat}</dd>
            {media.length > 0 && <><dt>ছবি</dt><dd>{toBn(media.length)}টি</dd></>}
          </dl>
          <CopyLink />
          {site.complaintBoxEnabled && <Link className="btn btn-dark" href="/complaint" style={{ marginTop: 10 }}>এ বিষয়ে কিছু জানাতে চান?</Link>}
        </aside>
      </div></section>
      {related.length > 0 && (
        <section className="sec dark"><div className="wrap">
          <SecHead h={{ kicker: 'আরও পড়ুন', title: 'সম্পর্কিত কার্যক্রম' }} right={<More href="/activities">সব কার্যক্রম</More>} />
          <div className="news">{related.map((x) => <NewsCard key={x.slug} p={x} />)}</div>
        </div></section>
      )}
    </>
  );
}
