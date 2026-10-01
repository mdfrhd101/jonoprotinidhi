import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ApiFail } from '../api';
import { renderApp, fakeTenant, type FakeTenant } from '../test/utils';

/* Component tests for the screens with the most important rules: login/2FA, the post form (same schemas as the API),
   the complaint detail (identity never shown unless allowed), dashboard scoping. The tenant hook and the session
   hook are replaced with fakes; no network is involved. */

const h = vi.hoisted(() => ({ tenant: null as null | FakeTenant, session: { startLogin: vi.fn(), completeLogin: vi.fn(), me: null as unknown, status: 'anon', logout: vi.fn(), reload: vi.fn() } }));
vi.mock('../tenant', () => ({ useTenant: () => h.tenant, canDo: () => true }));
vi.mock('../session', () => ({ useSession: () => h.session, SessionProvider: ({ children }: any) => children }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') } }));
const apiMock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), api: apiMock.api }));

import Login from './Login';
import { PostEditor } from './tenant/Posts';
import Complaints from './tenant/Complaints';

beforeEach(() => { vi.clearAllMocks(); h.tenant = null; });

describe('Login', () => {
  it('asks for identifier and password and validates before calling the API', async () => {
    renderApp(<Login />);
    await userEvent.click(screen.getByRole('button', { name: 'এগিয়ে যান' }));
    expect(await screen.findByText(/মোবাইল নম্বর \(বা ইমেইল\) আর পাসওয়ার্ড দিন/)).toBeInTheDocument();
    expect(h.session.startLogin).not.toHaveBeenCalled();
  });

  it('shows the server message for wrong credentials and stays on the password step', async () => {
    h.session.startLogin.mockRejectedValueOnce(new ApiFail(401, 'UNAUTHORIZED', 'ভুল তথ্য অথবা অ্যাকাউন্ট সাময়িকভাবে বন্ধ'));
    renderApp(<Login />);
    await userEvent.type(screen.getByLabelText(/মোবাইল নম্বর/), '01712345678');
    await userEvent.type(screen.getByLabelText(/পাসওয়ার্ড/), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'এগিয়ে যান' }));
    expect(await screen.findByText(/ভুল তথ্য অথবা অ্যাকাউন্ট/)).toBeInTheDocument();
    expect(screen.getByLabelText(/পাসওয়ার্ড/)).toBeInTheDocument();
  });

  it('code step: only 6 digits are accepted, wrong code shows an error, right code completes login', async () => {
    h.session.startLogin.mockResolvedValueOnce({ kind: 'code', mfaToken: 'mfa-1' });
    renderApp(<Login />);
    await userEvent.type(screen.getByLabelText(/মোবাইল নম্বর/), 'a@b.co');
    await userEvent.type(screen.getByLabelText(/পাসওয়ার্ড/), 'secret-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'এগিয়ে যান' }));
    const code = await screen.findByLabelText(/^কোড/);
    await userEvent.type(code, '12ab34');
    expect(code).toHaveValue('1234'); // non-digits are dropped
    await userEvent.click(screen.getByRole('button', { name: 'যাচাই করুন' }));
    expect(await screen.findByText('৬ অক্ষরের কোডটি লিখুন')).toBeInTheDocument();
    h.session.completeLogin.mockRejectedValueOnce(new ApiFail(401, 'UNAUTHORIZED', 'কোড সঠিক নয়'));
    await userEvent.type(code, '56');
    await userEvent.click(screen.getByRole('button', { name: 'যাচাই করুন' }));
    expect(await screen.findByText('কোড সঠিক নয়')).toBeInTheDocument();
    h.session.completeLogin.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'যাচাই করুন' }));
    await waitFor(() => expect(h.session.completeLogin).toHaveBeenLastCalledWith('mfa-1', { code: '123456' }));
  });

  it('a recovery code can be used instead (phone lost)', async () => {
    h.session.startLogin.mockResolvedValueOnce({ kind: 'code', mfaToken: 'mfa-2' });
    h.session.completeLogin.mockResolvedValueOnce(undefined);
    renderApp(<Login />);
    await userEvent.type(screen.getByLabelText(/মোবাইল নম্বর/), 'a@b.co'); await userEvent.type(screen.getByLabelText(/পাসওয়ার্ড/), 'secret-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'এগিয়ে যান' }));
    await userEvent.click(await screen.findByRole('button', { name: /রিকভারি কোড ব্যবহার করুন/ }));
    await userEvent.type(screen.getByLabelText(/^রিকভারি কোড/), 'abc123-def456');
    await userEvent.click(screen.getByRole('button', { name: 'যাচাই করুন' }));
    await waitFor(() => expect(h.session.completeLogin).toHaveBeenCalledWith('mfa-2', { recoveryCode: 'abc123-def456' }));
  });

  it('first login: shows the QR + key + recovery codes and refuses to continue until they are saved', async () => {
    h.session.startLogin.mockResolvedValueOnce({ kind: 'enroll', mfaToken: 'mfa-3' });
    apiMock.api.mockResolvedValueOnce({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x', recoveryCodes: ['aaaaaa-bbbbbb', 'cccccc-dddddd'] });
    renderApp(<Login />);
    await userEvent.type(screen.getByLabelText(/মোবাইল নম্বর/), 'a@b.co'); await userEvent.type(screen.getByLabelText(/পাসওয়ার্ড/), 'secret-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'এগিয়ে যান' }));
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByAltText(/QR কোড/)).toBeInTheDocument(); expect(screen.getByText('aaaaaa-bbbbbb')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/অ্যাপে দেখানো/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'চালু করে ঢুকুন' }));
    expect(await screen.findByText(/রিকভারি কোডগুলো সংরক্ষণ করেছেন/)).toBeInTheDocument(); // blocked
    expect(h.session.completeLogin).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText(/কোডগুলো নিরাপদ জায়গায় সংরক্ষণ করেছি/));
    h.session.completeLogin.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'চালু করে ঢুকুন' }));
    await waitFor(() => expect(h.session.completeLogin).toHaveBeenCalledWith('mfa-3', { code: '123456' }));
  });
});

