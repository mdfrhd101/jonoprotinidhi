import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { parsePage } from '@jonoprotinidhi/shared';
import { ApiFail } from '../../../api';
import { renderApp, fakeTenant, type FakeTenant } from '../../../test/utils';

/* Component tests for the content editors: site-page editors (validation, repeatable lists, save/publish, version conflicts),
   gallery (upload -> create, reorder, delete rules), videos (YouTube preview, upload with progress, create payloads),
   events, media library (file in use) and the banners page. The tenant hook is a fake; no network. */

const h = vi.hoisted(() => ({ tenant: null as null | FakeTenant }));
vi.mock('../../../tenant', () => ({
  useTenant: () => h.tenant, canDo: () => true,
  publicSiteUrl: () => 'http://localhost:3000', publicPageUrl: (_s: string, p = '/') => `http://localhost:3000${p}`,
}));

import PageEditor from './PageEditor';
import SitePages from './SitePages';
import Gallery from './Gallery';
import Videos, { checkVideoFile } from './Videos';
import Events from './Events';
import MediaLibrary from './MediaLibrary';
import Site from '../Site';

beforeEach(() => { vi.clearAllMocks(); h.tenant = null; });

const doc = (key: 'home' | 'contact' | 'profile', data: object, extra: object = {}) => {
  const d = parsePage(key, data);
  return { key, label: key, draft: d, live: d, status: 'published', hasUnpublishedChanges: false, version: 7, updatedAt: '2026-09-29T10:00:00Z', publishedAt: '2026-09-29T10:00:00Z', ...extra };
};
const homeData = { hero: { kicker: 'সংসদ সদস্য', note: 'নোট' }, statsTitle: 'কাজের হিসাব', stats: [{ n: '৪২', unit: 'কিমি', label: 'সড়ক' }, { n: '১৮', unit: 'টি', label: 'বিজ্ঞানাগার' }] };
const contactData = { intro: 'যোগাযোগ করুন', channels: [{ label: 'ইমেইল', note: '', url: 'mailto:a@b.co' }, { label: 'ফোন', note: '', url: 'tel:123' }] };

function editor(key: string) {
  return renderApp(<Routes><Route path="/t/T1/site-pages/:key" element={<PageEditor />} /><Route path="/t/T1/site-pages" element={<p>hub</p>} /></Routes>, `/t/T1/site-pages/${key}`);
}

