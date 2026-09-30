# ADR-0001: One multi-tenant platform we host

- Status: accepted
- Date: 2026-09-29
- Deciders: product owner

## Context
The product will be sold to many MPs/ministers, including rivals from different parties. MPs and their
offices are non-technical. Hosting, domains, backups and fixes must stay with us. Earlier idea: one
deployed instance per client.

## Decision
Run **one platform** with many tenants (one per MP/minister). A Super Admin panel creates tenants; each
tenant gets its own admin panel automatically, a platform subdomain, and optionally a custom domain.
Super Admin can act inside any tenant, always audited.

## Alternatives considered
- **Instance per MP**: strongest isolation, but N deployments to patch, monitor and back up; slow onboarding.
- **Shared code, database per tenant**: good isolation, but connection and migration overhead grows with
  tenants; harder cross-tenant super-admin views.

## Consequences
+ One deploy, one backup, fast onboarding, cheap.
- A tenant-scoping bug is a cross-party data leak (see ADR-0003 mitigations; risk R-01).
- Customers must accept shared infrastructure; the contract and privacy notice say so.
- If a client demands physical isolation later, the same code can be deployed as a single-tenant instance.
