# Owner assistant MCP: business context and website proposals

Prepared October 8, 2026 for Jacob's selected first jobs: business context and
website work, with Claude and Croki/Codex as the first clients. This is isolated
local preparation, not a deployed connection or observed native-client use.

## Customer job

Connect Strelva once, choose a business, and ask the assistant to improve its
website using recorded business facts. The assistant reads the saved native
website and saves a proposal. The owner reviews facts and changes in Strelva.
Approval and publication retain the existing owner workflow.

Example first prompt:

> Read my Strelva business context and saved websites. Explain missing or
> unverified facts. Propose clearer homepage wording using only recorded facts,
> save it for my review, and give me the Strelva review link.

The endpoint is `<qualified HTTPS origin>/api/mcp/public`. The known production
address is `https://app.strelva.com/api/mcp/public`; it is not qualified by these
local tests. The same catalog contains existing public and protected tools.
Seeing a tool does not grant its permissions.

## Prepared behavior

- `read_business_context({})` starts from the consent-selected business and returns
  allowed facts/services with source and verification state. It excludes private
  staff, notification recipients, customer counts, billing and provider refs.
- `list_websites` and `read_website` read saved native website work, documents and
  current revisions. A public URL or legacy tenant name does not establish a
  native binding. Unsaved sites and arbitrary external-page scraping are outside
  this first job.
- `propose_website_change` accepts constrained patches, pins the current work and
  candidate identity, and creates an existing native candidate/document revision
  for owner review. It rejects stale revisions and deduplicates the same request.
  It clears old approval and treats new factual claims as unverified. No live
  website write occurs.
- `list_website_proposals` returns receipts and the native review link. It reports
  the original proposal revision; `superseded` can mean later owner fact review,
  not rejection. Current revision/hash and an explanation accompany the status.
- OAuth access expires after one hour. Rotating refresh credentials renew access
  within a fixed 30-day connection family; reconnect after that. Client, resource,
  selected business, original owner/current exact agency seat and attenuated scope
  are checked. Refresh replay revokes the family. Only token hashes are stored.
- `/connect?workspaceId=<id>` lists direct-owned businesses and their connections.
  Workspace Settings links here when released. Owners see client identity,
  permissions, expiry and last renewal, and can disconnect any unrevoked family,
  including one whose original owner lost authority. Disconnect permanently
  revokes access and renewal. Lost membership alone denies access while absent;
  it does not promise irreversible revocation if membership is restored.

Request only `business:read website:read website:propose` for this rehearsal.
`website:propose` can internally inspect its candidate to validate a constrained
patch; it does not authorize the public `read_website` tool. Never infer provider,
case-data, inbox, quote approval or publication authority from this connection.
Allowed fact fields can still contain pasted confidential text; review values.

## Source and integration

Initial feature branch: `build/mcp-complete-20261008` at `6a7ac01e`, worktree
`/private/tmp/strelva-mcp-complete-20261008`, based on `9b49d9fa`.

Reborn integration (Jacob authorized October 8): `integrate/mcp-reborn-20261008`
at `/private/tmp/strelva-mcp-reborn-20261008`, based on remote
`integrate/reborn-1.0` at `f3097dd6`. It selects the four original MCP foundation
commits and the eight owner-assistant commits, plus integration-only migration
ordering and handoff. It does not bring the 137-commit private launch ancestry
into Reborn. Existing remote SQL files retain their exact bytes, and workspace
provider-seat/Add Client controls are preserved. Direct connected-sites imports
match this Reborn base; native website locks/documents already exist here.

Earlier private preparation remains `prepare/mcp-launch-integration-20261008`
at `2782587b`, based on `e28e1a5f`; its evidence is dated history, not a claim that
its other money/apps/hosting features are in this Reborn integration.

The full webpack check exposed an existing application-draft import that pulled
server-only `node:crypto` into the browser. Existing schemas now live in a
client-safe contract module, with server exports preserved. Generated route checks
also exposed two optional page arguments and an unsupported Resend route constant
export; their contract-only fixes preserve account/auth/webhook behavior. The
scoped Reborn build additionally needs the existing email sanitizer/jsdom packages
externalized so their package-relative CSS can load. No dependency was added or
upgraded. Earlier failures are retained in the proof record.

Jacob explicitly chose to skip staging and push this work to Reborn. This
instruction authorizes Git integration and push, not production deployment,
configuration, live database changes or customer access. Actual native-client
qualification follows an approved Reborn deployment. Do not infer production
readiness from the Git push; reconcile the selected release against actual
deployed source/schema and the existing release checklist first.

MCP prerequisite migrations (after the existing Reborn/native schema):