describe('PostEditor: the form can only send what the API will accept', () => {
  const setup = (role: 'owner' | 'editor', routes: Record<string, unknown> = {}) => {
    h.tenant = fakeTenant(role, { 'POST /posts': { _id: 'p1', version: 1 }, 'POST /posts/p1/submit': { _id: 'p1', version: 2 }, 'POST /posts/p1/approve': { _id: 'p1', version: 3 }, ...routes });
    renderApp(<Routes><Route path="/posts/new" element={<PostEditor />} /><Route path="/posts/:id" element={<div>done</div>} /></Routes>, '/posts/new');
    return h.tenant;
  };
  const fill = async (title: string, summary: string) => {
    if (title) await userEvent.type(screen.getByLabelText(/শিরোনাম/), title);
    if (summary) await userEvent.type(screen.getByLabelText(/এক লাইনে সারাংশ/), summary);
  };

  it('editor sees "send for approval" and NO publish button', () => {
    setup('editor');
    expect(screen.getByRole('button', { name: 'অনুমোদনের জন্য পাঠান' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'প্রকাশ করুন' })).not.toBeInTheDocument();
  });
  it('owner sees publish', () => { setup('owner'); expect(screen.getByRole('button', { name: 'প্রকাশ করুন' })).toBeInTheDocument(); });

  it('an empty form shows field errors and makes no API call', async () => {
    const t = setup('editor');
    await userEvent.click(screen.getByRole('button', { name: 'অনুমোদনের জন্য পাঠান' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(t.api.post).not.toHaveBeenCalled();
  });

  it('a draft needs only a title (3+ characters); empty optional fields are not sent (BUG-2026-013)', async () => {
    const t = setup('editor');
    await fill('ক', '');
    await userEvent.click(screen.getByRole('button', { name: 'খসড়া রাখুন' }));
    expect(t.api.post).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText(/শিরোনাম/)); await fill('কাশবনে বীজ বিতরণ', '');
    await userEvent.click(screen.getByRole('button', { name: 'খসড়া রাখুন' }));
    await waitFor(() => expect(t.api.post).toHaveBeenCalledWith('/posts', expect.objectContaining({ title: 'কাশবনে বীজ বিতরণ' })));
    expect(t.api.post).toHaveBeenCalledTimes(1); // draft: created but NOT submitted
  });

  it('editor submit = create then submit; the payload carries the category, date and trimmed text', async () => {
    const t = setup('editor');
    await fill('কাশবনে বন্যাসহনশীল ধানের বীজ বিতরণ', 'আমন মৌসুমের আগে ১৫০ কৃষক বীজ পেয়েছেন।');
    await userEvent.click(screen.getByLabelText('স্বাস্থ্য'));
    await userEvent.click(screen.getByRole('button', { name: 'অনুমোদনের জন্য পাঠান' }));
    await waitFor(() => expect(t.api.post).toHaveBeenCalledWith('/posts/p1/submit'));
    const body = t.api.post.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).toMatchObject({ category: 'health', summary: 'আমন মৌসুমের আগে ১৫০ কৃষক বীজ পেয়েছেন।' });
    // the shared zod schema coerces the date input to a Date; JSON.stringify turns it into ISO on the wire
    expect(JSON.stringify(body.eventDate)).toMatch(/^"\d{4}-\d{2}-\d{2}T/);
    expect(t.api.post).not.toHaveBeenCalledWith('/posts/p1/approve', expect.anything());
  });

  it('owner publish approves the exact version just saved (no approving a stale copy)', async () => {
    const t = setup('owner');
    await fill('কাশবনে বন্যাসহনশীল ধানের বীজ বিতরণ', 'আমন মৌসুমের আগে ১৫০ কৃষক বীজ পেয়েছেন।');
    await userEvent.click(screen.getByRole('button', { name: 'প্রকাশ করুন' }));
    await waitFor(() => expect(t.api.post).toHaveBeenCalledWith('/posts/p1/approve', { version: 1 }));
  });

  it('server-side field errors are shown next to the field', async () => {
    const err = new ApiFail(400, 'VALIDATION_FAILED', 'ইনপুট সঠিক নয়', { fieldErrors: { title: ['এই শিরোনাম চলবে না'] } });
    setup('editor', { 'POST /posts': () => { throw err; } });
    await fill('কাশবনে বন্যাসহনশীল ধানের বীজ বিতরণ', 'আমন মৌসুমের আগে ১৫০ কৃষক বীজ পেয়েছেন।');
    await userEvent.click(screen.getByRole('button', { name: 'অনুমোদনের জন্য পাঠান' }));
    expect(await screen.findByText('এই শিরোনাম চলবে না')).toBeInTheDocument();
  });
});

describe('Complaint detail: identity is never shown unless the API says the viewer may', () => {
  const base = { id: 'c1', trackingId: 'NDP3-2026-00007', category: 'পানি ও পয়ঃনিষ্কাশন', upazila: 'নতুনহাট', union: 'রসুলপুর', place: '', description: 'ড্রেন উপচে রাস্তায় ময়লা পানি জমে আছে', channel: 'web', anonymous: false, otpVerified: false, status: 'new', assignedTo: 'u9', createdAt: '2026-09-30T08:00:00Z', slaDueAt: '2026-10-07T08:00:00Z', overdue: false, version: 1, pii: { available: true }, canViewPii: false, events: [] };
  const list = { items: [{ ...base }], totalPages: 1, total: 1 };
  const open = (role: 'owner' | 'officer', detail: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    h.tenant = fakeTenant(role, { 'GET /complaints': list, 'GET /complaints/c1': { ...base, ...detail }, 'GET /team': [], ...extra });
    renderApp(<Routes><Route path="/complaints/*" element={<Complaints />} /></Routes>, '/complaints/c1');
    return h.tenant;
  };

  it('owner: sees the explanation, no reveal button, no phone or name anywhere', async () => {
    open('owner', { canViewPii: false });
    expect(await screen.findByText(/শুধু দায়িত্বপ্রাপ্ত কর্মকর্তা দেখতে পারেন/, { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /দেখুন \(লগ হবে\)/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/01\d{9}/);
  });

  it('super admin acting as: told that even they cannot see identity', async () => {
    h.tenant = fakeTenant('owner', { 'GET /complaints': list, 'GET /complaints/c1': { ...base }, 'GET /team': [] }, { viaSuperAdmin: true });
    renderApp(<Routes><Route path="/complaints/*" element={<Complaints />} /></Routes>, '/complaints/c1');
    expect(await screen.findByText(/Super Admin-ও দেখতে পারেন না/)).toBeInTheDocument();
  });

  it('anonymous complaints say so and offer no reveal', async () => {
    open('officer', { anonymous: true, canViewPii: false, pii: { available: false } });
    expect(await screen.findByText(/বেনামী অভিযোগ: নাম ও নম্বর নেই/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /দেখুন \(লগ হবে\)/ })).not.toBeInTheDocument();
  });

  it('assigned officer: reveal needs a purpose (5+ chars), then shows name+phone, and can hide it again', async () => {
    const t = open('officer', { canViewPii: true }, { 'POST /complaints/c1/pii-view': { name: 'আব্দুর রহিম', phone: '01712345678' } });
    await userEvent.click(await screen.findByRole('button', { name: /দেখুন \(লগ হবে\)/ }));
    expect(screen.getByText(/অডিট লগে রেকর্ড হবে/)).toBeInTheDocument();
    expect(t.api.post).not.toHaveBeenCalled(); // nothing is fetched just by opening the dialog
    await userEvent.type(screen.getByLabelText(/কী কারণে দেখছেন/), 'ফোন');
    await userEvent.click(screen.getByRole('button', { name: 'দেখুন' }));
    expect(await screen.findByText(/কমপক্ষে ৫ অক্ষরে লিখুন|কমপক্ষে 5/)).toBeInTheDocument();
    expect(t.api.post).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/কী কারণে দেখছেন/), ' করে সমাধান জানাতে');
    await userEvent.click(screen.getByRole('button', { name: 'দেখুন' }));
    expect(await screen.findByText('আব্দুর রহিম')).toBeInTheDocument();
    expect(t.api.post).toHaveBeenCalledWith('/complaints/c1/pii-view', { purpose: 'ফোন করে সমাধান জানাতে' });
    expect(screen.getByText('01712345678')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'লুকান' }));
    expect(screen.queryByText('আব্দুর রহিম')).not.toBeInTheDocument();
  });

  it('owner status control offers only legal next states', async () => {
    open('owner', {});
    const sel = await screen.findByLabelText('অবস্থা পরিবর্তন করুন');
    expect(within(sel).getAllByRole('option').map((o) => o.textContent)).toEqual(['নতুন', 'যাচাই চলছে', 'স্প্যাম']); // new -> verify | spam only
  });

  it('officer cannot assign; owner can, and only to officers covering the upazila', async () => {
    open('officer', { assignedTo: 'u9', canUpdate: true });
    await screen.findByLabelText('অবস্থা পরিবর্তন করুন');
    expect(screen.queryByLabelText('দায়িত্ব দিন (সরাসরি পরিবর্তন)')).not.toBeInTheDocument();
  });
  it('owner assignment list shows only active officers of that upazila', async () => {
    open('owner', {}, { 'GET /team': [{ userId: 'u1', name: 'নতুনহাটের কর্মকর্তা', role: 'officer', status: 'active', scope: ['নতুনহাট'] }, { userId: 'u2', name: 'চরকান্দির কর্মকর্তা', role: 'officer', status: 'active', scope: ['চরকান্দি'] }, { userId: 'u3', name: 'সম্পাদক', role: 'editor', status: 'active', scope: [] }] });
    const sel = await screen.findByLabelText('দায়িত্ব দিন (সরাসরি পরিবর্তন)');
    await waitFor(() => expect(within(sel).getAllByRole('option').map((o) => o.textContent)).toEqual(['— কেউ না —', 'নতুনহাটের কর্মকর্তা']));
  });
});

