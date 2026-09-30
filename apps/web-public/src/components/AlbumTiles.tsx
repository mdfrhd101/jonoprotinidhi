'use client';
import { useState } from 'react';
import SafeImg from './SafeImg';
import Lightbox, { type LbItem } from './Lightbox';
import { toBn } from '@/lib/format';

/** Photo tiles (article album) that open the lightbox. */
export default function AlbumTiles({ items, className = 'album' }: { items: LbItem[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;
  return (
    <>
      <div className={`${className} reveal`}>
        {items.map((it, i) => (
          <button key={i} className="tile" type="button" aria-label={`ছবি ${toBn(i + 1)} বড় করে দেখুন${it.caption ? ': ' + it.caption : ''}`} onClick={() => setOpen(i)}>
            <SafeImg src={it.url} alt="" />
          </button>
        ))}
      </div>
      {open !== null && <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
