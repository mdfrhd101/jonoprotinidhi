"""End-to-end test of the CMS (content editors) in a real browser (Playwright + Edge), as the editor and as the owner.

Covers: every site page (edit -> draft -> publish -> visible on the public API -> restored), repeatable lists, gallery
(multi-upload, captions, reorder, bulk publish, public order, delete), videos (YouTube link + uploaded WebM, publish,
public list, Range requests on the file, media-in-use refusal, delete), events (create, publish, public, delete),
banners (image upload, reorder, public), and layout checks (no console errors, no horizontal scroll at 1440 and 390 px).

Prereqs: MongoDB, `npm run dev:api` (http://127.0.0.1:4000) and `npm run dev:admin` (http://localhost:5173), seeded tenant.
Login is password-only while MFA_REQUIRED=false. Credentials are read from apps/api/.seed-credentials.local (never printed).
Run:  PYTHONIOENCODING=utf-8 python e2e/cms_smoke.py [--shots DIR]
Everything the test creates is deleted and everything it changes is restored at the end (also when a step fails).
"""
import json, os, re, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get('ADMIN_URL', 'http://localhost:5173')
API = os.environ.get('API_URL', 'http://127.0.0.1:4000')
HOST = os.environ.get('TENANT_HOST', 'ndp3.jonoshetu.localhost')
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else Path(tempfile.gettempdir()) / 'jonoshetu-cms-shots'
SHOTS.mkdir(parents=True, exist_ok=True)
TMP = Path(tempfile.mkdtemp(prefix='cms-e2e-'))

creds = (ROOT / 'apps/api/.seed-credentials.local').read_text(encoding='utf-8')
PW = re.search(r'password \(all accounts\): (\S+)', creds).group(1)
OWNER, EDITOR = '01700000010', '01700000011'
TAG = 'E2E'

results = []
def step(name, ok, extra=''):
    results.append((name, bool(ok))); print(('PASS' if ok else 'FAIL'), name, extra, flush=True)

# ---------------------------------------------------------------- plain HTTP helpers (setup, verification, cleanup)
def http(method, url, body=None, tok=None, headers=None, raw=False):
    data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
    h = {'Content-Type': 'application/json', **({'Authorization': f'Bearer {tok}'} if tok else {}), **(headers or {})}
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            b = r.read(); return (r.status, dict(r.headers), b) if raw else (r.status, json.loads(b) if b else None)
    except urllib.error.HTTPError as e:
        b = e.read(); return (e.code, dict(e.headers), b) if raw else (e.code, json.loads(b) if b else None)

def token(ident):
    for _ in range(10):  # the login rate limit is shared with everyone working on this machine: wait it out
        s, j = http('POST', f'{API}/api/v1/auth/login', {'identifier': ident, 'password': PW})
        if s != 429: break
        wait = int(((j or {}).get('error', {}).get('details') or {}).get('retryAfterSec', 30)) + 2
        print(f'   (login rate-limited, waiting {wait} s)', flush=True); time.sleep(wait)
    assert s == 200 and j.get('accessToken'), 'API login failed'
    return j['accessToken']

OT = token(OWNER)
_, me = http('GET', f'{API}/api/v1/auth/me', tok=OT)
TID = next(m['tenantId'] for m in me['memberships'] if m['role'] == 'owner')
ADM = f'{API}/api/v1/admin/tenants/{TID}'
def adm(method, path, body=None): return http(method, ADM + path, body, OT)
def pub(path):
    s, j = http('GET', f'{API}/api/v1/public{path}', headers={'Host': HOST})
    return j if s == 200 else None
def all_items(path):
    s, j = adm('GET', f'{path}?limit=100&page=1'); items = j['items']
    for p in range(2, j.get('totalPages', 1) + 1): items += adm('GET', f'{path}?limit=100&page={p}')[1]['items']
    return items

# ---------------------------------------------------------------- snapshot of everything we touch
PAGE_KEYS = ['layout', 'home', 'profile', 'heroes', 'area', 'contact', 'complaint']
orig_pages = {k: adm('GET', f'/pages/{k}')[1] for k in PAGE_KEYS}
orig_site = adm('GET', '/site-config')[1]
orig_gallery = {g['id']: g['order'] for g in all_items('/gallery')}
orig_videos = {v['id']: v['order'] for v in all_items('/videos')}
orig_media = {m['id'] for m in all_items('/media')}
orig_events = {e['id'] for e in all_items('/events')}

