# ADR-0002: MERN stack (MongoDB, Express, React, Node), Next.js for public sites

- Status: accepted
- Date: 2026-09-30
- Deciders: product owner

## Context
Options were Next.js + Payload CMS + PostgreSQL (recommended by the assistant for speed), MERN, or
Next.js + Express + MySQL. The owner's team already knows MERN and runs MERN deployments.

## Decision
- **API**: Node 20 + Express + TypeScript + Mongoose, MongoDB 7 (replica set), Redis, BullMQ.
- **Admin panels**: React 18 + Vite SPA.
- **Public sites**: **Next.js** (React) for server rendering, SEO and correct Facebook/WhatsApp link previews.
  This is still React; it is not a different ecosystem.

## Alternatives considered
- Payload CMS 3 + Postgres: fewer lines of code, built-in multi-tenant plugin, RLS. Rejected because the
  team knows MERN and wants full control of PII, workflow and roles.
- Plain React SPA for public sites: bad SEO and link previews for a site whose main channel is sharing.

## Consequences
+ Team velocity, one language (TypeScript) across the stack, shared zod schemas.
- We build workflow, versions, roles and media handling ourselves (estimated in docs/07-TASKS.md).
- MongoDB has no row-level security: tenant isolation is application-enforced (ADR-0003).
- Mongo full-text search handles Bangla poorly; revisit with Atlas Search or Meilisearch if needed.