describe('site page editors', () => {
  it('shows the loaded draft and the public-vs-draft state; client-side validation blocks an empty required field', async () => {
    h.tenant = fakeTenant('editor', { 'GET /pages/home': doc('home', homeData) });
    editor('home');
    expect(await screen.findByDisplayValue('সংসদ সদস্য')).toBeInTheDocument();
    expect(screen.getByText('প্রকাশিত সংস্করণ')).toBeInTheDocument();
    expect(screen.getByText('লাইভ লেখার সঙ্গে হুবহু মিল')).toBeInTheDocument();
    // open the first stat and clear its number
    await userEvent.click(screen.getByRole('button', { name: /৪২ কিমি/ }));
    const n = screen.getAllByLabelText(/^সংখ্যা/)[0]!;
    await userEvent.clear(n);
    expect(screen.getByText('অসংরক্ষিত পরিবর্তন আছে', { selector: '.pill' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'খসড়া সংরক্ষণ' }));
    expect(await screen.findByText('এই ঘরটি পূরণ করুন')).toBeInTheDocument();
    expect(screen.getByText(/১টি ঘরে ভুল আছে/)).toBeInTheDocument();
    expect(h.tenant.api.put).not.toHaveBeenCalled();
    // an editor never sees publish
    expect(screen.queryByRole('button', { name: /প্রকাশ/ })).toBeNull();
  });

  it('repeatable lists: add, move up, remove; saving sends the whole page with the version', async () => {
    h.tenant = fakeTenant('editor', { 'GET /pages/contact': doc('contact', contactData), 'PUT /pages/contact': (b: any) => doc('contact', { ...b, version: undefined } as never, { version: 8 }) });
    // the fake returns whatever was PUT (minus version) as the new draft
    h.tenant.api.put.mockImplementation(async (_p: string, b: any) => { const { version: _v, ...rest } = b; return doc('contact', rest, { version: 8, hasUnpublishedChanges: true, status: 'draft' }); });
    editor('contact');
    await screen.findByDisplayValue('যোগাযোগ করুন');
    await userEvent.click(screen.getByRole('button', { name: 'মাধ্যম যোগ করুন' }));
    const group = screen.getByRole('group', { name: 'মাধ্যম ৩' });
    await userEvent.type(within(group).getByLabelText(/^নাম/), 'হোয়াটসঅ্যাপ');
    await userEvent.type(within(group).getByLabelText(/^লিংক/), 'https://wa.me/880');
    await userEvent.click(screen.getByRole('button', { name: 'মাধ্যম ৩ ওপরে সরান' }));
    await userEvent.click(screen.getByRole('button', { name: 'মাধ্যম ১ মুছুন' }));
    await userEvent.click(screen.getByRole('button', { name: 'খসড়া সংরক্ষণ' }));
    await waitFor(() => expect(h.tenant!.api.put).toHaveBeenCalledTimes(1));
    const [path, body] = h.tenant.api.put.mock.calls[0]! as [string, any];
    expect(path).toBe('/pages/contact');
    expect(body.version).toBe(7);
    expect(body.channels.map((c: { label: string }) => c.label)).toEqual(['হোয়াটসঅ্যাপ', 'ফোন']);
    expect(body.intro).toBe('যোগাযোগ করুন');
    expect(h.tenant.api.post).not.toHaveBeenCalled();
    expect(await screen.findByText('সংরক্ষিত, প্রকাশের অপেক্ষায়')).toBeInTheDocument();
  });

  it('owner: "সংরক্ষণ ও প্রকাশ" saves the draft then publishes it', async () => {
    h.tenant = fakeTenant('owner', { 'GET /pages/home': doc('home', homeData) });
    h.tenant.api.put.mockImplementation(async (_p: string, b: any) => { const { version: _v, ...rest } = b; return doc('home', rest, { version: 8, hasUnpublishedChanges: true, status: 'draft' }); });
    h.tenant.api.post.mockImplementation(async () => doc('home', { ...homeData, statsTitle: 'নতুন শিরোনাম' }, { version: 9 }));
    editor('home');
    const t = await screen.findByDisplayValue('কাজের হিসাব');
    await userEvent.clear(t); await userEvent.type(t, 'নতুন শিরোনাম');
    await userEvent.click(screen.getByRole('button', { name: 'সংরক্ষণ ও প্রকাশ' }));
    await waitFor(() => expect(h.tenant!.api.post).toHaveBeenCalledWith('/pages/home/publish'));
    expect(h.tenant.api.put).toHaveBeenCalledWith('/pages/home', expect.objectContaining({ statsTitle: 'নতুন শিরোনাম', version: 7 }));
    expect(h.tenant.api.put.mock.invocationCallOrder[0]!).toBeLessThan(h.tenant.api.post.mock.invocationCallOrder[0]!);
  });

  it('a stale version (409 VERSION_CONFLICT) shows a friendly reload / overwrite choice', async () => {
    h.tenant = fakeTenant('editor', { 'GET /pages/home': doc('home', homeData) });
    h.tenant.api.put.mockRejectedValueOnce(new ApiFail(409, 'VERSION_CONFLICT', 'পেজটি অন্য কেউ বদলেছেন'));
    editor('home');
    const t = await screen.findByDisplayValue('কাজের হিসাব');
    await userEvent.type(t, '!');
    await userEvent.click(screen.getByRole('button', { name: 'খসড়া সংরক্ষণ' }));
    const dlg = await screen.findByRole('dialog', { name: 'পাতাটি এর মধ্যে বদলে গেছে' });
    expect(within(dlg).getByRole('button', { name: 'সর্বশেষটি লোড করুন' })).toBeInTheDocument();
    // overwrite: re-reads the version, then saves again with it
    h.tenant.api.get.mockResolvedValueOnce(doc('home', homeData, { version: 12 }));
    h.tenant.api.put.mockImplementationOnce(async (_p: string, b: any) => { const { version: _v, ...rest } = b; return doc('home', rest, { version: 13 }); });
    await userEvent.click(within(dlg).getByRole('button', { name: 'আমার লেখা দিয়ে প্রতিস্থাপন' }));
    await waitFor(() => expect(h.tenant!.api.put).toHaveBeenLastCalledWith('/pages/home', expect.objectContaining({ version: 12, statsTitle: 'কাজের হিসাব!' })));
  });

  it('server field errors are shown next to the field (400 with fieldErrors)', async () => {
    h.tenant = fakeTenant('editor', { 'GET /pages/contact': doc('contact', contactData) });
    h.tenant.api.put.mockRejectedValueOnce(new ApiFail(400, 'VALIDATION_FAILED', 'তথ্য ঠিক নেই', { fieldErrors: { intro: ['খুব বড়'] } }));
    editor('contact');
    const intro = await screen.findByDisplayValue('যোগাযোগ করুন');
    await userEvent.type(intro, ' আজই');
    await userEvent.click(screen.getByRole('button', { name: 'খসড়া সংরক্ষণ' }));
    expect(await screen.findByText('খুব বড়')).toBeInTheDocument();
  });

  it('the hub lists every page with its state; the owner can publish a page with pending changes', async () => {
    const rows = ['layout', 'home', 'profile', 'heroes', 'area', 'contact', 'complaint'].map((key) => ({ key, label: `পাতা-${key}`, status: key === 'area' ? 'draft' : 'published', hasUnpublishedChanges: key === 'area', updatedAt: '2026-09-29T10:00:00Z', publishedAt: '2026-09-28T10:00:00Z' }));
    h.tenant = fakeTenant('owner', { 'GET /pages': rows });
    renderApp(<SitePages />);
    expect(await screen.findByRole('link', { name: 'পাতা-home' })).toBeInTheDocument();
    expect(screen.getByText('অপ্রকাশিত পরিবর্তন আছে')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'পাতা-area প্রকাশ করুন' }));
    await waitFor(() => expect(h.tenant!.api.post).toHaveBeenCalledWith('/pages/area/publish'));
    expect(screen.queryByRole('button', { name: 'পাতা-home প্রকাশ করুন' })).toBeNull();
  });
});

