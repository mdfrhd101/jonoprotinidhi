import type { Metadata } from 'next';
import Link from 'next/link';
import SafeImg from '@/components/SafeImg';
import { More, PageHero, SecHead, heroImage } from '@/components/blocks';
import { getPage, getSite, soft } from '@/lib/api';
import { PAGE_NAME } from '@/lib/nav';
import { splitYear, toBn } from '@/lib/format';

export const metadata: Metadata = { title: PAGE_NAME.about };

const BIO = [['edu', 'শিক্ষাজীবন', 'education'], ['work', 'পেশাগত জীবন', 'profession'], ['politics', 'রাজনৈতিক জীবন', 'politics']] as const;

export default async function About() {
  const site = await getSite();
  const [heroes, p] = await Promise.all([soft(getPage('heroes'), null), getPage('profile')]);
  const img = heroImage(site, 'about');
  const bio = BIO.filter(([, , k]) => p[k].length > 0);
  return (
    <>
      <PageHero hero={heroes?.about} fallbackTitle={site.mp.name || PAGE_NAME.about} image={img?.url} credit={img?.caption} crumbs={[{ label: PAGE_NAME.about }]} />

      <section className="sec light"><div className="wrap about-grid">
        <div className="about-left reveal">
          {p.portrait.url && (
            <figure className="portrait">
              <SafeImg src={p.portrait.url} alt={site.mp.name} eager />
              {p.portrait.credit && <figcaption>ছবি: {p.portrait.credit}</figcaption>}
            </figure>
          )}
          {p.personal.length > 0 && <>
            <p className="kicker">ব্যক্তিগত তথ্য</p>
            <h2 className="h3" style={{ marginTop: 10 }}>এক নজরে</h2>
            <ul className="facts wide">{p.personal.map((x, i) => <li key={i}><span>{x.label}</span>{x.value}</li>)}</ul>
          </>}
        </div>
        <div>
          <div className="reveal">
            {p.roleLine && <p className="kicker">{p.roleLine}</p>}
            {p.headline && <h2>{p.headline}</h2>}
            {p.intro && <p className="lead">{p.intro}</p>}
          </div>
          {p.story.length > 0 && <div className="prose reveal" style={{ marginTop: 28 }}>{p.story.map((s, i) => <p key={i}>{s}</p>)}</div>}
          {!p.headline && !p.intro && !p.story.length && <p className="empty" style={{ color: 'var(--muted-dark)' }}>পরিচিতি শিগগিরই যোগ করা হবে।</p>}
        </div>
      </div></section>

      {bio.length > 0 && (
        <section className="sec light-2"><div className="wrap">
          <SecHead h={{ kicker: 'জীবনপঞ্জি', title: 'শিক্ষা, পেশা ও রাজনীতি' }} right={<More href="/biography">পূর্ণ জীবনপঞ্জি</More>} />
          <nav className="sec-sum three reveal" aria-label="জীবনপঞ্জি">
            {bio.map(([id, t, k]) => {
              const l = p[k], last = l[l.length - 1]!;
              const y = splitYear(last.year);
              return <Link key={id} href={`/biography#${id}`}><b>{t}</b><span>{toBn(l.length)}টি ধাপ · সর্বশেষ: {last.title}{last.year ? `, ${[y.small, y.big].filter(Boolean).join(' ')}` : ''}</span></Link>;
            })}
          </nav>
        </div></section>
      )}

      {(p.committees.length > 0 || p.parliament.length > 0) && (
        <section className="band dark" aria-label="সংসদীয় দায়িত্ব">
          <div className="band-bg" data-px=".18"><SafeImg src={heroImage(site, 'promises')?.url} /></div><div className="band-shade" />
          <div className="wrap"><div className="reveal" style={{ maxWidth: 820 }}>
            <p className="kicker">সংসদীয় দায়িত্ব</p>
            <h2 className="h2">দায়িত্ব ও কমিটি</h2>
            {p.committees.length > 0 && <ul className="roles-list">{p.committees.map((r, i) => <li key={i}><b>{r.title}</b>{r.note && <span>{r.note}</span>}</li>)}</ul>}
            {p.parliament.length > 0 && <div className="pnums">{p.parliament.map((x, i) => <div key={i}><b>{x.n}</b><span>{x.label}</span></div>)}</div>}
            {p.parliamentNote && <p className="src">{p.parliamentNote}</p>}
          </div></div>
          {heroImage(site, 'promises')?.caption && <span className="credit">ছবি: {heroImage(site, 'promises')!.caption}</span>}
        </section>
      )}

      {(p.awards.length > 0 || p.works.length > 0) && (
        <section className="sec light"><div className="wrap two-col">
          {p.awards.length > 0 && <div className="reveal"><p className="kicker">সম্মাননা</p><h2 className="h3" style={{ marginTop: 10 }}>স্বীকৃতি</h2>
            <ul className="ylist">{p.awards.map((a, i) => <li key={i}><span className="y">{a.year}</span><div><b>{a.title}</b>{a.by && <span>{a.by}</span>}</div></li>)}</ul></div>}
          {p.works.length > 0 && <div className="reveal"><p className="kicker">গবেষণা ও প্রকাশনা</p><h2 className="h3" style={{ marginTop: 10 }}>লেখালেখি</h2>
            <ul className="ylist">{p.works.map((w, i) => <li key={i}><span className="y">{w.year}</span><div><b>{w.title}</b>{w.type && <span>{w.type}</span>}</div></li>)}</ul></div>}
        </div></section>
      )}

      {p.priorities.length > 0 && (
        <section className="sec light-2"><div className="wrap">
          <SecHead h={{ kicker: 'অগ্রাধিকার', title: 'যে কাজগুলো আগে' }} right={<More href="/promises">প্রতিশ্রুতির হিসাব দেখুন</More>} />
          <ol className="prio reveal">{p.priorities.map((x, i) => <li key={i}><b>{x.title}</b>{x.text && <span>{x.text}</span>}</li>)}</ol>
        </div></section>
      )}
    </>
  );
}
