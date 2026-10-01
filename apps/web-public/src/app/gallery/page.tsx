import type { Metadata } from 'next';
import GallerySlider from '@/components/GallerySlider';
import { More, PageHero, SecHead } from '@/components/blocks';
import { getAlbums, getGallery, getPage, getSite, getVideos, soft, pageImage } from '@/lib/api';
import { PAGE_NAME } from '@/lib/nav';
import { featuredFirst } from '@/lib/slider';
import { toBn } from '@/lib/format';

export const metadata: Metadata = { title: PAGE_NAME.gallery };

export default async function Gallery() {
  const site = await getSite();
  const [heroes, gallery, albums, videos] = await Promise.all([
    soft(getPage('heroes'), null), getGallery({ limit: 100 }), soft(getAlbums(), []), soft(getVideos({ limit: 1 }), null),
  ]);
  const items = featuredFirst(gallery.items);
  const cover = items[0];
  const img = cover ?? (await pageImage(site, 'gallery'));
  return (
    <>
      <PageHero hero={heroes?.gallery} fallbackTitle={PAGE_NAME.gallery} image={img?.url}
        credit={cover ? [cover.caption, cover.credit].filter(Boolean).join(' · ') : (await pageImage(site, 'gallery'))?.caption}
        crumbs={[{ label: PAGE_NAME.gallery }]} />
      <section className="sec dark"><div className="wrap">
        <p className="count" style={{ marginBottom: 18 }}>{toBn(gallery.total)}টি ছবি{albums.length ? ` · ${toBn(albums.length)}টি অ্যালবাম` : ''}</p>
        <GallerySlider items={items} albums={albums} filter wall label="গ্যালারি" />
        {(videos?.total ?? 0) > 0 && (
          <div style={{ marginTop: 96 }}>
            <SecHead h={heroes?.videos} fallbackTitle={PAGE_NAME.videos} right={<More href="/videos">সব ভিডিও দেখুন ({toBn(videos!.total)}টি)</More>} />
          </div>
        )}
      </div></section>
    </>
  );
}
