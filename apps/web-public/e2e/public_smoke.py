"""End-to-end smoke test of the public MP site (apps/web-public) in a real browser (Playwright + Edge).

Prereqs: API on :4000 with the seeded fictional tenant, the public site on :3000 (`npm run dev:public`).
Run:     python apps/web-public/e2e/public_smoke.py [--shots DIR] [--skip-write]
Checks every page at 1440 px and 390 px (HTTP 200, no console errors, no horizontal scroll, texts from the API are
on the page), the gallery slider + lightbox, the video slider (YouTube facade -> iframe, uploaded <video> plays),
the complaint form + tracking, and a CMS round-trip (edit the contact intro via the admin API, publish, see it on
/contact, restore). Credentials are read from apps/api/.seed-credentials.local and never printed.
"""
import json, os, re, sys, time, urllib.error, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
SITE = os.environ.get('PUBLIC_URL', 'http://127.0.0.1:3000')
API = os.environ.get('API_URL', 'http://127.0.0.1:4000')
HOST = os.environ.get('TENANT_HOST', 'ndp3.jonoprotinidhi.localhost')
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
SKIP_WRITE = '--skip-write' in sys.argv
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8')

results = []
def step(name, ok, extra=''):
    results.append((name, bool(ok))); print(('PASS' if ok else 'FAIL'), name, extra if not ok or extra else '', flush=True)

