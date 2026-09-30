import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiFail } from '../api';
import { renderApp, fakeTenant, type FakeTenant } from '../test/utils';

const h = vi.hoisted(() => ({ tenant: null as null | FakeTenant }));
vi.mock('../tenant', () => ({ useTenant: () => h.tenant, canDo: () => true }));

import { ImagePicker, type Pic } from './ImagePicker';
import { RichEditor, toEditorHtml } from './RichEditor';
import { RichText, cleanHtml } from './RichText';

beforeEach(() => { vi.clearAllMocks(); });

const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type });

function Harness({ initial = [] as Pic[], max }: { initial?: Pic[]; max?: number }) {
  const [v, setV] = useState<Pic[]>(initial);
  return <><ImagePicker value={v} onChange={setV} max={max} /><output data-testid="state">{JSON.stringify(v)}</output></>;
}
const state = () => JSON.parse(screen.getByTestId('state').textContent || '[]') as Pic[];

describe('ImagePicker (photo upload field)', () => {
  it('uploads a JPG/PNG/WebP as the raw file and shows it as the main photo', async () => {
    h.tenant = fakeTenant('editor', {});
    h.tenant.api.upload.mockResolvedValue({ url: 'http://x/media/1.webp' });
    renderApp(<Harness />);
    await userEvent.upload(screen.getByLabelText('ছবির ফাইল'), file('মাঠ.jpg', 'image/jpeg'));
    await waitFor(() => expect(state()).toEqual([{ url: 'http://x/media/1.webp', credit: '' }]));
    const [path, sent] = h.tenant.api.upload.mock.calls[0]!;
    expect(path).toBe(`/media?name=${encodeURIComponent('মাঠ.jpg')}`);
    expect(sent).toBeInstanceOf(File);
    expect(await screen.findByAltText('ছবি ১')).toHaveAttribute('src', 'http://x/media/1.webp');
    expect(screen.getByText('প্রধান ছবি')).toBeInTheDocument();
  });

  it('refuses wrong types and files over 8 MB before any request is made', async () => {
    h.tenant = fakeTenant('editor', {});
    renderApp(<Harness />);
    const input = screen.getByLabelText('ছবির ফাইল');
    await userEvent.upload(input, file('a.gif', 'image/gif'), { applyAccept: false });
    await userEvent.upload(input, file('b.svg', 'image/svg+xml'), { applyAccept: false });
    await userEvent.upload(input, file('c.jpg', 'image/jpeg', 8 * 1024 * 1024 + 1));
    expect(await screen.findByText(/"c.jpg": ছবি সর্বোচ্চ ৮ মেগাবাইট/)).toBeInTheDocument();
    expect(screen.getByText(/"a.gif": শুধু JPG/)).toBeInTheDocument();
    expect(h.tenant.api.upload).not.toHaveBeenCalled();
    expect(state()).toEqual([]);
  });

  it('shows the server message when an upload is refused and keeps the other photos', async () => {
    h.tenant = fakeTenant('editor', {});
    h.tenant.api.upload.mockRejectedValueOnce(new ApiFail(422, 'BAD_IMAGE', 'ছবিটি পড়া যায়নি')).mockResolvedValueOnce({ url: 'http://x/2.webp' });
    renderApp(<Harness />);
    await userEvent.upload(screen.getByLabelText('ছবির ফাইল'), [file('bad.png', 'image/png'), file('ok.png', 'image/png')]);
    expect(await screen.findByText(/ছবিটি পড়া যায়নি/)).toBeInTheDocument();
    await waitFor(() => expect(state().map((p) => p.url)).toEqual(['http://x/2.webp']));
  });

  it('credit can be edited, a photo can be made main or removed, and the box disappears at the limit', async () => {
    h.tenant = fakeTenant('editor', {});
    renderApp(<Harness max={2} initial={[{ url: 'http://x/a.webp', credit: '' }, { url: 'http://x/b.webp', credit: 'খ' }]} />);
    expect(screen.queryByRole('button', { name: 'ছবি আপলোড করুন' })).not.toBeInTheDocument(); // 2 of 2
    await userEvent.type(screen.getByLabelText('ছবি ১ এর ক্রেডিট'), 'অফিস');
    expect(state()[0]!.credit).toBe('অফিস');
    await userEvent.click(screen.getByRole('button', { name: 'ছবি ২ প্রধান করুন' }));
    expect(state().map((p) => p.url)).toEqual(['http://x/b.webp', 'http://x/a.webp']);
    await userEvent.click(screen.getByRole('button', { name: 'ছবি ১ সরান' }));
    expect(state().map((p) => p.url)).toEqual(['http://x/a.webp']);
    expect(screen.getByRole('button', { name: 'ছবি আপলোড করুন' })).toBeInTheDocument();
  });

  it('can pick an earlier upload from the library (and cannot pick one already used)', async () => {
    h.tenant = fakeTenant('editor', { 'GET /media': { items: [{ id: '1', url: 'http://x/old.webp', name: 'পুরনো', credit: 'ক্রেডিট' }, { id: '2', url: 'http://x/used.webp', name: 'ব্যবহৃত', credit: '' }], totalPages: 1 } });
    renderApp(<Harness initial={[{ url: 'http://x/used.webp', credit: '' }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'আগে আপলোড করা ছবি থেকে' }));
    expect(await screen.findByRole('button', { name: /ব্যবহৃত/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /পুরনো/ }));
    expect(state()).toEqual([{ url: 'http://x/used.webp', credit: '' }, { url: 'http://x/old.webp', credit: 'ক্রেডিট' }]);
    // BUG-2026-025: the library lists images only (uploaded videos live in the same media library)
    expect(h.tenant!.api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/media\?kind=image&/));
  });
});

