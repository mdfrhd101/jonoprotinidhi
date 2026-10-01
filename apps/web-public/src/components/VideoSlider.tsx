'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconLeft, IconPlay, IconRight } from './icons';
import { counterLabel, featuredFirst, keyToAction, swipeDirection, wrapIndex } from '@/lib/slider';
import { videoYouTubeId, ytEmbed, ytThumb } from '@/lib/youtube';
import { safeMediaUrl } from '@/lib/links';
import { bnDateSafe, joinParts, toBn } from '@/lib/format';
import type { VideoItem } from '@/lib/types';

type Props = { items: VideoItem[]; initialId?: string; label?: string; grid?: boolean; syncUrl?: boolean; rail?: boolean };

/** Poster with graceful fallbacks (e.g. YouTube maxres → hq → placeholder). */
function Poster({ sources, alt = '', eager }: { sources: string[]; alt?: string; eager?: boolean }) {
  const list = useMemo(() => sources.map((s) => safeMediaUrl(s)).filter(Boolean), [sources]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [list]);
  const src = list[i];
  if (!src) return <span className="noimg" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setI((x) => x + 1)} onLoad={(e) => {
    // YouTube answers a missing maxres thumbnail with a 120x90 grey image instead of an error
    const im = e.currentTarget; if (im.naturalWidth > 0 && im.naturalWidth <= 120 && i < list.length - 1) setI((x) => x + 1);
  }} />;
}

/** A still from an uploaded video without a poster: the browser shows the frame at 1.5 s (the first frame is often
    a blank fade-in). It only loads metadata and one frame. */
