# ADR-0006: Platform subdomains + optional custom domains via Cloudflare for SaaS

- Status: accepted
- Date: 2026-09-29
- Deciders: product owner

## Context
Each MP gets `<slug>.<platform-domain>`; later some want their own domain. Certificates must be automatic.

## Decision
Resolve tenant from the `Host` header using a `domains` collection (cached). Use Cloudflare for SaaS
custom hostnames for TLS on custom domains; the customer adds a CNAME and a TXT record shown in the Super
Admin panel. Access to the provider is behind a `DomainProvider` interface.

## Alternatives considered
- Caddy on-demand TLS: free and simple, but certificate issuance rate limits and no WAF/DDoS layer.
- Manual certificates: operational burden.

## Consequences
+ Automatic TLS, DDoS/WAF at the edge, easy custom domains.
- Vendor coupling and per-hostname cost; the interface keeps an exit path.
