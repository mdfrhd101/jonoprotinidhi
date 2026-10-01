import type { Metadata } from 'next';
import Link from 'next/link';
import FilterForm from '@/components/FilterForm';
import { NewsCard, PageHero } from '@/components/blocks';
import { getAllPosts, getPage, getPosts, getSite, soft, pageImage } from '@/lib/api';
import { PAGE_NAME } from '@/lib/nav';
import { POST_CATEGORY_LABEL, toBn } from '@/lib/format';
import { pageList } from '@/lib/slider';
import { STATIC_EXPORT } from '@/lib/staticMode';

export const metadata: Metadata = { title: PAGE_NAME.activities };

const PER_PAGE = 9;
type SP = { category?: string; upazila?: string; page?: string };

function href(q: { category?: string; upazila?: string; page?: number }) {
  const p = new URLSearchParams();
  if (q.category) p.set('category', q.category);
  if (q.upazila) p.set('upazila', q.upazila);
  if (q.page && q.page > 1) p.set('page', String(q.page));
  const s = p.toString();
  return `/activities${s ? '?' + s : ''}`;
}

export default async function Activities({ searchParams }: { searchParams: SP }) {
  const category = typeof searchParams.category === 'string' && searchParams.category in POST_CATEGORY_LABEL ? searchParams.category : '';
  const upazila = typeof searchParams.upazila === 'string' ? searchParams.upazila.slice(0, 60) : '';
  const page = Math.max(1, Math.min(500, Number.parseInt(String(searchParams.page ?? '1'), 10) || 1));
  const site = await getSite();
  const [heroes, area, posts] = await Promise.all([
    soft(getPage('heroes'), null), soft(getPage('area'), null),
    // a static export has no query string: it lists every post on one page, without the filters and pagination below
    STATIC_EXPORT ? getAllPosts() : getPosts({ category: category || undefined, upazila: upazila || undefined, page, limit: PER_PAGE }),
  ]);
  const img = (await pageImage(site, 'activities'));
  const upzOptions = [...new Set((area?.upazilas ?? []).map((u) => u.short || u.name).filter(Boolean))];
  if (upazila && !upzOptions.includes(upazila)) upzOptions.push(upazila);
  const cats: Array<[string, string]> = [['', 'সব'], ...Object.entries(POST_CATEGORY_LABEL)];
  const filtered = !!(category || upazila);
  return (
    <>
      <PageHero hero={heroes?.activities} fallbackTitle={PAGE_NAME.activities} image={img?.url} credit={img?.caption} crumbs={[{ label: PAGE_NAME.activities }]} />
      <section className="sec dark"><div className="wrap">
        {!STATIC_EXPORT && <div className="filters">
          <nav className="chips" aria-label="বিষয় অনুযায়ী দেখুন">
            {cats.map(([k, t]) => (
              <Link key={k || 'all'} className="chip as-link" href={href({ category: k, upazila })} aria-current={k === category ? 'page' : undefined}
                style={k === category ? { background: 'var(--brass)', color: 'var(--ink)', borderColor: 'var(--brass)' } : undefined} scroll={false}>{t}</Link>
            ))}
          </nav>
          {upzOptions.length > 0 && <FilterForm category={category} upazila={upazila} options={upzOptions} />}
          {filtered && <Link className="linkbtn" href="/activities" scroll={false} style={{ marginBottom: 12 }}>ফিল্টার মুছুন</Link>}
        </div>}
        <p className="count" aria-live="polite">{toBn(posts.total)}টি কার্যক্রম{posts.totalPages > 1 ? ` · পাতা ${toBn(page)}/${toBn(posts.totalPages)}` : ''}</p>
        {posts.items.length > 0 ? (
          <div className="news">{posts.items.map((p, i) => <NewsCard key={p.slug} p={p} feat={i === 0 && page === 1 && posts.items.length > 2} eager={i === 0} />)}</div>
        ) : (
          <p className="empty">{filtered ? 'এই ফিল্টারে কোনো কার্যক্রম নেই। অন্য বিষয় বা উপজেলা বেছে নিন।' : 'এখনো কোনো কার্যক্রম প্রকাশ করা হয়নি।'}</p>
        )}
        {posts.totalPages > 1 && (
          <nav className="pagination" aria-label="পাতা">
            {page > 1 && <Link href={href({ category, upazila, page: page - 1 })} aria-label="আগের পাতা">←</Link>}
            {pageList(page, posts.totalPages).map((x, i) => x === 'gap'
              ? <span key={`g${i}`} className="gap">…</span>
              : x === page ? <span key={x} aria-current="page">{toBn(x)}</span> : <Link key={x} href={href({ category, upazila, page: x })}>{toBn(x)}</Link>)}
            {page < posts.totalPages && <Link href={href({ category, upazila, page: page + 1 })} aria-label="পরের পাতা">→</Link>}
          </nav>
        )}
      </div></section>
    </>
  );
}
