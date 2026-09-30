import { useRef, useState, type DragEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiFail } from '../api';
import { useTenant } from '../tenant';
import { Dialog, Pager, useToast } from './ui';
import { toBn } from '../format';

/* Photo field: upload from the device (drag & drop or button), or pick something already uploaded. Each photo gets a
   credit line (who took it / who allows its use). Files are checked here for a friendly message; the server
   re-checks and re-encodes them, so this is not the security boundary. */

export type Pic = { url: string; credit: string };
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 8;

type Asset = { id: string; url: string; name: string; credit: string };

export function ImagePicker({ value, onChange, max = 6, error }: { value: Pic[]; onChange: (v: Pic[]) => void; max?: number; error?: string }) {
  const { api, id } = useTenant();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [lib, setLib] = useState(false);
  const [page, setPage] = useState(1);
  const room = max - value.length;

  const send = async (files: File[]) => {
    const ok: File[] = [];
    for (const f of files) {
      if (!TYPES.includes(f.type)) { toast(`"${f.name}": শুধু JPG, PNG বা WebP ছবি দেওয়া যায়`); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { toast(`"${f.name}": ছবি সর্বোচ্চ ${toBn(MAX_MB)} মেগাবাইট হতে পারে`); continue; }
      ok.push(f);
    }
    const take = ok.slice(0, Math.max(0, room));
    if (ok.length > take.length) toast(`সর্বোচ্চ ${toBn(max)}টি ছবি দেওয়া যায়`);
    if (!take.length) return;
    setBusy(take.length);
    const added: Pic[] = [];
    for (const f of take) {
      try {
        const r = await api.upload<{ url: string }>(`/media?name=${encodeURIComponent(f.name.slice(0, 100))}`, f);
        added.push({ url: r.url, credit: '' });
      } catch (e) {
        toast(`"${f.name}": ${e instanceof ApiFail ? e.message : 'আপলোড হয়নি'}`);
      }
      setBusy((n) => n - 1);
    }
    if (added.length) onChange([...value, ...added]);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); void send(Array.from(e.dataTransfer.files)); };
  const library = useQuery({ queryKey: ['tenant', id, 'media', page], enabled: lib, queryFn: () => api.get<{ items: Asset[]; totalPages: number }>(`/media?kind=image&page=${page}&limit=24`) });

  return (
    <div>
      {value.length > 0 && (
        <div className="pics" style={{ marginBottom: 14 }}>
          {value.map((p, i) => (
            <figure key={p.url + i} className="pic" style={{ margin: 0 }}>
              <img src={p.url} alt={`ছবি ${toBn(i + 1)}`} loading="lazy" />
              <div className="pic-b">
                <input aria-label={`ছবি ${toBn(i + 1)} এর ক্রেডিট`} placeholder="ক্রেডিট (কে তুলেছেন)" maxLength={200} value={p.credit}
                  onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, credit: e.target.value } : x)))} />
                <div className="pic-actions">
                  <span className="muted" style={{ fontSize: 13 }}>{i === 0 ? 'প্রধান ছবি' : ''}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {i > 0 && <button type="button" className="btn btn-g btn-s" aria-label={`ছবি ${toBn(i + 1)} প্রধান করুন`} onClick={() => onChange([p, ...value.filter((_, j) => j !== i)])}>প্রধান করুন</button>}
                    <button type="button" className="btn btn-g btn-s" aria-label={`ছবি ${toBn(i + 1)} সরান`} onClick={() => onChange(value.filter((_, j) => j !== i))}>সরান</button>
                  </span>
                </div>
              </div>
            </figure>
          ))}
        </div>
      )}
      {room > 0 && (
        <div className={`drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
          onClick={() => input.current?.click()} role="button" tabIndex={0} aria-label="ছবি আপলোড করুন"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}>
          <strong>{busy ? `আপলোড হচ্ছে… (${toBn(busy)}টি বাকি)` : 'ছবি এখানে টেনে আনুন, বা ক্লিক করে বাছুন'}</strong>
          <small>JPG, PNG বা WebP · সর্বোচ্চ {toBn(MAX_MB)} মেগাবাইট · আরও {toBn(room)}টি যোগ করা যাবে</small>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="btn btn-p btn-s" disabled={busy > 0} onClick={(e) => { e.stopPropagation(); input.current?.click(); }}>ছবি বাছুন</button>
            <button type="button" className="btn btn-g btn-s" onClick={(e) => { e.stopPropagation(); setPage(1); setLib(true); }}>আগে আপলোড করা ছবি থেকে</button>
          </span>
        </div>
      )}
      <input ref={input} type="file" accept={TYPES.join(',')} multiple hidden aria-label="ছবির ফাইল"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; void send(fs); }} />
      {error && <p className="err" role="alert">{error}</p>}

      <Dialog title="আগে আপলোড করা ছবি" open={lib} wide onClose={() => setLib(false)} footer={<button type="button" className="btn btn-g" onClick={() => setLib(false)}>বন্ধ করুন</button>}>
        {library.isLoading ? <p role="status">লোড হচ্ছে…</p> : !library.data?.items.length ? <p className="muted">এখনো কোনো ছবি আপলোড হয়নি।</p> : (
          <>
            <div className="lib">
              {library.data.items.map((a) => (
                <button key={a.id} type="button" aria-label={`এই ছবিটি নিন${a.name ? `: ${a.name}` : ''}`} disabled={value.some((v) => v.url === a.url) || room <= 0}
                  onClick={() => { onChange([...value, { url: a.url, credit: a.credit }]); if (room <= 1) setLib(false); }}>
                  <img src={a.url} alt={a.name || 'আপলোড করা ছবি'} loading="lazy" />
                </button>
              ))}
            </div>
            <Pager page={page} totalPages={library.data.totalPages} onPage={setPage} />
          </>
        )}
      </Dialog>
    </div>
  );
}