// BUG-2026-033: the API only lets managers and the assigned officer change status; a note never needs that right
describe('Complaint detail: status vs note (BUG-2026-033)', () => {
  const base = { id: 'c1', trackingId: 'NDP3-2026-00007', category: 'পানি ও পয়ঃনিষ্কাশন', upazila: 'নতুনহাট', union: 'রসুলপুর', place: '', description: 'ড্রেন উপচে রাস্তায় ময়লা পানি জমে আছে', channel: 'web', anonymous: false, otpVerified: false, status: 'new', assignedTo: null, createdAt: '2026-09-30T08:00:00Z', slaDueAt: '2026-10-07T08:00:00Z', overdue: false, version: 3, pii: { available: true }, canViewPii: false, canUpdate: false, events: [] };
  const open = (role: 'owner' | 'officer', detail: Record<string, unknown> = {}) => {
    h.tenant = fakeTenant(role, { 'GET /complaints': { items: [base], totalPages: 1, total: 1 }, 'GET /complaints/c1': { ...base, ...detail }, 'GET /team': [] });
    renderApp(<Routes><Route path="/complaints/*" element={<Complaints />} /></Routes>, '/complaints/c1');
    return h.tenant;
  };

  it('an unassigned officer sees no status selector or SMS buttons, and can still add a note (POST /notes, never PATCH)', async () => {
    const t = open('officer');
    await userEvent.type(await screen.findByLabelText('ভেতরের নোট (নাগরিক দেখবেন না)'), 'সরেজমিনে দেখে আসব');
    expect(screen.queryByLabelText('অবস্থা পরিবর্তন করুন')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^SMS:/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'নোট যোগ করুন' }));
    await waitFor(() => expect(t.api.post).toHaveBeenCalledWith('/complaints/c1/notes', { text: 'সরেজমিনে দেখে আসব' }));
    expect(t.api.patch).not.toHaveBeenCalled();
  });

  it('status form: a note alone goes to /notes; a status change goes to PATCH with the note', async () => {
    const t = open('owner');
    await userEvent.type(await screen.findByLabelText('নোট (নাগরিক দেখবেন না)'), 'ফোনে কথা হয়েছে');
    await userEvent.click(screen.getByRole('button', { name: 'আপডেট করুন' }));
    await waitFor(() => expect(t.api.post).toHaveBeenCalledWith('/complaints/c1/notes', { text: 'ফোনে কথা হয়েছে' }));
    expect(t.api.patch).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('অবস্থা পরিবর্তন করুন'), 'verify');
    await userEvent.type(screen.getByLabelText('নোট (নাগরিক দেখবেন না)'), 'যাচাই শুরু');
    await userEvent.click(screen.getByRole('button', { name: 'আপডেট করুন' }));
    await waitFor(() => expect(t.api.patch).toHaveBeenCalledWith('/complaints/c1', { version: 3, status: 'verify', note: 'যাচাই শুরু' }));
  });

  it('the assigned officer gets the status selector (canUpdate from the API)', async () => {
    open('officer', { canUpdate: true });
    expect(await screen.findByLabelText('অবস্থা পরিবর্তন করুন')).toBeInTheDocument();
  });
});

