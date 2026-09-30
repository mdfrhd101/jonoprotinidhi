import { describe, expect, it } from 'vitest';
import { parseYouTubeId, PAGE_SCHEMAS } from '@jonoshetu/shared';
import { normaliseHost, resolveTenantHost, isLocalHost } from '../src/lib/host';
import { bnDateSafe, bnMonthLabel, bnNumber, bnText, clampPct, dateParts, joinParts, parseNumber, sectorsOf, splitYear } from '../src/lib/format';
import { counterLabel, featuredFirst, keyToAction, nearbyIndexes, pageList, stepIndex, swipeDirection, wrapIndex } from '../src/lib/slider';
import { idFromEmbedUrl, isYouTubeId, videoYouTubeId, ytEmbed, ytThumb } from '../src/lib/youtube';
import { safeHref, safeMediaUrl, isExternalHref } from '../src/lib/links';
import { sanitizeBody, splitAfterFirstBlock, textOf } from '../src/lib/sanitize';
import { buildCsp, originOf } from '../src/lib/csp';
import { activeNav } from '../src/lib/nav';
import { defaultedPage } from '../src/lib/pages';

describe('host resolution', () => {
  const FB = 'ndp3.jonoshetu.localhost';
  it('uses the request host in production-like cases', () => {
    expect(resolveTenantHost('tahmina-noor.example', FB)).toBe('tahmina-noor.example');
    expect(resolveTenantHost('NDP3.Jonoshetu.com:443', FB)).toBe('ndp3.jonoshetu.com');
    expect(resolveTenantHost('ndp3.jonoshetu.localhost:3000', FB)).toBe('ndp3.jonoshetu.localhost');
  });
  it('falls back for local and invalid hosts', () => {
    for (const h of ['localhost', 'localhost:3000', '127.0.0.1:3000', '127.1.2.3', '[::1]:3000', '0.0.0.0', '', null, undefined, 'evil host', 'a..b', 'x'.repeat(300)]) {
      expect(resolveTenantHost(h as string, FB)).toBe(FB);
    }
  });
  it('takes the first value of a proxy list and strips a trailing dot', () => {
    expect(normaliseHost('site.example., proxy.internal')).toBe('site.example');
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('example.com')).toBe(false);
  });
});

describe('formatters', () => {
  it('Bangla digits and dates in Asia/Dhaka', () => {
    expect(bnDateSafe('2026-09-27T00:00:00.000Z')).toBe('২৭ সেপ্টেম্বর ২০২৬');
    expect(bnDateSafe('2026-09-30T20:00:00.000Z')).toBe('১ অক্টোবর ২০২৬'); // 02:00 next day in Dhaka
    expect(bnDateSafe(null)).toBe('');
    expect(bnDateSafe('not a date')).toBe('');
    expect(dateParts('2026-10-02T04:00:00.000Z')).toEqual({ day: '২', month: 'অক্টোবর', weekday: 'শুক্রবার', year: '২০২৬' });
    expect(bnMonthLabel('2026-09')).toBe('সেপ্টেম্বর ২০২৬');
    expect(bnMonthLabel('2026-13')).toBe('');
    expect(bnText('নদীপুর-3')).toBe('নদীপুর-৩');
  });
  it('numbers', () => {
    expect(parseNumber('২,৫৭,১১০')).toBe(257110);
    expect(parseNumber('68.4%')).toBe(68.4);
    expect(parseNumber('')).toBeNull();
    expect(bnNumber(743760)).toBe('৭,৪৩,৭৬০');
    expect(clampPct(140)).toBe(100);
    expect(clampPct(-3)).toBe(0);
    expect(clampPct('abc')).toBe(0);
  });
  it('misc', () => {
    expect(splitYear('ফেব্রুয়ারি ২০২৬')).toEqual({ small: 'ফেব্রুয়ারি', big: '২০২৬' });
    expect(splitYear('২০১৪')).toEqual({ small: '', big: '২০১৪' });
    expect(joinParts(['a', '', null, ' ', 'b'])).toBe('a · b');
    expect(sectorsOf([{ sector: 'edu' }, { sector: 'x' }, { sector: 'road' }, { sector: 'edu' }])).toEqual(['road', 'edu', 'x']);
  });
});

