# ADR-0009: No anonymous complaints; name, mobile, date of birth and NID are required

- Status: accepted (amends ADR-0004 and ADR-0007)
- Date: 2026-10-02
- Deciders: product owner

## Context
ADR-0004 and ADR-0007 kept an "anonymous safety valve": the citizen's name was optional, a complaint could be sent
without any identity, and the NID was not collected at all (docs/08 §3 "Minimisation"). On 2 Oct 2026 the owner
decided that the citizen complaint form must collect the complainant's **name, mobile number, date of birth and NID
number**, and that there is no anonymous option any more.

## Decision
- The public form (`/complaint`) and `POST /public/complaints` require all four. The shared schema
  `complaintSubmitSchema` enforces them for every client (normal site, static GitHub Pages export, direct API calls):
  - name 2–80 characters; mobile = the existing Bangladeshi rule (`01[3-9]` + 8 digits, Bangla digits and `+880` accepted);
  - date of birth `YYYY-MM-DD`, a real calendar date, year 1900 or later, not after today (Dhaka day);
  - NID digits only after removing spaces and dashes (Bangla digits accepted), length 10, 13 or 17.
- The `anonymous` key is no longer part of the public schema: the strict schema refuses it (400), true or false.
- Date of birth and NID go into the **same encrypted `pii` envelope** as name and phone (AES-256-GCM, tenant data key,
  AAD per tenant/record/field `dob` and `nid`). They are revealed only by `POST /complaints/:id/pii-view` to the assigned
  officer with a stated purpose, audited, exactly like name and phone. They never appear in logs (`dob` and `nid` are in
  the redaction list), audit entries, complaint events, SMS, the CSV export or any list/detail response. No hash of the
  NID is stored.
- Complaints stored before this decision, and hearing/phone complaints entered by staff, may lack date of birth and NID:
  they still load and the reveal shows "—" for the missing values.
- Staff-entered hearing/phone complaints (`POST /complaints` with a `channel`) keep their earlier rules (`staffComplaintSchema`):
  anonymous allowed, no DOB/NID. Records with `anonymous: true` remain valid and are handled as before (no reveal, no SMS).
- OTP (ADR-0007) is unchanged, but with no anonymous path a tenant that turns `otpRequired` on now applies it to every
  public complaint.

## Alternatives considered
- Keep an anonymous checkbox next to the new fields: contradicts the owner's decision.
- Require only name and mobile: not what the owner asked for.
- Store only a hash of the NID: the officer could not read it back, and a hash of a 10-17 digit number is easy to brute force.

## Consequences
- More friction: fewer complaints are likely, especially from citizens who fear retaliation, which was the reason for the
  anonymous option in ADR-0004. This follows directly from the owner's decision; it was not weighed against the old valve.
- NID plus date of birth is much more sensitive than a phone number. The lawyer check of Bangladesh data-protection and
  cyber law (docs/08 §9, task T6.7) matters more now; the privacy notice, the retention period (12 months after closure)
  and the master-key escrow (risk R-09) should be reviewed with it.
- The API does not verify an NID against the Election Commission, nor check that NID and date of birth belong together:
  only the format is checked.
- Public texts that mention anonymous complaints or "name and number" (CMS content: complaint page steps, privacy note, FAQ,
  home call-to-action) must be updated by the office; the code cannot edit them.
