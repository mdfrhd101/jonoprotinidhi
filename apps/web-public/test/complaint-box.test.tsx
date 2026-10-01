// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComplaintBox from '../src/components/ComplaintBox';

/* The citizen form (adr/0009): name, mobile, date of birth and NID are all required, there is no anonymous option.
   The form posts through publicApiUrl(), so the same component serves the normal build (same-origin proxy) and the
   GitHub Pages static export (API origin baked in at build time). */

const upazilas = [{ name: 'চরকান্দি', short: 'চরকান্দি', unions: ['কাশবন'] }] as never;
const props = { categories: ['রাস্তা-ঘাট ও সেতু'], upazilas, otpRequired: false, enabled: true, privacyNote: '', turnstileSiteKey: '' };
const WHO = { name: 'আব্দুর রহিম', phone: '01712345678', dob: '1985-03-14', nid: '1990123456' };
const SUBMIT = 'অভিযোগ জমা দিন';
const errorsOf = () => Array.from(document.querySelectorAll('.cmp .err')).map((e) => e.textContent ?? '');
const field = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ trackingId: 'NDP3-2026-00001' }) }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function fillCommon() {
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /বিষয়/ }), 'রাস্তা-ঘাট ও সেতু');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /উপজেলা/ }), 'চরকান্দি');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /ইউনিয়ন/ }), 'কাশবন');
  await userEvent.type(screen.getByLabelText(/সমস্যার লিখিত বিবরণ/), 'বাজারের সামনের রাস্তায় বড় গর্ত হয়েছে, রিকশা উল্টে যাচ্ছে');
}
async function fillIdentity(v: Partial<typeof WHO> = {}) {
  const w = { ...WHO, ...v };
  await userEvent.type(field(/আপনার নাম/), w.name);
  await userEvent.type(field(/মোবাইল নম্বর/), w.phone);
  fireEvent.change(field(/জন্মতারিখ/), { target: { value: w.dob } });
  await userEvent.type(field(/জাতীয় পরিচয়পত্র/), w.nid);
}

describe('complaint form: identity is required', () => {
  it('has no anonymous option; name, mobile, date of birth and NID are marked required, DOB is a date input', () => {
    render(<ComplaintBox {...props} />);
    expect(screen.queryByLabelText(/বেনামে/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/বেনামে|বেনামী/);
    for (const label of [/আপনার নাম/, /মোবাইল নম্বর/, /জন্মতারিখ/, /জাতীয় পরিচয়পত্র/]) {
      expect(screen.getByText(label, { selector: 'label' }).querySelector('.req'), String(label)).toBeTruthy();
    }
    const dob = field(/জন্মতারিখ/);
    expect([dob.type, dob.min]).toEqual(['date', '1900-01-01']);
    expect(dob.max).toMatch(/^\d{4}-\d{2}-\d{2}$/); // today in Dhaka, set after mount
    expect(field(/জাতীয় পরিচয়পত্র/).inputMode).toBe('numeric');
  });

  it('an empty form is refused: a Bangla error under each of the four fields, nothing is sent', async () => {
    render(<ComplaintBox {...props} />);
    await userEvent.click(screen.getByRole('button', { name: SUBMIT }));
    for (const id of ['fName', 'fPhone', 'fDob', 'fNid']) {
      const input = document.getElementById(id)!;
      expect(input.getAttribute('aria-invalid'), id).toBe('true');
      expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent, id).toMatch(/[ঀ-৿]/);
    }
    expect(errorsOf().length).toBeGreaterThanOrEqual(8); // category, upazila, union, description and the four identity fields
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks each field inline when the citizen leaves it, with the same rules as the API', async () => {
    render(<ComplaintBox {...props} />);
    await userEvent.type(field(/আপনার নাম/), 'ক');
    await userEvent.tab();
    expect(errorsOf().some((e) => /নাম/.test(e))).toBe(true);
    await userEvent.type(field(/মোবাইল নম্বর/), '01212345678'); // 012 is not a mobile prefix
    await userEvent.tab();
    expect(errorsOf().some((e) => /মোবাইল/.test(e))).toBe(true);
    fireEvent.change(field(/জন্মতারিখ/), { target: { value: '2999-01-01' } });
    fireEvent.blur(field(/জন্মতারিখ/));
    expect(errorsOf().some((e) => /পরে হতে পারে না/.test(e))).toBe(true);
    await userEvent.type(field(/জাতীয় পরিচয়পত্র/), '12345678901'); // 11 digits
    await userEvent.tab();
    expect(errorsOf().some((e) => /১০, ১৩ বা ১৭ সংখ্যা/.test(e))).toBe(true);
    // fixing a value clears its error as soon as the citizen types
    await userEvent.clear(field(/জাতীয় পরিচয়পত্র/));
    expect(errorsOf().some((e) => /১০, ১৩ বা ১৭ সংখ্যা/.test(e))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('one bad identity field is enough to block the submission, whatever else is filled in', async () => {
    for (const bad of [{ name: 'ক' }, { phone: '12345' }, { dob: '2001-02-29' }, { nid: '123456789' }] as Array<Partial<typeof WHO>>) {
      cleanup();
      render(<ComplaintBox {...props} />);
      await fillCommon();
      await fillIdentity(bad);
      await userEvent.click(screen.getByRole('button', { name: SUBMIT }));
      expect(errorsOf().length, JSON.stringify(bad)).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('with all four valid it posts them normalised (no anonymous key) and shows the tracking id', async () => {
    render(<ComplaintBox {...props} />);
    await fillCommon();
    await fillIdentity({ name: ' আব্দুর রহিম ', phone: '০১৭১২-৩৪৫৬৭৮', nid: '১৯৯০ ১২৩৪-৫৬' });
    await userEvent.click(screen.getByRole('button', { name: SUBMIT }));
    expect(await screen.findByTestId('tracking-id')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/public/complaints'); // normal mode: the site's same-origin proxy
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject(WHO);
    expect(sent).not.toHaveProperty('anonymous');
    expect(document.body.textContent).toMatch(/SMS যাবে/); // every complaint has a number now
  });

  it('static export (GitHub Pages): the same body goes straight to the API origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.example.org/');
    render(<ComplaintBox {...props} />);
    await fillCommon();
    await fillIdentity();
    await userEvent.click(screen.getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://api.example.org/api/v1/public/complaints');
    expect(JSON.parse(init.body)).toMatchObject(WHO);
  });

  it('when the tenant makes OTP mandatory it applies to everyone (nobody can skip it as anonymous)', async () => {
    render(<ComplaintBox {...props} otpRequired />);
    await fillCommon();
    await fillIdentity();
    expect(screen.getByText(/মোবাইল নম্বর যাচাই করা বাধ্যতামূলক/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: SUBMIT }));
    expect(errorsOf()).toEqual(['মোবাইল নম্বরটি কোড দিয়ে যাচাই করুন।']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
