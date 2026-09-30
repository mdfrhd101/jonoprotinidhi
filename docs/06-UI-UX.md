# 06 · UI / UX — Jonoprotinidhi

The demos are the living spec. When this doc and a demo disagree, ask the owner; the demo usually wins
for visuals, this doc wins for behaviour and rules.

- Public site: `client-demo/demo-mp/` (`assets/style.css`, `assets/app.js`, `assets/data.js`)
- Admin panels: `client-demo/admin/` (`assets/admin.css`, `core.js`, `super.js`, `mp.js`)

## 1. Design direction (owner-approved)

**"Cinematic premium"** — the site must raise the MP's image through real work, presented grandly.

- Full-bleed real photography with dark overlay; huge serif name; slow Ken Burns zoom on banners.
- Motion: parallax on hero/band backgrounds, count-up numbers, sections rise on scroll. All disabled under
  `prefers-reduced-motion`.
- Alternating dark (ink) and ivory sections.
- **One accent only** (brass by default). Tenant can pick one of three presets; never party colours
  without the office's written policy.
- Near-square corners (2 px). No rounded "app cards".
- "Simple" = uncluttered and organised, **not** plain or short. Content is detailed.
- Rejected in v1 (don't reintroduce): cartoon/flat illustrations, green-red palette, single-page layout,
  "scroll down" hint in hero, crowded home page.

## 2. Tokens (from the demos → `packages/ui-tokens`)

| Token | Value | Use |
|---|---|---|
| `--ink` / `--ink-2` / `--ink-3` | `#0C1117` / `#111820` / `#18212B` | dark sections, admin sidebar |
| `--paper` / `--paper-2` | `#F6F2EA` / `#EEE8DC` (`#EDE6DA` in early notes) | ivory sections, admin surface |
| `--brass` / `--brass-2` / `--brass-deep` | `#C7A35A` / `#E2C88E` / `#8A6A28` | the only accent (light/dark/deep) |
| Alt accents | river `#6E9CB4/#A9CBDD/#2F5C73`, maroon `#B06A5F/#DDA79D/#6E2F29` | tenant choice |
| Status | ok `#2E7D5B`/`#DCEDE3`, warn `#8F5B00`/`#F5E6C6`, late `#AE2A20`/`#F6DBD6`, plan `#5D6470`/`#E3DDD1` | promise/complaint states — always with a text label |
| Radius | 2 px | everything |
| Max width | 1240 px public, 1320 px admin content | |

**Typography**
- Headings / names: **Noto Serif Bengali** 700–900.
- Body: **Noto Sans Bengali** 400–600.
- Labels & numbers: Noto Sans Bengali condensed (`font-stretch: 75%`), tabular numerals.
- Hero kicker ("সংসদ সদস্য · আসন") 21 px full-width (not condensed) — owner asked for it larger.
- Header: **no logo/monogram**. Name 23 px serif + seat/title line 15.5 px brass, semibold.

**Numbers & dates**: always Bangla digits (`০১২৩৪৫৬৭৮৯`), Indian grouping (`৭,৪৩,৭৬০`), Bangla month names,
`Asia/Dhaka`. Use `packages/bangla`.

## 3. Public site page inventory

| Page | Route (product) | Demo file | Key components |
|---|---|---|---|
| Home | `/` | `index.html` | hero slideshow, stats count-up, about teaser + milestones, featured activities grid (1 large + 5), parliament band + video, promise summary + featured rows, area map + upazila chips, gallery mosaic, events, complaint CTA |
| About | `/about` | `about.html` | page hero, personal facts, story, biography summary (3 cells → biography), parliament band with numbers, awards, publications, priorities |
| Biography | `/about/biography` | `biography.html` | jump chips, 3 timelines (education, profession, politics) |
| Activities | `/activities` | `activities.html` | category chips, upazila + month selects, count, cards, empty state |
| Activity | `/activities/[slug]` | `activity.html?id=` | long hero, article with pull quote, album + lightbox, "at a glance" side card, prev/next, related |
| Promises | `/promises` | `promises.html` | summary bar, sector nav, status chips, sector groups with rows, updates, delay notes, methodology box |
| Area | `/area` | `area.html` | totals strip, interactive map + upazila detail, stats grid, voter bars, comparison table |
| Gallery | `/gallery` | `gallery.html` | album grid with category chips, videos (click-to-load) |
| Complaint | `/complaint` (`#track`) | `complaint.html` | tabs new/track, form, ticket card, tracking timeline, monthly stats, how-it-works, FAQ, other channels |
| Contact | `/contact` | `contact.html` | events, offices, socials/hotline, complaint CTA |

Shared: fixed header that turns solid on scroll, 7-item nav + "অভিযোগ বক্স" button, mobile menu at
≤ 1180 px, footer with site links, main office, photo credits, "demo/fictional" pill on demo tenants.

## 4. Admin UX

- Shell: ink sidebar (grouped nav, count badges), sticky top bar (breadcrumb, tenant/role, user), content
  on ivory. Drawer sidebar under 980 px.
- **Mobile-first screens**: post composer (category chips, sticky submit bar), approval queue, complaint
  inbox (list then detail below on phones).
- Complaint detail: PII box is locked by default; only the assigned officer sees "দেখুন (লগ হবে)" with a
  purpose reminder dialog.
- Act-as banner: always visible, ink-3 with brass text, "Super Admin হিসেবে … ফিরুন".
- Destructive actions: confirmation dialog stating the consequence; restore requires typing `RESTORE`.
- Toasts for success (bottom right), inline errors under fields, never alert().
- Empty states tell the user what to do next.

## 5. Bugs already found — keep them fixed

1. `.stat span` hit the number's inner span → use `.stat > span` for the label.
2. Timeline years overlapping text → `ol` is the grid (`max-content | 1fr`), each `li` uses `subgrid`.
3. No "scroll down" text in hero.
4. Nested lists inside fact rows inherited the grid → `.facts li li { display: list-item }`.
5. `.sec h2` overrode `.h3` → scope heading utility classes with enough specificity.
6. Inline `grid-template-columns` broke mobile → layout variants as classes, not inline styles.
7. Mobile hero caption hidden behind the fixed demo pill → caption offset on small screens.

## 6. Accessibility & performance

- WCAG 2.2 AA contrast (ivory/ink/brass combos in the demos pass for body text; brass on ivory only for
  large text/labels → use `--brass-deep`).
- Every interactive map region is a button with an `aria-label`; chips use `aria-pressed`; tabs use
  `role=tab`; lightbox is a modal dialog with focus trap and Esc.
- Skip link, visible focus ring (brass).
- Images: explicit width/height, lazy below the fold, WebP, `srcset`. Hero image preloaded.
- Fonts: preconnect + `display=swap`; subset to Bengali + Latin.
- Bangla line-height ≥ 1.7 for body.

## 7. Content & photo rules (enforced in admin where possible)

- Licence + credit required for every uploaded image not owned by the office (`media.license`, `credit`).
- Warn on upload if the image is portrait for a banner slot, smaller than 1600 px wide, or has faces
  of children in close-up (manual checkbox "অনুমতি নেওয়া হয়েছে").
- No party banners/flags in platform stock photos.
- Demo tenants show "ডেমো · সব নাম, আসন ও তথ্য কাল্পনিক" permanently.

## 8. Copy tone

Plain, factual Bangla; numbers with sources and dates; admit delays with reasons. No superlatives
("সর্বশ্রেষ্ঠ", "ঐতিহাসিক") in platform-authored copy. Buttons are verbs ("অভিযোগ জানান", "প্রকাশ করুন").
