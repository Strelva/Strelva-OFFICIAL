# Scrubbed local copy of production

Status: **tooling proven locally against a fake source; never run against production**
Updated: 2026-10-05

Before any tenant is converted into a workspace in production, every active
tenant's conversion is dry-run against a scrubbed local copy of production
([Strelva Reborn section 3](../product/strelva-reborn.md#3-every-client-converted)).
This page is the exact procedure. The tool is
`scripts/scrubbed-production-copy.ts` (`pnpm scrubbed-copy`). Its logic lives in
`scripts/scrubbed-copy/`.

## What needs Jacob's yes

| Step | Yes needed | Why |
| --- | --- | --- |
| `pnpm check:scrubbed-copy` (fake source) | No | Local clusters and fixtures only |
| Creating a read-only Postgres role in production (optional, below) | **Yes** | Production database change |
| Copying the Upstash read-only token from the console | **Yes** | Production credential |
| `pnpm scrubbed-copy create ... --i-have-jacobs-yes` | **Yes** | Reads production data |
| `pnpm scrubbed-copy dry-run` / `serve` on an existing copy | No | Local only; nothing leaves the machine |
| Deleting a copy | No | |

A successful dry run authorizes nothing. Each production conversion is still a
separate yes (`scripts/convert-tenant-to-workspace.ts --apply --i-have-jacobs-yes`).

## What the copy contains

**Postgres.** These are the tables conversion reads, for active tenants only
(add `--include-inactive` for all tenants):

- `tenants`, `domain_claims`, `content`, `bookings` and `memberships`
- `subscription_items` for those tenants
- every row of `users`, `auth.users` (only `id`, `email`, `email_confirmed_at`), `super_admins`, `accounts`, `account_memberships`, `subscriptions`, `workspaces` and `workspace_memberships`
- `tenant_leads`, `tenant_workspace_links`, `business_records` and the four `website_document*` tables, when production has them

**Redis.** For each copied tenant: `leads:{t}` and `lead:{t}:*`,
`reb:booking:config:{t}` and `reb:booking:overrides:{t}`, `events:{t}` and the
`event:{id}` bodies it lists, `connections:{t}:*`, `orders:{t}` and
`order:{t}:*`, `reb:rewards:{t}:*`, `reb:reply-voice:{t}` and `account-of:{t}`.
It also copies the linked `account:{id}` records and `accounts:index`, filtered
to the copied accounts. Key names are unchanged (frozen `reb:` names stay),
except that reward keys carry a pseudonymized member email. Remaining TTLs are
kept as absolute expiry times.

**Left out, by design:**

- `integrations`, `workspace_calendar_connections`, public booking grants and visitor tokens
- content versions, drafts, audit and activity history
- reviews, and the business record detail tables
- every other table
- in Redis, every other key in the tenant registry (`authoritativePatterns` in `src/lib/tenant-rename.ts`): threads, CRM, inquiry delivery state, GBP metadata, dedupe markers and so on
- every key that is not tenant-scoped, such as pay links

The receipt counts what was left out, by family, without reading the values.

## How data is scrubbed

Pseudonymization is an HMAC-SHA256 of the normalized value under a local salt
(default `~/.config/strelva/scrubbed-copy.salt`, created on first use, mode
0600). The same salt gives the same copy, so joins and dedupe keep working.

| Data | Becomes |
| --- | --- |
| Emails (any column, JSON value or text) | `u<16 hex>@scrubbed.strelva.test`. A valid email stays valid and lowercase; an invalid one stays invalid |
| Phones | Same digit count and the same planner `phoneKey` identity. US numbers get area code 555; others get country code 999. Neither is dialable |
| Names (owners, leads, bookings, contacts, reviewers, reward members, personal workspaces) | Deterministic fictional names. An owner name equal to the business name is kept, because the planner treats that as "not a person" |
| Lead messages, booking notes, event titles and bodies, account notes, free text in personal records | Filler text of about the same length |
| OAuth tokens, API keys, `enc:v1:` secrets, revalidation secrets, webhook and credential fields, credential-shaped strings anywhere | `scrubbed-secret` |
| Stripe ids | `<prefix>_scrubbed<16 hex>`, the same in every table, so tenant, subscription and account ids still join |
| `revalidate_url`, `slack_webhook_url` | `http://127.0.0.1:9/scrubbed`, so a publish cannot reach a live client site |
| Website document hashes, lead submission hashes | Recomputed from the scrubbed values with the app's own functions |

Published website copy (services, story, FAQ) stays as it is, apart from
emails, phones and secrets. It is already public on the client's site.
Testimonial and review authors are renamed.

## Safety guarantees and their proof

| Guarantee | Enforced by | Proven by |
| --- | --- | --- |
| Read-only against the source | One `REPEATABLE READ READ ONLY` transaction. The tool stops unless the server reports `transaction_read_only = on` before the first row. Redis gets only `SCAN`/`TYPE`/`PTTL`/`GET`/`ZRANGE`/`SMEMBERS`/`HGETALL`/`LRANGE`, checked before any request | Unit tests on the export SQL and the Redis allowlist; the e2e test fingerprints the source before and after |
| Unscrubbed data never touches disk | Rows and keys stream from the source into the scrubber in memory | Code path; e2e leak scan of every output |
| No original email, phone or secret survives | Before anything is loaded, every output file is searched for every replaced original. A hit deletes the output and stops the run | Unit test on `findLeaks`; e2e scan of the files, the local database and local Redis |
| Unknown data is not copied | A source column without a rule stops the run. A Redis key outside the included families is counted, never read | Unit tests |
| Explicit source and confirmation | `--source` must equal the Postgres host in the environment, and `--source-redis` the Upstash host. `--i-have-jacobs-yes` is required. Credentials come only from `SCRUBBED_COPY_*` environment variables, never argv | Unit and CLI refusal tests |
| Local destination only | `--out` must be absolute and outside every git checkout, and not in iCloud, `~/Library/CloudStorage` or `/Volumes`. Postgres listens on a unix socket only (`listen_addresses=''`). redis-server has no TCP port. The REST bridge binds 127.0.0.1 and blocks `MIGRATE`, `REPLICAOF`, `CONFIG` and `SHUTDOWN`. `--dest-database-url` must be loopback or a socket and must point at an empty database | Unit tests; the e2e test and `serve` check |
| Email, Stripe and Google impossible | Code that runs against the copy gets only the `copy.env` environment, with every email audience off, empty `RESEND_API_KEY`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, Google, Calendar and Microsoft OAuth clients, AI provider keys, no Supabase URL, and file sources. `serve` and `dry-run` refuse a `copy.env` with any switch re-enabled. The tool also refuses a shell that has production app credentials loaded | Unit tests per switch; e2e re-enable refusal |
| Receipt has no personal data | `manifest.json` and `dry-run-report.json` hold counts, slugs, stable ids and hashed host fingerprints. Each is checked for emails, phones and every replaced original before it is written | Unit test; e2e scan of both files |

Email is impossible because `RESEND_API_KEY` is empty, not only because of the
audience switches. A per-tenant client override in Redis can arm client mail
while the global switch is off, and that override family is not copied either.

## Prerequisites

PostgreSQL 18 binaries and `redis-server` on `PATH`, and a valid locale. The
postmaster refuses to start on macOS without one.

```bash
export LC_ALL=en_US.UTF-8 PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH
```

Prove the tool on this machine first. It needs no yes:

```bash
pnpm check:scrubbed-copy
```

That test builds a fake source: a local cluster at production's recorded
migration level (`20260930120000`) seeded with three fixture tenants, and a
local redis-server behind the Upstash REST protocol. It creates a copy and
checks scrubbing, joins, FK integrity, leaks, an untouched source and
determinism. It then runs the conversion dry run and the rolled-back rehearsal
for every active tenant.

## Running it against production (needs Jacob's yes)

1. **Postgres credentials.** Use a connection that can only read. The tool
   enforces a read-only transaction either way. A dedicated role is better
   still. Creating it is a production change and needs its own yes:

   ```sql
   create role strelva_copy_reader login password '<generated>' in role pg_read_all_data;
   alter role strelva_copy_reader set default_transaction_read_only = on;
   ```

   Whether Supabase's `postgres` role may grant `pg_read_all_data` is
   unverified; check it in a staging project first. Without the role, use the
   normal connection string: the read-only transaction still holds.
   Use the session pooler (port 5432) or the direct connection. `--source` is
   the host part of that URL.

2. **Redis credentials.** In the Upstash console, copy the database's
   **read-only** REST token. Never paste it into a chat, a doc or a log.

3. **Create the copy** from a clean terminal. Don't source `.env.local`; the
   tool refuses a shell that carries production app credentials.

   ```bash
   cd ~/Desktop/strelva/REB
   export LC_ALL=en_US.UTF-8 PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH
   read -rs SCRUBBED_COPY_SOURCE_DATABASE_URL && export SCRUBBED_COPY_SOURCE_DATABASE_URL
   export SCRUBBED_COPY_SOURCE_REDIS_REST_URL=https://<db>.upstash.io
   read -rs SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN && export SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN
   pnpm scrubbed-copy create \
     --out=$HOME/strelva-copies/$(date +%F) \
     --source=<postgres host> \
     --source-redis=<db>.upstash.io \
     --grandfathered=gldf,rohlax \
     --i-have-jacobs-yes
   unset SCRUBBED_COPY_SOURCE_DATABASE_URL SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN
   ```

   `--grandfathered` mirrors production's `STRIPE_BILLING_GRANDFATHER_TENANTS`
   (slugs only; gldf and rohlax are also hard-coded as protected).

   The copy loads at production's migration level. It then applies every
   repository migration production does not have yet, which rehearses the
   pending rollout on real-shaped data. If one fails, the run stops with the
   migration name. The cluster stays in `<out>/postgres` for inspection.

4. **Read the receipt.** `<out>/manifest.json` has rows and keys per tenant,
   what was left out, pending migrations applied, FK orphans (expected `{}`)
   and the leak check.

## Following it with the conversion dry run (no yes needed)

```bash
pnpm scrubbed-copy dry-run --out=$HOME/strelva-copies/<date>
pnpm scrubbed-copy dry-run --out=$HOME/strelva-copies/<date> --tenants=gldf   # one tenant
```

For each copied active tenant, this runs `scripts/convert-tenant-to-workspace.ts
<slug> --json` against the copy. Tenants and content come from `<out>/dev`;
leads, booking config and accounts come from the copy's Redis. The planner
writes nothing. The tool then applies the plan through the real
`convert_tenant_to_business` RPC as `operator@scrubbed.strelva.test`, a
local-only super admin, inside a transaction that is always rolled back. The
result is `<out>/dry-run-report.json`: plan counts, skipped fields, command id,
digest, and the database receipt counts (including `contactsMerged`). The
command exits non-zero if any tenant fails to plan or apply. `--no-rehearse`
skips the SQL step.

A tenant that fails here must not be converted in production until the
failure is understood.

## Inspecting the copy

```bash
pnpm scrubbed-copy serve --out=$HOME/strelva-copies/<date> [--port=<bridge port>]
```

This starts the cluster (it prints the `psql` command), redis-server and the
Upstash REST bridge on 127.0.0.1. The bridge URL and token are printed. Ctrl-C
stops everything and saves Redis.

The app reaches Postgres only through the Supabase REST client, and there is no
local PostgREST, so `pnpm dev` cannot read the cluster. To browse the copy in
`pnpm dev`, use a separate worktree with no `.env.local`. Copy
`<out>/dev/dev-*.json` into its root and start it with `copy.env` plus the two
`UPSTASH_REDIS_REST_*` values `serve` prints. **This path has not been
verified yet.**

## Disposal

The copy is pseudonymized but still derived from client data. Keep it on this
machine and treat it as confidential. Delete it once the conversion it
supported has shipped:

```bash
rm -rf $HOME/strelva-copies/<date>
```

Deleting the salt makes future copies unlinkable to earlier ones.

## Known limits

- Proven only against a fake source. Production may have schema drift: a
  column without a scrub rule stops the run, and migrations production has but
  the repository lacks are listed in the receipt.
- The Redis read is a rolling capture, not an atomic snapshot (the same caveat
  as the September 21 Redis export).
- Free text that is already public website copy is kept. A name inside it is
  not detected.
- The dry run does not exercise `pnpm dev`, client sites or `/api/v1`.