describe('slider math', () => {
  it('wraps and steps', () => {
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(5, 5)).toBe(0);
    expect(wrapIndex(12, 5)).toBe(2);
    expect(wrapIndex(3, 0)).toBe(0);
    expect(stepIndex(4, 1, 5)).toBe(0);
    expect(stepIndex(0, -1, 5)).toBe(4);
    expect(stepIndex(4, 1, 5, false)).toBe(4);
    expect(stepIndex(0, -1, 5, false)).toBe(0);
  });
  it('counter label in Bangla digits', () => {
    expect(counterLabel(2, 12)).toBe('৩/১২');
    expect(counterLabel(-1, 12)).toBe('১২/১২');
    expect(counterLabel(0, 0)).toBe('');
  });
  it('swipes need distance and a mostly horizontal gesture', () => {
    expect(swipeDirection(-80, 5, 390)).toBe(1);
    expect(swipeDirection(80, 5, 390)).toBe(-1);
    expect(swipeDirection(-20, 0, 390)).toBe(0);
    expect(swipeDirection(-80, 120, 390)).toBe(0);
    expect(swipeDirection(-100, 0, 1440)).toBe(0); // wide stage needs a longer drag (min(12%, 120px))
    expect(swipeDirection(-130, 0, 1440)).toBe(1);
  });
  it('neighbours, keys, featured order and pager', () => {
    expect(nearbyIndexes(0, 5)).toEqual([0, 1, 4]);
    expect(nearbyIndexes(0, 1)).toEqual([0]);
    expect(keyToAction('ArrowRight', 4, 5)).toBe(0);
    expect(keyToAction('ArrowLeft', 0, 5)).toBe(4);
    expect(keyToAction('End', 0, 5)).toBe(4);
    expect(keyToAction('a', 0, 5)).toBeNull();
    expect(featuredFirst([{ id: 1 }, { id: 2, featured: true }, { id: 3 }, { id: 4, featured: true }]).map((x) => x.id)).toEqual([2, 4, 1, 3]);
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(pageList(2, 4)).toEqual([1, 2, 3, 4]);
  });
});

