import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Bars, Field, Pager, Pill, PillOf, ReasonDialog, ErrorBox, fieldMessages } from './ui';
import { ApiFail } from '../api';
import { renderApp } from '../test/utils';

describe('Field', () => {
  it('links label, input and error message for screen readers', () => {
    renderApp(<Field label="শিরোনাম" required error="খুব ছোট">{(p) => <input {...p} />}</Field>);
    const input = screen.getByLabelText(/শিরোনাম/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('খুব ছোট');
    expect(screen.getByRole('alert')).toHaveTextContent('খুব ছোট');
  });
  it('shows a hint only when there is no error', () => {
    const { rerender } = renderApp(<Field label="নাম" hint="সাহায্য">{(p) => <input {...p} />}</Field>);
    expect(screen.getByText('সাহায্য')).toBeInTheDocument();
    rerender(<Field label="নাম" hint="সাহায্য" error="ভুল">{(p) => <input {...p} />}</Field>);
    expect(screen.queryByText('সাহায্য')).not.toBeInTheDocument();
  });
});

describe('Bars / Pill / Pager', () => {
  it('prints counts in Bangla digits and scales widths to the largest value', () => {
    renderApp(<Bars rows={[['নতুন', 8], ['সমাধান', 2]]} />);
    expect(screen.getByText('৮')).toBeInTheDocument(); expect(screen.getByText('২')).toBeInTheDocument();
    const fills = document.querySelectorAll<HTMLElement>('.t i');
    expect(fills[0]!.style.width).toBe('100%'); expect(fills[1]!.style.width).toBe('25%');
  });
  it('Pill and PillOf fall back gracefully for unknown keys', () => {
    renderApp(<><Pill label="ঠিক" tone="ok" /><PillOf map={{ a: ['এ', 'warn'] }} k="a" /><PillOf map={{}} k="zzz" /></>);
    expect(screen.getByText('ঠিক')).toHaveClass('pill', 'ok'); expect(screen.getByText('এ')).toHaveClass('warn'); expect(screen.getByText('zzz')).toBeInTheDocument();
  });
  it('Pager disables the ends and hides itself for a single page', async () => {
    const on = vi.fn();
    const { rerender } = renderApp(<Pager page={1} totalPages={3} onPage={on} />);
    expect(screen.getByRole('button', { name: /আগের/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /পরের/ }));
    expect(on).toHaveBeenCalledWith(2);
    rerender(<Pager page={1} totalPages={1} onPage={on} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('ReasonDialog (used for reject / suspend / act-as / PII view)', () => {
  it('refuses a too-short reason and never calls onConfirm', async () => {
    const onConfirm = vi.fn();
    renderApp(<ReasonDialog title="কারণ দিন" open onClose={() => {}} onConfirm={onConfirm} min={10} label="কারণ" />);
    await userEvent.type(screen.getByRole('textbox'), 'ছোট');
    await userEvent.click(screen.getByRole('button', { name: 'নিশ্চিত করুন' }));
    expect(await screen.findByText(/কমপক্ষে ১০ অক্ষরে লিখুন|কমপক্ষে 10/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it('confirms with the trimmed reason, then closes', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined), onClose = vi.fn();
    renderApp(<ReasonDialog title="কারণ দিন" open onClose={onClose} onConfirm={onConfirm} min={5} label="কারণ" />);
    await userEvent.type(screen.getByRole('textbox'), '   সাইটের ছবি ঠিক করতে   ');
    await userEvent.click(screen.getByRole('button', { name: 'নিশ্চিত করুন' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('সাইটের ছবি ঠিক করতে'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
  it('shows the server error and stays open when the action fails', async () => {
    const onClose = vi.fn();
    renderApp(<ReasonDialog title="t" open onClose={onClose} onConfirm={async () => { throw new ApiFail(403, 'FORBIDDEN', 'এই কাজের অনুমতি নেই'); }} min={3} />);
    await userEvent.type(screen.getByRole('textbox'), 'কারণ আছে');
    await userEvent.click(screen.getByRole('button', { name: 'নিশ্চিত করুন' }));
    expect(await screen.findByText('এই কাজের অনুমতি নেই')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
  it('renders nothing while closed', () => {
    renderApp(<ReasonDialog title="গোপন" open={false} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByText('গোপন')).not.toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('fieldMessages keeps the first message per field and ignores non-API errors', () => {
    expect(fieldMessages(new ApiFail(400, 'V', 'm', { fieldErrors: { a: ['x', 'y'], b: ['z'] } }))).toEqual({ a: 'x', b: 'z' });
    expect(fieldMessages(new Error('boom'))).toEqual({});
  });
  it('ErrorBox shows the API message or a generic one, and a retry action', async () => {
    const retry = vi.fn();
    const { rerender } = renderApp(<ErrorBox error={new ApiFail(500, 'X', 'সার্ভারে সমস্যা')} retry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('সার্ভারে সমস্যা');
    await userEvent.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' })); expect(retry).toHaveBeenCalled();
    rerender(<ErrorBox error={new Error('x')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('কিছু ভুল হয়েছে');
  });
});
