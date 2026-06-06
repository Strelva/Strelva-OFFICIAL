# Strelva Operations — Where Things Live and the Rules That Keep It Clean

The architecture (org of per-client repos, one shared content store, one
Vercel team) is correct for our size. What rots agency platforms is not the
architecture — it's drift. These are the conventions that prevent it.
Adopted 2026-06-06 after the repo-sprawl cleanup (4 copies of the marketing
site, 22 dead branches, canonical repos invisible to one founder).

## Repo map (the only copies that matter)

| Repo | What | Canonical location |
| --- | --- | --- |
| `REB` (this repo) | Control plane: multi-tenant platform, AI agent, dashboard, `/api/v1` contract | → moving to `Scaffold-Web` org |
| `strelva-marketing` | strelva.com marketing site + `brand/` assets | → moving to `Scaffold-Web` org |
| `custom-repo-starter/` (in this repo) | The template every client storefront starts from | here |
| `rhm-innovations` | Client storefront | `Scaffold-Web` org |
| `greatlakesdriedfruits` | Client storefront | → moving to org |
| `rohlax-wellness` | Client storefront | → needs a remote in the org |
| `reb-contracts` | Shared `@reb/contracts` package | → needs a remote in the org |

Anything not in this table is a stale copy. Archive it, don't edit it.
Brand assets (logo SVGs, palette hex, usage rules) live in
`strelva-marketing/brand/BRAND.md` — never rebuild them by hand.

## The starter-first rule (the one that matters most)

**Reusable changes go to `custom-repo-starter` first, then propagate to
client repos. Never patch a client repo with anything another client could
need. Never fork client B from client A — always from the starter.**

Why this is the hill to die on: the day a client repo gets a hand-rolled
integration, we stop having one system with N instances and start having N
systems. That's the difference between "update all client sites" being one
job or six. Snowflake repos are how agency platforms die at client #15.

Client-specific code (their booking widget, their rewards program) belongs
in their repo. The test: "would a second client ever want this?" If yes →
starter.

## Client lifecycle

**Onboarding:** clone starter → 4 env vars → tenant in control plane →
Vercel project in the team → domain. No hand-built repos.

**Offboarding (do it the day they churn, not "later"):**
1. Archive the GitHub repo
2. Delete the Vercel project (export anything they're owed first)
3. Remove/disable the tenant in the control plane
4. Release DNS / transfer the domain to them
5. Revoke their integration tokens (GSC, reviews, social)

## Access policy

**Both founders are admin on everything: GitHub org, Vercel team,
Cloudflare, Clerk, Stripe, Resend, Sanity, Google Search Console.** No
production surface lives under one person's personal account. This is not
about trust — it's bus factor. The 2026-06-06 cleanup happened because the
canonical marketing repo was invisible to half the company.

## Quarterly entropy pass (~30 min, calendar it)

- Branches: anything merged or >30 days stale gets deleted
- Sanity: list tenants/datasets — does each map to a paying client or a
  named experiment? Delete the rest
- Vercel: every project maps to a live client or core property? Delete the rest
- This table: still accurate? Update it

## Database / content store

One shared Sanity dataset (`production`) + Upstash Redis, tenant-scoped.
Correct at this scale; revisit per-tenant isolation around client ~25.
The standing rule: **every read/write is scoped by tenant id derived from
auth or trusted config — never from request input.** Any new route that
touches tenant data gets that check in review.