def restore():
    print('-- restoring seeded content')
    for k, d in orig_pages.items():
        cur = adm('GET', f'/pages/{k}')[1]
        if cur['draft'] == d['draft'] and cur['live'] == d['live']: continue
        if d['live'] is not None:
            adm('PUT', f'/pages/{k}', {**d['live'], 'version': cur['version']}); adm('POST', f'/pages/{k}/publish')
            cur = adm('GET', f'/pages/{k}')[1]
        if d['draft'] != cur['draft']: adm('PUT', f'/pages/{k}', {**d['draft'], 'version': cur['version']})
    keep = {k: orig_site[k] for k in ('slogan', 'accent', 'banners', 'sections')}
    adm('PUT', '/site-config', keep)
    for g in all_items('/gallery'):
        if g['id'] not in orig_gallery: adm('DELETE', f"/gallery/{g['id']}")
        elif g['order'] != orig_gallery[g['id']]: adm('PATCH', f"/gallery/{g['id']}", {'order': orig_gallery[g['id']]})
    for v in all_items('/videos'):
        if v['id'] not in orig_videos: adm('DELETE', f"/videos/{v['id']}")
        elif v['order'] != orig_videos[v['id']]: adm('PATCH', f"/videos/{v['id']}", {'order': orig_videos[v['id']]})
    for e in all_items('/events'):
        if e['id'] not in orig_events: adm('DELETE', f"/events/{e['id']}")
    for m in all_items('/media'):
        if m['id'] not in orig_media: adm('DELETE', f"/media/{m['id']}")
    left = [p for p in ('/gallery', '/videos', '/events', '/media') if any(TAG in json.dumps(x, ensure_ascii=False) for x in all_items(p))]
    step('cleanup: nothing created by the test is left, seeded pages/site config restored', not left and all(adm('GET', f'/pages/{k}')[1]['live'] == orig_pages[k]['live'] for k in PAGE_KEYS), str(left))

# ---------------------------------------------------------------- browser helpers
console_errors = []
ALLOWED = ('Future Flag', 'status of 409', 'status of 401', 'status of 429', 'favicon', 'youtube', 'ytimg', 'googlevideo', 'doubleclick')
def login(browser, ident, width=1440, height=900):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    page = ctx.new_page()
    page.on('pageerror', lambda e: console_errors.append(f'[{ident}] pageerror {e}'))
    page.on('console', lambda m: console_errors.append(f'[{ident}] {m.text}') if m.type == 'error' and not any(a in m.text for a in ALLOWED) else None)
    for _ in range(8):
        page.goto(BASE + '/login')
        page.get_by_label('মোবাইল নম্বর বা ইমেইল').fill(ident)
        page.get_by_label('পাসওয়ার্ড').fill(PW)
        with page.expect_response(lambda r: '/auth/login' in r.url) as resp:
            page.get_by_role('button', name='এগিয়ে যান').click()
        if resp.value.status != 429: break
        print('   (browser login rate-limited, waiting 60 s)', flush=True); page.wait_for_timeout(60000)
    page.wait_for_url(re.compile(r'/(t/|switch)'), timeout=20000)
    return ctx, page

def go(page, path):
    # the dev API restarts when other people save API files (tsx watch): a load error is retried a few times
    for attempt in range(4):
        page.goto(f'{BASE}/t/{TID}/{path}')
        page.wait_for_load_state('networkidle')
        if not page.get_by_role('button', name='আবার চেষ্টা করুন').count() and '/login' not in page.url: return
        print('   (retrying', path, ')', flush=True); page.wait_for_timeout(2500)

def toast(page, text, timeout=15000):
    page.locator('.toast', has_text=text).first.wait_for(timeout=timeout)

def shot(page, name, full=True):
    page.screenshot(path=str(SHOTS / f'{name}.png'), full_page=full)

def no_hscroll(page):
    return page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')

def make_png(page, name, color, text):
    page.set_content(f'<div style="width:800px;height:600px;background:linear-gradient(135deg,{color},#0C1117);color:#fff;font:bold 64px sans-serif;display:grid;place-items:center">{text}</div>')
    path = TMP / name; page.locator('div').screenshot(path=str(path)); return str(path)

