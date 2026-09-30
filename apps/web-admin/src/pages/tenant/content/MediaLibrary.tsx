import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiFail, type TenantApi } from '../../../api';
import { useTenant } from '../../../tenant';
import { Badge, Button, Drawer, EmptyState, Icon, PageHead, Pager, Skeleton, Tabs, useToast } from '../../../components';
import { bnDateTime, toBn } from '../../../format';
import { Confirm, UploadBar, bnBytes, errText, fetchAll } from './common';
import { checkVideoFile, MAX_VIDEO_MB } from './Videos';

/* Media library: every uploaded image and video of this site. Upload, copy the address, see details, delete (the API refuses
   while a file is still used; we then look up and show where). */

export type Asset = { id: string; kind: 'image' | 'video'; url: string; name: string; bytes: number; width: number | null; height: number | null; credit: string; createdAt: string };
type Up = { key: string; name: string; p: number; state: 'up' | 'ok' | 'bad' };
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LIMIT = 24;

export default function MediaLibrary() {
  const { api, id } = useTenant();
  const qc = useQueryClient(); const toast = useToast();
  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Asset | null>(null);
  const [ups, setUps] = useState<Up[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ['tenant', id, 'media', 'lib', kind, page], queryFn: () => api.get<{ items: Asset[]; total: number; totalPages: number }>(`/media?kind=${kind}&page=${page}&limit=${LIMIT}`) });
  const other = useQuery({ queryKey: ['tenant', id, 'media', 'lib', kind === 'image' ? 'video' : 'image', 'count'], queryFn: () => api.get<{ total: number }>(`/media?kind=${kind === 'image' ? 'video' : 'image'}&page=1&limit=1`) });
  const totals = { [kind]: q.data?.total, [kind === 'image' ? 'video' : 'image']: other.data?.total } as Record<string, number | undefined>;

  const upload = async (files: File[]) => {
    const good: File[] = [];
    for (const f of files) {
      const bad = kind === 'video' ? checkVideoFile(f) : !IMG_TYPES.includes(f.type) ? 'শুধু JPG, PNG বা WebP ছবি দেওয়া যায়' : f.size > 8 * 1024 * 1024 ? 'ছবি সর্বোচ্চ ৮ মেগাবাইট হতে পারে' : null;
      if (bad) toast(`"${f.name}": ${bad}`, 'bad'); else good.push(f);
    }
    if (!good.length) return;
    const list = good.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, p: 0, state: 'up' as const }));
    setUps((u) => [...u, ...list]);
    const patch = (k: string, v: Partial<Up>) => setUps((u) => u.map((x) => (x.key === k ? { ...x, ...v } : x)));
    let n = 0;
    for (const [i, f] of good.entries()) {
      const k = list[i]!.key;
      try {
        await api.uploadProgress(`${kind === 'video' ? '/media/video' : '/media'}?name=${encodeURIComponent(f.name.slice(0, 100))}`, f, (l, t) => patch(k, { p: t ? l / t : 0 }));
        patch(k, { p: 1, state: 'ok' }); n++;
      } catch (e) { patch(k, { state: 'bad' }); toast(`"${f.name}": ${errText(e)}`, 'bad'); }
    }
    if (n) { toast(`${toBn(n)}টি ফাইল আপলোড হয়েছে`, 'ok'); setPage(1); await qc.invalidateQueries({ queryKey: ['tenant', id, 'media'] }); }
    setTimeout(() => setUps((u) => u.filter((x) => x.state !== 'ok')), 2500);
  };

  return (
    <>
      <PageHead kicker="কনটেন্ট" icon="media" title="মিডিয়া লাইব্রেরি" sub="এই সাইটে আপলোড করা সব ছবি ও ভিডিও। ছবি নিরাপদে WebP-তে রূপান্তর হয় (লোকেশনসহ মেটাডেটা মুছে)।"
        actions={<Button variant="accent" icon="upload" onClick={() => input.current?.click()}>{kind === 'image' ? 'ছবি আপলোড' : 'ভিডিও আপলোড'}</Button>} />
      <input ref={input} type="file" hidden multiple={kind === 'image'} accept={kind === 'image' ? IMG_TYPES.join(',') : 'video/mp4,video/webm,.mp4,.webm'} aria-label={kind === 'image' ? 'ছবির ফাইল' : 'ভিডিও ফাইল'}
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; void upload(fs); }} />
      <div className="bar">
        <Tabs base="media" label="ফাইলের ধরন" value={kind} onChange={(k) => { setKind(k); setPage(1); }} variant="pill"
          tabs={[{ key: 'image', label: 'ছবি', icon: 'image', badge: totals.image }, { key: 'video', label: 'ভিডিও', icon: 'video', badge: totals.video }]} />
        <span className="grow" />
        <span className="muted ct-small">{kind === 'image' ? 'JPG, PNG, WebP · সর্বোচ্চ ৮ মেগাবাইট' : `MP4, WebM · সর্বোচ্চ ${toBn(MAX_VIDEO_MB)} মেগাবাইট`}</span>
      </div>
      {ups.length > 0 && <div className="ct-ups" aria-live="polite">{ups.map((u) => <UploadBar key={u.key} label={u.name} value={u.p} state={u.state} />)}</div>}
      <div role="tabpanel" id={`media-panel-${kind}`} aria-labelledby={`media-tab-${kind}`}>
        {q.isLoading ? (
          <ul className="ct-mgrid">{Array.from({ length: 12 }, (_, i) => <li key={i} className="card ct-mcard"><Skeleton h={140} r={0} /><div style={{ padding: 10 }}><Skeleton w="70%" h={12} /></div></li>)}</ul>
        ) : q.isError ? (
          <div className="card"><EmptyState icon="alert" title="লাইব্রেরি লোড হয়নি" text={errText(q.error)} action={<Button icon="refresh" onClick={() => q.refetch()}>আবার চেষ্টা করুন</Button>} /></div>
        ) : !q.data?.items.length ? (
          <div className="card"><EmptyState icon={kind === 'image' ? 'image' : 'video'} title={kind === 'image' ? 'এখনো কোনো ছবি আপলোড হয়নি' : 'এখনো কোনো ভিডিও আপলোড হয়নি'}
            text="পোস্ট, গ্যালারি, ব্যানার বা ভিডিওতে যা আপলোড করবেন, সব এখানে জমা থাকবে।" action={<Button variant="accent" icon="upload" onClick={() => input.current?.click()}>আপলোড করুন</Button>} /></div>
        ) : (
          <>
            <ul className="ct-mgrid" aria-label={kind === 'image' ? 'ছবির তালিকা' : 'ভিডিওর তালিকা'}>
              {q.data.items.map((a) => (
                <li key={a.id} className="card ct-mcard">
                  <button type="button" className="ct-mopen" onClick={() => setOpen(a)} aria-label={`বিস্তারিত: ${a.name || 'নামহীন ফাইল'}`}>
                    {a.kind === 'video' ? <span className="ct-mvid"><video src={`${a.url}#t=0.5`} preload="metadata" muted playsInline aria-hidden /><span className="ct-vplay" aria-hidden><Icon name="play" size={18} /></span></span> : <img src={a.url} alt="" loading="lazy" />}
                  </button>
                  <div className="ct-mbody"><b title={a.name}>{a.name || 'নামহীন'}</b><small className="muted">{[bnBytes(a.bytes), a.width && a.height ? `${toBn(a.width)}×${toBn(a.height)}` : ''].filter(Boolean).join(' · ')}</small></div>
                </li>
              ))}
            </ul>
            <Pager page={page} totalPages={q.data.totalPages} onPage={setPage} />
          </>
        )}
      </div>
      {open && <Details a={open} onClose={() => setOpen(null)} onDeleted={async () => { setOpen(null); await qc.invalidateQueries({ queryKey: ['tenant', id, 'media'] }); }} />}
    </>
  );
}

