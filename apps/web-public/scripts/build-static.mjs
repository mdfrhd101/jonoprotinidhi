/* Static export of the public site for GitHub Pages (docs/11-DEPLOY-GITHUB-PAGES.md).
     API_URL=https://jonoprotinidhi-api.onrender.com TENANT_HOST=jonoprotinidhi-api.onrender.com \
     TURNSTILE_SITE_KEY=<public site key> npm run build:static -w @jonoprotinidhi/web-public
   1. wakes the API (a free-tier service sleeps; the first request can take about a minute),
   2. runs `next build` with STATIC_EXPORT=1 (data is fetched from the public API at build time, only public GETs, no secrets),
   3. checks the result: pages exist, every page says noindex, the CMS footer disclaimer is there.
   The output is apps/web-public/out/ (git-ignored): an artifact to upload, never to commit. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiUrl = (process.env.API_URL || '').replace(/\/+$/, '');
const tenantHost = process.env.TENANT_HOST || '';
if (!apiUrl || !tenantHost) { console.error('build-static: set API_URL and TENANT_HOST'); process.exit(1); }

const WAKE_TOTAL_MS = 180_000, WAKE_EVERY_MS = 5_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wakeApi() {
  const t0 = Date.now();
  for (let n = 1; ; n++) {
    try {
      const r = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(30_000) });
      if (r.ok) { console.log(`API is up after ${Math.round((Date.now() - t0) / 1000)} s`); return; }
      console.log(`API answered ${r.status} (attempt ${n})`);
    } catch (e) { console.log(`API not reachable yet (attempt ${n}): ${e.name}`); }
    if (Date.now() - t0 > WAKE_TOTAL_MS) { console.error(`build-static: API did not wake within ${WAKE_TOTAL_MS / 1000} s`); process.exit(1); }
    await sleep(WAKE_EVERY_MS);
  }
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}

function verify() {
  const out = join(root, 'out');
  const problems = [];
  const need = ['index.html', '404.html', ...['about', 'biography', 'activities', 'promises', 'area', 'gallery', 'videos', 'complaint', 'contact'].map((p) => `${p}/index.html`)];
  for (const f of need) if (!existsSync(join(out, f))) problems.push(`missing ${f}`);
  const pages = htmlFiles(out);
  if (!pages.some((f) => /activities[\\/][^\\/]+[\\/]index\.html$/.test(f))) problems.push('no activities/<slug>/index.html');
  for (const f of pages) if (!readFileSync(f, 'utf8').includes('<meta name="robots" content="noindex, nofollow"/>')) problems.push(`no noindex meta in ${f.slice(out.length + 1)}`);
  // The footer disclaimer (copyright / footerNote of the CMS layout page) must stay on a public site of a real politician.
  // An API error never gets this far: a failed read fails the build (src/lib/api.ts), so a missing note means the CMS has none.
  if (existsSync(join(out, 'index.html')) && !readFileSync(join(out, 'index.html'), 'utf8').includes('class="foot-note"')) problems.push('no footer disclaimer (CMS layout page: copyright / footerNote) in index.html');
  if (problems.length) { console.error('build-static: verification failed\n- ' + problems.join('\n- ')); process.exit(1); }
  console.log(`verified ${pages.length} pages: noindex on every page, footer disclaimer present`);
}

await wakeApi();
rmSync(join(root, 'out'), { recursive: true, force: true });
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const build = spawnSync(process.execPath, [next, 'build'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, STATIC_EXPORT: '1', NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN || apiUrl, NEXT_TELEMETRY_DISABLED: '1' },
});
if (build.status !== 0) process.exit(build.status ?? 1);
verify();