# page key -> (label of the field we edit, getter on the public data)
EDIT = {
    'layout': ('ট্যাগলাইন', lambda d: d['tagline']),
    'home': ('অংশের শিরোনাম', lambda d: d['statsTitle']),
    'profile': ('শিরোনাম', lambda d: d['headline']),
    'area': ('ভূমিকা', lambda d: d['intro']),
    'contact': ('ভূমিকা', lambda d: d['intro']),
    'complaint': ('ভূমিকা', lambda d: d['intro']),
}
LABEL = {p['key']: p['label'] for p in adm('GET', '/pages')[1]}

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')
    try:
        ectx, ed = login(browser, EDITOR)
        octx, ow = login(browser, OWNER)
        step('login: editor and owner (password only)', f'/t/' in ed.url or '/switch' in ed.url)

        # ================= 1. site pages: editor drafts every page, public unchanged ==================
        for key, (label, getv) in EDIT.items():
            go(ed, f'site-pages/{key}')
            f = ed.get_by_label(label, exact=False).first
            f.wait_for()
            old = f.input_value()
            f.fill(f'{old} {TAG}'[:120] if key in ('profile', 'home', 'layout') else f'{old} {TAG}')
            ed.get_by_role('button', name='খসড়া সংরক্ষণ').click()
            toast(ed, 'খসড়া সংরক্ষণ হয়েছে')
            live = pub(f'/pages/{key}')['data']
            step(f'editor: {key} saved as draft, public site unchanged', TAG not in getv(live))
        # heroes: open a card, edit its title
        go(ed, 'site-pages/heroes')
        ed.get_by_role('group', name='পরিচিতি', exact=True).get_by_role('button').first.click()
        t = ed.get_by_role('group', name='পরিচিতি', exact=True).get_by_label('শিরোনাম', exact=True)
        t.fill(f'{t.input_value()} {TAG}')
        ed.get_by_role('button', name='খসড়া সংরক্ষণ').click(); toast(ed, 'খসড়া সংরক্ষণ হয়েছে')
        step('editor: heroes (collapsible card) saved as draft', TAG not in pub('/pages/heroes')['data']['about']['title'])
        # a list operation: add one FAQ entry, reorder it to the top
        go(ed, 'site-pages/complaint')
        n_faq = len(pub('/pages/complaint')['data']['faq'])
        ed.get_by_role('button', name='প্রশ্ন যোগ করুন').click()
        grp = ed.get_by_role('group', name=re.compile(rf'^প্রশ্ন {"".join("০১২৩৪৫৬৭৮৯"[int(c)] for c in str(n_faq + 1))}$'))
        grp.get_by_role('textbox', name=re.compile('^প্রশ্ন')).fill(f'{TAG}: অভিযোগ কত দিনে নিষ্পত্তি হয়?')
        grp.get_by_role('textbox', name=re.compile('^উত্তর')).fill('সাধারণত সাত দিনের মধ্যে।')
        ed.get_by_role('button', name=re.compile(r'প্রশ্ন \S+ ওপরে সরান')).last.click()
        # the empty required field check: add another item and try to save
        ed.get_by_role('button', name='প্রশ্ন যোগ করুন').click()
        ed.get_by_role('button', name='খসড়া সংরক্ষণ').click()
        err_shown = ed.get_by_text('এই ঘরটি পূরণ করুন').first.is_visible()
        step('editor: an empty required list field is caught before saving', err_shown)
        ed.get_by_role('button', name=re.compile(r'প্রশ্ন \S+ মুছুন')).last.click()
        ed.get_by_role('button', name='খসড়া সংরক্ষণ').click(); toast(ed, 'খসড়া সংরক্ষণ হয়েছে')
        d = adm('GET', '/pages/complaint')[1]['draft']['faq']
        step('editor: FAQ item added and moved up (draft)', len(d) == n_faq + 1 and TAG in d[-2]['q'])
        shot(ed, 'editor-complaint-editor', full=False)

        # ================= 2. owner publishes: from the hub and from the editor ==================
        go(ow, 'site-pages')
        shot(ow, 'owner-site-pages-hub')
        for key in ['layout', 'profile', 'area', 'contact', 'complaint', 'heroes']:
            ow.get_by_role('button', name=f'{LABEL[key]} প্রকাশ করুন', exact=True).click()
            toast(ow, 'প্রকাশ হয়েছে')
            ow.wait_for_timeout(300)
        go(ow, 'site-pages/home')
        ow.get_by_role('button', name='প্রকাশ করুন', exact=True).first.click(); toast(ow, 'প্রকাশ হয়েছে')
        for key, (label, getv) in EDIT.items():
            step(f'owner: {key} published, change visible on the public API', TAG in getv(pub(f'/pages/{key}')['data']))
        step('owner: heroes published', TAG in pub('/pages/heroes')['data']['about']['title'])
        step('owner: FAQ item is live', any(TAG in f['q'] for f in pub('/pages/complaint')['data']['faq']))
        # owner edits + "সংরক্ষণ ও প্রকাশ" in one go
        go(ow, 'site-pages/home')
        f = ow.get_by_label('অংশের শিরোনাম'); f.fill(f.input_value().replace(f' {TAG}', f' {TAG}2'))
        ow.get_by_role('button', name='সংরক্ষণ ও প্রকাশ').click(); toast(ow, 'প্রকাশ হয়েছে')
        step('owner: save & publish in one click', f'{TAG}2' in pub('/pages/home')['data']['statsTitle'])
        restore_pages_ok = True

        # ================= 3. gallery ==================
        tmp = browser.new_page()
        pngs = [make_png(tmp, 'e2e-a.png', '#C7A35A', 'ক'), make_png(tmp, 'e2e-b.png', '#2F6DA3', 'খ')]
        tmp.close()
        go(ed, 'gallery')
        before = len(all_items('/gallery'))
        ed.set_input_files('input[aria-label="গ্যালারির জন্য ছবির ফাইল"]', pngs)
        toast(ed, 'ছবি গ্যালারিতে যোগ হয়েছে', 30000)
        ed.wait_for_timeout(800)
        items = all_items('/gallery'); new = [g for g in items if g['id'] not in orig_gallery]
        step('editor: 2 photos uploaded (media) and created as gallery drafts', len(items) == before + 2 and len(new) == 2 and all(g['status'] == 'draft' for g in new))
        # captions via the edit drawer
        for g, cap in zip(sorted(new, key=lambda x: x['order']), [f'{TAG} ছবি ক', f'{TAG} ছবি খ']):
            ed.get_by_role('button', name='সম্পাদনা: ক্যাপশন ছাড়া ছবি').first.click()
            dr = ed.get_by_role('dialog', name='ছবির তথ্য')
            dr.get_by_label('ক্যাপশন').fill(cap); dr.get_by_label('অ্যালবাম').fill(f'{TAG} অ্যালবাম')
            dr.get_by_role('button', name='সংরক্ষণ', exact=True).click(); toast(ed, 'সংরক্ষণ হয়েছে')
            ed.wait_for_timeout(400)
        # reorder: খ before ক
        ed.get_by_role('button', name=f'আগে আনুন: {TAG} ছবি খ').click()
        ed.get_by_role('button', name='ক্রম সংরক্ষণ').click(); toast(ed, 'নতুন ক্রম সংরক্ষণ হয়েছে')
        shot(ed, 'editor-gallery')
        # editor cannot delete a published photo
        ed.get_by_role('button', name=re.compile('^সম্পাদনা: ')).first.click()
        dr = ed.get_by_role('dialog', name='ছবির তথ্য')
        first_pub = dr.get_by_text('প্রকাশিত ছবি মুছতে MP-র অনুমতি লাগে').is_visible() and dr.get_by_role('button', name='মুছুন').is_disabled()
        step('editor: a published photo cannot be deleted (explained)', first_pub)
        dr.get_by_role('button', name='বন্ধ করুন').click()
        # owner: bulk publish the two
        go(ow, 'gallery')
        ow.get_by_label(f'নির্বাচন: {TAG} ছবি ক').check(); ow.get_by_label(f'নির্বাচন: {TAG} ছবি খ').check()
        ow.locator('.ct-bulk').get_by_role('button', name='প্রকাশ করুন', exact=True).click(); toast(ow, 'ছবি প্রকাশ হয়েছে')
        pg = pub('/gallery?limit=100')['items']; caps = [x['caption'] for x in pg]
        ok = f'{TAG} ছবি ক' in caps and f'{TAG} ছবি খ' in caps and caps.index(f'{TAG} ছবি খ') < caps.index(f'{TAG} ছবি ক')
        step('owner: bulk publish; public gallery shows both in the new order', ok)
        albums = [a['name'] for a in (pub('/gallery/albums') or {}).get('items', [])]
        step('public: the new album is listed', f'{TAG} অ্যালবাম' in albums)
        ow.get_by_role('button', name='স্লাইডার প্রিভিউ').click()
        sl = ow.get_by_role('region', name=re.compile('গ্যালারি: পাবলিক সাইটে'))
        sl.focus(); ow.keyboard.press('ArrowRight')
        step('owner: preview slider opens and moves with the keyboard', sl.locator('.ct-count-pill').inner_text().startswith('২ /'))
        shot(ow, 'owner-gallery-slider', full=False)
        ow.keyboard.press('Escape')
        # owner deletes both
        for cap in (f'{TAG} ছবি ক', f'{TAG} ছবি খ'):
            ow.get_by_role('button', name=f'সম্পাদনা: {cap}').first.click()
            dr = ow.get_by_role('dialog', name='ছবির তথ্য')
            dr.get_by_role('button', name='মুছুন').click()
            ow.get_by_role('button', name='মুছে ফেলুন').click(); toast(ow, 'মুছে ফেলা হয়েছে')
            ow.wait_for_timeout(300)
        step('owner: both test photos deleted', not any(TAG in x['caption'] for x in all_items('/gallery')))

        # ================= 4. videos ==================
        go(ed, 'videos')
        ed.get_by_role('button', name='নতুন ভিডিও').click()
        dlg = ed.get_by_role('dialog', name='নতুন ভিডিও')
        dlg.get_by_role('textbox', name=re.compile('^YouTube লিংক')).fill('not a link')
        bad = dlg.get_by_text('এটি সঠিক YouTube লিংক নয়').is_visible()
        dlg.get_by_role('textbox', name=re.compile('^YouTube লিংক')).fill('https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=10s')
        prev = dlg.get_by_title('YouTube প্রিভিউ').get_attribute('src')
        step('editor: YouTube link is validated and previewed instantly (nocookie embed)', bad and prev == 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ')
        dlg.get_by_label('শিরোনাম', exact=False).first.fill(f'{TAG} YouTube ভিডিও')
        shot(ed, 'editor-video-youtube-dialog', full=False)
        dlg.get_by_role('button', name='খসড়া হিসেবে রাখুন').click(); toast(ed, 'ভিডিও যোগ হয়েছে')
        go(ow, 'videos')
        ow.get_by_role('button', name='নতুন ভিডিও').click()
        dlg = ow.get_by_role('dialog', name='নতুন ভিডিও')
        dlg.get_by_role('tab', name='ফাইল আপলোড').click()
        dlg.locator('input[aria-label="ভিডিও ফাইল"]').set_input_files(str(ROOT / 'apps/api/seed-assets/demo-hearing.webm'))
        dlg.get_by_label('আপলোড করা ভিডিওর প্রিভিউ').wait_for(timeout=60000)
        dlg.get_by_label('শিরোনাম', exact=False).first.fill(f'{TAG} আপলোড ভিডিও')
        shot(ow, 'owner-video-upload-dialog', full=False)
        dlg.get_by_role('button', name='যোগ ও প্রকাশ').click(); toast(ow, 'প্রকাশ হয়েছে')
        ow.wait_for_timeout(500)
        ow.get_by_role('button', name=f'প্রকাশ করুন: {TAG} YouTube ভিডিও', exact=True).click(); toast(ow, 'ভিডিও প্রকাশ হয়েছে')
        pv = pub('/videos?limit=100')['items']
        yt = next((v for v in pv if v['title'] == f'{TAG} YouTube ভিডিও'), None)
        up = next((v for v in pv if v['title'] == f'{TAG} আপলোড ভিডিও'), None)
        step('public: both videos listed (YouTube id + embed, upload with file URL)', yt and yt['youtubeId'] == 'aqz-KE-bpKQ' and up and up['kind'] == 'upload' and up['fileUrl'])
        if up and up['fileUrl']:
            s, hd, b = http('GET', up['fileUrl'], headers={'Range': 'bytes=0-1023'}, raw=True)
            s2, hd2, _ = http('GET', up['fileUrl'], raw=True)
            step('public: uploaded file is served (200) and seekable (206 Range, video/webm)', s2 == 200 and s == 206 and len(b) == 1024 and hd.get('Content-Type') == 'video/webm' and hd2.get('Accept-Ranges') == 'bytes')
        ow.get_by_role('button', name='স্লাইডার প্রিভিউ').click()
        sl = ow.get_by_role('region', name=re.compile('ভিডিও: পাবলিক সাইটে'))
        step('owner: video preview slider shows a player and the title', sl.locator('.ct-frame').count() == 1 and sl.locator('.ct-cap b').inner_text() != '')
        shot(ow, 'owner-video-slider', full=False)
        ow.keyboard.press('Escape')
        # the uploaded file cannot be deleted from the library while the video uses it
        media_id = next(m['id'] for m in all_items('/media') if m['id'] not in orig_media and m['kind'] == 'video')
        go(ow, 'media'); ow.get_by_role('tab', name=re.compile('ভিডিও')).click()
        ow.get_by_role('button', name='বিস্তারিত: demo-hearing.webm').first.click()
        dr = ow.get_by_role('dialog', name='ভিডিওর বিস্তারিত')
        dr.get_by_role('button', name='মুছুন').click(); ow.get_by_role('button', name='মুছে ফেলুন').click()
        dr.get_by_text('এখন মোছা যাবে না').wait_for()
        step('owner: media library refuses to delete a used video and says where', dr.get_by_role('link', name=f'ভিডিও: “{TAG} আপলোড ভিডিও”').is_visible())
        shot(ow, 'owner-media-in-use', full=False)
        dr.get_by_role('button', name='বন্ধ করুন').last.click()
        go(ow, 'videos')
        for t in (f'{TAG} YouTube ভিডিও', f'{TAG} আপলোড ভিডিও'):
            ow.get_by_role('button', name=f'মুছুন: {t}').click(); ow.get_by_role('button', name='মুছে ফেলুন').click(); toast(ow, 'ভিডিও মুছে ফেলা হয়েছে'); ow.wait_for_timeout(300)
        go(ow, 'media'); ow.get_by_role('tab', name=re.compile('ভিডিও')).click()
        ow.get_by_role('button', name='বিস্তারিত: demo-hearing.webm').first.click()
        ids_before = {m['id'] for m in all_items('/media')}
        # the newest file is listed first; delete it now that nothing uses it
        dr = ow.get_by_role('dialog', name='ভিডিওর বিস্তারিত')
        is_new = media_id in dr.locator('#ct-media-url').input_value()
        dr.get_by_role('button', name='মুছুন').click(); ow.get_by_role('button', name='মুছে ফেলুন').click(); toast(ow, 'মুছে ফেলা হয়েছে')
        step('owner: videos deleted, then the uploaded file deleted from the media library', is_new and media_id not in {m['id'] for m in all_items('/media')} and not any(TAG in v['title'] for v in all_items('/videos')))

        # ================= 5. events ==================
        go(ed, 'events')
        ed.get_by_role('button', name='নতুন কর্মসূচি').click()
        dlg = ed.get_by_role('dialog', name='নতুন কর্মসূচি')
        day = time.strftime('%Y-%m-%d', time.gmtime(time.time() + 6 * 3600 + 3 * 86400))
        dlg.get_by_label('শিরোনাম', exact=False).fill(f'{TAG} উঠান বৈঠক')
        dlg.get_by_label('তারিখ', exact=False).fill(day)
        dlg.get_by_label('সময়').fill('বিকেল ৪টা'); dlg.get_by_label('স্থান').fill('চরকান্দি বাজার')
        dlg.get_by_role('button', name='খসড়া হিসেবে রাখুন').click(); toast(ed, 'সংরক্ষণ হয়েছে')
        step('editor: event created as draft, not public', not any(e['title'] == f'{TAG} উঠান বৈঠক' for e in pub('/events?limit=50')['items']))
        shot(ed, 'editor-events')
        go(ow, 'events')
        ow.get_by_role('button', name=f'প্রকাশ করুন: {TAG} উঠান বৈঠক', exact=True).click(); toast(ow, 'কর্মসূচি প্রকাশ হয়েছে')
        ev = next((e for e in pub('/events?limit=50')['items'] if e['title'] == f'{TAG} উঠান বৈঠক'), None)
        step('owner: event published and listed on the public API with the right day', ev and ev['date'][:10] == day)
        ow.get_by_role('button', name=f'মুছুন: {TAG} উঠান বৈঠক').click(); ow.get_by_role('button', name='মুছে ফেলুন').click(); toast(ow, 'কর্মসূচি মুছে ফেলা হয়েছে')
        step('owner: event deleted', not any(TAG in e['title'] for e in all_items('/events')))

        # ================= 6. banners ==================
        go(ow, 'site')
        n_ban = len(orig_site['banners'])
        ow.get_by_role('button', name='ব্যানার যোগ করুন').click()
        ow.set_input_files('input[aria-label="ছবির ফাইল"]', pngs[0])
        ow.get_by_role('button', name=re.compile(r'ব্যানার \S+ এর ছবি বদলান')).last.wait_for(timeout=30000)
        g = ow.get_by_role('group', name=re.compile(r'^ব্যানার ')).last
        g.get_by_label('শিরোনাম', exact=True).fill(f'{TAG} ব্যানার'); g.get_by_label('ছবির ক্যাপশন / ক্রেডিট').fill('পরীক্ষার ছবি')
        g.get_by_role('button', name=re.compile('ওপরে সরান')).click()
        ow.get_by_role('button', name='সংরক্ষণ ও প্রকাশ').click(); toast(ow, 'পাবলিক সাইটে এখন দেখা যাচ্ছে')
        bs = pub('/site')
        titles = [b.get('title') for b in (bs or {}).get('banners', [])] if bs else []
        step('owner: banner image uploaded, moved up one, live on the public site', len(titles) == n_ban + 1 and titles[-2] == f'{TAG} ব্যানার', str(titles[-3:]))
        shot(ow, 'owner-banners')

        # ================= 7. layout: every new screen at 1440 and 390 px ==================
        screens = ['site-pages', 'site-pages/home', 'site-pages/profile', 'site-pages/heroes', 'site-pages/area', 'site-pages/contact', 'site-pages/complaint', 'site-pages/layout', 'gallery', 'videos', 'events', 'media', 'site', 'settings']
        # (re-uses the two logged-in sessions: fewer logins, the auth rate limit is per IP)
        for width in (1440, 390):
            ow.set_viewport_size({'width': width, 'height': 860})
            bad = []
            for s in screens:
                go(ow, s); ow.wait_for_timeout(500)
                if not no_hscroll(ow): bad.append(s)
                if width == 390: shot(ow, f'owner-390-{s.replace("/", "_")}', full=False)
            step(f'layout: no horizontal scroll on {len(screens)} screens at {width}px', not bad, str(bad))
        ed.set_viewport_size({'width': 390, 'height': 860})
        bad = []
        for s in ['site-pages', 'site-pages/profile', 'gallery', 'videos', 'events', 'media']:
            go(ed, s); ed.wait_for_timeout(400)
            if not no_hscroll(ed): bad.append(s)
        hrefs = ed.evaluate("[...document.querySelectorAll('nav a')].map(a => a.getAttribute('href'))")
        step('editor at 390px: no horizontal scroll; banners/settings are not in the editor nav', not bad and not any(h and (h.endswith('/site') or h.endswith('/settings')) for h in hrefs), str(bad))
        step('no console errors on any screen', not console_errors, '\n  '.join(console_errors[:10]))
    except Exception as e:
        step('unexpected error', False, repr(e)[:500])
        try:
            for pgx in (locals().get('ow'), locals().get('ed')):
                if pgx: shot(pgx, f'failure-{int(time.time())}', full=False)
        except Exception: pass
    finally:
        restore()
        browser.close()

fails = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(fails)}/{len(results)} passed. Screenshots: {SHOTS}')
sys.exit(1 if fails else 0)
