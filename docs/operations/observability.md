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
