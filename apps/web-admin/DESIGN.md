# Jonoprotinidhi admin: design system

A calm, warm "control room": ink sidebar, paper background, white cards (14 px radius, 1 px border, soft layered shadow), brass as the single accent, Bangla-first typography. Everything you need to build a page is exported from one barrel:

```tsx
import { Card, StatCard, AreaChart, DataTable, Button, EmptyState, useToast /* ... */ } from '../../components';
```

Live catalogue with sample data (development only): **http://localhost:5173/_kit** (`src/pages/Kit.tsx`). Keep it in sync when you add a component.

Not in the barrel on purpose (heavier / app specific, import from the file): `Shell` (`components/Shell`), `RichEditor`, `RichText`, `ImagePicker`, `CopyButton` (`components/CopyButton`).

## Files

| File | What |
|---|---|
| `src/base.css` | design tokens (`:root`) + primitives: buttons, cards, grids, pills, tables, forms, notes, dialog, toast, legacy helper classes |
| `src/extra.css` | roomy form controls (BUG-2026-015: tests read this file), rich-text editor, photo picker |
| `src/ds.css` | shell (sidebar, top bar, dropdown), component library styles, dashboard, login, editor layout |
| `src/components/*.tsx` | the components below |
| `src/tenant.tsx` | `TENANT_NAV` (the sidebar as a plain array), `buildTenantNav`, `publicSiteUrl` |
| `src/routes.ts` | `KNOWN_TENANT_ROUTES`, `EDITOR_ROUTE` (which pages exist; dashboard links to missing ones are greyed out "শীঘ্রই") |
| `src/format.ts` | Bangla helpers: `toBn`, `formatBn` (lakh/crore), `bnDate`, `bnDateTime`, `bnAgo`, `bnUntil`, `bnDayShort/Long`, `bnWeekday`, `bnGreeting`, labels |

Content agents may add their own `content.css`; do not edit `base.css`/`ds.css` for page-specific tweaks (prefix your classes, e.g. `.gal-…`).

## Tokens (CSS variables)

- **Brand:** `--ink #0C1117` (`--ink-2/3/4` lighter), `--brass #C7A35A`, `--brass-2 #E2C88E`, `--brass-deep #9C7A2E` (fills/borders), `--brass-ink #7A5B17` (brass *text*, AA contrast), `--brass-s/-s2` (tints), `--paper/--bg #F5F1EA`, `--card #fff`.
- **Neutrals:** `--n-50 … --n-900`, `--text`, `--muted #5B6370`, `--faint` (decoration only), `--line`, `--line-2`, `--line-strong`.
- **Semantic:** `--ok/-d/-s` (green), `--warn`, `--late` (red), `--info` (blue), `--plan-d/-s` (grey). `-d` = readable text colour, `-s` = soft background.
- **Chart palette:** `--c-a` blue, `--c-b` green (the colour-blind-safe pair used for two series), `--c-c` brass, `--c-d` amber, `--c-e` grey, `--c-f` red, `--c-g` violet. Never encode meaning with colour alone: charts have labels and a hidden data table.
- **Shape/shadow:** `--r-xs 6 / --r-sm 10 / --r 14 / --r-lg 20`, `--sh-1 / --sh-2 / --sh-3`, `--ring` (focus glow), `--gap 24px` (16 px on phones).
- **Type:** body `Noto Sans Bengali` 16 px / 1.65; `--f-display` (Noto Serif Bengali) only for page titles, card titles and big numbers.
- **Layout:** `--side-w 272px`, `--top-h 68px`.

Utility classes: `.sr` (visually hidden), `.muted`, `.num` (tabular digits), `.stack` (vertical rhythm), `.row` (flex row, wraps), `.grow`, `.grid .g2/.g3/.g4/.g21/.g12`, `.kpis` (KPI grid: 4 → 2 columns), `.bar` (filter toolbar), `.form`, `.frow`/`.frow.three` (form grid), `.note`/`.note.info|bad|ok`, `.acts` (button row), `.dash-row` + `.c4 … .c12` (12-column dashboard grid; add `keep6` to keep two-up on tablets).

## Page skeleton

```tsx
<>
  <PageHead kicker="পোস্ট" icon="posts" title="সব পোস্ট" sub="…" actions={<Button variant="accent" icon="plus" to="new">নতুন পোস্ট</Button>} />
  <div className="bar"><Chips … /><SearchInput … /></div>
  <DataTable … />
</>
```

Loading: `<Loading />` or component skeletons (`Skeleton`, `StatCard loading`, `DataTable loading`). Error: `<ErrorBox error={q.error} retry={() => q.refetch()} />`. Empty: `EmptyState` with an action. Feedback: `const toast = useToast(); toast('সংরক্ষণ হয়েছে', 'ok'); toast(e.message, 'bad')`.

## Components