function FramePreview({ src }: { src: string }) {
  if (!src) return <span className="noimg" />;
  return <video className="frame" src={`${src}#t=1.5`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" />;
}

function thumb(v: VideoItem) {
  return !videoYouTubeId(v) && !v.posterUrl ? <FramePreview src={safeMediaUrl(v.fileUrl)} /> : <Poster sources={posterSources(v, false)} />;
}

function posterSources(v: VideoItem, big: boolean): string[] {
  const id = videoYouTubeId(v);
  const out: string[] = [];
  if (v.posterUrl && !(id && v.posterUrl.includes('i.ytimg.com'))) out.push(v.posterUrl);
  if (id) { if (big) out.push(ytThumb(id, 'maxresdefault')); out.push(ytThumb(id, big ? 'hqdefault' : 'mqdefault')); }
  else if (v.posterUrl) out.push(v.posterUrl);
  return out;
}

/** Video slider: each slide shows the player (YouTube through a click-to-load facade, or the uploaded file in a
    native <video>) with title, date, duration and description. Only the current slide has a player, so switching
    slides always stops the previous video. */
export default function VideoSlider({ items, initialId, label = 'ভিডিও স্লাইডার', grid = false, syncUrl = false, rail = true }: Props) {
  const list = useMemo(() => featuredFirst(items.filter((v) => videoYouTubeId(v) || safeMediaUrl(v.fileUrl))), [items]);
  const n = list.length;
  const [cur, setCur] = useState(() => Math.max(0, list.findIndex((v) => v.id === initialId)));
  const [active, setActive] = useState(false); // YouTube facade replaced by the iframe
  const [announce, setAnnounce] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLUListElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const v = list[cur];

  const go = useCallback((i: number, focusStage = false) => {
    setCur(wrapIndex(i, n)); setActive(false); setAnnounce(true);
    if (focusStage) root.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, [n]);

  // A static export cannot read ?v= on the server (no initialId): pick that video from the address bar once, before the effect below rewrites it.
  useEffect(() => {
    if (!syncUrl || initialId !== undefined) return;
    const i = list.findIndex((x) => x.id === new URLSearchParams(window.location.search).get('v'));
    if (i > 0) setCur(i);
  }, [syncUrl, initialId, list]);

  useEffect(() => {
    if (!syncUrl || !v) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get('v') !== v.id) { u.searchParams.set('v', v.id); window.history.replaceState(window.history.state, '', u); }
  }, [v, syncUrl]);

  useEffect(() => {
    const ul = railRef.current, li = ul?.children[cur] as HTMLElement | undefined;
    if (!ul || !li) return;
    ul.scrollTo({ left: Math.max(0, li.offsetLeft - ul.clientWidth / 2 + li.clientWidth / 2), behavior: 'smooth' });
  }, [cur]);

  if (!n || !v) return <p className="gs-empty">এখনো কোনো ভিডিও প্রকাশ করা হয়নি।</p>;
  const ytId = videoYouTubeId(v);
  const file = safeMediaUrl(v.fileUrl);

  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (n < 2 || t.closest('video, iframe, input, textarea, select')) return;
    const to = keyToAction(e.key, cur, n);
    if (to !== null) { e.preventDefault(); go(to); }
  };
  const meta = joinParts([bnDateSafe(v.date), v.duration ? `দৈর্ঘ্য ${v.duration}` : '']);

  return (
    <div className="vs" ref={root} style={{ scrollMarginTop: 110 }}>
      <div className="vs-grid" role="region" aria-roledescription="carousel" aria-label={`${label}: বাম-ডান তীর দিয়ে ভিডিও বদলান`} tabIndex={-1} onKeyDown={onKey}>
        <div className="vs-stage" key={v.id}
          onPointerDown={(e) => { if (e.pointerType !== 'mouse') start.current = { x: e.clientX, y: e.clientY }; }}
          onPointerUp={(e) => {
            if (!start.current) return;
            const d = swipeDirection(e.clientX - start.current.x, e.clientY - start.current.y, e.currentTarget.clientWidth);
            start.current = null;
            if (d && n > 1 && !(e.target as HTMLElement).closest('video')) go(cur + d);
          }}>
          {ytId ? (active
            ? <iframe src={ytEmbed(ytId, { autoplay: true })} title={v.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            : (
              <button type="button" className="vs-facade" aria-label={`ভিডিও চালান: ${v.title}`} onClick={() => setActive(true)}>
                <Poster sources={posterSources(v, true)} eager />
                <span className="vs-play" aria-hidden="true"><IconPlay /></span>
                {v.duration && <span className="vs-badge">{v.duration}</span>}
                <span className="vs-note">চালু করলে ইউটিউব থেকে ভিডিওটি আসবে</span>
              </button>
            )) : (
            active
              ? <video controls autoPlay preload="metadata" playsInline poster={safeMediaUrl(v.posterUrl) || undefined} src={file} aria-label={v.title}>
                  দুঃখিত, আপনার ব্রাউজারে ভিডিওটি চলছে না।
                </video>
              : (
                <button type="button" className="vs-facade" aria-label={`ভিডিও চালান: ${v.title}`} onClick={() => setActive(true)}>
                  {v.posterUrl ? <Poster sources={[v.posterUrl]} eager /> : <FramePreview src={file} />}
                  <span className="vs-play" aria-hidden="true"><IconPlay /></span>
                  {v.duration && <span className="vs-badge">{v.duration}</span>}
                </button>
              )
          )}
        </div>
        <div className="vs-info">
          <div className="key" key={v.id}>
            <p className="vs-kind"><span className="k">{ytId ? 'ইউটিউব' : 'ভিডিও'}</span>{meta && <span>{meta}</span>}</p>
            <h3>{v.title}</h3>
            {v.description && <p className="d">{v.description}</p>}
          </div>
          {n > 1 && (
            <div className="vs-ctl">
              <p className="vs-count" aria-hidden="true"><b>{toBn(cur + 1)}</b><span>/{toBn(n)}</span></p>
              <button type="button" className="rbtn sm" aria-label="আগের ভিডিও" onClick={() => go(cur - 1)}><IconLeft /></button>
              <button type="button" className="rbtn sm" aria-label="পরের ভিডিও" onClick={() => go(cur + 1)}><IconRight /></button>
            </div>
          )}
          <p className="sr" aria-live={announce ? 'polite' : 'off'} aria-atomic="true">{`ভিডিও ${counterLabel(cur, n)}: ${v.title}`}</p>
        </div>
      </div>
      {rail && n > 1 && (
        <ul ref={railRef} className="vs-rail" aria-label="সব ভিডিও">
          {list.map((x, i) => (
            <li key={x.id}>
              <button type="button" className="vs-item" aria-current={i === cur ? 'true' : undefined} onClick={() => go(i)}>
                <span className="th">{thumb(x)}<span className="pl"><IconPlay /></span>{x.duration && <span className="n">{x.duration}</span>}</span>
                <span><b>{x.title}</b><small>{bnDateSafe(x.date)}</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {grid && (
        <div className="vids three" style={{ marginTop: 72 }}>
          {list.map((x, i) => (
            <button key={x.id} className="alb" type="button" aria-current={i === cur ? 'true' : undefined} onClick={() => go(i, true)}>
              <span className="ph">
                {thumb(x)}
                <span className="vplay"><IconPlay /></span>
                {x.featured && <span className="feat-tag">বিশেষ</span>}
                {x.duration && <span className="n">{x.duration}</span>}
              </span>
              <b>{x.title}</b>
              <small>{joinParts([bnDateSafe(x.date), videoYouTubeId(x) ? 'ইউটিউব' : 'ভিডিও'])}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