const g = (id: string, over: object = {}) => ({ id, url: `http://127.0.0.1:4000/api/v1/public/media/T1/${id}.webp`, caption: `ছবি ${id}`, credit: '', album: 'এলাকা', takenAt: null, order: Number(id.slice(1)), featured: false, status: 'published', updatedAt: '', ...over });

describe('gallery manager', () => {
  it('multi-upload: each file goes to /media with progress, then becomes a gallery item at the end of the order', async () => {
    h.tenant = fakeTenant('editor', { 'GET /gallery': { items: [g('g1'), g('g2')], totalPages: 1, total: 2 } });
    h.tenant.api.uploadProgress.mockImplementation(async (_p: string, f: Blob, on?: (l: number, t: number) => void) => { on?.(f.size / 2, f.size); return { url: `http://127.0.0.1:4000/m/${(f as File).name}.webp` }; });
    renderApp(<Gallery />);
    await screen.findByText('ছবি g1');
    const files = [new File(['a'], 'one.jpg', { type: 'image/jpeg' }), new File(['b'], 'two.png', { type: 'image/png' }), new File(['c'], 'bad.gif', { type: 'image/gif' })];
    fireEvent.change(screen.getByLabelText('গ্যালারির জন্য ছবির ফাইল'), { target: { files } });
    await waitFor(() => expect(h.tenant!.api.post).toHaveBeenCalledTimes(2));
    expect(h.tenant.api.uploadProgress).toHaveBeenCalledWith('/media?name=one.jpg', files[0], expect.any(Function));
    expect(h.tenant.api.post).toHaveBeenNthCalledWith(1, '/gallery', { url: 'http://127.0.0.1:4000/m/one.jpg.webp', caption: '', credit: '', album: '', order: 3, featured: false });
    expect(h.tenant.api.post).toHaveBeenNthCalledWith(2, '/gallery', expect.objectContaining({ url: 'http://127.0.0.1:4000/m/two.png.webp', order: 4 }));
    expect(await screen.findByText(/শুধু JPG, PNG বা WebP/)).toBeInTheDocument(); // the gif was refused before upload
  });

  it('reordering sends every id in the new order to /gallery/reorder', async () => {
    h.tenant = fakeTenant('editor', { 'GET /gallery': { items: [g('g1'), g('g2'), g('g3')], totalPages: 1, total: 3 } });
    renderApp(<Gallery />);
    await screen.findByText('ছবি g1');
    await userEvent.click(screen.getByRole('button', { name: 'পরে নিন: ছবি g1' }));
    await userEvent.click(screen.getByRole('button', { name: 'ক্রম সংরক্ষণ' }));
    await waitFor(() => expect(h.tenant!.api.post).toHaveBeenCalledWith('/gallery/reorder', { ids: ['g2', 'g1', 'g3'] }));
  });

  it('an editor cannot delete a published photo (the button is disabled and says why); a draft can be deleted', async () => {
    h.tenant = fakeTenant('editor', { 'GET /gallery': { items: [g('g1'), g('g2', { status: 'draft' })], totalPages: 1, total: 2 } });
    renderApp(<Gallery />);
    await userEvent.click(await screen.findByRole('button', { name: 'সম্পাদনা: ছবি g1' }));
    let d = await screen.findByRole('dialog', { name: 'ছবির তথ্য' });
    expect(within(d).getByRole('button', { name: 'মুছুন' })).toBeDisabled();
    expect(within(d).getByText(/প্রকাশিত ছবি মুছতে MP-র অনুমতি লাগে/)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: 'বন্ধ করুন' }));
    await userEvent.click(screen.getByRole('button', { name: 'সম্পাদনা: ছবি g2' }));
    d = await screen.findByRole('dialog', { name: 'ছবির তথ্য' });
    await userEvent.click(within(d).getByRole('button', { name: 'মুছুন' }));
    await userEvent.click(await screen.findByRole('button', { name: 'মুছে ফেলুন' }));
    await waitFor(() => expect(h.tenant!.api.del).toHaveBeenCalledWith('/gallery/g2'));
  });

  it('owner: bulk publish of selected drafts, and the preview slider shows published photos with prev/next', async () => {
    h.tenant = fakeTenant('owner', { 'GET /gallery': { items: [g('g1'), g('g2'), g('g3', { status: 'draft' })], totalPages: 1, total: 3 } });
    renderApp(<Gallery />);
    await userEvent.click(await screen.findByRole('button', { name: /সব খসড়া বাছুন/ }));
    await userEvent.click(screen.getByRole('button', { name: 'প্রকাশ করুন' }));
    await waitFor(() => expect(h.tenant!.api.post).toHaveBeenCalledWith('/gallery/g3/publish'));
    await userEvent.click(screen.getByRole('button', { name: 'স্লাইডার প্রিভিউ' }));
    const s = await screen.findByRole('region', { name: /গ্যালারি: পাবলিক সাইটে/ });
    expect(within(s).getByText('১ / ২')).toBeInTheDocument();
    await userEvent.click(within(s).getByRole('button', { name: 'পরেরটি' }));
    expect(within(s).getByText('২ / ২')).toBeInTheDocument();
    fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(within(s).getByText('১ / ২')).toBeInTheDocument();
  });
});