### Legacy-compatible (props unchanged, new props only add)
`Pill {label, tone}`, `PillOf {map, k}`, `PageHead {kicker?, title, sub?, actions?, back?: {to,label}, meta?, icon?}`, `Field {label, error?, hint?, required?, children(props)}`, `Dialog {title, open, onClose, children, footer?, wide?, size?: 'sm'|'md'|'wide'}` (native `<dialog>`; renders nothing when closed), `ReasonDialog {title, open, onClose, onConfirm(reason), label?, min?, confirmLabel?, danger?}`, `Pager {page, totalPages, onPage}`, `Bars {rows: [label, n][], max?}` (simple bars), `ErrorBox {error, retry?}`, `Loading`, `Empty {children}`, `ToastProvider` / `useToast() → (msg, tone?: 'ok'|'bad'|'info')`, `fieldMessages(err)`.
CSS classes `.btn .btn-p .btn-b .btn-g .btn-d .btn-s`, `.card`, `.kpi`, `.pill`, `.tbl`, `.chip`, `.chips`, `.tline`, `.rows/.rowi`, `.switch`, `.dl`, `.list`, `.tag` all still work.

### Icon
`<Icon name="bell" size={18} label?="…" />`. Names are the keys of `ICONS` in `Icon.tsx` (lucide-react underneath, tree-shaken). Decorative unless `label` is given. Add an icon by adding one line to `ICONS`. `IconName` is the type.

### Button
`<Button variant="primary|accent|ghost|danger|quiet" size="sm|md|lg" icon? iconRight? loading? block? to?="/route" href?="https://…">`. Defaults to `type="button"`. `to` renders a router Link, `href` an external link (new tab, `rel=noopener`); `disabled` on a link renders a non-interactive span. Classes: `btn btn-p|btn-b|btn-g|btn-d|btn-q`, `btn-s`, `btn-l`, `icon-btn` (square icon button).

### Badge / Pill
`<Badge tone="ok|warn|bad|info|brass|ink|plain" icon? dot? count?>text</Badge>`. Use `Pill`/`PillOf` for status with a dot (`POST_STATUS_LABEL` etc. from `format.ts`).

### Card / Panel, SectionHeader
`<Card title sub icon actions footer pad="md|sm|lg|none" flat as level className>`; `pad="none"` for full-bleed lists/tables (`.rl` rows carry their own padding). `Panel` is an alias. `<SectionHeader title sub icon actions link={{to,label}} />` heads a group of cards.

### StatCard (KPI)
```tsx
<StatCard label="খোলা অভিযোগ" value={128} unit="%" icon="inbox" tone="brass|blue|green|amber|red|ink" dark
  delta={{ value: 12, suffix: '%', label: 'গত মাসে', good: 'up'|'down'|'none' }} hint="…" spark={number[]} to="/t/x/complaints" loading />
```
Numbers are Bangla digits with lakh/crore grouping (`format` prop overrides); `null` shows "—"; `to` makes the card a link. Keeps the `.kpi` class (e2e counts it). Wrap cards in `<div className="kpis">`.

### Charts (hand-written SVG, `role="img"`, `aria-label`, hidden data table, animation off under `prefers-reduced-motion`)
- `AreaChart {data, series: [{key,label,tone?,fill?}], xKey='date', xFormat?, tooltipTitle?, valueFormat?, height=260, ariaLabel, caption?, emptyText?, legendTotals?}`: 1-3 series over time, hover tooltip, keyboard (focus the chart, ←/→/Home/End/Esc), responsive to container width. `data` items look like `{ date: '2026-09-25', received: 3, solved: 2 }`.
- `Donut {data: [{key,label,value,tone?|color?}], size, thickness, centerLabel, ariaLabel, valueFormat?, emptyText, legend=true}`.
- `BarList {rows: [{key?,label,value,hint?,tone?,to?}], max?, ariaLabel, format?, emptyText, tone}`: ranked bars; rows can link.
- `ProgressBar {value, tone, label, showValue, size}` (`role=progressbar`), `ProgressRing {value, size, stroke, tone, label, sub}`.
- `Sparkline {data, tone, height, fill, label?}` decorative unless `label`. `monotonePath(points)` and `TONE_COLOR` are exported.

### Tabs
```tsx
<Tabs base="pages" label="পেজের ধরন" value={tab} onChange={setTab} tabs={[{key:'a',label:'সব',icon?,badge?,disabled?}]} variant="underline|pill" />
<TabPanel base="pages" tab="a" value={tab}>…</TabPanel>
```
WAI-ARIA tabs: roving tabindex, ←/→ (skips disabled, wraps), Home/End. `base` links tabs and panels.

### DropdownMenu
`<DropdownMenu label="অ্যাকাউন্ট" trigger={…} items={[{heading}, {label, icon?, onSelect?|to?|href?, danger?, disabled?, hint?, badge?}, {separator:true}]} align="end|start" triggerClassName chevron />`. Menu button pattern: Enter/Space/↓ opens on the first item, ↑ on the last, arrows/Home/End move, Esc closes and restores focus, Tab and outside click close.

