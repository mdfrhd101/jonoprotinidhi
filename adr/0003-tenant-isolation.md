# ADR-0003: Tenant isolation with tenantId + fail-closed Mongoose plugin

- Status: accepted
- Date: 2026-09-30
- Deciders: product owner

## Context
MongoDB has no row-level security. Tenants may be political rivals, so a leak is a serious incident (MIS-01).

## Decision
Single database. Every tenant document has an immutable `tenantId`. A Mongoose plugin injects the current
tenant (from AsyncLocalStorage request context) into every query, update, delete and aggregate, and
**throws** when there is no tenant context. Foreign ids return 404. A CI test crawls all tenant routes with
two seeded tenants.

## Alternatives considered
- Database per tenant: stronger boundary; costly operations and cross-tenant admin views. Kept as the
  fallback if a client requires physical isolation.
- Manual `tenantId` in each query: error-prone, rejected.

## Consequences
+ Cheap and simple; failure mode is loud (exception), not silent.
- Raw driver access bypasses the plugin: forbidden outside migrations (lint rule + review).
- Every new route must be covered by the isolation harness (task T1.8).
