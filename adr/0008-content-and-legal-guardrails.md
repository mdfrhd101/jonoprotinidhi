# ADR-0008: No invented content under real politicians; consent before any real site

- Status: accepted
- Date: 2026-09-29
- Deciders: product owner

## Context
Screenshots of a "sample" page under a real politician's name can circulate as fake news. Real MPs' photos
and words are copyrighted or personal.

## Decision
- Full-content demos use only the fictional MP (Dr. Tahmina Noor, seat "নদীপুর-৩") and are labelled fictional.
- A real MP's tenant is created only with written consent from their office (document reference stored)
  and stays in `setup` (non-public) until content is supplied and verified.
- Photos: office-owned or CC0 / CC BY / CC BY-SA with credits. No party symbols without permission.
- The real-MP demo (`client-demo/mirza-abbas/`) uses only verifiable public facts and is never published.
- AI-generated photos of a fictional MP are allowed only when labelled as AI-made and fictional, and only
  if they do not resemble a real person.

## Alternatives considered
- "Sample" labels on realistic fake content: still spreadable out of context.

## Consequences
+ Reduces legal and reputational risk for the company and for MPs.
- Slower first demos for real prospects; mitigated by the fictional full-content demo.
