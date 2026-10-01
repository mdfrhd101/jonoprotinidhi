# Architecture Decision Records

One file per significant decision. Copy `0000-template.md`, number sequentially, never rewrite history:
supersede with a new ADR instead.

| ADR | Decision |
|---|---|
| 0001 | One multi-tenant platform we host |
| 0002 | MERN stack; Next.js for public sites |
| 0003 | Tenant isolation: tenantId + fail-closed Mongoose plugin |
| 0004 | Field-level encryption and need-to-know for complainant PII |
| 0005 | Draft → Review → Publish with owner approval |
| 0006 | Subdomains + optional custom domains via Cloudflare for SaaS |
| 0007 | Complaint OTP optional by default, mandatory per tenant |
| 0008 | No invented content under real politicians; consent before any real site |
| 0009 | No anonymous complaints; name, mobile, date of birth and NID required (amends 0004, 0007) |
