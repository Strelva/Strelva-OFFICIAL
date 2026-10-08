# Public business verification · #308

Prepared on `feat/verified-business-profile-308-20261008`, based on `e9ac136f`.
Local code and fictional fixtures only; no production/provider operation.
Migration `20261018132000` is pinned in proposed release packet batch 12 as
unapplied prepared work. Its timestamp precedes the current final `20261019100000`
security boundary; filename-sorted local proof does not qualify applying it to
an already-deployed target. Deployed-target ordering, prerequisites, live-role
defaults and recovery must be separately qualified before promotion.

One public `verification` block accompanies `get_business` and the server-rendered
`/biz/{handle}` page. Issue #308's `/b/{handle}` wording predates the accepted
routing: `/b/[token]` manages bookings; #309's profile lives under `/biz/`.
No route or booking token is repurposed.

`read_public_business_verification(text,text)` reads existing canonical records,
without new persistence or confirmation authority. A published page, customer
business and non-exited workspace are required. Tenant lookup additionally needs
an active tenant and its current stable business link. The app applies the same
business-page and connected-sites global/per-business release gates as `/biz`.
Unpublished legacy website tenants return an unknown block; their private
business metadata is not inferred to be publishable from a directory entry.

The block contains:

- `domains`: only owner's public website links matching active connected-site
  control proofs or verified non-admin hosted claims, with `checkedAt`, `stale`
  and a recent `verified` claim. Evidence older than 48 hours or dated in the
  future cannot support a current claim. This is a conservative public claim
  limit, not a refresh job or a website uptime assertion. Hosted `domain_claims.updated_at`
  is a generic save time, so hosted claims without a dedicated proof timestamp
  carry `checkedAt: null` and cannot support a fresh verified verdict. Connected
  host proofs use the canonical `verified_at`.
- `googleBusinessProfile`: `linked` from connected canonical Google bindings
  with a location, `checkedAt`, and `stale` using the existing 48-hour Google
  listing health window. `verified` is always `null`: the current store does
  not persist a Google profile verification verdict. OAuth access, scopes and
  successful writes are not that verdict.
- `ownerConfirmedFactCount` and `lastConfirmedAt`: facts actually served by
  `business_confirmed_public_facts` from `business_record_confirmed`. Private
  `owner_recipient`, uncertain policy terms, working operator/model/import
  facts and people/contacts do not enter the count. Services are not facts.
- `operatingAgency`: name only, while both current provider selection and its
  provider seat are active. No agency ID, contact, staff identity or mandate
  is disclosed.

Missing migration/store, invalid projection or closed gates return unknown
confirmation counts and Google linkage, never an invented zero or blanket
verified business. Revoked connections/claims and ended agency selections drop
immediately on the next read. JSON-LD adds recent proof-matched public domain
URLs to existing owner-confirmed `sameAs` links; no Google URL is synthesized
from its private account/location identifier.

Proof:

```bash
pnpm exec vitest run src/__tests__/business-verification.test.tsx src/__tests__/business-pages-routes.test.ts src/__tests__/platform-mcp.test.ts src/__tests__/platform-mcp-directory.test.ts src/__tests__/business-pages-directory.test.ts
pnpm typecheck
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:public-business-verification
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:agency-workflow
pnpm exec vitest run src/__tests__/release-safety-tools.test.ts
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:release-safety:batch8 --current-tail
```

The focused tests cover current, stale, future, unknown, revoked, consent,
anonymous reader privacy, rendering and additive MCP behavior. The SQL runner
applies the actual complete migration order, checks role denials, executes the
reader under service role in READ ONLY, and proves rollback/reapply leaves all
other function definitions and privileges identical. The agency runner also
executes the new projection test on the ordered final schema.

Observed locally: 55 focused tests and 27 release-inventory tests passed;
typecheck, boundaries, changed-file ESLint and both SQL runners passed. The
current-tail packet proved complete coverage of 41 remaining forward files,
188 introduced RPCs dark during both recovery rounds, and exact restoration
of public catalog/ACL and legacy auth/content/billing behavior. Local receipt:
`output/release-safety/batch8-1791466576534`. This is local recovery evidence,
not a deployed-target qualification. Custom-repository checks passed 20 cases;
nine sibling cases were skipped because their paths are absent beside this
isolated worktree.

The default-off fictional fixture `/preview/strelva/business-verification`
shows `fresh`, `stale`, `unknown` and `revoked` states. It requires the existing
preview gate and accesses no provider or customer store.

The current connected-site verifier is a one-time ownership check: it retains
`verified_at` once set. Refreshing aged ownership proof is an independent
follow-up; this projection does not extend that authority or pretend a generic
site save was a new check.

Remaining: independently review the projection and isolated delta, then promote
only through the existing release process. A real Google verification claim
needs a provider-authorized read, a persisted verdict with checked/revoked state,
and its own qualified reader; this lane deliberately does not fabricate that
outside dependency or introduce credentials/authority to resolve it.
