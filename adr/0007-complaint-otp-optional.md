# ADR-0007: Complaint OTP optional by default, mandatory per tenant on request

- Status: accepted (2 Oct 2026: anonymous complaints no longer exist on the public form, see ADR-0009)
- Date: 2026-09-30
- Deciders: product owner

## Context
OTP reduces spam and fake numbers but costs SMS money, adds friction, and is incompatible with anonymous
complaints. Rural users on basic phones may struggle with extra steps.

## Decision
OTP is optional by default. A tenant setting (`otpRequired`) makes it mandatory for non-anonymous
complaints. Anonymous complaints are always allowed and never receive SMS. Spam is controlled by
Cloudflare Turnstile, rate limits per IP and per phone HMAC, and a per-tenant daily SMS cap.

## Alternatives considered
- Always mandatory: cleanest data, but excludes anonymous reporters and raises cost.
- Never: too easy to abuse with fake numbers.

## Consequences
+ Flexible per MP; the anonymous safety valve remains.
- Unverified numbers may be wrong, so SMS delivery can fail; staff see `otpVerified` in the inbox.
