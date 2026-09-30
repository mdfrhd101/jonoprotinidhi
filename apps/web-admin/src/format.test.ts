import { describe, it, expect } from 'vitest';
import { bnDateTime, daysSince, POST_STATUS_LABEL, COMPLAINT_STATUS_LABEL, PROMISE_STATUS_LABEL, TENANT_STATUS_LABEL, ROLE_LABEL } from './format';
import { POST_STATUSES, COMPLAINT_STATUSES, PROMISE_STATUSES } from '@jonoprotinidhi/shared';

describe('bnDateTime (Asia/Dhaka, Bangla digits, day-part words)', () => {
  it('formats dawn, morning, noon, afternoon, evening and night (BUG-2026-012: 3:30 pm is বিকেল, not দুপুর)', () => {
    expect(bnDateTime('2026-09-26T23:00:00Z')).toBe('২৭ সেপ্টেম্বর ২০২৬, ভোর ৫:০০');
    expect(bnDateTime('2026-09-27T02:15:00Z')).toBe('২৭ সেপ্টেম্বর ২০২৬, সকাল ৮:১৫');
    expect(bnDateTime('2026-09-27T06:00:00Z')).toBe('২৭ সেপ্টেম্বর ২০২৬, দুপুর ১২:০০');
    expect(bnDateTime('2026-09-27T09:30:00Z')).toBe('২৭ সেপ্টেম্বর ২০২৬, বিকেল ৩:৩০');
    expect(bnDateTime('2026-09-27T12:05:00Z')).toBe('২৭ সেপ্টেম্বর ২০২৬, সন্ধ্যা ৬:০৫');
    expect(bnDateTime('2026-09-27T16:00:00Z')).toBe('২৭ সেপ্টেম্বর ২০২৬, রাত ১০:০০');
  });
  it('handles midnight in Dhaka (18:00 UTC = 00:00 next day) and bad input', () => {
    expect(bnDateTime('2026-09-27T18:00:00Z')).toBe('২৮ সেপ্টেম্বর ২০২৬, রাত ১২:০০');
    for (const bad of [undefined, null, '', 'nope']) expect(bnDateTime(bad as never)).toBe('—');
  });
});

describe('daysSince', () => {
  it('counts whole days, never negative, null for bad input', () => {
    const now = Date.parse('2026-09-30T12:00:00Z');
    expect(daysSince('2026-09-27T12:00:00Z', now)).toBe(3);
    expect(daysSince('2026-09-30T13:00:00Z', now)).toBe(0);
    expect(daysSince(undefined)).toBeNull(); expect(daysSince('x')).toBeNull();
  });
});

describe('label maps cover every status the API can return', () => {
  it('posts, complaints, promises', () => {
    for (const s of POST_STATUSES) expect(POST_STATUS_LABEL[s], s).toBeTruthy();
    for (const s of COMPLAINT_STATUSES) expect(COMPLAINT_STATUS_LABEL[s], s).toBeTruthy();
    for (const s of PROMISE_STATUSES) expect(PROMISE_STATUS_LABEL[s], s).toBeTruthy();
    for (const s of ['live', 'setup', 'suspended']) expect(TENANT_STATUS_LABEL[s], s).toBeTruthy();
    for (const r of ['owner', 'editor', 'officer', 'super_admin', 'support']) expect(ROLE_LABEL[r], r).toBeTruthy();
  });
});
