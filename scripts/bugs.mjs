#!/usr/bin/env node
/* Jonoshetu bug tracker: register.json is the source of truth, BUGS.md is generated.
   Formula, lifecycle and rules are documented in bugs/README.md.

   usage:
     node scripts/bugs.mjs add --title "..." --sev 1-5 --occ 1-5 --det 1-5 --cat <cat> --module <path> --found <phase> --desc "..." [--repro "..."] [--req FR-..] [--by name]
     node scripts/bugs.mjs status <BUG-ID> <status> [--fix "what changed"] [--test path/to/test] [--waive "reason (sev<=2 only)"]
     node scripts/bugs.mjs list [--open] [--prio P0]
     node scripts/bugs.mjs show <BUG-ID>
     node scripts/bugs.mjs report            regenerate bugs/BUGS.md
     node scripts/bugs.mjs check [--gate]    validate register; --gate also fails when any P0/P1 is open (release gate)
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(ROOT, 'bugs', 'register.json');
const MD = path.join(ROOT, 'bugs', 'BUGS.md');

export const CATEGORIES = ['security', 'privacy', 'tenant-isolation', 'data-integrity', 'functional', 'validation', 'ui', 'performance', 'reliability', 'test-infra', 'docs'];
export const PHASES = ['dev', 'unit-test', 'integration-test', 'e2e-test', 'review', 'staging', 'production'];
export const STATUSES = ['new', 'triaged', 'in_progress', 'fixed', 'verified', 'closed', 'wontfix', 'duplicate', 'needs_info'];
const OPEN = new Set(['new', 'triaged', 'in_progress', 'needs_info']);
const FLOW = {
  new: ['triaged', 'in_progress', 'fixed', 'wontfix', 'duplicate', 'needs_info'],
  triaged: ['in_progress', 'fixed', 'wontfix', 'duplicate', 'needs_info'],
  in_progress: ['fixed', 'triaged', 'wontfix', 'needs_info'],
  needs_info: ['triaged', 'in_progress', 'wontfix', 'duplicate'],
  fixed: ['verified', 'in_progress'],
  verified: ['closed', 'in_progress'],
  closed: ['in_progress'],
  wontfix: ['triaged'],
  duplicate: [],
};
const SEC_CATS = new Set(['security', 'privacy', 'tenant-isolation']);

/* ---------- the formula ---------- */
/** RPN = Severity x Occurrence x Detectability (1..125), FMEA-style. */
export const rpn = (b) => b.severity * b.occurrence * b.detectability;
/**
 * Priority:
 *  P0  RPN >= 60, OR severity 5 (data leak, auth bypass, data loss, cross-tenant exposure)
 *  P1  RPN 30-59, OR (severity >= 4 AND category is security/privacy/tenant-isolation)
 *  P2  RPN 12-29
 *  P3  RPN < 12
 */
export function priority(b) {
  const r = rpn(b);
  if (r >= 60 || b.severity === 5) return 'P0';
  if (r >= 30 || (b.severity >= 4 && SEC_CATS.has(b.category))) return 'P1';
  if (r >= 12) return 'P2';
  return 'P3';
}
export const SLA = { P0: 'fix same day; blocks release', P1: 'fix within 3 working days; blocks release', P2: 'fix within the current milestone', P3: 'backlog; fix opportunistically' };

