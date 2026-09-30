import type { Metadata } from 'next';
import VideoSlider from '@/components/VideoSlider';
import { PageHero, heroImage } from '@/components/blocks';
import { getPage, getSite, getVideos, soft } from '@/lib/api';
import { PAGE_NAME } from '@/lib/nav';
import { featuredFirst } from '@/lib/slider';
import { videoYouTubeId, ytThumb } from '@/lib/youtube';
import { toBn } from '@/lib/format';

export const metadata: Metadata = { title: PAGE_NAME.videos };

export default async function Videos({ searchParams }: { searchParams: { v?: string } }) {
  const site = await getSite();
  const [heroes, videos] = await Promise.all([soft(getPage('heroes'), null), getVideos({ limit: 100 })]);
  const items = featuredFirst(videos.items);
  const first = items[0];
  const firstYt = first ? videoYouTubeId(first) : null;
  const banner = heroImage(site, 'videos');
  const heroUrl = first?.posterUrl || (firstYt ? ytThumb(firstYt, 'hqdefault') : '') || banner?.url;
  const credit = first && heroUrl !== banner?.url ? first.title : banner?.caption;
  return (
    <>
      <PageHero hero={heroes?.videos} fallbackTitle={PAGE_NAME.videos} image={heroUrl} credit={credit} crumbs={[{ label: PAGE_NAME.videos }]} />
      <section className="sec dark"><div className="wrap">
        {items.length > 0 && <p className="count" style={{ marginBottom: 18 }}>{toBn(items.length)}টি ভিডিও</p>}
        <VideoSlider items={items} initialId={typeof searchParams.v === 'string' ? searchParams.v : undefined} grid syncUrl label="ভিডিও" />
      </div></section>
    </>
  );
}
