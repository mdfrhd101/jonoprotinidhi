import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, EmptyState, Field, FormSection, Icon, Switch, type IconName } from '../../../components';
import { ImagePicker } from '../../../components/ImagePicker';
import { toBn } from '../../../format';
import { CharCount } from './common';

/* A small, typed form renderer for the site-page editors. Each page has a hand-written config (pageConfigs.ts) that lists
   its sections and fields; this file draws them with the design-system components. Values are addressed by dotted paths
   ("stats.2.label"), validation errors come in keyed by the same paths. */

/* ---------- field config ---------- */
type Base = { k: string; label: string; hint?: string; req?: boolean; ph?: string };
export type FieldCfg =
  | (Base & { t: 'text'; max: number })
  | (Base & { t: 'area'; max: number; rows?: number })
  | (Base & { t: 'url'; max?: number })
  | (Base & { t: 'bool' })
  | (Base & { t: 'select'; options: Array<[string, string]> })
  | { t: 'row'; fields: FieldCfg[]; three?: boolean }
  | { t: 'group'; k: string; fields: FieldCfg[] }
  | (Base & { t: 'list'; item: string; max: number; fields: FieldCfg[]; summary?: (it: any) => string; add?: string; scalar?: boolean })
  | (Base & { t: 'chips'; item: string; max: number; maxLen: number })
  | (Base & { t: 'image' })
  | (Base & { t: 'hero'; path?: string });
export type SectionCfg = { id: string; title: string; description?: string; icon?: IconName; fields: FieldCfg[] };

/* ---------- path helpers ---------- */
export const join = (a: string, b: string) => (!b ? a : a ? `${a}.${b}` : b);
export function getAt(o: unknown, path: string): any {
  if (!path) return o;
  return path.split('.').reduce<any>((a, k) => (a == null ? undefined : a[k]), o);
}
function setParts(o: any, parts: string[], v: unknown): any {
  if (!parts.length) return v;
  const [h, ...rest] = parts as [string, ...string[]];
  if (Array.isArray(o)) { const c = [...o]; c[Number(h)] = setParts(o[Number(h)], rest, v); return c; }
  return { ...(o ?? {}), [h]: setParts(o?.[h], rest, v) };
}
export const setAt = (o: unknown, path: string, v: unknown) => setParts(o, path ? path.split('.') : [], v);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** An empty item for a list, built from its field config. */
export function blankOf(fields: FieldCfg[], scalar?: boolean): any {
  if (scalar) return '';
  const o: Record<string, unknown> = {};
  const fill = (fs: FieldCfg[], into: Record<string, unknown>) => {
    for (const f of fs) {
      if (f.t === 'row') fill(f.fields, into);
      else if (f.t === 'group') { const g: Record<string, unknown> = {}; fill(f.fields, g); into[f.k] = g; }
      else if (f.t === 'bool') into[f.k] = false;
      else if (f.t === 'list' || f.t === 'chips') into[f.k] = [];
      else if (f.t === 'select') into[f.k] = f.options[0]?.[0] ?? '';
      else if (f.t === 'image') into[f.k] = { url: '', credit: '' };
      else if (f.t === 'hero') into[f.k] = { kicker: '', title: '', intro: '' };
      else into[f.k] = '';
    }
  };
  fill(fields, o);
  return o;
}
/** Every top-level path a list of fields writes to (used for "this section has changes/errors"). */
export function pathsOf(fields: FieldCfg[], base = ''): string[] {
  return fields.flatMap((f) => (f.t === 'row' ? pathsOf(f.fields, base) : f.t === 'group' ? pathsOf(f.fields, join(base, f.k)) : [join(base, f.k)]));
}

/* ---------- form context ---------- */
type Ctx = { form: any; live: any | null; errors: Record<string, string>; showDiff: boolean; set: (path: string, v: unknown) => void };
const FormCtx = createContext<Ctx | null>(null);
export const FormProvider = ({ value, children }: { value: Ctx; children: ReactNode }) => <FormCtx.Provider value={value}>{children}</FormCtx.Provider>;
const useForm = () => { const c = useContext(FormCtx); if (!c) throw new Error('FormProvider missing'); return c; };
export const hasErrorUnder = (errors: Record<string, string>, path: string) => Object.keys(errors).some((k) => k === path || k.startsWith(path + '.'));
export const differsFromLive = (form: unknown, live: unknown, path: string) => live != null && !same(getAt(form, path), getAt(live, path));