def api(path, method='GET', body=None, token=None, public=True):
    url = f"{API}/api/v1/{'public/' if public else ''}{path.lstrip('/')}"
    h = {'accept': 'application/json', 'x-forwarded-host': HOST}
    if body is not None: h['content-type'] = 'application/json'
    if token: h['authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            t = r.read().decode('utf-8'); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode('utf-8', 'replace'); return e.code, (json.loads(t) if t.startswith('{') else t)

norm = lambda s: re.sub(r'\s+', ' ', str(s or '')).strip()

# ---------- expected content, straight from the public API ----------
_, site = api('site')
page = {k: api(f'pages/{k}')[1]['data'] for k in ['layout', 'home', 'profile', 'heroes', 'area', 'contact', 'complaint']}
_, posts = api('posts?limit=6')
_, promises = api('promises')
_, gallery = api('gallery?limit=100')
_, albums = api('gallery/albums')
_, videos = api('videos?limit=100')
_, events = api('events?limit=3')
H = page['heroes']; P = page['profile']; A = page['area']; C = page['contact']; CP = page['complaint']; L = page['layout']; HM = page['home']
first_post = posts['items'][0] if posts['items'] else None
feat_gallery = [g for g in gallery['items'] if g['featured']] + [g for g in gallery['items'] if not g['featured']]
feat_videos = [v for v in videos['items'] if v['featured']] + [v for v in videos['items'] if not v['featured']]

def present(*xs): return [x for x in xs if x and norm(x)]
EXPECT = {
    '/': present(site['mp']['name'], HM['statsTitle'], HM['sections']['activities']['title'], first_post and first_post['title'], HM['complaintCta']['title'],
                 site['banners'][0]['caption'] if site['banners'] else '', L['footerAbout'], L['copyright'], L['notice']['text'] if L['notice']['on'] else '',
                 events['items'][0]['title'] if events['items'] else ''),
    '/about': present(H['about']['title'], P['headline'], P['personal'][0]['value'] if P['personal'] else '', P['committees'][0]['title'] if P['committees'] else '', P['portrait']['credit'],
                      P['priorities'][0]['title'] if P['priorities'] else ''),
    '/biography': present(H['biography']['title'], P['education'][0]['title'] if P['education'] else '', P['politics'][-1]['title'] if P['politics'] else ''),
    '/activities': present(H['activities']['title'], first_post and first_post['title']),
    '/promises': present(H['promises']['title'], promises['items'][0]['name'] if promises['items'] else ''),
    '/area': present(H['area']['title'], A['upazilas'][0]['name'] if A['upazilas'] else '', A['note'], A['totals'][0]['label'] if A['totals'] else ''),
    '/gallery': present(H['gallery']['title'], feat_gallery[0]['caption'] if feat_gallery else '', albums['items'][0]['name'] if albums['items'] else ''),
    '/videos': present(H['videos']['title'], *[v['title'] for v in feat_videos]),
    '/complaint': present(H['complaint']['title'], CP['faq'][0]['q'] if CP['faq'] else '', CP['steps'][0]['title'] if CP['steps'] else '', CP['privacyNote']),
    '/contact': present(H['contact']['title'], C['offices'][0]['name'] if C['offices'] else '', C['hotline']['number'], C['intro']),
}
if first_post:
    EXPECT[f"/activities/{first_post['slug']}"] = present(first_post['title'], first_post.get('quote'))

missing_data = [k for k, v in {'banners': site['banners'], 'posts': posts['items'], 'promises': promises['items'], 'gallery': gallery['items'], 'videos': videos['items'],
                               'events': events['items'], 'upazilas': A['upazilas'], 'offices': C['offices'], 'faq': CP['faq']}.items() if not v]
if missing_data: print('NOTE seed has no data for:', ', '.join(missing_data))

IGNORE = re.compile(r'youtube|ytimg|googlevideo|doubleclick|favicon|Download the React DevTools|\[Fast Refresh\]|\[HMR\]', re.I)

def new_page(browser, width):
    ctx = browser.new_context(viewport={'width': width, 'height': 900 if width > 600 else 844}, locale='bn-BD')
    pg = ctx.new_page(); errs = []
    # an unknown tracking id is an intended 404 of the lookup endpoint; the browser logs every 4xx fetch
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text[:300]}') if m.type == 'error' and not IGNORE.search(m.text) and '/api/public/complaints/' not in (m.location or {}).get('url', '') else None)
    pg.on('pageerror', lambda e: errs.append(f'pageerror: {str(e)[:300]}'))
    pg.on('response', lambda r: errs.append(f'{r.status} {r.url}') if r.status >= 400 and not IGNORE.search(r.url) and '/api/public/complaints/' not in r.url else None)
    return ctx, pg, errs

# All test traffic comes from one IP, and the API allows 120 public requests per minute per visitor IP (BUG-2026-020:
# a server-rendered page view costs several API calls). Keep page loads spaced like a brisk human reader.
PACE = float(os.environ.get('PACE_S', '4'))
_last = [0.0]
def pace():
    wait = PACE - (time.time() - _last[0])
    if wait > 0: time.sleep(wait)
    _last[0] = time.time()

def scroll_through(pg):
    h = pg.evaluate('document.body.scrollHeight'); y = 0
    while y < h:
        pg.evaluate(f'window.scrollTo(0,{y})'); time.sleep(0.08); y += 800; h = pg.evaluate('document.body.scrollHeight')
    pg.evaluate('window.scrollTo(0,0)')

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')

    # ---------- 1. every page, two widths ----------
    for width in (1440, 390):
        ctx, pg, errs = new_page(browser, width)
        for path, texts in EXPECT.items():
            errs.clear()
            pace()
            r = pg.goto(SITE + path, wait_until='networkidle', timeout=90000)
            scroll_through(pg); time.sleep(0.3)
            body = norm(pg.evaluate('document.body.textContent'))
            miss = [t for t in texts if norm(t) not in body]
            sw, cw = pg.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
            step(f'{width}px {path}: HTTP 200', r and r.status == 200, str(r and r.status))
            step(f'{width}px {path}: texts from the CMS present ({len(texts)})', not miss, 'missing: ' + ' | '.join(m[:60] for m in miss))
            step(f'{width}px {path}: no horizontal scroll', sw <= cw, f'{sw} > {cw}')
            step(f'{width}px {path}: no console errors', not errs, ' || '.join(errs[:4]))
            if path == '/':
                cap = norm(pg.locator('.hero-cap p').first.text_content() or '') if site['banners'] else ''
                caps = [norm(b['caption']) for b in site['banners']]
                step(f'{width}px /: banner caption (photo credit) visible', not site['banners'] or (cap in caps and pg.locator('.hero-cap p').first.is_visible()), cap)
                hdr = r.headers if r else {}
                step(f'{width}px /: CSP + security headers', 'youtube-nocookie.com' in hdr.get('content-security-policy', '') and "'nonce-" in hdr.get('content-security-policy', '')
                     and hdr.get('x-content-type-options') == 'nosniff' and hdr.get('x-frame-options') == 'DENY')
            if SHOTS: pg.screenshot(path=str(SHOTS / f"{(path.strip('/') or 'home').replace('/', '_')}-{width}.png"), full_page=True)
        if width == 390:
            pg.goto(SITE + '/', wait_until='networkidle')
            pg.click('#menuBtn'); time.sleep(0.2)
            ok = pg.locator('#nav.open a[href="/gallery"]').is_visible()
            pg.click('#nav.open a[href="/gallery"]')
            pg.wait_for_function("location.pathname === '/gallery'", timeout=20000)  # page.url misses client-side pushState here
            time.sleep(0.5)
            closed = pg.locator('#nav.open').count() == 0
            step('390px: mobile menu opens and navigates', ok and closed, f'visible={ok} closed={closed}')
        ctx.close()

    # ---------- 2. gallery slider + lightbox ----------
    ctx, pg, errs = new_page(browser, 1440)
    pg.goto(SITE + '/gallery', wait_until='networkidle')
    n = len(gallery['items'])
    cnt = lambda: norm(pg.locator('.gs-count').first.text_content())
    bn = lambda i: ''.join('০১২৩৪৫৬৭৮৯'[int(c)] for c in str(i))
    if n >= 2:
        step('gallery: counter starts at ১/N', cnt() == f'১/{bn(n)}', cnt())
        pg.click('.gs-nav.next'); time.sleep(0.3)
        step('gallery: next button', cnt() == f'২/{bn(n)}', cnt())
        pg.click('.gs-nav.prev'); time.sleep(0.3)
        step('gallery: prev button', cnt() == f'১/{bn(n)}', cnt())
        pg.focus('.gs-stage'); pg.keyboard.press('ArrowRight'); time.sleep(0.2); a = cnt()
        pg.keyboard.press('ArrowLeft'); time.sleep(0.2); b = cnt()
        step('gallery: keyboard arrows', a == f'২/{bn(n)}' and b == f'১/{bn(n)}', f'{a} {b}')
        pg.locator('.gs-stage').scroll_into_view_if_needed(); box = pg.locator('.gs-stage').bounding_box()
        pg.mouse.move(box['x'] + box['width'] * .7, box['y'] + box['height'] * .5); pg.mouse.down()
        for k in range(1, 9): pg.mouse.move(box['x'] + box['width'] * (.7 - .05 * k), box['y'] + box['height'] * .5)
        pg.mouse.up(); time.sleep(0.3)
        step('gallery: drag/swipe to the next photo', cnt() == f'২/{bn(n)}', cnt())
        pg.locator('.gs-thumb').nth(2).click(); time.sleep(0.3)
        step('gallery: thumbnail jumps to that photo', cnt() == f'৩/{bn(n)}', cnt())
        cap = norm(pg.locator('.gs-cap h3').first.text_content())
        step('gallery: caption follows the slide', cap == norm(feat_gallery[2]['caption']), cap)
        pg.click('.gs-tools button[aria-label="ছবিটি বড় করে দেখুন"]'); time.sleep(0.3)
        opened = pg.locator('.lb[role=dialog]').is_visible()
        focus_in = pg.evaluate("document.activeElement && document.activeElement.closest('.lb') !== null")
        pg.keyboard.press('ArrowRight'); time.sleep(0.2)
        lbcap = norm(pg.locator('.lb-cap').text_content())
        for _ in range(4): pg.keyboard.press('Tab')
        still_in = pg.evaluate("document.activeElement && document.activeElement.closest('.lb') !== null")
        pg.keyboard.press('Escape'); time.sleep(0.2)
        step('gallery: lightbox opens, traps focus, arrows navigate, Esc closes', opened and focus_in and still_in and norm(feat_gallery[3]['caption']) in lbcap and pg.locator('.lb').count() == 0, lbcap[:60])
        if albums['items']:
            alb = albums['items'][-1]
            pg.locator('.gs-filter .chip', has_text=alb['name']).first.click(); time.sleep(0.3)
            step('gallery: album chip filters the slider', cnt() == f"১/{bn(alb['count'])}" or (alb['count'] == 1 and pg.locator('.gs-nav').count() == 0), cnt())
        pg.locator('.wall button').first.click() if pg.locator('.wall button').count() else None
    step('gallery: no console errors during interaction', not errs, ' || '.join(errs[:3]))
    ctx.close()

    # ---------- 3. video slider ----------
    ctx, pg, errs = new_page(browser, 1440)
    pg.goto(SITE + '/videos', wait_until='networkidle')
    title = lambda: norm(pg.locator('.vs-info h3').first.text_content())
    if feat_videos:
        step('videos: first slide is the first featured video', title() == norm(feat_videos[0]['title']), title())
        if len(feat_videos) > 1:
            pg.click('.vs-ctl button[aria-label="পরের ভিডিও"]'); time.sleep(0.3)
            step('videos: next button switches the slide + title', title() == norm(feat_videos[1]['title']), title())
            pg.locator('.vs-item').nth(0).click(); time.sleep(0.3)
            step('videos: rail item selects the slide', title() == norm(feat_videos[0]['title']))
        yt = next((i for i, v in enumerate(feat_videos) if v['kind'] == 'youtube'), None)
        up = next((i for i, v in enumerate(feat_videos) if v['kind'] == 'upload' and v['fileUrl']), None)
        if up is not None:
            pg.locator('.vs-item').nth(up).click() if len(feat_videos) > 1 else None; time.sleep(0.5)
            pg.locator('.vs-stage .vs-facade').click(); time.sleep(0.5)
            v = pg.locator('.vs-stage video[controls]')
            pg.wait_for_function("() => { const v = document.querySelector('.vs-stage video[controls]'); return v && v.readyState > 0 }", timeout=20000)
            info = pg.evaluate("(() => { const v = document.querySelector('.vs-stage video[controls]'); return { rs: v.readyState, d: v.duration, src: v.currentSrc } })()")
            step('videos: uploaded video is a playable <video> (readyState > 0)', v.count() == 1 and info['rs'] > 0 and info['d'] > 0, json.dumps(info)[:160])
            time.sleep(1.0)
            playing = pg.evaluate("(() => { const v = document.querySelector('.vs-stage video[controls]'); return !v.paused })()")
            step('videos: uploaded video starts playing after the click', playing)
        else:
            step('videos: seed has an uploaded video', False, 'no upload in /videos')
        if yt is not None:
            pg.locator('.vs-item').nth(yt).click() if len(feat_videos) > 1 else None; time.sleep(0.4)
            playing_after = pg.evaluate("[...document.querySelectorAll('video')].filter(v => !v.paused).length")
            step('videos: switching slides stops the previous video', playing_after == 0, str(playing_after))
            step('videos: YouTube slide shows the facade, no iframe yet', pg.locator('.vs-stage iframe').count() == 0 and pg.locator('.vs-stage .vs-facade img').count() == 1)
            pg.click('.vs-stage .vs-facade'); time.sleep(0.5)
            src = pg.locator('.vs-stage iframe').get_attribute('src') if pg.locator('.vs-stage iframe').count() else ''
            step('videos: facade click loads the youtube-nocookie iframe', src.startswith(f"https://www.youtube-nocookie.com/embed/{feat_videos[yt]['youtubeId']}"), src)
        else:
            step('videos: seed has a YouTube video', False)
        pg.goto(SITE + f"/videos?v={feat_videos[-1]['id']}", wait_until='networkidle')
        step('videos: ?v= deep link opens that video', title() == norm(feat_videos[-1]['title']), title())
        pg.locator('.vids .alb').nth(1).click(); time.sleep(0.5)
        step('videos: grid card selects the slide', title() == norm(feat_videos[1]['title']) if len(feat_videos) > 1 else True)
    step('videos: no console errors (excluding YouTube iframe)', not errs, ' || '.join(errs[:3]))
    ctx.close()

    # ---------- 4. complaint form + tracking ----------
    _, form = api('complaint-form')
    ctx, pg, errs = new_page(browser, 1440)
    pg.goto(SITE + '/complaint', wait_until='networkidle')
    pg.click('button[type=submit]:has-text("অভিযোগ জমা দিন")'); time.sleep(0.3)
    step('complaint: empty form shows Bangla field errors', pg.locator('.cmp .err').count() >= 8 and pg.locator('[aria-invalid=true]').count() >= 8)
    step('complaint: no anonymous option, name/mobile/DOB/NID fields present', pg.locator('#fAnon').count() == 0 and all(pg.locator(i).count() == 1 for i in ['#fName', '#fPhone', '#fDob', '#fNid']))
    tid = None
    if SKIP_WRITE or not form['enabled']:
        print('SKIP complaint submission', 'box disabled' if not form['enabled'] else '(--skip-write)')
    elif form['otpRequired']:
        print('NOTE tenant requires OTP: the SMS code cannot be read in this test; checking that the OTP step is shown')
        pg.fill('#fPhone', '01700000099')
        step('complaint: OTP step shown for an OTP tenant', pg.locator('.otp').is_visible())
    else:
        pg.select_option('#fCat', index=1)
        pg.select_option('#fUpz', index=1)
        pg.select_option('#fUnion', index=1)
        pg.fill('#fPlace', 'ই২ই পরীক্ষা')
        pg.fill('#fText', 'স্বয়ংক্রিয় পরীক্ষা: রাস্তার পাশের ড্রেন বন্ধ হয়ে পানি জমে থাকে, দয়া করে দেখুন। ' + time.strftime('%H%M%S'))
        # name, mobile, date of birth and NID are all required (adr/0009); fictional values, a fresh number: the API caps submissions per phone per day
        pg.fill('#fName', 'ই২ই পরীক্ষা নাগরিক')
        pg.fill('#fPhone', '0171' + str(int(time.time() * 1000))[-7:])
        pg.fill('#fDob', '1985-03-14')
        pg.fill('#fNid', '1990123456')
        pg.click('button[type=submit]:has-text("অভিযোগ জমা দিন")')
        try:
            pg.wait_for_selector('[data-testid=tracking-id]', timeout=20000)
            tid = norm(pg.locator('[data-testid=tracking-id]').text_content())
        except Exception:
            print('   alert:', pg.locator('.alert').all_text_contents())
        step('complaint: submission shows a tracking id', tid and re.match(r'^[A-Z0-9]+-\d{4}-\d{5}$', tid), str(tid))
        if tid:
            pg.click('.ticket button:has-text("অবস্থা দেখুন")')
            pg.wait_for_selector('[data-testid=track-card]', timeout=15000)
            card = norm(pg.locator('[data-testid=track-card]').text_content())
            step('complaint: tracking finds the new complaint', tid in card and 'অভিযোগ গৃহীত' in card, card[:80])
    pg.goto(SITE + '/complaint#track', wait_until='networkidle')
    pg.fill('#trackId', 'NOPE-2020-99999'); pg.click('#pane-track button[type=submit]'); time.sleep(1.0)
    step('complaint: unknown tracking id gives a Bangla message', 'পাওয়া যায়নি' in norm(pg.locator('#pane-track').text_content()))
    if tid:
        pg.fill('#trackId', tid.lower()); pg.click('#pane-track button[type=submit]')
        pg.wait_for_selector('[data-testid=track-card]', timeout=15000)
        step('complaint: tracking lookup (typed, lower case) finds it', tid in norm(pg.locator('[data-testid=track-card]').text_content()))
    step('complaint: no console errors', not errs, ' || '.join(errs[:3]))
    ctx.close()

    # ---------- 5. CMS round-trip ----------
    if SKIP_WRITE:
        print('SKIP CMS round-trip (--skip-write)')
    else:
        creds = (ROOT / 'apps/api/.seed-credentials.local').read_text(encoding='utf-8')
        pw = re.search(r'password \(all accounts\): (\S+)', creds).group(1)
        owner = re.search(r'MP owner: (\S+)', creds).group(1)
        s, login = api('auth/login', 'POST', {'identifier': owner, 'password': pw}, public=False)
        token = login.get('accessToken') if isinstance(login, dict) else None
        step('cms: owner login (password only, MFA_REQUIRED=false)', s == 200 and token, str(s))
        if token:
            _, me = api('auth/me', token=token, public=False)
            tenant = next(m['tenantId'] for m in me['memberships'] if m['role'] in ('owner', 'mp', 'mp_owner') or True)
            base = f'admin/tenants/{tenant}/pages/contact'
            s, cur = api(base, token=token, public=False)
            orig_draft, orig_live, had_changes = cur['draft'], cur['live'], cur.get('hasUnpublishedChanges')
            marker = 'ই২ই পরীক্ষা ' + time.strftime('%H%M%S') + ': এই লেখাটি সিএমএস থেকে বদলানো হয়েছে।'
            s1, put = api(base, 'PUT', {**orig_draft, 'intro': marker, 'version': cur['version']}, token=token, public=False)
            s2, _ = api(base + '/publish', 'POST', {}, token=token, public=False)
            step('cms: contact intro saved + published through the admin API', s1 == 200 and s2 == 200, f'{s1} {s2}')
            ctx, pg, errs = new_page(browser, 1440)
            def shows(want, timeout=15):  # the site keeps API reads for ~5 s, so allow a few reloads
                t0 = time.time()
                while True:
                    pg.goto(SITE + '/contact', wait_until='networkidle')
                    if want(norm(pg.evaluate('document.body.textContent'))): return round(time.time() - t0, 1)
                    if time.time() - t0 > timeout: return None
                    time.sleep(1.5)
            took = shows(lambda b: marker in b)
            step('cms: /contact shows the new intro within seconds', took is not None, f'{took}s')
            # restore: publish the original live copy, then put the original draft back (keeps unpublished work unpublished)
            _, cur2 = api(base, token=token, public=False)
            restore_live = orig_live if orig_live else orig_draft
            s3, r3 = api(base, 'PUT', {**restore_live, 'version': cur2['version']}, token=token, public=False)
            s4, r4 = api(base + '/publish', 'POST', {}, token=token, public=False)
            if had_changes:
                api(base, 'PUT', {**orig_draft, 'version': r4['version']}, token=token, public=False)
            took = shows(lambda b: marker not in b and (not restore_live.get('intro') or norm(restore_live['intro']) in b))
            step('cms: original contact page restored', s3 == 200 and s4 == 200 and took is not None, f'{s3} {s4} {took}s')
            ctx.close()

    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
if failed: print('FAILED:\n  ' + '\n  '.join(failed))
sys.exit(1 if failed else 0)