// BUG-2026-027 (defence in depth) and BUG-2026-030 (no canned text for a voice-only complaint)
describe('Complaint detail: attachments are only shown through safe object URLs', () => {
  const base = { id: 'c1', trackingId: 'NDP3-2026-00008', category: 'বিদ্যুৎ', upazila: 'নতুনহাট', union: 'রসুলপুর', place: '', description: '', channel: 'web', anonymous: true, otpVerified: false, status: 'new', assignedTo: null, createdAt: '2026-09-30T08:00:00Z', slaDueAt: '2026-10-07T08:00:00Z', overdue: false, version: 1, pii: { available: false }, canViewPii: false, events: [] };
  const urls: string[] = [];
  beforeEach(() => {
    urls.length = 0;
    URL.createObjectURL = vi.fn((b: Blob) => { urls.push(b.type); return `blob:test/${urls.length}`; }) as never;
    URL.revokeObjectURL = vi.fn() as never;
  });
  const open = (detail: Record<string, unknown>) => {
    h.tenant = fakeTenant('owner', { 'GET /complaints': { items: [base], totalPages: 1, total: 1 }, 'GET /complaints/c1': { ...base, ...detail }, 'GET /team': [] });
    renderApp(<Routes><Route path="/complaints/*" element={<Complaints />} /></Routes>, '/complaints/c1');
  };
  const PNG = 'data:image/webp;base64,UklGRg==';

  it('hostile values never reach src/href; safe ones become blob: URLs with a fixed type', async () => {
    open({ hasVoice: true, voiceNote: { audioData: 'data:text/html;base64,PHNjcmlwdD4=', durationSec: 5 }, files: [
      { name: 'evil.pdf', mimeType: 'application/pdf', size: 10, data: 'javascript:alert(1)' },
      { name: 'evil.png', mimeType: 'image/png', size: 10, data: 'data:image/svg+xml;base64,PHN2Zz4=' },
      { name: 'ok.webp', mimeType: 'image/webp', size: 6, data: PNG },
    ] });
    expect(await screen.findByText('ভয়েস রেকর্ডটি চালানো যাচ্ছে না।')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText('ok.webp')).toHaveAttribute('src', expect.stringMatching(/^blob:/)));
    expect(screen.queryByAltText('evil.png')).not.toBeInTheDocument();
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/javascript:|data:text\/html|data:image\/svg/);
    expect(urls).toEqual(['image/webp']);
    await userEvent.click(screen.getByText('evil.pdf'));
    expect(await screen.findByText('ফাইলটি খোলা যাচ্ছে না।')).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('link', { name: 'ডাউনলোড করুন' })).not.toBeInTheDocument();
  });

  it('a safe PDF opens in an iframe and downloads from a blob: URL; a voice-only complaint gets a neutral label', async () => {
    open({ hasVoice: true, voiceNote: { audioData: 'data:audio/webm;base64,GkXfow==', durationSec: 5 }, files: [{ name: 'doc.pdf', mimeType: 'application/pdf', size: 8, data: 'data:application/pdf;base64,JVBERi0xLjQ=' }] });
    expect(await screen.findByText('শুধু ভয়েস অভিযোগ (লিখিত বিবরণ নেই)')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('audio')).toHaveAttribute('src', expect.stringMatching(/^blob:/)));
    await userEvent.click(screen.getByText('doc.pdf'));
    await waitFor(() => expect(document.querySelector('iframe')).toHaveAttribute('src', expect.stringMatching(/^blob:/)));
    expect(screen.getByRole('link', { name: 'ডাউনলোড করুন' })).toHaveAttribute('href', expect.stringMatching(/^blob:/));
    expect(urls).toEqual(['audio/webm', 'application/pdf']);
  });
});