function Meta({ path, n, max }: { path: string; n?: number; max?: number }) {
  const { form, live, showDiff } = useForm();
  const diff = showDiff && differsFromLive(form, live, path);
  if (!diff && max == null) return null;
  return (
    <div className="ct-meta">
      {diff ? <span className="ct-diff"><i aria-hidden />প্রকাশিত লেখা থেকে ভিন্ন</span> : <span />}
      {max != null && n != null && <CharCount n={n} max={max} />}
    </div>
  );
}

/* ---------- renderer ---------- */
export function Fields({ fields, base = '' }: { fields: FieldCfg[]; base?: string }) {
  return <>{fields.map((f, i) => <FieldR key={('k' in f ? f.k : 'row') + i} f={f} base={base} />)}</>;
}

function FieldR({ f, base }: { f: FieldCfg; base: string }) {
  const { form, errors, set, live, showDiff } = useForm();
  if (f.t === 'row') return <div className={`frow${f.three ? ' three' : ''}`}><Fields fields={f.fields} base={base} /></div>;
  if (f.t === 'group') return <Fields fields={f.fields} base={join(base, f.k)} />;
  const path = join(base, f.k);
  const v = getAt(form, path);
  const err = errors[path];
  const cls = showDiff && differsFromLive(form, live, path) ? 'ct-f changed' : 'ct-f';
  switch (f.t) {
    case 'text': case 'url': {
      const max = f.max ?? 1500;
      return (
        <div className={cls}><Field label={f.label} required={f.req} error={err} hint={f.hint}>{(p) => <>
          <input {...p} type={f.t === 'url' ? 'url' : undefined} inputMode={f.t === 'url' ? 'url' : undefined} value={v ?? ''} maxLength={max} placeholder={f.ph}
            onChange={(e) => set(path, e.target.value)} />
          <Meta path={path} n={String(v ?? '').length} max={f.t === 'text' && max >= 40 ? max : undefined} />
        </>}</Field></div>
      );
    }
    case 'area':
      return (
        <div className={cls}><Field label={f.label} required={f.req} error={err} hint={f.hint}>{(p) => <>
          <textarea {...p} className={f.max <= 400 ? 'short' : undefined} rows={f.rows ?? (f.max <= 400 ? 3 : 6)} value={v ?? ''} maxLength={f.max} placeholder={f.ph}
            onChange={(e) => set(path, e.target.value)} />
          <Meta path={path} n={String(v ?? '').length} max={f.max} />
        </>}</Field></div>
      );
    case 'bool':
      return (
        <div className={`${cls} ct-bool`}>
          <Switch checked={!!v} onChange={(x) => set(path, x)} label={f.label} />
          <div><b>{f.label}</b>{f.hint && <small className="muted">{f.hint}</small>}</div>
        </div>
      );
    case 'select':
      return (
        <div className={cls}><Field label={f.label} error={err} hint={f.hint}>{(p) => (
          <select {...p} value={v ?? ''} onChange={(e) => set(path, e.target.value)}>{f.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        )}</Field></div>
      );
    case 'image': {
      const pic = v?.url ? [{ url: v.url, credit: v.credit ?? '' }] : [];
      return (
        <div className={`${cls} field`}>
          <span className="lab">{f.label}</span>
          {f.hint && <p className="hint">{f.hint}</p>}
          <ImagePicker max={1} value={pic} error={err ?? errors[join(path, 'url')] ?? errors[join(path, 'credit')]} onChange={(x) => set(path, { url: x[0]?.url ?? '', credit: x[0]?.credit ?? '' })} />
          <Meta path={path} />
        </div>
      );
    }
    case 'chips': return <ChipsEditor f={f} path={path} />;
    case 'list': return <ListEditor f={f} path={path} />;
    case 'hero': return <HeroFold f={f} path={path} />;
  }
}

/* ---------- collapsible item shell (list items, hero cards) ---------- */
function Fold({ n, title, sub, open, onToggle, bad, changed, actions, children, label }: { n?: string; title: string; sub?: string; open: boolean; onToggle: () => void; bad?: boolean; changed?: boolean; actions?: ReactNode; children: ReactNode; label: string }) {
  const id = useId();
  return (
    <div className={`ct-item${open ? ' open' : ''}${bad ? ' bad' : ''}${changed ? ' changed' : ''}`} role="group" aria-label={label}>
      <div className="ct-item-h">
        <button type="button" className="ct-item-tg" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          {n && <span className="ct-item-n" aria-hidden>{n}</span>}
          <span className="ct-item-t"><b>{title}</b>{sub && <small>{sub}</small>}</span>
          {bad && <Badge tone="bad" icon="alert">ভুল আছে</Badge>}
          {changed && !bad && <span className="ct-dot" title="প্রকাশিত লেখা থেকে ভিন্ন"><span className="sr">প্রকাশিত লেখা থেকে ভিন্ন</span></span>}
          <Icon name="chevronDown" size={18} className="ct-chev" />
        </button>
        {actions && <div className="ct-item-a">{actions}</div>}
      </div>
      <div className="ct-item-b form" id={id} hidden={!open}>{open && children}</div>
    </div>
  );
}

function HeroFold({ f, path }: { f: Extract<FieldCfg, { t: 'hero' }>; path: string }) {
  const { form, errors, live, showDiff } = useForm();
  const v = getAt(form, path) ?? {};
  const bad = hasErrorUnder(errors, path);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (bad) setOpen(true); }, [bad]);
  return (
    <Fold label={f.label} title={f.label} sub={v.title || 'শিরোনাম এখনো লেখা হয়নি'} open={open || bad} onToggle={() => setOpen((o) => !o)} bad={bad} changed={showDiff && differsFromLive(form, live, path)}>
      <div className="frow">
        <FieldR base={path} f={{ t: 'text', k: 'kicker', label: 'ওপরের ছোট লেখা', max: 60, hint: 'শিরোনামের ওপরে ছোট অক্ষরে' }} />
        <FieldR base={path} f={{ t: 'text', k: 'title', label: 'শিরোনাম', max: 140 }} />
      </div>
      <FieldR base={path} f={{ t: 'area', k: 'intro', label: 'ভূমিকা', max: 700, hint: 'শিরোনামের নিচে এক-দুই বাক্য' }} />
      {f.hint && <p className="hint">{f.hint}</p>}
    </Fold>
  );
}

