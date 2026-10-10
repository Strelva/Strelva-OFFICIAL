# Website journey release package — October 8, 2026

Private, unmerged preparation on `prepare/launch-completion-20261008`, based on
`e9ac136f9a0eecf362421c4046a333f0c20496fd`. That base contains deployed
`954f19057344dbf0cc9c10b04506071750a19c50`. This package makes no production,
provider, domain, billing, email or pricing change. The coordinator records
its exact committed head in the dated `engineering.md` artifact.

## What is prepared

An optional assigned sites origin serves approved published catalog documents
at `/sites/{tenant}`. Set `NEXT_PUBLIC_SITES_PATH_ORIGIN` only after choosing
and authorizing the exact public production alias. The variable is unset by
default: existing wildcard/custom-domain routing and the v1 bare-origin
contract remain the baseline. It accepts only a separate HTTPS single-label
`.vercel.app` origin; disposable development also accepts `sites.localhost`.
A syntactically acceptable origin does not establish ownership or availability.

This shared sites origin serves only the closed catalog, with no arbitrary
customer script/HTML capability. Any such future capability needs a separate
origin/isolation review. The selected host admits published page paths, robots and the existing
write-only lead beacon. App, owner, client, internal and preview routes return
404 before auth/session handling. Forwarded cookies, authorization and tenant
or preview selection headers are stripped. Durable published-document reads
recheck active-site authority on every request, independently of Redis. The
shared renderer scopes root-relative navigation to the mount without changing
the issued document or hash; metadata, sitemap, receipts and current public
URLs retain its base path. Assets and approved capability endpoints keep their
existing contracts. The owner sees a hosted address and separate custom-domain
help; a path publication without an attached domain does not ask for a DNS
restoration attestation. There is no new domain/purchase automation.

