#!/usr/bin/env node
/* Copy the local demo database (collections, documents, indexes) to a hosted MongoDB such as Atlas free M0.
   Uses the `mongodb` driver already in node_modules (no mongodump/mongorestore needed). Run it from the repo root with Node 24.

     node scripts/deploy/copy-db.mjs "<targetMongoUri>" [options]
     COPY_DB_TARGET_URI="<targetMongoUri>" node scripts/deploy/copy-db.mjs [options]      (keeps the URI out of `ps`)

   The target URI MUST name the database ("...mongodb.net/jonoprotinidhi?retryWrites=true&w=majority"): there is no default,
   so nothing can land in the driver's implicit "test" database by accident.

   Options
     --source <uri>        default mongodb://127.0.0.1:27017/jonoprotinidhi_dev
     --force               the target already holds documents: drop the collections that are about to be copied first
                           (collections that are not part of the copy are left alone). Without it the run is refused.
     --exclude a,b         do not copy these collections (e.g. smslogs,auditlogs,complaints,complaintevents)
     --bind-host <host>    after copying, register <host> as a platform Domain of --tenant in the TARGET database. On Render
                           the public site reaches the API by its own onrender.com host, and the API picks the tenant from
                           the Host header, so that host must be a Domain of the demo tenant (docs/10-DEPLOY-RENDER.md).
     --tenant <slug>       tenant for --bind-host, default tarique-rahman
     --dry-run             connect and report what would happen; write nothing
     --bind-only           copy nothing: only register --bind-host in the target (use it when Render gave the API a different
                           host name than planned, so the full copy need not be redone; needs --bind-host)

   Secrets: the URI (it carries the database password) is never printed. Error text is scrubbed of it before it is shown.
   The source database is only ever read. */
import { MongoClient, BSON } from 'mongodb';

const DEFAULT_SOURCE = 'mongodb://127.0.0.1:27017/jonoprotinidhi_dev';
const BATCH_DOCS = 500;
const BATCH_BYTES = 8 * 1024 * 1024;

/* ---------- argument parsing ---------- */
function parseArgs(argv) {
  const o = { target: process.env.COPY_DB_TARGET_URI || '', source: DEFAULT_SOURCE, force: false, exclude: [], bindHost: '', tenant: 'tarique-rahman', dryRun: false, bindOnly: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) fail(`${a} needs a value`); return v; };
    if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--bind-only') o.bindOnly = true;
    else if (a === '--source') o.source = val();
    else if (a === '--exclude') o.exclude = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--bind-host') o.bindHost = val().trim().toLowerCase();
    else if (a === '--tenant') o.tenant = val().trim();
    else if (a === '-h' || a === '--help') { console.log('usage: node scripts/deploy/copy-db.mjs "<targetMongoUri>" [--force] [--exclude a,b] [--bind-host <host>] [--tenant <slug>] [--source <uri>] [--dry-run] [--bind-only]'); process.exit(0); }
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else pos.push(a);
  }
  if (pos.length > 1) fail('expected one target URI; quote it, it contains characters the shell would split on');
  if (pos[0]) o.target = pos[0];
  if (!o.target) fail('missing target URI (argument 1 or COPY_DB_TARGET_URI)');
  return o;
}

function fail(msg) { console.error(`error: ${msg}`); process.exit(2); }

/* ---------- URI helpers (never print the URI) ---------- */
function describeUri(uri) {
  const m = /^mongodb(?:\+srv)?:\/\/([^/?]*)(?:\/([^?]*))?/.exec(uri);
  if (!m) return null;
  const authority = m[1];
  const at = authority.lastIndexOf('@');
  const userinfo = at >= 0 ? authority.slice(0, at) : '';
  const hosts = (at >= 0 ? authority.slice(at + 1) : authority).toLowerCase();
  const colon = userinfo.indexOf(':');
  const password = colon >= 0 ? userinfo.slice(colon + 1) : '';
  let db = '';
  try { db = decodeURIComponent(m[2] ?? ''); } catch { db = m[2] ?? ''; }
  let passwordDecoded = password;
  try { passwordDecoded = decodeURIComponent(password); } catch { /* keep raw */ }
  return { hosts, db, secrets: [password, passwordDecoded].filter((s) => s.length >= 3) };
}