### Drawer
`<Drawer open onClose title side="right|left" width={480} footer>`: side sheet on native `<dialog>` (focus trap, Esc, backdrop click). For confirmations use `Dialog`/`ReasonDialog`.

### Stepper, Timeline
`<Stepper steps={[{key,label,sub?}]} current="review" vertical? />` (`aria-current="step"`). `<Timeline items={[{id?, title, meta?, icon?, tone?}]} />` (activity feed).

### DataTable, CellMain, RowActions
```tsx
<DataTable caption="পোস্টের তালিকা" rows={rows} rowKey={(r) => r._id} loading={q.isLoading} onRowClick={(r) => nav(r._id)} rowLabel={(r) => r.title} selectedKey={id}
  empty={<div className="card"><EmptyState … /></div>}
  columns={[{ key:'t', header:'শিরোনাম', primary: true, cell: (r) => <CellMain title={r.title} sub={r.place} to={r._id} thumb={r.media?.[0]?.url ?? null} /> },
            { key:'d', header:'তারিখ', nowrap: true, align:'right', cell: (r) => bnDate(r.date) }]} />
```
Below 720 px it becomes cards: the `primary` cell is the card title, other cells show their string `header` as a label (`mobileLabel` if the header is a node, `hideOnMobile` to drop a column). Loading shows div skeletons (never `<tr>`s). A plain `<div class="tbl-wrap"><table class="tbl">` is styled too.

### EmptyState, Skeleton, Avatar
`<EmptyState icon title text action compact tone="brass|ok|info" />` (icon + title + text + action; always give an action when the user can do something). `<Skeleton w h r />`, `<SkeletonText lines />`. `<Avatar name src? size />` (initials, honorifics like "ড." skipped, stable tint).

### CopyButton
`import { CopyButton, copyText } from '../../components/CopyButton'`. `<CopyButton value={link} label="আমন্ত্রণ লিংক কপি করুন" iconOnly? size="sm|md" />`: copies to the clipboard (falls back to a hidden textarea + `execCommand` on http:// hosts), shows "কপি হয়েছে" for 2 s and announces it in a polite live region. `label` is the accessible name (keep it specific, e.g. "TXT রেকর্ডের মান কপি করুন"). Used by the Super Admin wizard (one-time invite link) and DNS instructions.

### Forms
`Field` wires label, hint and error for screen readers (`{(p) => <input {...p} />}`). Inputs are ≥ 52 px tall by CSS. Extras: `Chips {value,onChange,options:[{value,label,count?}],label}`, `SearchInput {value,onChange,label,placeholder}`, `Switch {checked,onChange,label}` (still a checkbox for assistive tech).
`<FormSection title description icon actions layout="stack|split">` groups fields in a card (do not give it an `aria-label` equal to a field label: tests query by label).
`<SaveBar dirty busy onSave onDiscard saveLabel status extra form? />` is the sticky bottom bar; pair it with `useUnsavedGuard(dirty)` (beforeunload). Unsaved-changes pattern used by the post editor: keep a JSON snapshot of the loaded form, `dirty = JSON.stringify(form) !== snapshot`.

### Shell (sidebar + top bar)
`components/Shell.tsx`, used by `TenantLayout` and `SuperLayout`. Props: `brand {small,title,sub?,live?}`, `nav: NavItem[]`, `banner?` (act-as strip, class `.imp`), `roleLabel`, `siteUrl?` ("সাইট দেখুন" link), `notifications?: {key,label,count,to,icon?}[]` (bell menu), `cta?` (brass button on top of the sidebar). It provides breadcrumbs from the nav array, document title, a collapsible icon rail (remembered in `localStorage`), an off-canvas drawer below 980 px and the user menu (role, switch panel, logout).

**Adding a page to the tenant panel:** (1) `<Route>` in `App.tsx`, (2) an entry in `TENANT_NAV` in `src/tenant.tsx` (`{ path, label, icon, perm?, badge?, end? }`; the planned content / site pages / media / office entries are listed in the comment above the array), (3) the path in `KNOWN_TENANT_ROUTES` in `src/routes.ts` so dashboard links stop saying "শীঘ্রই". The Super Admin nav is a literal array in `SuperLayout` (`pages/super/Super.tsx`): `{ to, label, icon, end?, badge? }` / `{ group }`; the Super Admin screens live in `pages/super/*.tsx` and their page-specific styles in `src/super.css` (`sa-` prefix).

## Rules of the house

- UI copy in Bangla; numbers through `toBn`/`formatBn`, dates through `bnDate*`/`bnAgo`; never show Latin digits in numbers.
- Keep accessible names stable (tests and `e2e/smoke.py` query by label/role). Icons are decorative (`aria-hidden`).
- Every interactive target ≥ 44 px, visible focus (brass ring), works from 390 px, no horizontal scroll.
- Empty, loading and error states are part of the page, not afterthoughts.
- Never render complainant PII on new screens; the API decides what a role receives, the UI only hides what is absent.
