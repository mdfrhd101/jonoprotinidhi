'use client';
import { useEffect, useRef } from 'react';
import SafeImg from './SafeImg';
import { IconLeft, IconRight, IconX } from './icons';
import { counterLabel, stepIndex, swipeDirection } from '@/lib/slider';

export type LbItem = { url: string; caption?: string; sub?: string; credit?: string };

/** Full-screen photo viewer: Esc closes, ←/→ navigate, swipe on touch screens, focus stays inside while open. */
export default function Lightbox({ items, index, onIndex, onClose }: { items: LbItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const x0 = useRef<{ x: number; y: number } | null>(null);
  const n = items.length;
  const it = items[index];

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    document.body.classList.add('lb-open');
    closeBtn.current?.focus();
    return () => { document.body.classList.remove('lb-open'); back?.focus?.(); };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowLeft' && n > 1) { e.preventDefault(); onIndex(stepIndex(index, -1, n)); }
    else if (e.key === 'ArrowRight' && n > 1) { e.preventDefault(); onIndex(stepIndex(index, 1, n)); }
    else if (e.key === 'Tab') {
      const f = Array.from(box.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []).filter((b) => b.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]!.focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]!.focus(); }
    }
  };

  if (!it) return null;
  return (
    <div className="lb" ref={box} role="dialog" aria-modal="true" aria-label="ছবি দেখুন" onKeyDown={onKey}
      onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.stage) onClose(); }}
      onPointerDown={(e) => { x0.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        if (!x0.current || n < 2) return;
        const d = swipeDirection(e.clientX - x0.current.x, e.clientY - x0.current.y, window.innerWidth);
        x0.current = null;
        if (d) onIndex(stepIndex(index, d, n));
      }}>
      <div className="lb-top">
        <p aria-hidden="true">{n > 1 ? counterLabel(index, n).replace('/', ' / ') : ''}</p>
        <button ref={closeBtn} className="lb-btn" type="button" aria-label="বন্ধ করুন" onClick={onClose}><IconX /></button>
      </div>
      <div className="lb-stage" data-stage="1">
        <div data-stage="1"><SafeImg key={it.url} src={it.url} alt={it.caption || ''} eager /></div>
      </div>
      <div className="lb-bot">
        <button className="lb-btn" type="button" aria-label="আগের ছবি" hidden={n < 2} onClick={() => onIndex(stepIndex(index, -1, n))}><IconLeft /></button>
        <p className="lb-cap" aria-live="polite">
          <span className="sr">{counterLabel(index, n)}। </span>
          {it.caption}
          {it.sub && <small>{it.sub}</small>}
          {it.credit && <small>ছবি: {it.credit}</small>}
        </p>
        <button className="lb-btn" type="button" aria-label="পরের ছবি" hidden={n < 2} onClick={() => onIndex(stepIndex(index, 1, n))}><IconRight /></button>
      </div>
    </div>
  );
}