1. `20261020090016_agent_inquiries.sql`
2. `20261020090017_agent_profile.sql`
3. `20261020090018_agent_oauth.sql`
4. `20261020090019_agent_channel_policy.sql`
5. `20261020090020_agent_confirmed_provenance.sql`

New owner-assistant forward migrations, after those prerequisites:

1. `20261020090031_agent_oauth_connection_context.sql`
2. `20261020090032_agent_oauth_renewable.sql`
3. `20261020090033_agent_website_tools.sql`

Paired rollback files exist. Rollback refuses adopted renewable/website state;
that refusal is tested. Fresh ordered-schema and rollback tests do not replace
historical upgrade rehearsal or production backup/restore qualification.

Default-off gates: `STRELVA_WORKSPACE_RELEASE=1` and `STRELVA_MCP_OAUTH=1`.
Set `NEXT_PUBLIC_APP_URL` to the exact qualified app origin so issuer, resource,
discovery and redirects agree. Native website feature/release conditions and
saved website ownership remain governed by the selected launch release. Existing
Supabase Auth and service-role configuration are prerequisites; no new dependency
or secret is required by this feature. No environment or production change was made.

## Proof commands and meaning

Use existing installed dependencies. This worktree uses an external node_modules
symlink, so webpack is required locally; Turbopack rejects that arrangement.

```bash
pnpm typecheck
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH \
  STRELVA_MCP_HTTP_SQL_PROOF=1 bash scripts/check-agent-channel-sql.sh
NODE_OPTIONS=--max-old-space-size=8192 RAYON_NUM_THREADS=2 \
  PLAYWRIGHT_DIST_DIR=.next-mcp-build pnpm exec next build --webpack
```

The HTTP proof starts a clean-env local Next process, a strict loopback RPC
adapter, and disposable real PostgreSQL. It exercises actual HTTP handlers,
Supabase SDK calls and service-role SQL. Code consent is issued through a SQL
fixture: this does **not** prove Supabase browser login, actual Claude/Codex
callbacks, client refresh behavior or the selected public HTTPS deployment. It refuses repository env
files and never accepts production credentials. All data is fictional.

The browser suite is `tests/agent-connections-ui.spec.ts`. Start a local webpack
dev server with `STRELVA_UI_PREVIEW=1`, then set `PLAYWRIGHT_BASE_URL` to its local
origin. The previews also require development mode. It tests 320–1600px wrapping,
keyboard focus, confirmation/cancel, permission/loading/empty/error, disconnect
failure and recovery, consent and native owner fact review. Consent transport is
mocked in that one UI case. Browser fixtures do not establish authenticated owner
session or publication.

## Scoped Reborn push proof

Remote base `f3097dd6` plus this MCP-only slice passes **448 tests across 35
files**: 280 MCP/owner contracts, 145 public-site/workspace regressions and
23 email/sanitizer checks. The full optimized webpack build passed, including
generated route types and all 248 page entries. Ordered schema/rollback/reapply
and composed real SQL/HTTP checks passed on this scoped source. Independent
review found no functional blocker and confirmed all 434 existing remote SQL
files remain byte-identical; eight forward additions and three rollbacks have
unique versions. No dependencies, `/api/v1` or Vercel configuration changed.

The first scoped build failure (disk capacity and package-relative sanitizer
CSS) is retained alongside the passing retry. Stored console logs normalize
line endings, tabs and trailing whitespace only; test results/errors are intact.
Original stdout logs remain in `/private/tmp/strelva-mcp-reborn-*.log`.

## October 8 security review: public MCP body cap (#396)

Review of scoped source `4afd7c28` found the public MCP transport buffered the
entire body with `request.text()` before applying its 30,000-character check or
any authorization/rate limit. A synthetic chunked 1,000,000-byte unauthenticated
request was fully consumed before HTTP 400; its stream was never canceled.

Isolated branch `security/mcp-body-cap-20261008` at
`/private/tmp/strelva-mcp-body-cap-20261008` prepares a streaming 30,000-byte cap.
Declared oversize bodies are canceled before reading. Chunked bodies are canceled
as soon as a delivered chunk exceeds the remaining budget. The same native
reproduction now consumes four 10,000-byte chunks, cancels the stream and returns
HTTP 400; only chunks within the budget are retained. This preserves the existing
invalid-request response and keeps protocol parsing independent of session code.

Twelve new tests exercise the actual `/api/mcp/public` handler for public and
protected tool names: declared/chunked oversize and cancellation, multibyte bytes,
an exact 30,000-byte body, UTF-8 split across chunks, and empty/malformed JSON.
Protected calls still challenge absent bearer authority when a cookie is present.
The eight focused MCP suites pass **106 tests**. Typecheck and scoped ESLint pass. The
baseline ordered disposable-Postgres authority, renewal, revocation and website
contracts passed before this transport-only repair; SQL did not change.