describe('RichEditor', () => {
  it('toEditorHtml turns old plain text into escaped paragraphs and leaves HTML alone', () => {
    expect(toEditorHtml('')).toBe('');
    expect(toEditorHtml('এক\n\nদুই\nতিন < ৫')).toBe('<p>এক</p><p>দুই<br>তিন &lt; ৫</p>');
    expect(toEditorHtml('<p>ঠিক</p>')).toBe('<p>ঠিক</p>');
  });

  function Ed({ initial = '' }: { initial?: string }) {
    const [v, setV] = useState(initial);
    return <><RichEditor value={v} onChange={setV} maxText={20} /><output data-testid="html">{v}</output></>;
  }

  it('shows an existing (plain-text) body as paragraphs and counts visible characters only', async () => {
    renderApp(<Ed initial={'প্রথম\n\nদ্বিতীয়'} />);
    expect((await screen.findByText('প্রথম')).tagName).toBe('P');
    expect(screen.getByText('দ্বিতীয়').tagName).toBe('P');
    expect(screen.getByText(/অক্ষর/).textContent).toMatch(/^[০-৯]+\/২০ অক্ষর$/);
  });

  it('has a toolbar with every formatting control and undo starts disabled', async () => {
    renderApp(<Ed />);
    await screen.findByRole('toolbar', { name: 'লেখা সাজানোর টুল' });
    for (const n of ['মোটা', 'বাঁকা', 'নিচে দাগ', 'বড় হেডিং', 'ছোট হেডিং', 'বুলেট তালিকা', 'নম্বর তালিকা', 'উদ্ধৃতি', 'লিংক যোগ করুন']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'আগের অবস্থায় ফিরুন' })).toBeDisabled();
  });

  it('link box accepts https/mailto/tel and refuses javascript: and bare text', async () => {
    renderApp(<Ed initial="<p>লিংক</p>" />);
    await userEvent.click(await screen.findByRole('button', { name: 'লিংক যোগ করুন' }));
    const box = screen.getByLabelText('লিংকের ঠিকানা');
    await userEvent.type(box, 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'ঠিক আছে' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('https://');
    await userEvent.clear(box); await userEvent.type(box, 'example.org');
    await userEvent.click(screen.getByRole('button', { name: 'ঠিক আছে' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.clear(box); await userEvent.type(box, 'https://example.org');
    await userEvent.click(screen.getByRole('button', { name: 'ঠিক আছে' }));
    expect(screen.queryByLabelText('লিংকের ঠিকানা')).not.toBeInTheDocument();
  });
});

describe('RichText (read-only body)', () => {
  it('removes scripts, handlers, images, iframes, styles and javascript: links even if they reach the browser', () => {
    const out = cleanHtml('<p onclick="x()">ঠিক <strong>মোটা</strong></p><script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe><a href="javascript:alert(1)">খারাপ</a><a href="https://ok.example">ভালো</a><p style="color:red">রং</p>');
    expect(out).toContain('<strong>মোটা</strong>');
    expect(out).toContain('href="https://ok.example"');
    expect(out).not.toMatch(/script|onclick|onerror|<img|iframe|javascript:|style=/i);
  });
  it('renders plain-text bodies as paragraphs', () => {
    renderApp(<RichText html={'এক\n\nদুই'} />);
    expect(screen.getByText('এক').tagName).toBe('P');
    expect(screen.getByText('দুই').tagName).toBe('P');
  });
});
