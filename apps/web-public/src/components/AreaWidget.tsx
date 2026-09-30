'use client';
import { useState } from 'react';
import { parseNumber, toBn } from '@/lib/format';
import type { Upazila } from '@/lib/types';

/** Upazila explorer: a card per upazila (with its share of the seat's voters) and a detail panel.
    Replaces the demo's hand-drawn map, which cannot be generated for an arbitrary seat. */
export default function AreaWidget({ upazilas, full = false, initial }: { upazilas: Upazila[]; full?: boolean; initial?: string }) {
  const start = Math.max(0, upazilas.findIndex((u) => u.short === initial || u.name === initial));
  const [cur, setCur] = useState(start);
  if (!upazilas.length) return null;
  const a = upazilas[cur] ?? upazilas[0]!;
  const voters = upazilas.map((u) => parseNumber(u.voters) ?? parseNumber(u.pop) ?? 0);
  const total = voters.reduce((s, x) => s + x, 0) || 1;
  const kv: Array<[string, string]> = (full
    ? [[a.pop, 'জনসংখ্যা'], [a.voters, 'ভোটার'], [a.size, 'বর্গকিমি আয়তন'], [a.lit, 'সাক্ষরতা'], [a.households, 'খানা (পরিবার)'], [a.schools, 'মাধ্যমিক বিদ্যালয়'], [a.clinics, 'কমিউনিটি ক্লিনিক'], [a.projects, 'চলমান প্রকল্প'], [a.complaints, 'এ মাসে অভিযোগ']]
    : [[a.pop, 'জনসংখ্যা'], [a.voters, 'ভোটার'], [a.projects, 'চলমান প্রকল্প'], [a.complaints, 'এ মাসে অভিযোগ']]) as Array<[string, string]>;
  return (
    <div className="area-grid">
      <div className="upz-cards reveal" role="group" aria-label="উপজেলা বেছে নিন">
        {upazilas.map((u, i) => (
          <button key={u.name + i} type="button" className="upz-card" aria-pressed={i === cur} onClick={() => setCur(i)}>
            <b>{u.short || u.name}</b>
            {u.voters && <span>ভোটার {u.voters}</span>}
            <span className="share" aria-hidden="true"><i style={{ width: `${Math.max(2, (voters[i]! / total) * 100).toFixed(1)}%` }} /></span>
          </button>
        ))}
      </div>
      <div className={`area-info reveal${full ? ' area-full' : ''}`} aria-live="polite">
        <div className="key" key={cur}>
          <h3>{a.name}</h3>
          {full && a.note && <p className="about-upz">{a.note}</p>}
          {kv.some(([v]) => v) && <div className="kv">{kv.filter(([v]) => v).map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div>}
          {a.unions.length > 0 && <>
            <p className="lbl">ইউনিয়ন ও পৌরসভা ({toBn(a.unions.length)}টি)</p>
            <ul className="unions">{a.unions.map((u) => <li key={u}>{u}</li>)}</ul>
          </>}
          {!full && a.note && <p className="office-line">{a.note}</p>}
        </div>
      </div>
    </div>
  );
}