Verified Supabase credential AMR timestamps now supply recent sign-in time
when `auth_time` is absent. Both callers first verify the user/signature and
same subject. Explicit `auth_time` retains precedence; issuance/refresh,
invite/signup, recovery and unknown methods never satisfy freshness. The
existing ten-minute/future-time refusal is unchanged. This fixes actual local
signed-password operator invitation failure without trusting a typed email.
Supabase documents password AMR timestamps in its
[JWT reference](https://supabase.com/docs/guides/auth/jwt-fields), read October 8.

The proxy admits exactly the existing visitor `/api/booking` and
`/api/booking/availability` paths; booking management paths remain gated.
Journey fixtures now name an ordinary staffed agency explicitly, use actual
signed operator sessions, and supply current native business-service authority.
Backdated parity fixture rows simulate the historical read-cutover prerequisite
across all current disposable tenants. They are not measured seven-day parity.
No owner, reader, actor, retention or provider-seat SQL was weakened.

## Migration and integration manifest

[All 266 ordered migrations](./launch-completion-migrations-2026-10-08.json)
are byte-identical to e9ac136f. This package adds, renumbers or rewrites no SQL.
The manifest includes every filename and SHA-256 against the applied266
baseline. Deployed reader/owner/retention and actor ACL successors remain intact.

Broad money/apps `1902c15c09a65d0e79431d33021559be76c8e261` from
`cdf5c31a10085b949c2ab25045f0d5dd4d270cb6` was compared, not merged here.
The bounded merge-tree reproduced 15 conflicts. #601 owns its separate
reconciliation; its new 31-migration tail, 42 original acceptances and populated
rollback/current-authority/READ ONLY proof remain the coordinator's gates.
The unrelated local `integrate/reborn-1.0` source was inspected, not promoted.

For a combined private candidate: start at the coordinator's exact qualified
#601 commit, cherry-pick this branch's exact commit, retain its stronger SQL
successors and use this manifest to prove the original266 bytes survived.
Resolve intersections in `src/proxy.ts`, brand/URL helpers, website publication
and rendering, signed Auth context, workspace owner invitation callers and
journey fixtures against current authority. No isolated green run substitutes
for combined full units, typecheck/lint/build/boundaries/ontology, actual client
contracts, ordered/native/historical upgrade/rollback/READ ONLY tests and real
Auth/Postgres/Redis browser proof on the resulting exact head. Recheck payer,
Connect, creator and Versions intersections under #601; do not import its
prepared breadth by editing this checkout.

## Local acceptance and limits

Technical receipts are private under the bound checkout's
`.scratch/launch-completion/receipts/`. No generated local Auth keys belong in
published docs. Logs preserve failed runs as well as final passing proof.

| Acceptance | Evidence | Limit / open gate |
| --- | --- | --- |
| Ordinary agency account and client business | Minimum real Auth/browser run, production account/create-agency and add-client APIs, no super-admin role; provider seat without client membership | Verified identities originate in disposable Auth setup; external Google/SMTP acquisition not exercised |
| Exact owner claim/approval | Actual claim UI and saved candidate approval; unverified agency, missing mandate and other agency refused | Independent publish verification is an explicitly fictional reviewed fixture; no real verifier/provider acceptance |
| Published page and saved return | Actual HTTP renderer/hash, mounted canonical/navigation/sitemap, desktop1440 and mobile390, saved owner receipt/readback state | Loopback only; public HTTPS verification correctly fails |
| Public form empty/error/pending/success | Actual visitor POST, whitespace name400, keyboard submit, pending fieldset and eventual success | Only transport was briefly held to observe pending; no app response/store acceptance mocked; no external mail |
| Session/tenant isolation | Private routes404, forged preview/tenant headers ignored, no response auth cookie, outsider publication refusal | Hosted proxy/cookie/protection behavior still needs exact-origin deployed proof |
| Pause and revocation | Active=false immediately404 despite cached publication; actual mandate-revoke RPC; accepted publication replay retains one receipt | Native tests cover refusal of new effects; accepted-effect replay is intentionally retained, not made retryable |
| Booking and inquiries | Real local booking approve/decline desktop/mobile; anonymous offered slot→requested booking→duplicate409→owner confirmation; durable held inquiry release and marker | Synthetic historical parity and owner/service setup; no calendar/email provider effect |
| Native current authority | `check:agency-workflow`, `check:workspace-sql`, `check:workspace-upgrade` on real PostgreSQL18; ordered266, outsider/revocation/stale/replay, writer lock races, populated forward/rollback/reapply, owner effects, reader/retention/ACL checks | Local source proof; not production migration application or broad #601 integration proof |
| Client/API compatibility |196/196 checks against nine actual existing client clones | Existing helper reads declared pin sources where present; not nine clean isolated pin builds or deployed readback |
| No-login owner requirement #475 | Retained email-only and one-tap journey failures | Still open; do not grant authority from an old bearer/link fixture to turn it green |
| Full1.0 / combined package | Retained expanded 12 run: 4 passed / 8 failed; later scoped repairs pass independently | Full combined acceptance remains open; no full1.0 claim |

Commands used (all local; provider credentials absent):

```sh
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:agency-workflow
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
SUPABASE_CLI=supabase bash scripts/check-agency-workflow-browser.sh --path-sites
pnpm test --maxWorkers=4
pnpm typecheck
pnpm lint
pnpm build
NEXT_PUBLIC_SITES_PATH_ORIGIN=https://assigned-sites.vercel.app pnpm build
pnpm check:boundaries
pnpm check:ontology
pnpm check:site-domains
CUSTOM_REPO_CHECKOUTS_ROOT="$PWD/.scratch/launch-completion/clients" pnpm check:custom-repos
```

The minimum runner creates and cleans only its unique app, real Redis bridge
and disposable Auth/Postgres stack. Global Supabase 2.120.0 was already installed;
pinned 2.117.0 was absent from the offline cache. No package was added. Existing
locked dependencies were restored offline without install scripts.

Retained failures: initial unavailable Docker/CLI bootstrap; obsolete recipient
and conversion fixtures; typecheck's removed designation import; publication
revocation expectation incorrectly demanding403 for an accepted replay;
Node `.localhost` resolution; trailing-slash308 probes; native-service fixture
missing current business service; an obsolete fixture membership column;
product boundary import; and one 5-second unit import timeout under concurrent
build/full-suite load. Corrections do not erase those receipts. Expanded owner
links and Versions remain unqualified in this branch. Filtered journey commands
exit1 because the aggregate checker requires all 12 journeys, even when their
selected test passes. Do not report those commands as a green aggregate.

## Two activation choices

Primary sources read October 8, 2026; costs below are advertised inputs, not
Strelva's account bill or a selected price.

| Choice | Cost and machinery | Authority and decisive proof |
| --- | --- | --- |
| Existing stable assigned production `.vercel.app` alias + prepared path mount | $0 registrar/DNS purchase if that alias already belongs to the existing project. Vercel provides production/generated URLs; use the stable production address rather than a retained commit preview. Current Pro list price is $20/month with $20 usage credit. Incremental database/runtime/support cost is unknown. | Jacob selects exact alias and authorizes env/new production deployment; confirm assignment, protection, app-host separation, caching/headers and public TLS/hash/visitor readback without Vercel cookies. Reversing env needs another build; issued receipt URLs stay immutable. |
| Separate neutral registrable apex + existing wildcard site routing | Example non-premium `.com` registrar list price $11.08/year registration and renewal; exact name/availability/premium/tax quote unknown. Uses existing independent sites-root source and project. Vercel wildcard setup normally uses its nameservers; official challenge delegation is an alternative only where nameserver change is unavailable. Runtime/support remain unknown. | Jacob selects brand/name, registrar owner, renewal liability and spend; separately authorizes wildcard binding/DNS/TLS/env/deploy. Confirm exact provider records, propagate/read back, preserve old records, verify new site and existing client sites, prepare and prove undo. |

Vercel's [generated/production URL docs](https://vercel.com/docs/deployments/generated-urls)
explain URL lifetimes and production aliases. Its
[pricing](https://vercel.com/pricing) supplies the Pro input; its
[Hobby terms](https://vercel.com/docs/plans/hobby) restrict Hobby to personal,
noncommercial use, so $0 Hobby is not this commercial hosting plan.
[Registrar pricing](https://porkbun.com/products/domains) supplies the
non-premium `.com` example. The
[wildcard instructions](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
were updated September16,2026 and distinguish certificate challenge delegation
from traffic routing. Inspect deployment protection explicitly: the recent
[free production protection announcement](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)
supersedes older paid-addon assumptions, but protection can still block anonymous
visitors. No purchase, record or protection change was made here.

The assigned-origin choice removes registrar/DNS setup from the first hosted
page if an existing public alias is usable. It does not remove domain choice
for a customer's own brand, guarantee crawl/indexing, or make hosting free.
Contribution remains revenue minus runtime/database, delivery/support labor,
failed verification/rework and other variable costs; those unknown inputs
cannot be set to zero. Neither option accepts a price or commercial term.

## Server-rendered facts and visibility

`connect.js` is not the only public facts path in the bounded source.
`src/products/connected-sites/business-pages.ts` and
`src/app/biz/[handle]/page.tsx` server-render `/biz/{handle}` with inline JSON-LD;
`src/app/biz/[handle]/llms.txt/route.ts` emits the same confirmed facts as text.
`schema-block.ts` supplies escaped static JSON-LD and a content hash for a person
to paste into an existing site's HTML. This package makes no such outside edit.

The `/biz` loader needs workspace/connected-sites release,
`STRELVA_BUSINESS_PAGES=1`, the business's public connected-sites release row,
a valid published handle and confirmed name. SQL publication requires current
verified owner/admin authority; public SQL excludes exited workspaces.
Confirmed facts/services filter provenance; policies additionally require
verified owner/operator provenance and private identifiers are omitted. Route
code refuses tenant hosts. Directory/robots/sitemap follow those gates.
`business-pages-routes.test.ts` tests actual SSR HTML/text projection with fixture
stores and refusal/error/privacy gates; the full unit run includes that proof.
Native schema tests supply separate SQL authority proof. Neither constitutes
an observed external crawl, citation or ranking. Private authenticated MCP
provides a different access contract; public booking MCP has its own release,
read and customer-confirmation boundaries. Prices must not promise “found by AI”
on this evidence.

Next action: coordinator qualifies the exact combined private candidate, keeps
all original outside gates open, then presents one concrete hosting activation
choice plus exact deployment/readback/undo action for Jacob's decision.
