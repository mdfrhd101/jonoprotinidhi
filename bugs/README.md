# Bug tracking: the formula and the rules

Every defect found by anyone (developer, test, review, pilot user) goes into `bugs/register.json` through
`node scripts/bugs.mjs`. `bugs/BUGS.md` is generated from it. No bug lives only in chat or in someone's head.

## 1. ID

`BUG-<year>-<nnn>`, assigned by the tool, sequential per year. Put the ID in the commit message, in the fix, and in
the regression test (a comment such as `// BUG-2026-003` is enough).

## 2. The scoring formula (FMEA-style RPN)

```
RPN = Severity × Occurrence × Detectability        (1 … 125)
```

| Score | Severity (harm if it happens) | Occurrence (how often real users hit it) | Detectability (how hard to notice before harm) |
|---|---|---|---|
| 5 | **Critical**: PII/tenant data exposed, auth bypass, data loss, wrong public content about a politician | Every use / default path | **Silent**: no error, no log, nobody would notice |
| 4 | **High**: feature unusable for a role, wrong money/status/permission result, audit gap | Common path | Only noticed by chance or by a user report |
| 3 | **Medium**: wrong behaviour with a workaround, bad validation, data shown wrongly | Some workflows | Noticed by careful manual use |
| 2 | **Low**: cosmetic or edge-case functional issue | Rare | Visible immediately in normal use |
| 1 | **Trivial**: typo, spacing | Very rare | Obvious to everyone |

### Priority (derived, never typed by hand)

| Priority | Rule | Response (SLA) |
|---|---|---|
| **P0** | RPN ≥ 60, **or** Severity = 5 | Fix the same day. **Blocks release.** Stop other work if it is in production |
| **P1** | RPN 30–59, **or** Severity ≥ 4 in category `security`, `privacy` or `tenant-isolation` | Fix within 3 working days. **Blocks release** |
| **P2** | RPN 12–29 | Fix within the current milestone |
| **P3** | RPN < 12 | Backlog |

The tool stores `rpn` and `priority` and `check` recomputes them, so a hand-edited value is caught.

## 3. Categories and phases

- **Categories**: `security`, `privacy`, `tenant-isolation`, `data-integrity`, `functional`, `validation`, `ui`,
  `performance`, `reliability`, `test-infra`, `docs`.
- **Found in (phase)**: `dev`, `unit-test`, `integration-test`, `e2e-test`, `review`, `staging`, `production`.
  The register reports a **defect escape rate** = share found in staging/production. Trend it down.

## 4. Lifecycle

```
new → triaged → in_progress → fixed → verified → closed
        ↘ needs_info ↗            ↘ back to in_progress if verification fails
new/triaged → wontfix | duplicate      (wontfix needs a written reason in the description)
```

Rules enforced by `node scripts/bugs.mjs`:

1. **fixed** needs a `--fix` note saying what changed. Optionally `--cause` (root cause).
2. **verified / closed** needs a **regression test that mentions the bug ID**. Only severity ≤ 2 bugs may be
   closed with `--waive "reason"`.
3. Transitions must follow the diagram; going backwards reopens the bug.
4. **Release gate**: `node scripts/bugs.mjs check --gate` fails while any P0 or P1 is open. CI runs it before a tag.

## 5. Workflow

1. Reproduce. Write the failing test first when you can.
2. `node scripts/bugs.mjs add --title "…" --sev 4 --occ 3 --det 4 --cat tenant-isolation --module api/services/posts --found unit-test --desc "…" --repro "…"`
3. Read the priority the tool prints. P0/P1: drop other work.
4. Fix it. Put the ID in the commit message and the regression test.
5. `node scripts/bugs.mjs status BUG-2026-007 fixed --fix "what changed" --cause "why it happened"`
6. Another person (or a fresh test run) checks it: `… status BUG-2026-007 verified`
7. `… status BUG-2026-007 closed` when the release containing it is shipped.
8. `node scripts/bugs.mjs check` (also part of `npm test` in CI) keeps the register honest.

## 6. Good bug report (template)

```
Title:        one line, what is wrong (not the guess at the cause)
Where:        module / screen / endpoint
Expected:     …
Actual:       …
Reproduce:    numbered steps or a failing test name
Impact:       who is affected; is any PII/tenant data involved?
Environment:  commit, browser/device, tenant
```

## 7. Commands

```bash
npm run bugs                 # list all
npm run bugs -- list --open  # open only
npm run bugs -- show BUG-2026-001
npm run bugs -- report       # regenerate bugs/BUGS.md
npm run bugs:check           # validate the register
node scripts/bugs.mjs check --gate   # release gate
```
