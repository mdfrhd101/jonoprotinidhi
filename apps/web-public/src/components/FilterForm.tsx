'use client';
import { useRouter } from 'next/navigation';

/** Upazila filter for the activities list: a plain GET form (works without JavaScript) that also applies on change. */
export default function FilterForm({ category, upazila, options }: { category: string; upazila: string; options: string[] }) {
  const router = useRouter();
  const go = (u: string) => {
    const p = new URLSearchParams();
    if (category) p.set('category', category);
    if (u) p.set('upazila', u);
    const s = p.toString();
    router.push(`/activities${s ? '?' + s : ''}`, { scroll: false });
  };
  return (
    <form method="get" action="/activities" className="field" onSubmit={(e) => { e.preventDefault(); go(String(new FormData(e.currentTarget).get('upazila') ?? '')); }}>
      <label htmlFor="fU">উপজেলা</label>
      {category && <input type="hidden" name="category" value={category} />}
      <select id="fU" name="upazila" defaultValue={upazila} key={upazila} onChange={(e) => go(e.target.value)}>
        <option value="">সব উপজেলা</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <noscript><button className="btn btn-brass btn-sm" type="submit">দেখুন</button></noscript>
    </form>
  );
}
