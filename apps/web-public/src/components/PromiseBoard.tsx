'use client';
import { useState } from 'react';
import { PromiseRow } from './blocks';
import { SECTOR_LABEL, clampPct, sectorsOf, toBn } from '@/lib/format';
import type { PromiseItem } from '@/lib/types';

const FILTERS: Array<[string, string]> = [['all', 'সব'], ['done', 'সম্পন্ন'], ['ongoing', 'চলমান'], ['late', 'বিলম্বিত'], ['plan', 'শুরু হয়নি']];


/** Promises grouped by sector with a status filter. */
export default function PromiseBoard({ items }: { items: PromiseItem[] }) {
  const [f, setF] = useState('all');
  const sectors = sectorsOf(items);
  const blocks = sectors.map((sk) => {
    const all = items.filter((p) => p.sector === sk);
    const list = all.filter((p) => f === 'all' || p.status === f);
    const avg = all.length ? Math.round(all.reduce((s, p) => s + clampPct(p.pct), 0) / all.length) : 0;
    return { sk, all, list, avg };
  }).filter((b) => b.list.length > 0);
  return (
    <>
      <div className="chips" style={{ marginTop: 44 }} role="group" aria-label="অবস্থা অনুযায়ী দেখুন">
        {FILTERS.map(([k, t]) => <button key={k} type="button" className="chip" aria-pressed={f === k} onClick={() => setF(k)}>{t}</button>)}
      </div>
      <div aria-live="polite">
        {blocks.length ? blocks.map(({ sk, all, list, avg }) => (
          <div className="sector" id={`sec-${sk}`} key={sk}>
            <div className="sector-head"><h2 className="h3">{SECTOR_LABEL[sk] ?? sk}</h2><span>{toBn(all.length)}টি প্রতিশ্রুতি · গড় অগ্রগতি {toBn(avg)}%</span></div>
            <div className="p-list">{list.map((p) => <PromiseRow key={p.id} p={p} withUpd />)}</div>
          </div>
        )) : <p className="empty" style={{ color: 'var(--muted-dark)' }}>এই অবস্থায় কোনো প্রতিশ্রুতি নেই।</p>}
      </div>
    </>
  );
}
