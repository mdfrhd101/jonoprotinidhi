# ADR-0005: Draft → Review → Publish with owner approval

- Status: accepted
- Date: 2026-09-29
- Deciders: product owner

## Context
A PR team writes content; the MP's image depends on it. Nothing wrong or unauthorised may go live.

## Decision
Editors can only create drafts and submit. Only the owner (or a super admin acting-as) can approve, reject
(with reason), schedule or unpublish. Every transition writes a version snapshot and an audit entry. Editing
a live post creates a review copy; the live version stays until approval.

## Alternatives considered
- Editors publish directly with after-the-fact review: faster, but rejected by the owner (nothing goes
  live without the MP's approval).

## Consequences
+ Trust and accountability; supports the "real work, not exaggeration" positioning.
- Owner becomes a bottleneck: mitigated by mobile approval links and notifications (FR-CMS-04).