describe('YouTube handling', () => {
  it('ids, thumbnails and nocookie embeds', () => {
    expect(isYouTubeId('aqz-KE-bpKQ')).toBe(true);
    expect(isYouTubeId('bad')).toBe(false);
    expect(ytThumb('aqz-KE-bpKQ')).toBe('https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg');
    expect(ytThumb('<script>')).toBe('');
    expect(ytEmbed('aqz-KE-bpKQ', { autoplay: true })).toBe('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0&modestbranding=1&playsinline=1&autoplay=1');
    expect(ytEmbed('x" onload="alert(1)')).toBe('');
  });
  it('accepts only trusted embed URLs', () => {
    expect(idFromEmbedUrl('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ');
    expect(idFromEmbedUrl('https://www.youtube.com/embed/aqz-KE-bpKQ')).toBeNull();
    expect(idFromEmbedUrl('javascript:alert(1)')).toBeNull();
    expect(videoYouTubeId({ kind: 'youtube', youtubeId: 'aqz-KE-bpKQ' })).toBe('aqz-KE-bpKQ');
    expect(videoYouTubeId({ kind: 'youtube', youtubeId: null, embedUrl: 'https://www.youtube-nocookie.com/embed/eRsGyueVLvQ' })).toBe('eRsGyueVLvQ');
    expect(videoYouTubeId({ kind: 'upload', youtubeId: 'aqz-KE-bpKQ' })).toBeNull();
  });
  it('agrees with the shared parser for every pasted-link form the CMS accepts', () => {
    for (const u of ['https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'https://youtu.be/aqz-KE-bpKQ?t=3', 'https://www.youtube.com/shorts/aqz-KE-bpKQ', 'youtube.com/embed/aqz-KE-bpKQ', 'aqz-KE-bpKQ']) {
      const id = parseYouTubeId(u);
      expect(id).toBe('aqz-KE-bpKQ');
      expect(idFromEmbedUrl(`https://www.youtube-nocookie.com/embed/${id}`)).toBe(id);
    }
  });
});

describe('links and sanitiser', () => {
  it('safeHref allows site paths, http(s), mailto, tel only', () => {
    expect(safeHref('/complaint')).toBe('/complaint');
    expect(safeHref('https://www.facebook.com/')).toBe('https://www.facebook.com/');
    expect(safeHref('mailto:office@x.example')).toBe('mailto:office@x.example');
    expect(safeHref('tel:+8801700000002')).toBe('tel:+8801700000002');
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', '//evil.example', '/\\evil.example', 'data:text/html,x', 'vbscript:x', 'java\tscript:x', 'complaint.html', '']) expect(safeHref(bad)).toBe('');
    expect(isExternalHref('https://a.example')).toBe(true);
    expect(safeMediaUrl('javascript:alert(1)')).toBe('');
    expect(safeMediaUrl('http://127.0.0.1:4000/api/v1/public/media/a/b.webp')).toBe('http://127.0.0.1:4000/api/v1/public/media/a/b.webp');
  });
  it('sanitizeBody keeps the allow-list and removes everything else', () => {
    const dirty = '<p onclick="x()">Hi <b>bold</b> <script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a> <a href="https://ok.example">ok</a></p><iframe src="https://evil"></iframe><style>p{}</style>';
    const out = sanitizeBody(dirty);
    expect(out).not.toMatch(/script|onerror|onclick|iframe|javascript|<img|style/i);
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<a href="https://ok.example" rel="noopener noreferrer nofollow" target="_blank">ok</a>');
    expect(out).toContain('bad'); // the unsafe link keeps its text, not its href
    expect(sanitizeBody(null)).toBe('');
    expect(textOf('<p>এক&nbsp;দুই</p><p>তিন</p>', 7)).toBe('এক দুই…');
  });
  it('BUG-2026-017: an unsafe link never breaks the closing tag of the next element', () => {
    const out = sanitizeBody('<p><i>x</i> <a href="javascript:x">bad</a> <a href="https://ok.example">ok</a> <b>z</b></p>');
    expect(out).toBe('<p><em>x</em> <a>bad</a> <a href="https://ok.example" rel="noopener noreferrer nofollow" target="_blank">ok</a> <strong>z</strong></p>');
    expect(out).not.toContain('</span>');
  });
  it('splits a body after its first paragraph only', () => {
    expect(splitAfterFirstBlock('<p>a</p><p>b</p>')).toEqual(['<p>a</p>', '<p>b</p>']);
    expect(splitAfterFirstBlock('<ul><li>a</li></ul><p>b</p>')).toEqual(['<ul><li>a</li></ul><p>b</p>', '']);
  });
});

describe('CSP', () => {
  it('nonce + strict-dynamic, YouTube nocookie frames, API media, no inline script', () => {
    const csp = buildCsp({ nonce: 'abc', dev: false, mediaOrigins: ['https://api.jonoshetu.com/x'], imageHosts: ['upload.wikimedia.org', 'thumb.wikimedia.org', 'bad host'], turnstile: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain('frame-src https://www.youtube-nocookie.com');
    expect(csp).toContain('img-src \'self\' data: blob: https://i.ytimg.com https://upload.wikimedia.org https://thumb.wikimedia.org https://api.jonoshetu.com');
    expect(csp).toContain('media-src \'self\' blob: https://api.jonoshetu.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('bad host');
    const dev = buildCsp({ nonce: 'n', dev: true, mediaOrigins: ['http://127.0.0.1:4000'], imageHosts: [], turnstile: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain('https://challenges.cloudflare.com');
    expect(dev).not.toContain('upgrade-insecure-requests');
    expect(originOf('ftp://x')).toBe('');
  });
});

describe('navigation + page defaults', () => {
  it('marks the right menu entry', () => {
    expect(activeNav('/')).toBe('/');
    expect(activeNav('/biography')).toBe('/about');
    expect(activeNav('/activities/post-1')).toBe('/activities');
    expect(activeNav('/videos/')).toBe('/videos');
  });
  it('fills every field even for an empty or partly unknown page', () => {
    const empty = defaultedPage('contact', {});
    expect(empty).toEqual(PAGE_SCHEMAS.contact.parse({}));
    const odd = defaultedPage('layout', { tagline: 'x', futureField: 1, social: 'not-an-array' });
    expect(odd.tagline).toBe('x');
    expect(Array.isArray(odd.social)).toBe(true);
    expect((odd as Record<string, unknown>).futureField).toBeUndefined();
  });
});

import { TtlCache, isTransient } from '../src/lib/ttlcache';
describe('server read cache', () => {
  it('serves fresh values, shares in-flight loads, refreshes after the TTL', async () => {
    let t = 0, calls = 0;
    const c = new TtlCache(5000, 60_000, 3, () => t);
    const load = async () => ++calls;
    const [a, b] = await Promise.all([c.get('k', load), c.get('k', load)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    t = 4000; expect(await c.get('k', load)).toBe(1);
    t = 6000; expect(await c.get('k', load)).toBe(2);
  });
  it('serves the last good copy on a transient error, not on a 404; stays bounded', async () => {
    let t = 0;
    const c = new TtlCache(1000, 60_000, 2, () => t);
    await c.get('a', async () => 'good');
    t = 5000;
    expect(await c.get('a', async () => { throw Object.assign(new Error('rl'), { status: 429 }); })).toBe('good');
    await expect(c.get('a', async () => { throw Object.assign(new Error('nf'), { status: 404 }); })).rejects.toThrow('nf');
    t = 70_000;
    await expect(c.get('a', async () => { throw Object.assign(new Error('down'), { status: 503 }); })).rejects.toThrow('down');
    await c.get('b', async () => 1); await c.get('c', async () => 2); await c.get('d', async () => 3);
    expect(c.size).toBe(2);
    expect(isTransient({ status: 500 })).toBe(true);
    expect(isTransient({ status: 400 })).toBe(false);
  });
});

import http from 'node:http';
import { serverHeaders, visitorIp } from '../src/lib/serverHeaders';
import { httpRequest } from '../src/lib/http';
describe('server-to-API headers (BUG-2026-020)', () => {
  const H = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  it('with the site token: x-site-token + x-client-ip, no x-forwarded-for', () => {
    const h = serverHeaders({ host: 'ndp3.jonoshetu.com', ip: '203.0.113.9', token: 't'.repeat(40) });
    expect(h).toEqual({ accept: 'application/json', host: 'ndp3.jonoshetu.com', 'x-forwarded-host': 'ndp3.jonoshetu.com', 'x-site-token': 't'.repeat(40), 'x-client-ip': '203.0.113.9' });
  });
  it('without a token: X-Forwarded-For fallback; never an invalid IP', () => {
    expect(serverHeaders({ host: 'a.example', ip: '2001:db8::1' })['x-forwarded-for']).toBe('2001:db8::1');
    expect(serverHeaders({ host: 'a.example', ip: '::ffff:10.0.0.1', token: 'x'.repeat(32) })['x-client-ip']).toBe('10.0.0.1');
    for (const bad of ['', 'evil, 1.2.3.4', '1.2.3.4\r\nx: y', 'localhost']) {
      const h = serverHeaders({ host: 'a.example', ip: bad, token: 'x'.repeat(32) });
      expect(h['x-client-ip']).toBeUndefined();
      expect(h['x-forwarded-for']).toBeUndefined();
    }
    expect(serverHeaders({ host: 'a', json: true })['content-type']).toBe('application/json');
  });
  it('visitor IP = right-most X-Forwarded-For hop (left entries are spoofable)', () => {
    expect(visitorIp(H({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7' }))).toBe('198.51.100.7');
    expect(visitorIp(H({ 'x-real-ip': '198.51.100.8' }))).toBe('198.51.100.8');
    expect(visitorIp(H({}), '127.0.0.1')).toBe('127.0.0.1');
  });
  it('BUG-2026-023: the HTTP client really sends the tenant Host header (global fetch would replace it)', async () => {
    const srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ host: q.headers.host, tok: q.headers['x-site-token'] ?? null })); });
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
    const port = (srv.address() as { port: number }).port;
    const r = await httpRequest(`http://127.0.0.1:${port}/x`, { headers: serverHeaders({ host: 'ndp3.jonoshetu.com', ip: '1.2.3.4', token: 'k'.repeat(32) }) });
    srv.close();
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ host: 'ndp3.jonoshetu.com', tok: 'k'.repeat(32) });
  });
});