type Use = { label: string; to: string };
/** Where an asset is still used (best effort; posts are not searched, the API message covers them). */
export async function findUsage(api: Pick<TenantApi, 'get'>, a: Asset, can: (p: any) => boolean): Promise<Use[]> {
  const out: Use[] = [];
  const safe = async <T,>(fn: () => Promise<T>) => { try { return await fn(); } catch { return null; } };
  const [g, v, site, prof] = await Promise.all([
    a.kind === 'image' ? safe(() => fetchAll<{ url: string; caption: string }>(api, '/gallery')) : null,
    safe(() => fetchAll<{ title: string; mediaId: string | null; posterUrl: string }>(api, '/videos')),
    a.kind === 'image' && can('site.edit') ? safe(() => api.get<{ banners?: Array<{ url: string; title?: string }> }>('/site-config')) : null,
    a.kind === 'image' ? safe(() => api.get<{ draft?: { portrait?: { url: string } }; live?: { portrait?: { url: string } } | null }>('/pages/profile')) : null,
  ]);
  for (const x of g?.items ?? []) if (x.url === a.url) out.push({ label: `গ্যালারির ছবি${x.caption ? `: “${x.caption}”` : ''}`, to: 'gallery' });
  for (const x of v?.items ?? []) if (x.mediaId === a.id || x.posterUrl === a.url) out.push({ label: `${x.mediaId === a.id ? 'ভিডিও' : 'ভিডিওর পোস্টার'}: “${x.title}”`, to: 'videos' });
  (site?.banners ?? []).forEach((b, i) => { if (b.url === a.url) out.push({ label: `হোমপেজের ব্যানার ${toBn(i + 1)}${b.title ? `: “${b.title}”` : ''}`, to: 'site' }); });
  if (prof && (prof.draft?.portrait?.url === a.url || prof.live?.portrait?.url === a.url)) out.push({ label: 'পরিচিতি পাতার প্রতিকৃতি', to: 'site-pages/profile' });
  return out;
}

