'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SafeImg from './SafeImg';
import Lightbox, { type LbItem } from './Lightbox';
import { IconExpand, IconLeft, IconPause, IconPlay, IconRight } from './icons';
import { counterLabel, keyToAction, nearbyIndexes, stepIndex, swipeDirection, wrapIndex } from '@/lib/slider';
import { bnDateSafe, joinParts, toBn } from '@/lib/format';
import type { Album, GalleryItem } from '@/lib/types';

type Props = {
  items: GalleryItem[];
  albums?: Album[];
  /** show album filter chips */
  filter?: boolean;
  /** show the photo wall under the slider */
  wall?: boolean;
  thumbs?: boolean;
  label?: string;
  delay?: number;
};

const ALL = '';

/** The gallery slider: large photo on a blurred copy of itself, caption + credit, counter, prev/next, keyboard,
    swipe, autoplay (pauses on hover/focus, off with reduced motion), thumbnail strip, album chips and a lightbox. */
export default function GallerySlider({ items, albums = [], filter = false, wall = false, thumbs = true, label = 'ছবির স্লাইডার', delay = 6000 }: Props) {
  const [album, setAlbum] = useState(ALL);
  const list = useMemo(() => items.filter((x) => x.url && (album === ALL || x.album === album)), [items, album]);
  const n = list.length;
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hold, setHold] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [drag, setDrag] = useState(0);
  const [lb, setLb] = useState<{ items: LbItem[]; i: number } | null>(null);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0, 1]));
  const stage = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLUListElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => { const r = window.matchMedia('(prefers-reduced-motion: reduce)').matches; setReduce(r); if (r) setPlaying(false); }, []);
  useEffect(() => { setCur(0); setSeen(new Set([0, 1])); }, [album]);
  useEffect(() => { setSeen((s) => { const add = nearbyIndexes(cur, n).filter((i) => !s.has(i)); return add.length ? new Set([...s, ...add]) : s; }); }, [cur, n]);

  const go = useCallback((i: number) => { setCur(wrapIndex(i, n)); setAnnounce(true); }, [n]);

  // autoplay
  const running = n > 1 && playing && !hold && !reduce && !lb;
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => { if (!document.hidden) setCur((c) => stepIndex(c, 1, n)); }, delay);
    return () => window.clearTimeout(t);
  }, [running, cur, n, delay]);

  // keep the active thumbnail visible inside the strip without scrolling the page
  useEffect(() => {
    const ul = strip.current, li = ul?.children[cur] as HTMLElement | undefined;
    if (!ul || !li) return;
    const left = li.offsetLeft - ul.clientWidth / 2 + li.clientWidth / 2;
    ul.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
  }, [cur, reduce]);

  const lbItems = useMemo<LbItem[]>(() => list.map((x) => ({ url: x.url, caption: x.caption, credit: x.credit, sub: joinParts([x.album, bnDateSafe(x.takenAt)]) })), [list]);

  const onKey = (e: React.KeyboardEvent) => {
    if (n < 2) return;
    const to = keyToAction(e.key, cur, n);
    if (to !== null) { e.preventDefault(); go(to); }
    else if (e.key === 'Enter' && e.target === stage.current) { e.preventDefault(); setLb({ items: lbItems, i: cur }); }
  };

  const pDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const pMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
      setDrag(dx);
    }
  };
  const pUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    setDrag(0);
    const d = swipeDirection(dx, dy, stage.current?.clientWidth ?? 600);
    if (d && n > 1) go(cur + d);
    else if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && (e.target as HTMLElement).classList.contains('ph')) setLb({ items: lbItems, i: cur });
  };

  const albumChips = filter && albums.length > 1 && (
    <div className="chips gs-filter" role="group" aria-label="অ্যালবাম বেছে নিন">
      <button type="button" className="chip" aria-pressed={album === ALL} onClick={() => setAlbum(ALL)}>সব ছবি <span aria-hidden="true">({toBn(items.length)})</span></button>
      {albums.map((a) => <button key={a.name} type="button" className="chip" aria-pressed={album === a.name} onClick={() => setAlbum(a.name)}>{a.name} <span aria-hidden="true">({toBn(a.count)})</span></button>)}
    </div>
  );

  if (!n) return <>{albumChips}<p className="gs-empty">এখনো কোনো ছবি প্রকাশ করা হয়নি।</p></>;
  const it = list[cur]!;

  return (
    <div className="gs">
      {albumChips}
      <div ref={stage} className="gs-stage" tabIndex={0} role="region" aria-roledescription="carousel" aria-label={`${label}: বাম-ডান তীর দিয়ে ছবি বদলান, Enter চাপলে বড় করে দেখুন`}
        onKeyDown={onKey}
        onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}
        onFocus={() => setHold(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHold(false); }}
        onPointerDown={pDown} onPointerMove={pMove} onPointerUp={pUp} onPointerCancel={() => { start.current = null; setDrag(0); }}>
        {running && <div className="gs-bar" key={`bar-${cur}`} style={{ ['--dur' as string]: `${delay}ms` } as React.CSSProperties}><i /></div>}
        <div className={`gs-track${drag ? ' drag' : ''}`} style={{ transform: `translate3d(calc(${-cur * 100}% + ${drag}px),0,0)` }}>
          {list.map((x, i) => (
            <div key={x.id} className={`gs-slide${i === cur ? ' on' : ''}`} role="group" aria-roledescription="slide" aria-label={`${toBn(i + 1)}/${toBn(n)}`} aria-hidden={i !== cur}>
              {seen.has(i) ? <>
                <SafeImg src={x.url} className="bg" />
                <SafeImg src={x.url} className="ph" alt={x.caption || `ছবি ${toBn(i + 1)}`} eager={i === 0} />
              </> : <span className="noimg" />}
            </div>
          ))}
        </div>
        <p className="gs-count" aria-hidden="true"><b>{toBn(cur + 1)}</b><span>/{toBn(n)}</span></p>
        <div className="gs-tools">
          {n > 1 && !reduce && (
            <button type="button" className="rbtn sm" aria-label={playing ? 'স্বয়ংক্রিয় স্লাইড থামান' : 'স্বয়ংক্রিয় স্লাইড চালু করুন'} aria-pressed={!playing} onClick={() => setPlaying((p) => !p)}>
              {playing ? <IconPause /> : <IconPlay />}
            </button>
          )}
          <button type="button" className="rbtn sm" aria-label="ছবিটি বড় করে দেখুন" onClick={() => setLb({ items: lbItems, i: cur })}><IconExpand /></button>
        </div>
        {n > 1 && <>
          <button type="button" className="rbtn gs-nav prev" aria-label="আগের ছবি" onClick={() => go(cur - 1)}><IconLeft /></button>
          <button type="button" className="rbtn gs-nav next" aria-label="পরের ছবি" onClick={() => go(cur + 1)}><IconRight /></button>
        </>}
        <div className="gs-cap">
          <div className="key" key={it.id}>
            {it.album && <span className="al">{it.album}</span>}
            {it.caption && <h3>{it.caption}</h3>}
            {(it.credit || it.takenAt) && <p>{joinParts([bnDateSafe(it.takenAt), it.credit ? `ছবি: ${it.credit}` : ''])}</p>}
          </div>
        </div>
        <p className="sr" aria-live={announce ? 'polite' : 'off'} aria-atomic="true">{`ছবি ${counterLabel(cur, n)}${it.caption ? ': ' + it.caption : ''}`}</p>
      </div>
      {thumbs && n > 1 && (
        <ul ref={strip} className="gs-thumbs" aria-label="সব ছবি">
          {list.map((x, i) => (
            <li key={x.id}>
              <button type="button" className="gs-thumb" aria-current={i === cur ? 'true' : undefined} aria-label={`ছবি ${toBn(i + 1)}${x.caption ? ': ' + x.caption : ''}`} onClick={() => go(i)}>
                <SafeImg src={x.url} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {wall && n > 1 && (
        <div className="wall" style={{ marginTop: 56 }}>
          {list.map((x, i) => (
            <button key={x.id} type="button" aria-label={`বড় করে দেখুন: ${x.caption || 'ছবি ' + toBn(i + 1)}`} onClick={() => setLb({ items: lbItems, i })}>
              <SafeImg src={x.url} alt="" />
              {x.caption && <span className="c">{x.caption}</span>}
            </button>
          ))}
        </div>
      )}
      {lb && <Lightbox items={lb.items} index={lb.i} onIndex={(i) => { setLb({ ...lb, i }); setCur(i); }} onClose={() => setLb(null)} />}
    </div>
  );
}