let SECRETS = [];
/** Removes the URIs, any connection string and the password from text that is about to be shown. */
function scrub(text) {
  let t = String(text);
  for (const s of SECRETS) t = t.split(s).join('<redacted>');
  return t.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://<redacted>');
}
const errText = (e) => `${e?.name ?? 'Error'}: ${scrub(e?.message ?? e)}`;

/* ---------- copy ---------- */
const HOST_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const isSystem = (name) => name.startsWith('system.');
const num = (x) => (typeof x === 'number' ? x : typeof x?.toNumber === 'function' ? x.toNumber() : Number(x));

async function targetNonEmpty(tdb, names) {
  const out = [];
  for (const n of names) if ((await tdb.collection(n).countDocuments({}, { limit: 1 })) > 0) out.push(n);
  return out;
}

async function copyDocuments(src, dst) {
  let batch = [], bytes = 0, total = 0;
  const flush = async () => { if (batch.length) { await dst.insertMany(batch, { ordered: true, bypassDocumentValidation: true }); total += batch.length; batch = []; bytes = 0; } };
  for await (const doc of src.find({})) {
    batch.push(doc); bytes += BSON.calculateObjectSize(doc);
    if (batch.length >= BATCH_DOCS || bytes >= BATCH_BYTES) await flush();
  }
  await flush();
  return total;
}

async function copyIndexes(src, dst, label, problems) {
  for (const idx of await src.indexes()) {
    if (idx.name === '_id_') continue;
    const { v, ns, key, name, ...rest } = idx; // v/ns are server-assigned
    try { await dst.createIndex(key, { name, ...rest }); }
    catch (e) { problems.push(`index ${label}.${name}: ${errText(e)}`); }
  }
}

