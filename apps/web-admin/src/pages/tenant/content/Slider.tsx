import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, EmptyState, Icon } from '../../../components';
import { toBn } from '../../../format';

/* A preview slider: a big stage, title/caption, prev/next, keyboard (←/→, Home/End), swipe on touch, and a thumbnail strip.
   Used to preview the gallery and the videos the way the public site shows them. */

export type Slide = { key: string; stage: ReactNode; thumb?: string | null; title: string; sub?: ReactNode; badge?: ReactNode };

export function Slider({ slides, label, start = 0 }: { slides: Slide[]; label: string; start?: number }) {
  const [i, setI] = useState(Math.min(start, Math.max(0, slides.length - 1)));
  const strip = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const go = (j: number) => { if (n) setI(((j % n) + n) % n); };
  useEffect(() => { strip.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [i]);
  if (!n) return <EmptyState compact icon="image" title="দেখানোর মতো কিছু নেই" text="প্রকাশিত আইটেম থাকলে এখানে পাবলিক সাইটের মতো দেখাবে।" />;
  const s = slides[Math.min(i, n - 1)]!;
  return (
    <div className="ct-slider" role="region" aria-roledescription="স্লাইডার" aria-label={label} tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
        else if (e.key === 'Home') { e.preventDefault(); go(0); }
        else if (e.key === 'End') { e.preventDefault(); go(n - 1); }
      }}>
      <div className="ct-stage" onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => { const x0 = touch.current; touch.current = null; const x1 = e.changedTouches[0]?.clientX; if (x0 != null && x1 != null && Math.abs(x1 - x0) > 40) go(x1 < x0 ? i + 1 : i - 1); }}>
        <div className="ct-stage-in" key={s.key} aria-roledescription="স্লাইড" aria-label={`${toBn(i + 1)} / ${toBn(n)}: ${s.title}`}>{s.stage}</div>
        {n > 1 && <>
          <button type="button" className="ct-nav prev" aria-label="আগেরটি" onClick={() => go(i - 1)}><Icon name="chevronLeft" size={22} /></button>
          <button type="button" className="ct-nav next" aria-label="পরেরটি" onClick={() => go(i + 1)}><Icon name="chevronRight" size={22} /></button>
        </>}
        <span className="ct-count-pill num" aria-live="polite">{toBn(i + 1)} / {toBn(n)}</span>
      </div>
      <div className="ct-cap">
        <div className="grow"><b>{s.title}</b>{s.sub && <div className="muted">{s.sub}</div>}</div>
        {s.badge}
      </div>
      {n > 1 && (
        <div className="ct-strip" ref={strip} role="group" aria-label="সব স্লাইড">
          {slides.map((x, j) => (
            <button type="button" key={x.key} data-i={j} className="ct-thumb" aria-current={j === i ? 'true' : undefined} aria-label={`${toBn(j + 1)}: ${x.title}`} onClick={() => setI(j)}>
              {x.thumb ? <img src={x.thumb} alt="" loading="lazy" /> : <span className="ct-thumb-ph"><Icon name="play" size={18} /></span>}
            </button>
          ))}
        </div>
      )}
      <p className="sr">বাঁ-ডান তীর চিহ্ন দিয়ে স্লাইড বদলানো যায়।</p>
    </div>
  );
}

/** The slider inside a wide dialog. */
export function SliderDialog({ open, onClose, title, slides, note, start }: { open: boolean; onClose: () => void; title: string; slides: Slide[]; note?: ReactNode; start?: number }) {
  return (
    <Dialog title={title} open={open} onClose={onClose} size="wide">
      {note && <p className="muted ct-small" style={{ marginBottom: 12 }}>{note}</p>}
      {open && <Slider slides={slides} label={title} start={start} />}
    </Dialog>
  );
}