function Details({ a, onClose, onDeleted }: { a: Asset; onClose: () => void; onDeleted: () => Promise<void> }) {
  const { api, id, can } = useTenant();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inUse, setInUse] = useState<null | { msg: string; uses: Use[] }>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(a.url); toast('ঠিকানা কপি হয়েছে', 'ok'); }
    catch { (document.getElementById('ct-media-url') as HTMLInputElement | null)?.select(); toast('ঠিকানাটি নির্বাচন করা হয়েছে, Ctrl+C চাপুন', 'info'); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.del(`/media/${a.id}`); toast('ফাইলটি মুছে ফেলা হয়েছে', 'ok'); setAsk(false); await onDeleted(); }
    catch (e) {
      setAsk(false);
      if (e instanceof ApiFail && e.code === 'MEDIA_IN_USE') setInUse({ msg: e.message, uses: await findUsage(api, a, can) });
      else toast(errText(e), 'bad');
    } finally { setBusy(false); }
  };
  return (
    <Drawer open title={a.kind === 'video' ? 'ভিডিওর বিস্তারিত' : 'ছবির বিস্তারিত'} onClose={onClose} width={520}
      footer={<div className="ct-dfoot"><Button variant="danger" icon="trash" onClick={() => setAsk(true)}>মুছুন</Button><span className="grow" /><Button onClick={onClose}>বন্ধ করুন</Button></div>}>
      {a.kind === 'video' ? <video className="ct-dimg" src={a.url} controls preload="metadata" playsInline aria-label={a.name || 'ভিডিও'} /> : <img className="ct-dimg" src={a.url} alt={a.name || 'ছবি'} />}
      {inUse && (
        <div className="note bad ct-inuse" role="alert"><Icon name="alert" />
          <div><b>এখন মোছা যাবে না: ফাইলটি ব্যবহৃত হচ্ছে।</b>
            {inUse.uses.length ? <><p>যেখানে ব্যবহৃত হচ্ছে, সেখান থেকে আগে সরান:</p><ul>{inUse.uses.map((u, i) => <li key={i}><Link to={`/t/${id}/${u.to}`}>{u.label}</Link></li>)}</ul></> : <p>{inUse.msg} সম্ভবত কোনো পোস্টে ছবিটি আছে।</p>}
          </div>
        </div>
      )}
      <dl className="dl ct-mdl">
        <dt>নাম</dt><dd>{a.name || '—'}</dd>
        <dt>ধরন</dt><dd><Badge tone={a.kind === 'video' ? 'info' : 'plain'} icon={a.kind === 'video' ? 'video' : 'image'}>{a.kind === 'video' ? `ভিডিও (${a.url.split('.').pop()?.toUpperCase()})` : 'ছবি (WebP)'}</Badge></dd>
        <dt>আকার</dt><dd>{bnBytes(a.bytes)}</dd>
        {a.width && a.height ? <><dt>মাপ</dt><dd className="num">{toBn(a.width)} × {toBn(a.height)} পিক্সেল</dd></> : null}
        <dt>ক্রেডিট</dt><dd>{a.credit || '—'}</dd>
        <dt>আপলোড</dt><dd>{bnDateTime(a.createdAt)}</dd>
      </dl>
      <div className="field"><label htmlFor="ct-media-url">ঠিকানা (URL)</label>
        <div className="ct-copy"><input id="ct-media-url" readOnly value={a.url} onFocus={(e) => e.currentTarget.select()} /><Button icon="copy" onClick={() => void copy()}>কপি</Button></div>
      </div>
      <Confirm open={ask} title="ফাইলটি মুছবেন?" danger confirmLabel="মুছে ফেলুন" busy={busy} onClose={() => setAsk(false)} onConfirm={() => void remove()}>
        <p>ফাইলটি স্থায়ীভাবে মুছে যাবে। কোথাও ব্যবহৃত হলে মোছা যাবে না, তখন কোথায় ব্যবহৃত দেখাবে।</p>
      </Confirm>
    </Drawer>
  );
}
