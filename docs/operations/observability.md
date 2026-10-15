# Observability

## Prod flag report

`pnpm report:prod-flags --env-file <path>` lists every release flag, switch and
key the source reads, against one pulled env file. Pull it yourself, then run:

```bash
vercel env pull .vercel/.env.production.local --environment=production
pnpm report:prod-flags --env-file .vercel/.env.production.local
```

Sections:

- **Client email (must be off).** The switches that let email reach clients.
- **Release flags.** Every `*_RELEASE` flag plus owner entry, as `on`, `off`,
  `workspace`, `operators`, `unset` or `set (value hidden)`.
- **Switches.** Other flags the source reads, same states.
- **Keys.** Secret-shaped names (keys, tokens, DSNs, URLs, ids, addresses) as
  `set` or `unset`. Presence only.
- **In env file but unused by this source.** Stale names, listed without values.

Values are never printed, and the command checks its own output for any value
before printing. It exits 1 with a `STOP:` line when a client-send switch is on.
It reads only the file you name: no network, no database, no writes. A key pulled
from Vercel as a Sensitive variable may arrive as a placeholder, so `set` proves a
name is present, not that the value works.

The inventory comes from the source, so it does not go stale. The readiness
snapshot (`scripts/production-readiness-snapshot.ts --i-have-jacobs-yes`) is the
separate database and Redis probe.

## Browser errors

Set `NEXT_PUBLIC_SENTRY_DSN` before a production build and its ingest host is
added to the CSP `connect-src` automatically. Unset, browser reporting is off and
the CSP is unchanged.

## CSP

The enforced policy still allows `script-src 'unsafe-inline'`. Next 16 stamps a
nonce on its own scripts when the request carries a CSP header, and the JSON-LD
blocks are data that CSP does not execute-block, so enforcing nonces is possible.
Two things stop it today: every pass-through in the proxy must forward the nonce,
and any prerendered page has no per-request nonce and would break. `style-src
'unsafe-inline'` has to stay, because React style attributes and inline styles
cannot carry a nonce.

So enforcement is not on. `STRELVA_CSP_NONCE_REPORT_ONLY=1` adds a
`Content-Security-Policy-Report-Only` nonce policy (reports go to Sentry when
`NEXT_PUBLIC_SENTRY_DSN` is set) and forwards the nonce to Next. Unset, which is
the default, responses and forwarded requests are identical to before.

To gather evidence, set it in Preview first. Enforcement needs about a week of
Sentry CSP reports with zero `script-src` violations on app routes, and it is a
separate release decision.

## Open for Jacob

- **Licenses.** The hosted "Audit dependencies" step is blocked by license review
  on `@sentry/cli` 2.58.5 and its platform packages (FSL-1.1-MIT, build-time only)
  and on `gsap` 3.14.2 (GSAP Standard License, ships in client website components,
  and limits use in tools that compete with Webflow's visual builder). Approve or
  reject each; `reviewedPackages` in `scripts/supply-chain-policy.json` stays
  empty until then. The alternative for gsap is replacing it with CSS or existing
  motion code.
- **Secret scan.** The Security job is red on exactly two `dev-tenants.json`
  findings from `eb67cd15b`. Add their fingerprints to `.gitleaksignore` now, or
  keep it red until the database copy of both secrets is re-encrypted and read back.
- **Registry audit.** `pnpm check:supply-chain` was not run here (it calls the npm
  registry audit). Braces is excepted until 2026-10-23.
- **Cron.** Domain verification now runs every five minutes (unflagged).
  `payment-holds` runs every 10 minutes but records no heartbeat, so the watchdog
  does not cover it.
- **Yelp copy.** The "Daily sync" wording belongs to the integrations lane; the
  cron stays daily.
