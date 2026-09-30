import Link from 'next/link';
import HeroSlider from '@/components/HeroSlider';
import GallerySlider from '@/components/GallerySlider';
import VideoSlider from '@/components/VideoSlider';
import AreaWidget from '@/components/AreaWidget';
import SafeImg from '@/components/SafeImg';
import { IconPlay } from '@/components/icons';
import { EventsList, More, NewsCard, PromiseRow, PromiseSummary, SecHead } from '@/components/blocks';
import { getComplaintStats, getEvents, getGallery, getPage, getPosts, getPromises, getSite, getVideos, soft } from '@/lib/api';
import { bnDateSafe, bnMonthLabel, bnNumber, dateParts, joinParts, toBn, bnText } from '@/lib/format';
import { featuredFirst } from '@/lib/slider';
import type { SectionKey } from '@/lib/types';

const DEFAULT_ORDER: SectionKey[] = ['stats', 'about', 'activities', 'office', 'promises', 'area', 'gallery', 'videos', 'events', 'cta'];

export default async function Home() {
  const site = await getSite();
  const [home, profile, area, posts, promises, galleryF, galleryAll, videos, events, stats] = await Promise.all([
    soft(getPage('home'), null), soft(getPage('profile'), null), soft(getPage('area'), null),
    soft(getPosts({ limit: 6 }), null), soft(getPromises(), null),
    soft(getGallery({ featured: true, limit: 16 }), null), soft(getGallery({ limit: 16 }), null),
    soft(getVideos({ limit: 12 }), null), soft(getEvents(3), []), soft(getComplaintStats(), null),
  ]);
  const S = home?.sections;
  const order = (site.sections?.length ? site.sections : DEFAULT_ORDER.map((key) => ({ key, on: true }))).filter((s) => s.on).map((s) => s.key as SectionKey);
  const next = events[0];
  const nd = next ? dateParts(next.date) : null;
  const banners = site.banners ?? [];
  const bandImg = banners.length > 1 ? banners[banners.length - 1] : banners[0];
  const gallery = (galleryF?.items.length ?? 0) >= 3 ? galleryF!.items : galleryAll?.items ?? [];
  const vids = featuredFirst(videos?.items ?? []);
  const featuredVideo = vids[0];

  const sec: Record<SectionKey, () => React.ReactNode> = {
    stats: () => home && home.stats.length > 0 && (
      <section key="stats" className="stats" aria-label={home.statsTitle || 'সংখ্যায় কাজ'}><div className="wrap">
        {home.statsTitle && <p className="kicker" style={{ marginBottom: 26 }}>{home.statsTitle}</p>}
        <div className="stats-grid">
          {home.stats.map((s, i) => (
            <div className="stat reveal" key={i}><b><span data-count={s.n}>{s.n}</span>{s.unit && <small>{s.unit}</small>}</b><span>{s.label}</span></div>
          ))}
        </div>
        {home.statsNote && <p className="src">{home.statsNote}</p>}
      </div></section>
    ),

    about: () => {
      if (!profile && !S?.about.title) return null;
      const edu = profile?.education.slice(-2).map((e) => e.title).join(' · ');
      const job = profile?.profession.at(-1)?.title;
      const roles = profile?.committees.slice(0, 2) ?? [];
      const hasFacts = !!(edu || job || roles.length);
      const photo = profile?.portrait.url ? { url: profile.portrait.url, cap: profile.portrait.credit } : gallery[0] ? { url: gallery[0].url, cap: joinParts([gallery[0].caption, gallery[0].credit]) } : null;
      return (
        <section key="about" className="sec light"><div className="wrap about-grid">
          <div className="about-left reveal">
            {S?.about.kicker && <p className="kicker">{S.about.kicker}</p>}
            {(S?.about.title || profile?.headline) && <h2>{S?.about.title || profile?.headline}</h2>}
            {(S?.about.intro || profile?.intro) && <p className="lead">{S?.about.intro || profile?.intro}</p>}
            {hasFacts && (
              <ul className="facts">
                {edu && <li><span>শিক্ষা</span>{edu}</li>}
                {job && <li><span>পেশা</span>{job}</li>}
                {roles.length > 0 && <li><span>দায়িত্ব</span><ul>{roles.map((r, i) => <li key={i}>{r.title}</li>)}</ul></li>}
              </ul>
            )}
            <p className="sec-foot"><More href="/about">পূর্ণ পরিচিতি পড়ুন</More></p>
          </div>
          <div>
            {photo && <figure className="about-fig reveal"><SafeImg src={photo.url} alt={photo.cap || ''} />{photo.cap && <figcaption>{photo.cap}</figcaption>}</figure>}
            {profile && profile.milestones.length > 0 && (
              <ol className="tl" aria-label="জীবনের গুরুত্বপূর্ণ বছর">
                {profile.milestones.map((m, i) => <li key={i} className={`reveal${m.now ? ' now' : ''}`}><span className="yr">{m.yr}</span><div><h3>{m.title}</h3>{m.note && <p>{m.note}</p>}</div></li>)}
              </ol>
            )}
          </div>
        </div></section>
      );
    },

    activities: () => (posts?.items.length ?? 0) > 0 && (
      <section key="activities" className="sec dark"><div className="wrap">
        <SecHead h={S?.activities} right={<More href="/activities">সব কার্যক্রম</More>} />
        {S?.activities.intro && <p className="lead reveal" style={{ margin: '-24px 0 40px' }}>{S.activities.intro}</p>}
        <div className="news">{posts!.items.map((p, i) => <NewsCard key={p.slug} p={p} feat={i === 0 && posts!.items.length > 2} />)}</div>
      </div></section>
    ),

    office: () => {
      const roles = profile?.committees.slice(0, 3) ?? [];
      const o = S?.office;
      if (!roles.length && !o?.title && !featuredVideo) return null;
      return (
        <section key="office" className="band dark" aria-label={o?.title || 'দায়িত্ব'}>
          <div className="band-bg" data-px=".18"><SafeImg src={bandImg?.url} /></div><div className="band-shade" />
          <div className="wrap band-grid">
            <div className="reveal">
              {o?.kicker && <p className="kicker">{o.kicker}</p>}
              {o?.title && <h2 className="h2">{o.title}</h2>}
              {o?.intro && <p className="lead">{o.intro}</p>}
              {roles.length > 0 && <ul className="roles-list">{roles.map((r, i) => <li key={i}><b>{r.title}</b>{r.note && <span>{r.note}</span>}</li>)}</ul>}
            </div>
            {featuredVideo && (
              <div className="video reveal">
                <Link className="play" href={`/videos?v=${encodeURIComponent(featuredVideo.id)}`} aria-label={`ভিডিও দেখুন: ${featuredVideo.title}`} style={{ display: 'grid' }}><IconPlay /></Link>
                <h3>{featuredVideo.title}</h3>
                <p>{joinParts([bnDateSafe(featuredVideo.date), featuredVideo.duration])}</p>
                <p style={{ marginTop: 16 }}><More href="/videos">সব ভিডিও</More></p>
              </div>
            )}
          </div>
          {bandImg?.caption && <span className="credit">ছবি: {bandImg.caption}</span>}
        </section>
      );
    },

    promises: () => {
      if (!promises?.items.length) return null;
      const feat = promises.items.filter((p) => p.featured);
      const rows = (feat.length ? feat : promises.items).slice(0, 5);
      return (
        <section key="promises" className="sec light"><div className="wrap">
          <SecHead h={S?.promises} right={<More href="/promises">সব প্রতিশ্রুতি দেখুন</More>} />
          <div className="home-prom">
            <div><PromiseSummary summary={promises.summary} />{S?.promises.intro && <p className="lead reveal" style={{ marginTop: 8 }}>{S.promises.intro}</p>}</div>
            <div className="p-list" style={{ marginTop: 0 }}>{rows.map((p) => <PromiseRow key={p.id} p={p} />)}</div>
          </div>
        </div></section>
      );
    },

    area: () => area && area.upazilas.length > 0 && (
      <section key="area" className="sec light-2"><div className="wrap">
        <SecHead h={S?.area} fallbackTitle={bnText(site.mp.seat)} right={S?.area.intro ? <p className="lead" style={{ margin: 0 }}>{S.area.intro}</p> : undefined} />
        <AreaWidget upazilas={area.upazilas} />
        <p className="sec-foot" style={{ marginTop: 28 }}><More href="/area">এলাকার পূর্ণ তথ্য</More></p>
      </div></section>
    ),

    gallery: () => gallery.length > 0 && (
      <section key="gallery" className="sec dark"><div className="wrap">
        <SecHead h={S?.gallery} right={<More href="/gallery">পুরো গ্যালারি</More>} />
        {S?.gallery.intro && <p className="lead reveal" style={{ margin: '-24px 0 36px' }}>{S.gallery.intro}</p>}
        <GallerySlider items={gallery} label="নির্বাচিত ছবি" />
      </div></section>
    ),

    videos: () => vids.length > 0 && (
      <section key="videos" className="sec dark" style={{ background: 'var(--ink-2)', borderTop: '1px solid var(--line-light)' }}><div className="wrap">
        <SecHead h={S?.videos} right={<More href="/videos">সব ভিডিও</More>} />
        {S?.videos.intro && <p className="lead reveal" style={{ margin: '-24px 0 36px' }}>{S.videos.intro}</p>}
        <VideoSlider items={vids} label="নির্বাচিত ভিডিও" />
      </div></section>
    ),

    events: () => events.length > 0 && (
      <section key="events" className="sec light"><div className="wrap">
        <SecHead h={S?.events} right={<More href="/contact">সব কর্মসূচি ও অফিস</More>} />
        {S?.events.intro && <p className="lead reveal" style={{ margin: '-24px 0 36px' }}>{S.events.intro}</p>}
        <div className="reveal"><EventsList items={events} /></div>
      </div></section>
    ),

    cta: () => {
      const c = home?.complaintCta;
      if (!site.complaintBoxEnabled || (!c?.title && !c?.text)) return null;
      return (
        <section key="cta" className="sec cta-band dark"><div className="wrap cta-grid">
          <div className="reveal">
            {c?.title && <h2 className="h2">{c.title}</h2>}
            {c?.text && <p className="lead">{c.text}</p>}
            <div className="acts">
              <Link className="btn btn-brass" href="/complaint">{c?.button || 'অভিযোগ জানান'}</Link>
              <Link className="btn btn-line" href="/complaint#track">অভিযোগের অবস্থা দেখুন</Link>
            </div>
          </div>
          {stats && stats.received > 0 && (
            <div className="side-box reveal">
              <p className="kicker">{bnMonthLabel(stats.month)} মাসের হিসাব</p>
              <div className="big3">
                <div><b>{bnNumber(stats.received)}</b><span>গৃহীত</span></div>
                <div><b>{bnNumber(stats.resolved)}</b><span>নিষ্পত্তি</span></div>
                <div><b>{toBn(stats.avgDays)}</b><span>দিন গড় সময়</span></div>
              </div>
              <p className="hint">শুধু সংখ্যা প্রকাশ করা হয়। কোনো অভিযোগকারীর নাম বা অভিযোগের বিবরণ প্রকাশ হয় না।</p>
            </div>
          )}
        </div></section>
      );
    },
  };

  return (
    <>
      <HeroSlider
        banners={banners}
        kicker={home?.hero.kicker || bnText(site.mp.title)}
        name={site.mp.name}
        slogan={site.slogan}
        note={home?.hero.note ?? ''}
        next={next ? { title: next.title, when: joinParts([nd ? `${nd.weekday}, ${nd.day} ${nd.month}` : '', next.time], ' · '), place: next.place } : null}
        complaintOn={site.complaintBoxEnabled}
      />
      {order.map((k) => (sec[k] ? sec[k]() || null : null))}
    </>
  );
}