/* ---------- storage ---------- */
export function load() {
  if (!fs.existsSync(REG)) return { counters: {}, bugs: [] };
  return JSON.parse(fs.readFileSync(REG, 'utf8'));
}
function save(db) {
  fs.mkdirSync(path.dirname(REG), { recursive: true });
  fs.writeFileSync(REG, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.writeFileSync(MD, renderMd(db), 'utf8');
}
const today = () => new Date().toISOString().slice(0, 10);

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true; else { out[k] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

/* ---------- regression-test lookup ---------- */
function testFiles(dir = ROOT, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'coverage'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) testFiles(p, acc);
    else if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
export function testsReferencing(id, files = testFiles()) {
  return files.filter((f) => fs.readFileSync(f, 'utf8').includes(id)).map((f) => path.relative(ROOT, f).replace(/\\/g, '/'));
}

/* ---------- validation ---------- */
export function validate(db, { gate = false } = {}) {
  const errors = [], warnings = [];
  const ids = new Set();
  for (const b of db.bugs) {
    const at = b.id ?? '(no id)';
    if (!/^BUG-\d{4}-\d{3}$/.test(b.id ?? '')) errors.push(`${at}: bad id format`);
    if (ids.has(b.id)) errors.push(`${at}: duplicate id`);
    ids.add(b.id);
    for (const k of ['severity', 'occurrence', 'detectability']) if (!Number.isInteger(b[k]) || b[k] < 1 || b[k] > 5) errors.push(`${at}: ${k} must be an integer 1-5`);
    if (!CATEGORIES.includes(b.category)) errors.push(`${at}: unknown category "${b.category}"`);
    if (!PHASES.includes(b.foundIn)) errors.push(`${at}: unknown foundIn "${b.foundIn}"`);
    if (!STATUSES.includes(b.status)) errors.push(`${at}: unknown status "${b.status}"`);
    if (!b.title || b.title.length < 8) errors.push(`${at}: title too short`);
    if (!b.description || b.description.length < 15) errors.push(`${at}: description too short`);
    if (Number.isInteger(b.severity) && Number.isInteger(b.occurrence) && Number.isInteger(b.detectability)) {
      if (b.rpn !== rpn(b)) errors.push(`${at}: stored rpn ${b.rpn} != computed ${rpn(b)}`);
      if (b.priority !== priority(b)) errors.push(`${at}: stored priority ${b.priority} != computed ${priority(b)}`);
    }
    if (['fixed', 'verified', 'closed'].includes(b.status)) {
      if (!b.fix) errors.push(`${at}: ${b.status} requires a "fix" description`);
      const refs = testsReferencing(b.id);
      if (['verified', 'closed'].includes(b.status)) {
        if (!refs.length && !b.testWaiver) errors.push(`${at}: ${b.status} requires a regression test that mentions ${b.id} (or a waiver for severity <= 2)`);
        if (b.testWaiver && b.severity > 2) errors.push(`${at}: test waiver is only allowed for severity <= 2`);
      } else if (!refs.length && !b.testWaiver) warnings.push(`${at}: fixed but no regression test mentions ${b.id} yet`);
    }
  }
  if (gate) {
    for (const b of db.bugs) if (OPEN.has(b.status) && ['P0', 'P1'].includes(b.priority)) errors.push(`RELEASE GATE: ${b.id} (${b.priority}) is ${b.status}: ${b.title}`);
  }
  return { errors, warnings };
}

/* ---------- report ---------- */
function stats(db) {
  const open = db.bugs.filter((b) => OPEN.has(b.status));
  const fixed = db.bugs.filter((b) => ['fixed', 'verified', 'closed'].includes(b.status) && b.fixedAt);
  const days = fixed.map((b) => (Date.parse(b.fixedAt) - Date.parse(b.reportedAt)) / 86400000);
  const byPhase = {};
  for (const b of db.bugs) byPhase[b.foundIn] = (byPhase[b.foundIn] ?? 0) + 1;
  const late = (byPhase.staging ?? 0) + (byPhase.production ?? 0);
  return {
    total: db.bugs.length,
    open: open.length,
    openByPrio: ['P0', 'P1', 'P2', 'P3'].map((p) => [p, open.filter((b) => b.priority === p).length]),
    meanDaysToFix: days.length ? (days.reduce((a, b) => a + b, 0) / days.length).toFixed(1) : '-',
    escapeRate: db.bugs.length ? Math.round((late / db.bugs.length) * 100) + '%' : '0%',
    byPhase,
    openRpn: open.reduce((a, b) => a + b.rpn, 0),
  };
}

function renderMd(db) {
  const s = stats(db);
  const rows = [...db.bugs].sort((a, b) => a.priority.localeCompare(b.priority) || b.rpn - a.rpn || a.id.localeCompare(b.id));
  const line = (b) => `| ${b.id} | ${b.priority} | ${b.rpn} (${b.severity}×${b.occurrence}×${b.detectability}) | ${b.status} | ${b.category} | ${b.title.replace(/\|/g, '/')} | ${b.module ?? ''} | ${b.foundIn} |`;
  const head = '| ID | Prio | RPN (S×O×D) | Status | Category | Title | Module | Found in |\n|---|---|---|---|---|---|---|---|';
  const openRows = rows.filter((b) => OPEN.has(b.status));
  const doneRows = rows.filter((b) => !OPEN.has(b.status));
  return `# Bug register (generated, do not edit)

Source of truth: \`bugs/register.json\`. Formula, lifecycle and rules: \`bugs/README.md\`. Regenerate with \`node scripts/bugs.mjs report\`.

## Summary

| Metric | Value |
|---|---|
| Total bugs | ${s.total} |
| Open | ${s.open} (${s.openByPrio.map(([p, n]) => `${p}: ${n}`).join(', ')}) |
| Sum of open RPN (risk load) | ${s.openRpn} |
| Mean days report → fix | ${s.meanDaysToFix} |
| Defect escape rate (found in staging/production) | ${s.escapeRate} |
| Found by phase | ${Object.entries(s.byPhase).map(([k, v]) => `${k}: ${v}`).join(', ') || '-'} |

## Open

${openRows.length ? head + '\n' + openRows.map(line).join('\n') : '_None._'}

## Fixed / closed / other

${doneRows.length ? head + '\n' + doneRows.map(line).join('\n') : '_None._'}

## Details

${rows.map((b) => `### ${b.id}: ${b.title}
- **Priority ${b.priority}**, RPN ${b.rpn} (severity ${b.severity}, occurrence ${b.occurrence}, detectability ${b.detectability}), status **${b.status}**, category ${b.category}, found in ${b.foundIn} on ${b.reportedAt}${b.reportedBy ? ' by ' + b.reportedBy : ''}
- Module: ${b.module ?? '-'}${b.requirement ? ' · Requirement: ' + b.requirement : ''}
- **What:** ${b.description}
${b.repro ? `- **How to reproduce:** ${b.repro}\n` : ''}${b.rootCause ? `- **Root cause:** ${b.rootCause}\n` : ''}${b.fix ? `- **Fix:** ${b.fix}${b.fixedAt ? ' (' + b.fixedAt + ')' : ''}\n` : ''}${(b.tests ?? []).length ? `- **Regression tests:** ${b.tests.join(', ')}\n` : ''}${b.testWaiver ? `- **Test waiver:** ${b.testWaiver}\n` : ''}`).join('\n')}
`;
}

/* ---------- commands ---------- */
function cmdAdd(a) {
  const db = load();
  const year = new Date().getFullYear();
  const need = ['title', 'sev', 'occ', 'det', 'cat', 'found', 'desc'];
  for (const k of need) if (a[k] === undefined || a[k] === true) die(`missing --${k}`);
  db.counters[year] = (db.counters[year] ?? 0) + 1;
  const b = {
    id: `BUG-${year}-${String(db.counters[year]).padStart(3, '0')}`,
    title: a.title, description: a.desc, repro: a.repro ?? '', rootCause: a.cause ?? '',
    category: a.cat, module: a.module ?? '', requirement: a.req ?? '',
    severity: +a.sev, occurrence: +a.occ, detectability: +a.det,
    foundIn: a.found, status: 'new', reportedAt: today(), reportedBy: a.by ?? '',
    fix: '', fixedAt: '', tests: [],
  };
  b.rpn = rpn(b); b.priority = priority(b);
  db.bugs.push(b);
  const v = validate({ ...db, bugs: [b] });
  if (v.errors.length) die(v.errors.join('\n'));
  save(db);
  console.log(`${b.id} added: ${b.priority}, RPN ${b.rpn}. SLA: ${SLA[b.priority]}`);
}

function cmdStatus(a) {
  const [id, to] = a._.slice(1);
  const db = load();
  const b = db.bugs.find((x) => x.id === id);
  if (!b) die(`unknown bug ${id}`);
  if (!STATUSES.includes(to)) die(`unknown status ${to}. one of: ${STATUSES.join(', ')}`);
  if (!FLOW[b.status]?.includes(to)) die(`illegal transition ${b.status} -> ${to}. allowed: ${(FLOW[b.status] ?? []).join(', ') || 'none'}`);
  if (a.fix && a.fix !== true) b.fix = a.fix;
  if (a.cause && a.cause !== true) b.rootCause = a.cause;
  if (a.waive && a.waive !== true) b.testWaiver = a.waive;
  if (a.test && a.test !== true) b.tests = [...new Set([...(b.tests ?? []), a.test])];
  if (to === 'fixed') { if (!b.fix) die('fixed requires --fix "what changed"'); b.fixedAt = today(); }
  if (['verified', 'closed'].includes(to)) {
    b.tests = [...new Set([...(b.tests ?? []), ...testsReferencing(b.id)])];
    if (!b.tests.length && !b.testWaiver) die(`${to} requires a regression test that mentions ${b.id} (add "// ${b.id}" in the test) or --waive "reason" for severity <= 2`);
    if (b.testWaiver && b.severity > 2) die('waiver only for severity <= 2');
  }
  if (to === 'in_progress' && ['fixed', 'verified', 'closed'].includes(b.status)) { b.fixedAt = ''; }
  b.status = to;
  b.updatedAt = today();
  save(db);
  console.log(`${id}: ${to}`);
}

function cmdList(a) {
  const db = load();
  let bugs = db.bugs;
  if (a.open) bugs = bugs.filter((b) => OPEN.has(b.status));
  if (a.prio) bugs = bugs.filter((b) => b.priority === a.prio);
  bugs.sort((x, y) => x.priority.localeCompare(y.priority) || y.rpn - x.rpn);
  for (const b of bugs) console.log(`${b.id}  ${b.priority}  RPN ${String(b.rpn).padStart(3)}  ${b.status.padEnd(11)} ${b.category.padEnd(16)} ${b.title}`);
  if (!bugs.length) console.log('(none)');
}

function die(msg) { console.error(msg); process.exit(1); }

function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0] ?? 'list';
  if (cmd === 'add') return cmdAdd(a);
  if (cmd === 'status') return cmdStatus(a);
  if (cmd === 'list') return cmdList(a);
  if (cmd === 'show') { const b = load().bugs.find((x) => x.id === a._[1]); return b ? console.log(JSON.stringify(b, null, 2)) : die('unknown bug'); }
  if (cmd === 'report') { save(load()); return console.log('wrote bugs/BUGS.md'); }
  if (cmd === 'check') {
    const db = load();
    const { errors, warnings } = validate(db, { gate: !!a.gate });
    warnings.forEach((w) => console.warn('warn:', w));
    if (errors.length) { errors.forEach((e) => console.error('error:', e)); process.exit(1); }
    const s = stats(db);
    console.log(`register ok: ${s.total} bugs, ${s.open} open (${s.openByPrio.map(([p, n]) => `${p}:${n}`).join(' ')})${a.gate ? ' · release gate passed' : ''}`);
    return;
  }
  die(`unknown command ${cmd}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