describe('videos manager', () => {
  it('pasting a YouTube link shows the thumbnail and a privacy-enhanced embed at once; a bad link shows an error', async () => {
    h.tenant = fakeTenant('owner', { 'GET /videos': { items: [], totalPages: 1, total: 0 } });
    renderApp(<Videos />);
    await userEvent.click(await screen.findByRole('button', { name: 'নতুন ভিডিও' }));
    const link = screen.getByRole('textbox', { name: /^YouTube লিংক/ });
    await userEvent.type(link, 'https://example.com/watch?v=nope');
    expect(screen.getByText(/এটি সঠিক YouTube লিংক নয়/)).toBeInTheDocument();
    await userEvent.clear(link);
    await userEvent.type(link, 'https://youtu.be/dQw4w9WgXcQ?t=42');
    expect(screen.getByTitle('YouTube প্রিভিউ')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(screen.getByAltText('YouTube থাম্বনেইল')).toHaveAttribute('src', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    await userEvent.type(screen.getByLabelText(/^শিরোনাম/), 'সংসদে বক্তব্য');
    await userEvent.click(screen.getByRole('button', { name: 'যোগ ও প্রকাশ' }));
    await waitFor(() => expect(h.tenant!.api.post).toHaveBeenCalledWith('/videos?publish=1', expect.objectContaining({ kind: 'youtube', youtube: 'https://youtu.be/dQw4w9WgXcQ?t=42', title: 'সংসদে বক্তব্য', order: 0 })));
    expect((h.tenant.api.post.mock.calls[0]![1] as Record<string, unknown>).mediaId).toBeUndefined();
  });

  it('upload: checks the file, uploads with real progress to /media/video, then creates an upload video', async () => {
    h.tenant = fakeTenant('editor', { 'GET /videos': { items: [], totalPages: 1, total: 0 } });
    let finish!: (v: unknown) => void;
    h.tenant.api.uploadProgress.mockImplementation((_p: string, f: Blob, on?: (l: number, t: number) => void) => { on?.(f.size * 0.4, f.size); return new Promise((r) => { finish = r; }); });
    renderApp(<Videos />);
    await userEvent.click(await screen.findByRole('button', { name: 'নতুন ভিডিও' }));
    await userEvent.click(screen.getByRole('tab', { name: 'ফাইল আপলোড' }));
    const bad = new File(['x'], 'clip.avi', { type: 'video/x-msvideo' });
    fireEvent.change(screen.getByLabelText('ভিডিও ফাইল'), { target: { files: [bad] } });
    expect((await screen.findAllByText('শুধু MP4 বা WebM ভিডিও দেওয়া যায়')).length).toBeGreaterThan(0);
    expect(h.tenant.api.uploadProgress).not.toHaveBeenCalled();
    const file = new File(['0123456789'], 'gonoshunani.webm', { type: 'video/webm' });
    fireEvent.change(screen.getByLabelText('ভিডিও ফাইল'), { target: { files: [file] } });
    const bar = await screen.findByRole('progressbar', { name: 'gonoshunani.webm' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(h.tenant.api.uploadProgress).toHaveBeenCalledWith('/media/video?name=gonoshunani.webm', file, expect.any(Function), expect.any(AbortSignal));
    finish({ id: 'a'.repeat(24), url: 'http://127.0.0.1:4000/api/v1/public/media/T1/aaa.webm', name: 'gonoshunani.webm', bytes: 10 });
    expect(await screen.findByLabelText('আপলোড করা ভিডিওর প্রিভিউ')).toBeInTheDocument();
    expect(screen.getByLabelText(/^শিরোনাম/)).toHaveValue('gonoshunani'); // filled from the file name
    await userEvent.click(screen.getByRole('button', { name: 'খসড়া হিসেবে রাখুন' }));
    await waitFor(() => expect(h.tenant!.api.post).toHaveBeenCalledWith('/videos', expect.objectContaining({ kind: 'upload', mediaId: 'a'.repeat(24), title: 'gonoshunani' })));
    expect(screen.queryByRole('button', { name: 'যোগ ও প্রকাশ' })).toBeNull(); // editors cannot publish
  });

  it('checkVideoFile: type and 150 MB limit', () => {
    expect(checkVideoFile(new File(['x'], 'a.mp4', { type: 'video/mp4' }))).toBeNull();
    expect(checkVideoFile(new File(['x'], 'a.webm', { type: '' }))).toBeNull();
    expect(checkVideoFile(new File(['x'], 'a.mov', { type: 'video/quicktime' }))).toMatch(/MP4 বা WebM/);
    const big = new File(['x'], 'b.mp4', { type: 'video/mp4' }); Object.defineProperty(big, 'size', { value: 151 * 1024 * 1024 });
    expect(checkVideoFile(big)).toMatch(/১৫০ মেগাবাইট/);
  });

  it('owner publishes a draft from the list; editors cannot delete a published video', async () => {
    const v = (id: string, status: string) => ({ id, title: `ভিডিও ${id}`, description: '', date: null, kind: 'youtube', youtubeId: 'dQw4w9WgXcQ', mediaId: null, fileUrl: null, posterUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', embedUrl: '', duration: '', order: 0, featured: false, status, updatedAt: '' });
    h.tenant = fakeTenant('owner', { 'GET /videos': { items: [v('v1', 'published'), v('v2', 'draft')], totalPages: 1, total: 2 } });
    const r = renderApp(<Videos />);
    await userEvent.click(await screen.findByRole('button', { name: 'প্রকাশ করুন: ভিডিও v2' }));
    await waitFor(() => expect(h.tenant!.api.post).toHaveBeenCalledWith('/videos/v2/publish'));
    r.unmount();
    h.tenant = fakeTenant('editor', { 'GET /videos': { items: [v('v1', 'published'), v('v2', 'draft')], totalPages: 1, total: 2 } });
    renderApp(<Videos />);
    expect(await screen.findByRole('button', { name: 'মুছুন: ভিডিও v1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'মুছুন: ভিডিও v2' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /প্রকাশ করুন: / })).toBeNull();
  });
});

describe('events', () => {
  it('splits upcoming and past, and creates an event with a Dhaka-safe date', async () => {
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    h.tenant = fakeTenant('editor', { 'GET /events': { items: [{ id: 'e1', title: 'আসন্ন গণশুনানি', date: `${future}T04:00:00.000Z`, time: '', place: 'মাঠ', note: '', status: 'published', updatedAt: '' }, { id: 'e2', title: 'পুরনো সভা', date: '2020-01-05T04:00:00.000Z', time: '', place: '', note: '', status: 'published', updatedAt: '' }], totalPages: 1, total: 2 } });
    renderApp(<Events />);
    expect(await screen.findByText('আসন্ন গণশুনানি')).toBeInTheDocument();
    expect(screen.queryByText('পুরনো সভা')).toBeNull();
    expect(screen.getByRole('button', { name: 'মুছুন: আসন্ন গণশুনানি' })).toBeDisabled(); // published: owner only
    await userEvent.click(screen.getByRole('tab', { name: /অতীত/ }));
    expect(screen.getByText('পুরনো সভা')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'নতুন কর্মসূচি' }));
    const d = await screen.findByRole('dialog', { name: 'নতুন কর্মসূচি' });
    await userEvent.click(within(d).getByRole('button', { name: 'খসড়া হিসেবে রাখুন' }));
    expect(await within(d).findByText('তারিখ দিন')).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(/^শিরোনাম/), 'চক্ষু শিবির');
    fireEvent.change(within(d).getByLabelText(/^তারিখ/), { target: { value: '2026-10-20' } });
    await userEvent.type(within(d).getByLabelText(/^স্থান/), 'স্বাস্থ্য কমপ্লেক্স');
    await userEvent.click(within(d).getByRole('button', { name: 'খসড়া হিসেবে রাখুন' }));
    await waitFor(() => expect(h.tenant!.api.post).toHaveBeenCalledWith('/events', { title: 'চক্ষু শিবির', date: '2026-10-20T04:00:00.000Z', time: '', place: 'স্বাস্থ্য কমপ্লেক্স', note: '' }));
  });
});

describe('media library', () => {
  it('a file that is still used cannot be deleted: the API refusal is explained with where it is used', async () => {
    const asset = { id: 'm1', kind: 'image', url: 'http://127.0.0.1:4000/api/v1/public/media/T1/m1.webp', name: 'hero.jpg', bytes: 204800, width: 1600, height: 900, credit: '', createdAt: '2026-09-29T10:00:00Z' };
    h.tenant = fakeTenant('owner', {
      'GET /media': { items: [asset], total: 1, totalPages: 1 },
      'GET /gallery': { items: [{ url: asset.url, caption: 'সংসদ ভবন' }], totalPages: 1 },
      'GET /videos': { items: [], totalPages: 1 },
      'GET /site-config': { banners: [{ url: asset.url, title: 'প্রথম ব্যানার' }] },
      'GET /pages/profile': { draft: { portrait: { url: '' } }, live: null },
    });
    h.tenant.api.del.mockRejectedValueOnce(new ApiFail(409, 'MEDIA_IN_USE', 'এই ফাইলটি কোথাও ব্যবহৃত হচ্ছে'));
    renderApp(<MediaLibrary />);
    await userEvent.click(await screen.findByRole('button', { name: 'বিস্তারিত: hero.jpg' }));
    const d = await screen.findByRole('dialog', { name: 'ছবির বিস্তারিত' });
    expect(within(d).getByText('২০০ কিলোবাইট')).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: 'মুছুন' }));
    await userEvent.click(await screen.findByRole('button', { name: 'মুছে ফেলুন' }));
    expect(await within(d).findByText(/এখন মোছা যাবে না/)).toBeInTheDocument();
    expect(within(d).getByRole('link', { name: 'গ্যালারির ছবি: “সংসদ ভবন”' })).toHaveAttribute('href', '/t/T1/gallery');
    expect(within(d).getByRole('link', { name: 'হোমপেজের ব্যানার ১: “প্রথম ব্যানার”' })).toHaveAttribute('href', '/t/T1/site');
  });
});

describe('banners & homepage layout', () => {
  it('BUG-2026-021: the banners page has no profile form (it wiped the profile) and saves banners + all sections incl. videos', async () => {
    h.tenant = fakeTenant('owner', { 'GET /site-config': { slogan: 'স্লোগান', accent: 'brass', banners: [{ url: 'http://127.0.0.1:4000/a.webp', caption: 'ক', title: 'এক' }, { url: 'http://127.0.0.1:4000/b.webp', caption: 'খ', title: 'দুই' }], sections: [{ key: 'stats', on: true }, { key: 'about', on: true }] } });
    renderApp(<Site />);
    expect(await screen.findByDisplayValue('স্লোগান')).toBeInTheDocument();
    expect(screen.queryByText('পরিচিতি (প্রোফাইল)')).toBeNull();
    expect(h.tenant.api.get).not.toHaveBeenCalledWith('/profile');
    await userEvent.click(screen.getByRole('button', { name: 'ব্যানার ২ ওপরে সরান' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'ভিডিও চালু' }));
    await userEvent.click(screen.getByRole('button', { name: 'সংরক্ষণ ও প্রকাশ' }));
    await waitFor(() => expect(h.tenant!.api.put).toHaveBeenCalledTimes(1));
    const [p, body] = h.tenant.api.put.mock.calls[0]! as [string, any];
    expect(p).toBe('/site-config');
    expect(body.banners.map((b: { title: string }) => b.title)).toEqual(['দুই', 'এক']);
    expect(body.sections.map((s: { key: string }) => s.key)).toEqual(['stats', 'about', 'activities', 'office', 'promises', 'area', 'gallery', 'videos', 'events', 'cta']);
    expect(body.sections.find((s: { key: string }) => s.key === 'videos').on).toBe(true);
    expect(h.tenant.api.put).not.toHaveBeenCalledWith('/profile', expect.anything());
  });

  it('BUG-2026-024: two edits in the same tick (autofill, fast typing) are both kept', async () => {
    h.tenant = fakeTenant('owner', { 'GET /site-config': { slogan: '', accent: 'brass', banners: [{ url: 'http://127.0.0.1:4000/a.webp', caption: '', title: '' }], sections: [] } });
    renderApp(<Site />);
    const g = await screen.findByRole('group', { name: 'ব্যানার ১' });
    act(() => {
      fireEvent.change(within(g).getByLabelText('শিরোনাম'), { target: { value: 'শিরোনাম লেখা' } });
      fireEvent.change(within(g).getByLabelText('ছবির ক্যাপশন / ক্রেডিট'), { target: { value: 'ক্যাপশন লেখা' } });
    });
    expect(within(g).getByLabelText('শিরোনাম')).toHaveValue('শিরোনাম লেখা');
    expect(within(g).getByLabelText('ছবির ক্যাপশন / ক্রেডিট')).toHaveValue('ক্যাপশন লেখা');
  });

  it('a banner without an image is refused before saving', async () => {
    h.tenant = fakeTenant('owner', { 'GET /site-config': { slogan: '', accent: 'brass', banners: [], sections: [] } });
    renderApp(<Site />);
    await userEvent.click(await screen.findByRole('button', { name: 'ব্যানার যোগ করুন' }));
    await userEvent.click(screen.getByRole('button', { name: 'সংরক্ষণ ও প্রকাশ' }));
    expect(await screen.findByText('ব্যানারের ছবি দিন')).toBeInTheDocument();
    expect(h.tenant.api.put).not.toHaveBeenCalled();
  });
});
