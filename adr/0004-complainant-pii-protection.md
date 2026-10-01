# ADR-0004: Field-level encryption and need-to-know for complainant PII

- Status: accepted (2 Oct 2026: date of birth and NID are now in the same envelope, see ADR-0009)
- Date: 2026-09-30
- Deciders: product owner

## Context
Complaints contain name and phone of citizens who may fear retaliation. An MP office could be tempted to
use numbers for campaigning (MIS-02). The owner's rule: only the responsible officer sees identity; it is
not used for promotion without separate consent.

## Decision
- Encrypt `name` and `phone` with AES-256-GCM using a per-tenant data key wrapped by a master key
  (envelope encryption). AAD binds ciphertext to tenant, complaint and field.
- Store `HMAC-SHA256(phone, pepper)` for rate limits and dedupe only.
- Decrypt only in `viewPii()`: assigned officer, explicit purpose, per-officer rate tier, audited. Owner,
  editor, support and super admin (including act-as) cannot decrypt.
- No bulk export of PII. SMS worker decrypts internally; numbers never enter queues or logs.
- Retention purge after a configurable period (default 12 months after closure).

## Alternatives considered
- Database-at-rest encryption only: does not stop authorised staff or super admin from reading.
- Never store phone: makes SMS updates impossible. (Anonymous mode covered that need until ADR-0009 removed it.)

## Consequences
+ Strong answer to the harvesting risk and to regulator questions.
- Officer offboarding needs reassignment before removal; a lost master key means unrecoverable PII (escrow
  procedure in docs/08, risk R-09).
- Search by name or phone in the inbox is not possible; search by tracking id and text only.