async function bindHost(tdb, host, slug) {
  const tenant = await tdb.collection('tenants').findOne({ slug }, { projection: { _id: 1 } });
  if (!tenant) throw new Error(`no tenant with slug "${slug}" in the target database`);
  const existing = await tdb.collection('domains').findOne({ host });
  if (existing) {
    if (String(existing.tenantId) !== String(tenant._id)) throw new Error(`host ${host} is already a domain of a different tenant; not changing it`);
    return 'already bound';
  }
  const now = new Date();
  await tdb.collection('domains').insertOne({ tenantId: tenant._id, host, type: 'platform', primary: false, dnsStatus: 'active', sslStatus: 'active', createdAt: now, updatedAt: now, __v: 0 });
  return 'bound';
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const t = describeUri(o.target), s = describeUri(o.source);
  if (!t) fail('the target is not a mongodb:// or mongodb+srv:// URI');
  if (!s) fail('the --source is not a mongodb:// or mongodb+srv:// URI');
  SECRETS = [...t.secrets, ...s.secrets, o.target, o.source];
  if (!t.db) fail('the target URI has no database name (…/<dbname>?…). Refusing to guess one.');
  if (!s.db) fail('the source URI has no database name');
  if (['admin', 'local', 'config'].includes(t.db)) fail(`refusing to write into the "${t.db}" system database`);
  if (t.hosts === s.hosts && t.db === s.db) fail('source and target are the same database');
  if (o.bindOnly && !o.bindHost) fail('--bind-only needs --bind-host <host>');
  if (o.bindHost && !HOST_RE.test(o.bindHost)) fail(`--bind-host "${o.bindHost}" is not a valid host name (give the bare host, e.g. my-api.onrender.com)`);

  if (o.bindOnly) {
    const target = new MongoClient(o.target, { serverSelectionTimeoutMS: 30_000 });
    try {
      await target.connect();
      console.log(`target database: ${t.db}`);
      if (o.dryRun) { console.log(`dry run: would bind ${o.bindHost} -> ${o.tenant}`); return; }
      console.log(`bind-host ${o.bindHost} -> tenant ${o.tenant}: ${await bindHost(target.db(t.db), o.bindHost, o.tenant)}`);
    } catch (e) { console.error(`error: ${errText(e)}`); process.exitCode = 1; }
    finally { await target.close().catch(() => {}); }
    return;
  }

  const source = new MongoClient(o.source, { serverSelectionTimeoutMS: 8_000, promoteValues: false }); // promoteValues:false = exact BSON types (Int32/Double/Long stay what they were)
  const target = new MongoClient(o.target, { serverSelectionTimeoutMS: 30_000 });
  try {
    try { await source.connect(); await source.db(s.db).command({ ping: 1 }); } catch (e) { console.error(`error: cannot reach the source database: ${errText(e)}`); process.exitCode = 1; return; }
    try { await target.connect(); await target.db(t.db).command({ ping: 1 }); } catch (e) { console.error(`error: cannot reach the target database (check the URI, the user/password and Atlas Network Access 0.0.0.0/0): ${errText(e)}`); process.exitCode = 1; return; }
    const sdb = source.db(s.db), tdb = target.db(t.db);

    const all = await sdb.listCollections({}, { nameOnly: false }).toArray();
    const skipped = [];
    const cols = all.filter((c) => {
      if (isSystem(c.name)) return false;
      if (c.type && c.type !== 'collection') { skipped.push(`${c.name} (${c.type})`); return false; }
      if (o.exclude.includes(c.name)) { skipped.push(`${c.name} (excluded)`); return false; }
      return true;
    });
    for (const x of o.exclude) if (!all.some((c) => c.name === x)) console.warn(`warning: --exclude ${x}: no such collection in the source`);
    if (!cols.length) { console.error('error: the source database has no collections to copy'); process.exitCode = 1; return; }

    const present = (await tdb.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !isSystem(n));
    const nonEmpty = await targetNonEmpty(tdb, present);
    console.log(`source database: ${s.db} (${cols.length} collections to copy${skipped.length ? `, skipped: ${skipped.join(', ')}` : ''})`);
    console.log(`target database: ${t.db} (${present.length} collections present, ${nonEmpty.length} with documents)`);
    if (nonEmpty.length && !o.force) {
      console.error(`refused: the target database is not empty (documents in: ${nonEmpty.join(', ')}).\nRe-run with --force to replace those collections, or point at an empty database.`);
      process.exitCode = 3; return;
    }
    const clash = present.filter((n) => cols.some((c) => c.name === n));
    const untouched = present.filter((n) => !clash.includes(n));
    if (o.dryRun) { console.log(`dry run: would drop ${clash.length} existing collection(s) of the same name and copy ${cols.length}.${untouched.length ? ` Left alone: ${untouched.join(', ')}.` : ''}${o.bindHost ? ` Would bind ${o.bindHost} -> ${o.tenant}.` : ''}`); return; }

    for (const n of clash) await tdb.collection(n).drop(); // empty, or --force: replaced wholesale
    if (clash.length) console.log(`dropped ${clash.length} existing collection(s) in the target: ${clash.join(', ')}`);
    if (untouched.length) console.log(`note: target collections not part of this copy were left untouched: ${untouched.join(', ')}`);

    const problems = [];
    const report = [];
    for (const c of cols) {
      const src = sdb.collection(c.name);
      const opts = c.options && Object.keys(c.options).length ? c.options : undefined;
      if (opts) await tdb.createCollection(c.name, opts);
      const dst = tdb.collection(c.name);
      const copied = await copyDocuments(src, dst);
      await copyIndexes(src, dst, c.name, problems);
      // the source client runs with promoteValues:false, so its counts come back as BSON Int32/Long: convert before comparing
      const [nSrc, nDst, iSrc, iDst] = [num(await src.countDocuments({})), num(await dst.countDocuments({})), (await src.indexes()).length, (await dst.indexes()).length];
      const ok = nSrc === nDst && nDst === copied && iSrc === iDst;
      if (!ok) problems.push(`${c.name}: source ${nSrc} docs / ${iSrc} indexes, target ${nDst} docs / ${iDst} indexes (inserted ${copied})`);
      report.push({ collection: c.name, docs: nDst, indexes: `${iDst}/${iSrc}`, ok: ok ? 'ok' : 'MISMATCH' });
    }
    console.table(report);

    if (o.bindHost) {
      try { console.log(`bind-host ${o.bindHost} -> tenant ${o.tenant}: ${await bindHost(tdb, o.bindHost, o.tenant)}`); }
      catch (e) { problems.push(`bind-host: ${scrub(e?.message ?? e)}`); }
    }

    if (problems.length) { console.error(`\nFINISHED WITH PROBLEMS:\n- ${problems.join('\n- ')}`); process.exitCode = 1; }
    else console.log(`\ndone: ${cols.length} collections, ${report.reduce((a, r) => a + r.docs, 0)} documents copied and verified (counts + index counts).`);
  } catch (e) {
    console.error(`error: ${errText(e)}`);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([source.close(), target.close()]);
  }
}

main().catch((e) => { console.error(`error: ${errText(e)}`); process.exit(1); });
