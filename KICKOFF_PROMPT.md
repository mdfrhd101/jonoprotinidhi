# Kickoff prompts — Jonoshetu (জনসেতু)

Copy one of these as the **first message** in a new Claude session. Replace the bracketed parts.

---

## 1. Claude Code (repo is on your machine)

```
Read CLAUDE.md, then docs/00-START-HERE.md, HANDOFF.md, and skim docs/01..08 and adr/.
You are joining the Jonoshetu project (multi-tenant MP portfolio + CMS + complaint platform, MERN,
decisions already made in adr/). Reply to me in [Bangla | English].

Before writing code:
1. Summarise in 10 lines what we are building, the current state, and the decisions you must not re-open.
2. Tell me which milestone/task in docs/07-TASKS.md you will start with and why.
3. List any question that genuinely blocks you (max 3). Do not ask about things already in the docs.

Then work on task [T0.1 / next open task]. Rules:
- Follow docs/05-DESIGN-PATTERNS.md. Every tenant model uses the tenantScoped plugin; complainant PII
  follows ADR-0004. If a change would break a rule, stop and ask.
- Write tests with the code (isolation and PII suites are mandatory where relevant).
- Use a branch named feat/<task-id>-<slug>; small commits.
- When done, update HANDOFF.md (dated entry) and any doc you changed, then show me what to run to verify.
```

## 2. claude.ai (chat / Project)

1. Create a **Project** named "Jonoshetu".
2. Upload `HANDOFF_BUNDLE.md` as project knowledge (it contains CLAUDE.md, HANDOFF.md, docs 00–08 and the
   ADRs in one file). Regenerate it after doc changes: `python scripts/build-bundle.py`.
3. First message:

```
You are joining the Jonoshetu project. The project knowledge contains the full handoff bundle. Read it all.
Reply in [Bangla | English].

Give me: (a) a 10-line summary of the product, current state and fixed decisions, (b) the next 3 tasks
from the task list with acceptance criteria, (c) up to 3 blocking questions.
Then help me with: [describe today's goal].
When you write code, give complete files with paths relative to the repo root, following the patterns in
the design-patterns section. Never invent facts about real politicians.
```

## 3. Useful follow-up prompts

**Implement a task**
```
Implement task [T2.2 Posts CRUD + state machine + versions]. Show the plan first (files, models, routes,
tests). Then implement. Include the tenant-isolation test and the permission tests. Update docs/04-API.md
if the contract changed.
```

**Review a pull request**
```
Review this diff against docs/05-DESIGN-PATTERNS.md and docs/08-SECURITY.md. Check specifically: tenant
scoping, PII exposure, permission checks, audit entries, input validation, missing tests. List findings by
severity with file and line.
```

**Security pass on a feature**
```
Run a security review of [feature] using docs/08-SECURITY.md (STRIDE table, controls checklist, misuse
cases in docs/01-PRD.md §5). Output: risks, missing controls, tests to add.
```

**New MP onboarding checklist**
```
Prepare the onboarding checklist for a new MP client using client-demo/MP_INFO.md and ADR-0008: consent
document, content intake, photo licences, domain, first-week posting plan. Do not invent any activity or
statistic; leave unknowns blank.
```

**Update the handoff**
```
Append a dated entry to HANDOFF.md (what was done, files touched, decisions, what is next), sync any changed
doc, and regenerate HANDOFF_BUNDLE.md.
```

---

## Ground rules for every session

- Bangla for talking to the owner; English for code, commits and docs; UI copy in Bangla.
- Never put invented content under a real politician's name (ADR-0008).
- Never commit secrets; use `.env.example`.
- Demos in `client-demo/` are the visual spec: run them with
  `python -m http.server 8765 --bind 127.0.0.1 --directory client-demo`.
- Open questions belong to the owner: party colour/symbol policy, first real client and consent, hosting and
  pricing, SMS gateway, production domain.
