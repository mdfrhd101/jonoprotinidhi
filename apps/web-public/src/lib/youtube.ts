/* YouTube helpers for the privacy-friendly facade: nothing from youtube.com loads until the visitor presses play,
   and then only from youtube-nocookie.com. The API already stores the bare 11-character id. */

const ID = /^[A-Za-z0-9_-]{11}$/;

export const isYouTubeId = (id: unknown): id is string => typeof id === 'string' && ID.test(id);

/** Thumbnail from i.ytimg.com. `hqdefault` always exists; `maxresdefault` is sharper but missing for some videos. */
export const ytThumb = (id: string, q: 'hqdefault' | 'maxresdefault' | 'mqdefault' | 'sddefault' = 'hqdefault'): string =>
  isYouTubeId(id) ? `https://i.ytimg.com/vi/${id}/${q}.jpg` : '';

/** Embed URL on youtube-nocookie.com. With autoplay the video starts as soon as the iframe replaces the facade. */
export function ytEmbed(id: string, opts: { autoplay?: boolean; start?: number } = {}): string {
  if (!isYouTubeId(id)) return '';
  const p = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
  if (opts.autoplay) p.set('autoplay', '1');
  if (opts.start && opts.start > 0) p.set('start', String(Math.floor(opts.start)));
  return `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`;
}

/** Id from an API `embedUrl`, accepted only when it is a youtube-nocookie embed. Anything else is ignored. */
export function idFromEmbedUrl(embedUrl: string | null | undefined): string | null {
  if (!embedUrl) return null;
  try {
    const u = new URL(embedUrl);
    if (u.protocol !== 'https:' || u.hostname !== 'www.youtube-nocookie.com') return null;
    const m = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(u.pathname);
    return m ? m[1]! : null;
  } catch { return null; }
}

/** Best id for a video item: the stored youtubeId, else the one inside a trusted embedUrl. */
export function videoYouTubeId(v: { kind?: string; youtubeId?: string | null; embedUrl?: string | null }): string | null {
  if (v.kind !== 'youtube') return null;
  if (isYouTubeId(v.youtubeId)) return v.youtubeId;
  return idFromEmbedUrl(v.embedUrl);
}