/* ---------- repeatable list ---------- */
let keySeq = 0;
const newKey = () => `k${++keySeq}`;

function ListEditor({ f, path }: { f: Extract<FieldCfg, { t: 'list' }>; path: string }) {
  const { form, set, errors, live, showDiff } = useForm();
  const arr: any[] = Array.isArray(getAt(form, path)) ? getAt(form, path) : [];
  const [keys, setKeys] = useState<string[]>(() => arr.map(newKey));
  const [open, setOpen] = useState<Set<string>>(() => new Set(arr.length <= 2 ? [] : []));
  const focusNext = useRef<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // the value can change from outside (discard, reload): keep one key per item
  const ks = keys.length === arr.length ? keys : arr.map((_, i) => keys[i] ?? newKey());
  useEffect(() => { if (ks !== keys) setKeys(ks); }, [ks, keys]);
  useEffect(() => {
    if (!focusNext.current) return;
    const el = wrap.current?.querySelector<HTMLElement>(`[data-k="${focusNext.current}"] .ct-item-b input, [data-k="${focusNext.current}"] .ct-item-b textarea`);
    focusNext.current = null; el?.focus();
  });
  const n = arr.length, full = n >= f.max;
  const listErr = errors[path];
  const toggle = (k: string) => setOpen((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  const add = () => {
    if (full) return;
    const k = newKey();
    setKeys([...ks, k]); setOpen((s) => new Set(s).add(k)); focusNext.current = k;
    set(path, [...arr, blankOf(f.fields, f.scalar)]);
  };
  const remove = (i: number) => { setKeys(ks.filter((_, j) => j !== i)); set(path, arr.filter((_, j) => j !== i)); };
  const move = (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= n) return;
    const a = [...arr], kk = [...ks];
    [a[i], a[j]] = [a[j], a[i]]; [kk[i], kk[j]] = [kk[j]!, kk[i]!];
    setKeys(kk); set(path, a);
  };
  const allOpen = n > 0 && ks.every((k) => open.has(k));
  return (
    <div className={`field ct-list${showDiff && differsFromLive(form, live, path) ? ' changed' : ''}`} ref={wrap}>
      <div className="ct-list-h">
        <span className="lab">{f.label}</span>
        <span className="ct-list-n muted num">{toBn(n)}/{toBn(f.max)}</span>
        {n > 1 && <button type="button" className="link ct-list-all" onClick={() => setOpen(allOpen ? new Set() : new Set(ks))}>{allOpen ? 'সব বন্ধ করুন' : 'সব খুলুন'}</button>}
      </div>
      {f.hint && <p className="hint">{f.hint}</p>}
      {n === 0 ? (
        <div className="ct-list-empty"><EmptyState compact icon="list" title={`এখনো কোনো ${f.item} নেই`} text="যোগ করলে পাবলিক সাইটে এই অংশে দেখাবে।" /></div>
      ) : (
        <div className="ct-items">
          {arr.map((it, i) => {
            const k = ks[i]!, ip = `${path}.${i}`, bad = hasErrorUnder(errors, ip);
            const title = (f.summary?.(it) ?? (f.scalar ? String(it ?? '') : '')).trim();
            const label = `${f.item} ${toBn(i + 1)}`;
            return (
              <div key={k} data-k={k}>
                <Fold n={toBn(i + 1)} label={label} title={title ? (title.length > 90 ? title.slice(0, 90) + '…' : title) : `নতুন ${f.item}`} open={open.has(k) || bad} onToggle={() => toggle(k)} bad={bad}
                  changed={showDiff && live != null && !same(it, getAt(live, ip))}
                  actions={<>
                    <button type="button" className="icon-btn" aria-label={`${label} ওপরে সরান`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrowUp" size={16} /></button>
                    <button type="button" className="icon-btn" aria-label={`${label} নিচে সরান`} disabled={i === n - 1} onClick={() => move(i, 1)}><Icon name="arrowDown" size={16} /></button>
                    <button type="button" className="icon-btn ct-del" aria-label={`${label} মুছুন`} onClick={() => remove(i)}><Icon name="trash" size={16} /></button>
                  </>}>
                  {f.scalar ? <Fields fields={f.fields.map((x) => ({ ...x, label: label } as FieldCfg))} base={ip} /> : <Fields fields={f.fields} base={ip} />}
                </Fold>
              </div>
            );
          })}
        </div>
      )}
      {listErr && <p className="err" role="alert">{listErr}</p>}
      <div className="ct-list-f">
        <Button size="sm" icon="plus" disabled={full} onClick={add}>{f.add ?? `${f.item} যোগ করুন`}</Button>
        {full && <small className="muted">সর্বোচ্চ {toBn(f.max)}টি দেওয়া যায়</small>}
      </div>
    </div>
  );
}

/* ---------- chips (a list of short strings, e.g. unions) ---------- */
function ChipsEditor({ f, path }: { f: Extract<FieldCfg, { t: 'chips' }>; path: string }) {
  const { form, set, errors } = useForm();
  const arr: string[] = Array.isArray(getAt(form, path)) ? getAt(form, path) : [];
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const id = useId();
  const add = () => {
    const parts = text.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...arr];
    for (const p of parts) { if (p.length > f.maxLen) { setMsg(`প্রতিটি সর্বোচ্চ ${toBn(f.maxLen)} অক্ষর`); continue; } if (!next.includes(p) && next.length < f.max) next.push(p); }
    if (next.length >= f.max && parts.length) setMsg(next.length >= f.max ? `সর্বোচ্চ ${toBn(f.max)}টি` : '');
    set(path, next); setText('');
  };
  const err = errors[path] ?? Object.entries(errors).find(([k]) => k.startsWith(path + '.'))?.[1];
  return (
    <div className="field ct-chips">
      <label htmlFor={id}>{f.label} <span className="muted num">({toBn(arr.length)})</span></label>
      {arr.length > 0 && (
        <ul className="ct-chip-list" aria-label={f.label}>
          {arr.map((c, i) => <li key={c + i}><span>{c}</span><button type="button" aria-label={`${c} সরান`} onClick={() => set(path, arr.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button></li>)}
        </ul>
      )}
      <div className="ct-chip-add">
        <input id={id} value={text} maxLength={400} placeholder={f.ph ?? `${f.item}ের নাম লিখে Enter চাপুন`} onChange={(e) => { setText(e.target.value); setMsg(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} aria-describedby={`${id}-h`} />
        <Button size="sm" icon="plus" onClick={add} disabled={!text.trim() || arr.length >= f.max}>যোগ</Button>
      </div>
      <p className="hint" id={`${id}-h`}>{f.hint ?? 'কমা দিয়ে একসঙ্গে কয়েকটি লেখা যায়।'}</p>
      {(err || msg) && <p className="err" role="alert">{err || msg}</p>}
    </div>
  );
}

/* ---------- a whole section (card) ---------- */
export function Section({ s }: { s: SectionCfg }) {
  const { form, live, errors, showDiff } = useForm();
  const paths = pathsOf(s.fields);
  const bad = paths.some((p) => hasErrorUnder(errors, p));
  const changed = showDiff && live != null && paths.some((p) => differsFromLive(form, live, p));
  return (
    <FormSection id={`sec-${s.id}`} title={s.title} description={s.description} icon={s.icon}
      actions={bad ? <Badge tone="bad" icon="alert">ভুল আছে</Badge> : changed ? <Badge tone="brass" dot>প্রকাশিত থেকে ভিন্ন</Badge> : undefined}>
      <Fields fields={s.fields} />
    </FormSection>
  );
}
