import type { Metadata } from 'next';
import SafeImg from '@/components/SafeImg';
import { More, PageHero, heroImage } from '@/components/blocks';
import { getPage, getSite, soft } from '@/lib/api';
import { PAGE_NAME } from '@/lib/nav';
import { splitYear } from '@/lib/format';
import type { ProfilePage } from '@/lib/types';

export const metadata: Metadata = { title: PAGE_NAME.biography };

const BIO = [['edu', 'শিক্ষাজীবন', 'education'], ['work', 'পেশাগত জীবন', 'profession'], ['politics', 'রাজনৈতিক জীবন', 'politics']] as const;

function Timeline({ list, mid, nowLast }: { list: ProfilePage['education']; mid?: boolean; nowLast?: boolean }) {
  return (
    <ol className={`tl${mid ? ' mid' : ''}`}>
      {list.map((e, i) => {
        const y = splitYear(e.year);
        return (
          <li key={i} className={`reveal${nowLast && i === list.length - 1 ? ' now' : ''}`}>
            <span className="yr">{y.small && <small>{y.small}</small>}{y.big}</span>
            <div><h3>{e.title}</h3><p>{e.place && <span className="place">{e.place}</span>}{e.note}</p></div>
          </li>
        );
      })}
    </ol>
  );
}

export default async function Biography() {
  const site = await getSite();
  const [heroes, p] = await Promise.all([soft(getPage('heroes'), null), getPage('profile')]);
  const img = heroImage(site, 'biography');
  const blocks = BIO.filter(([, , k]) => p[k].length > 0);
  return (
    <>
      <PageHero hero={heroes?.biography} fallbackTitle={PAGE_NAME.biography} image={img?.url} credit={img?.caption}
        crumbs={[{ label: PAGE_NAME.about, href: '/about' }, { label: PAGE_NAME.biography }]} />
      <section className="sec light-2"><div className="wrap">
        {blocks.length > 0 ? <>
          <nav className="chips reveal" aria-label="অংশে যান" style={{ marginBottom: 64 }}>
            {blocks.map(([id, t]) => <a key={id} className="chip" href={`#${id}`} style={{ textDecoration: 'none' }}>{t}</a>)}
          </nav>
          <div className="two-col wide-l" style={{ alignItems: 'start' }}>
            <div>
              {blocks.map(([id, t, k]) => (
                <div key={id} className="tl-block" id={id} style={{ scrollMarginTop: 110 }}>
                  <h2 className="h3 reveal">{t}</h2>
                  <Timeline list={p[k]} mid={k === 'profession'} nowLast={k === 'politics'} />
                </div>
              ))}
            </div>
            {p.portrait.url && (
              <aside className="reveal" style={{ position: 'sticky', top: 110 }}>
                <figure className="portrait">
                  <SafeImg src={p.portrait.url} alt={site.mp.name} />
                  {p.portrait.credit && <figcaption>ছবি: {p.portrait.credit}</figcaption>}
                </figure>
                {p.roleLine && <p className="lead" style={{ marginTop: 0 }}>{p.roleLine}</p>}
              </aside>
            )}
          </div>
        </> : <p className="empty" style={{ color: 'var(--muted-dark)' }}>জীবনপঞ্জি শিগগিরই যোগ করা হবে।</p>}
      </div></section>
      <section className="sec light"><div className="wrap two-col">
        <div className="reveal"><p className="kicker">পরিচিতি</p><h2 className="h3" style={{ margin: '10px 0 16px' }}>ব্যক্তিগত তথ্য, সংসদীয় দায়িত্ব ও সম্মাননা</h2><More href="/about">পরিচিতি পেজে যান</More></div>
        <div className="reveal"><p className="kicker">কাজের হিসাব</p><h2 className="h3" style={{ margin: '10px 0 16px' }}>নির্বাচনী প্রতিশ্রুতি কতদূর এগোল</h2><More href="/promises">প্রতিশ্রুতির হিসাব দেখুন</More></div>
      </div></section>
    </>
  );
}
