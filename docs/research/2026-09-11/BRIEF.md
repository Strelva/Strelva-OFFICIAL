# Strelva product research brief (2026-09-11)

You are one of several parallel research agents. Jacob Rhinehart is a solo founder in Buffalo, NY. Read-only: do not modify the repository. Use web search extensively and cite sources with URLs and dates. Today is 2026-09-11; prefer 2025 and 2026 sources. Question your own assumptions; do not flatter.

## What Strelva is
Strelva turns bounded business work into a finished, verifiable result while keeping humans in charge of consequential decisions. Today it runs a paid managed-website product for nine small businesses in Buffalo (control plane in this repo: Next.js, Supabase, Redis, governed AI agent, audit engine, Stripe, Google Business integration). It is now becoming one common interface for three relationships:
- Businesses using Strelva directly (free start, paid continuation).
- Agencies (called Enterprise) commissioning and reviewing work for their own clients.
- Managed clients where Strelva itself is responsible for delivery.
A second product, an IDX Home Finder for real-estate brokerages, is in preparation.

## Selected direction
- One accessible Strelva interface for all relationships, persistent navigation, product results as the working area.
- Minimal features, deep modules: a few understandable objects and actions with substantial responsibility underneath. Reject wide shallow feature surfaces.
- Proposed topology under review: four user-visible objects. Business (who it is for), Request (the single unit of work: assessment, website change, or build, with one composer and one history), Resource (what the business owns: Website, Assessment result, Home Finder installation), Access (who can see or act). Navigation collapses to Home, Requests, Resources, Business, plus Customers for agencies.
- The customer path: Problem -> Work -> Result -> Your system -> Handled.
- Jacob wants the product to have a "frontier feel": it should feel like the best software of 2026, not a small-business dashboard from 2019.
- Buffalo is the first market. Local identity alone is not differentiation.

## Existing local design language (DESIGN.md summary)
Warm ivory, ink-teal, muted-sage palette; editorial display type; soft outlined controls; restrained depth; a cairn (three stones) logo. No purple-blue AI gradients, no hero-stat templates, no icon-card grids, no generic dashboard.

## Output rules
Write your findings to the single markdown file path you were given. Structure: 1) Executive answer in under 200 words. 2) Evidence with citations. 3) Concrete recommendations for Strelva, each marked Keep / Change / Add / Drop. 4) Open questions for Jacob. 5) Sources list. Be specific: name products, screens, patterns, prices, and dates. Plain language, no em dashes.