Proof commands are `pnpm exec vitest run` with the OAuth, protected-tools,
routes, website-tools, connections, platform, directory and booking MCP suites;
`pnpm typecheck`; and `pnpm exec eslint src/platform/agent-channel/protocol.ts
src/__tests__/platform-mcp.test.ts`. Reproduction and verification logs remain in
`/private/tmp/mcp-body-cap-{byte-proof,unit,typecheck}.log`; baseline SQL review
is `/private/tmp/mcp-396-review-sql.log`.

This is local preparation for #396, not production rollout or issue closure.
The broader issue also owns owner email links, public leads/bookings, seat and
verification predicates, provider endpoints and remaining dependency findings.
Native HTTPS assistant sign-in/renewal remains the separate unproved matrix below.
Next action is to review this isolated commit for Git integration. Deployment,
configuration, migrations and native-client test-business access retain their
existing separate authority boundaries.

## Earlier private-source local evidence

- Integrated MCP/related contracts: **232 tests passed across 12 files**.
- Independent integrated authority/source review: **75 tests across seven files**.
- Adjacent build-repair regressions: **41 tests across six files**.
- Ordered real PostgreSQL, actual rollback/reapply and composed HTTP proof passed
  on the integrated source after version collision/order and absent generated-file
  harness failures were corrected. All earlier failure logs remain retained.
- Fourteen browser cases passed across focused runs on the feature source. Prior
  cold-load and pre-hydration-click failures were retained, then the affected
  consent/native review cases passed after readiness fixes. This is fictional UI
  proof, not real owner authentication.
- Initial full build exhausted default heap. Later isolated checks exposed the
  browser import, disk capacity and generated-route type issues above. **Final optimized webpack build passed**, including generated Next route
  types and page generation, after these repairs. A full repository
  suite/release check has not been claimed.

Evidence logs (including failures) are preserved under
`output/owner-assistant-mcp-2026-10-08/` in this isolated checkout.

## Native client rehearsal: exact remaining proof

Jacob has chosen no staging. After an explicitly approved Reborn deployment,
use an explicitly authorized non-confidential direct-owned test business with
one saved native website. Confirm the host's Supabase callback allowlist,
release/schema and public access from the assistant before inviting any customer.

For Codex 0.161.0:

```bash
codex mcp add strelva --url https://<qualified-host>/api/mcp/public
codex mcp login strelva --oauth-client-registration cimd --scopes business:read,website:read,website:propose
```

Croki uses the active Codex provider's effective MCP configuration. Verify that
home/profile before configuring it, and start a new provider turn to load tools.
No real Codex configuration was changed in this task.

For Claude, add a custom connector pointing to the qualified endpoint. Confirm
user/organization connector access and current administration UI; Team/Enterprise
may require an administrator. Claude supports published client metadata; the
server advertises CIMD with public-client token authentication. Consent shows the
verified metadata host plus the client's self-supplied name. Codex/Claude Code
portless loopback registrations support their ephemeral local callback ports;
HTTPS redirects still match exactly. Metadata discovery is not real sign-in proof.

For each client, retain evidence of:

1. Consent denial, sign-in, correct business choice and exact requested scopes.
2. Context and website reads; another-business refusal; permission step-up.
3. A saved revision-bound proposal, duplicate request receipt, stale refusal and
   the owner review link. Confirm it changes no live website.
4. Actual access expiry/refresh, 30-day reconnect behavior where feasible,
   owner disconnect, native-client reconnect and lost-membership refusal.
5. Current owner reviews facts in Strelva. Publication remains a separate
   authorized website operation and is not needed for the connector rehearsal.

## Resume and stop point

The authorized local first-job implementation is prepared. Pending proof is real HTTPS client sign-in/renewal after an approved Reborn deployment and the first
real business/site binding. No customer acceptance, recurring use, price, support
cost or distribution outcome is established. Directory submission is unnecessary
for an initial custom-connector rehearsal and remains a separate future.

Next action: push the verified scoped source to `integrate/reborn-1.0`, then
qualify the actual Reborn release/source/schema and obtain separate production
deployment/configuration/migration authority. Run the native-client matrix only
after that approved deployment and explicit test-business authority. Production deployment, flags, migrations and customer onboarding
need separate authority. The source owner is [AGENTS.md](../../AGENTS.md).

Primary client contracts checked October 8:
[Claude authentication](https://claude.com/docs/connectors/building/authentication),
[Codex MCP](https://developers.openai.com/codex/mcp),
[MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
These establish documented client paths, not observed Strelva adoption.