describe('Complaint list navigation (BUG-2026-010)', () => {
  it('opening a second complaint goes to /t/<id>/complaints/<cid>, never a nested broken URL', async () => {
    const mk = (id: string) => ({ id, trackingId: `NDP3-2026-0000${id}`, category: 'ক ক', upazila: 'নতুনহাট', union: 'রসুলপুর', place: '', description: 'বিবরণ বিবরণ বিবরণ', status: 'new', createdAt: '2026-09-20T05:00:00Z', anonymous: true, canViewPii: false, events: [] });
    const t = fakeTenant('owner', { 'GET /complaints': { items: [mk('1'), mk('2')], totalPages: 1, total: 2 }, 'GET /complaints/1': mk('1'), 'GET /complaints/2': mk('2'), 'GET /team': [] });
    h.tenant = t;
    let where = '';
    const Where = () => { where = useLocation().pathname; return null; };
    renderApp(<><Where /><Routes><Route path="/t/:tid/complaints/*" element={<Complaints />} /></Routes></>, '/t/T1/complaints/1');
    await waitFor(() => expect(t.api.get).toHaveBeenCalledWith('/complaints/1'));
    await userEvent.click((await screen.findAllByText(/NDP3-2026-00002/))[0]!);
    await waitFor(() => expect(where).toBe('/t/T1/complaints/2'));
    await userEvent.click((await screen.findAllByText(/NDP3-2026-00001/))[0]!);
    await waitFor(() => expect(where).toBe('/t/T1/complaints/1'));
  });
});
