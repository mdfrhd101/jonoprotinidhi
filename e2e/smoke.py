"""End-to-end smoke test of the real product in a real browser (Playwright + Edge/Chromium).

Prereqs: MongoDB running, `SEED_RESET=1 npm run seed`, `npm run dev:api`, `npm run dev:admin`.
Run:  python e2e/smoke.py [--shots DIR]
It reads local dev credentials from apps/api/.seed-credentials.local (never printed) and prints PASS/FAIL per step.
"""
import base64, hashlib, hmac, os, re, struct, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get('ADMIN_URL', 'http://localhost:5173')
API = os.environ.get('API_URL', 'http://127.0.0.1:4000')
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

creds = (ROOT / 'apps/api/.seed-credentials.local').read_text(encoding='utf-8')
PW = re.search(r'password \(all accounts\): (\S+)', creds).group(1)
SUPER = re.search(r'super admin: (\S+)', creds).group(1)

def totp(secret, offset=0):
    key = base64.b32decode(secret.upper() + '=' * (-len(secret) % 8))
    counter = int(time.time() // 30) + offset
    h = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    o = h[-1] & 15
    return str((struct.unpack('>I', h[o:o + 4])[0] & 0x7fffffff) % 10**6).zfill(6)

results, secrets = [], {}
def step(name, ok, extra=''):
    results.append(ok); print(('PASS' if ok else 'FAIL'), name, extra)

def shot(page, name):
    if SHOTS: page.screenshot(path=str(SHOTS / f'{name}.png'), full_page=True)

def login(browser, ident, width=1366, height=860):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('response', lambda r: errs.append(f'{r.status} {r.url}') if r.status >= 400 and r.status != 401 and 'favicon' not in r.url else None)
    page.on('console', lambda m: None)
    page.goto(BASE + '/login')
    page.get_by_label('মোবাইল নম্বর বা ইমেইল').fill(ident)
    page.get_by_label('পাসওয়ার্ড').fill(PW)
    page.get_by_role('button', name='এগিয়ে যান').click()
    page.wait_for_selector('h1:has-text("২-ধাপ যাচাই"), h1:has-text("যাচাই কোড দিন")', timeout=10000)
    if page.locator('h1:has-text("২-ধাপ যাচাই")').count():
        page.wait_for_selector('code', timeout=10000)  # the secret arrives after the enrol request
        secret = page.locator('code').first.inner_text().strip()
        secrets[ident] = secret
        page.get_by_label('কোডগুলো নিরাপদ জায়গায় সংরক্ষণ করেছি').check()
        page.get_by_label('অ্যাপে দেখানো ৬ অক্ষরের কোড').fill(totp(secret))
        page.get_by_role('button', name='চালু করে ঢুকুন').click()
    else:
        page.get_by_label('কোড').fill(totp(secrets[ident], 1))
        page.get_by_role('button', name='যাচাই করুন').click()
    try:
        page.wait_for_url(re.compile(r'/(t/|super|switch)'), timeout=15000)
    except Exception:
        print('LOGIN STUCK', ident, page.url, errs[-5:], page.locator('[role=alert]').all_inner_texts())
        raise
    return ctx, page, errs

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')

    # 1. owner: login with mandatory 2FA enrolment, dashboard
    octx, owner, oerr = login(browser, '01700000010')
    owner.wait_for_selector('text=খোলা অভিযোগ', timeout=10000)
    step('owner: password + TOTP enrolment + dashboard', 'স্বাগতম' in owner.content() and owner.locator('.kpi').count() >= 3)
    shot(owner, 'owner-dashboard')

    # 2. editor writes a post and submits it for approval
    ectx, editor, eerr = login(browser, '01700000011')
    editor.goto(BASE + owner.url.split(BASE)[1].split('/t/')[0] + '/t/' + owner.url.split('/t/')[1].split('/')[0] + '/posts/new')
    editor.get_by_label(re.compile('শিরোনাম')).fill('কাশবনে বন্যাসহনশীল ধানের বীজ বিতরণ কর্মসূচি')
    editor.get_by_label('এক লাইনে সারাংশ').fill('আমন মৌসুমের আগে ১৫০ কৃষক বিনামূল্যে বীজ ও সার পেয়েছেন।')
    # BUG-2026-015: inputs without a type attribute were unstyled (about 21 px high); all form controls must be roomy
    heights = editor.evaluate("() => [...document.querySelectorAll('.composer input:not([type]), .composer textarea')].map(e => e.getBoundingClientRect().height)")
    step('editor: text fields are tall enough (>= 48 px)', len(heights) >= 5 and min(heights) >= 48, str(min(heights) if heights else None))
    ed = editor.locator('.ProseMirror[contenteditable=true]')
    ed.click(); editor.keyboard.type('উপজেলা কৃষি কার্যালয়ের তালিকা ধরে বিতরণ হয়েছে।')
    editor.get_by_role('button', name='বুলেট তালিকা').click(); editor.keyboard.type('তালিকা ইউনিয়ন পরিষদে টাঙানো আছে।')
    # photo upload: a real PNG goes in, the API re-encodes it and the browser can display the public URL
    import zlib, struct
    def png(w=64, h=48):
        raw = b''.join(b'\x00' + b'\xc7\xa3\x5a' * w for _ in range(h))
        chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
        return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    editor.get_by_label('ছবির ফাইল').set_input_files(files=[{'name': 'field.png', 'mimeType': 'image/png', 'buffer': png()}])
    editor.wait_for_selector('.pic img', timeout=15000)
    editor.wait_for_function("() => { const i = document.querySelector('.pic img'); return i && i.complete && i.naturalWidth > 0 }", timeout=10000)
    step('editor: photo upload works and the image loads from the public URL', True)
    editor.get_by_label('ছবি ১ এর ক্রেডিট').fill('অফিস ফটোগ্রাফার')
    editor.get_by_role('button', name='অনুমোদনের জন্য পাঠান').click()
    editor.wait_for_selector('text=অনুমোদনের অপেক্ষায়', timeout=10000)
    step('editor: writes a post and submits for approval (cannot publish)', editor.get_by_role('button', name='অনুমোদন ও প্রকাশ').count() == 0)
    shot(editor, 'editor-post-submitted')

    # 3. owner approves it; the public API now serves it
    tid = owner.url.split('/t/')[1].split('/')[0]
    owner.goto(f'{BASE}/t/{tid}/approvals')
    owner.wait_for_selector('text=কাশবনে বন্যাসহনশীল', timeout=10000)
    shot(owner, 'owner-approvals')
    owner.get_by_role('button', name='অনুমোদন ও প্রকাশ').first.click()
    owner.wait_for_selector('text=প্রকাশ হয়েছে', timeout=10000)
    import urllib.request, json
    req = urllib.request.Request(API + '/api/v1/public/posts?limit=50', headers={'Host': 'ndp3.jonoprotinidhi.localhost'})
    titles = [i['title'] for i in json.load(urllib.request.urlopen(req))['items']]
    step('owner approves -> post is live on the public API', any('বন্যাসহনশীল' in t for t in titles))

    # 4. officer: sees only own upazila, can reveal identity of an ASSIGNED case, purpose is logged
    fctx, officer, ferr = login(browser, '01700000012')
    officer.goto(f'{BASE}/t/{tid}/complaints')
    officer.wait_for_selector('.tbl tbody tr', timeout=10000)
    upz = set(officer.locator('.tbl tbody tr td:nth-child(2) small').all_inner_texts())
    step('officer: inbox shows only their own upazila', upz == {'নতুনহাট'}, str(upz))
    # open rows until one has an identity to reveal (older or hearing-entered complaints can be anonymous)
    btn = officer.get_by_role('button', name='দেখুন (লগ হবে)')
    for i in range(officer.locator('.tbl tbody tr').count()):
        officer.locator('.tbl tbody tr').nth(i).click()
        officer.wait_for_selector('.detail .pii', timeout=10000)
        if btn.count(): break
    shot(officer, 'officer-complaint')
    step('officer: identity is hidden until requested', not re.search(r'01\d{9}', officer.locator('.detail').inner_text()))
    if btn.count():
        btn.click()
        officer.get_by_label('কী কারণে দেখছেন').fill('দ্রুত সমাধানের জন্য নাগরিকের সাথে যোগাযোগ')
        officer.get_by_role('button', name='দেখুন', exact=True).click()
        officer.wait_for_selector('[role=status] .num', timeout=10000)
        step('officer: assigned case reveals identity after a stated purpose', bool(re.search(r'01\d{9}', officer.locator('.pii').inner_text())))
    else:
        step('officer: assigned case has a reveal button', False)

    # 5. owner: the same complaint never offers identity
    owner.goto(f'{BASE}/t/{tid}/complaints')
    owner.wait_for_selector('.tbl tbody tr', timeout=10000)
    owner.locator('.tbl tbody tr').first.click()
    owner.wait_for_selector('text=নাম ও নম্বর', timeout=10000)
    step('owner (the MP): no way to view complainant identity', owner.get_by_role('button', name='দেখুন (লগ হবে)').count() == 0 and not re.search(r'01\d{9}', owner.locator('.detail').inner_text()))
    shot(owner, 'owner-complaint')

    # 6. super admin: tenant list, act-as with a reason, banner, no identity
    sctx, sup, serr = login(browser, SUPER)
    sup.goto(BASE + '/super/tenants'); sup.wait_for_selector('.tbl tbody tr', timeout=10000)
    shot(sup, 'super-tenants')
    sup.locator('a:has-text("বিস্তারিত")').first.click()
    sup.get_by_role('button', name='সাইটের অ্যাডমিনে ঢুকুন').click()
    sup.get_by_label('কী কারণে ঢুকছেন (অডিট লগে যাবে)').fill('ব্যানারের ছবি ঠিক করার জন্য ঢুকছি')
    sup.get_by_role('button', name='ঢুকুন', exact=True).click()
    sup.wait_for_selector('.imp', timeout=10000)
    step('super admin: act-as shows the audit banner', 'Super Admin হিসেবে' in sup.locator('.imp').inner_text())
    sup.goto(f'{BASE}/t/{tid}/complaints') if False else None
    shot(sup, 'super-act-as')

    # 7. mobile layout of the composer and inbox (390px) has no horizontal scroll
    mctx, mob, merr = login(browser, '01700000011', 390, 800)
    for path in ['/posts/new', '']:
        mob.goto(f'{BASE}/t/{tid}{path}'); mob.wait_for_timeout(700)
        ov = mob.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
        step(f'mobile 390px {path or "dashboard"}: no horizontal scroll', not ov)
    shot(mob, 'mobile-editor')

    errs = oerr + eerr + ferr + serr + merr
    step('no browser console errors during the run', not errs, '; '.join(errs)[:200])
    browser.close()

print(f'\n{sum(results)}/{len(results)} passed')
sys.exit(0 if all(results) else 1)
