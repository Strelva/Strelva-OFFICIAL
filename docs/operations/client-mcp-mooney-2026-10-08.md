# Claude client preparation: The Mooney Firm

Prepared October 8, 2026. Local implementation and rehearsal instructions;
not a deployed connector, client invitation, accepted service or evidence of
actual Claude use.

## First job

The owner asks Claude: “Using our Strelva business facts, help me improve the
wording on our website. Separate recorded facts from anything I need to confirm.”

The owner adds Strelva as a custom connector, signs in to Strelva, selects The
Mooney Firm and grants only `business:read`. Claude starts with
`read_business_context({})`: no tenant slug, workspace UUID or public listing
required. It receives selected profile facts and services with their recorded
source and verification state. The connector currently cannot read the website
document, save an edit or publish it. Claude can draft wording in the conversation.

This step prepares business context; it does not complete website management.
The next useful capability is a saved, revision-bound website proposal that the
owner reviews through the existing Strelva website workflow.

## Client boundary

Use public website/business information for this first rehearsal. The client's
accepted decision at
`/Users/jacobrhinehart/Desktop/mooney-firm-site/docs/decisions/0001-adr-notable-system-of-record.md`
keeps matter, participant, scheduling, document and case communication data in
ADR Notable. Its implementation contract leaves AI use subject to confidentiality
requirements. Neither the firm's adopted vendor configuration nor its Claude
data/retention settings were verified in this task.

Do not import matter records, dispute narratives, client documents, Outlook mail,
private staff data or inquiry payloads. Do not grant `inquiries:read` or
`quotes:approve` for this rehearsal. The shared MCP still lists those protected
tools and public customer tools; a basic profile grant does not authorize those
other protected operations. This is not a separate website-only tool catalog.

The profile projection explicitly excludes private notification recipients,
staff records/contact details, customer counts, billing and internal author or
provider references. Included fact keys are legal/display name, business
phone/email/address, service area, hours, links and description. Their values
still require review before loading: a permitted field name does not classify
arbitrary text as non-confidential. Verification flags are recorded state, not
proof of legal correctness or provider certification.

## What changed

Preparation branch: `prepare/mooney-claude-mcp-20261008`, based on
`build/mcp-auth-20261007` at `6a7d3f6e`.
Worktree: `REB/.scratch/worktrees/mooney-claude-mcp-20261008`.

- Basic business context resolves the selected workspace from its bearer token.
  Explicit selectors remain supported and must match current token authority.
- A new service-role-only resolver returns the current principal. The existing
  protected-tool transaction still locks and rechecks token, scope, owner or
  exact staffed agency grant before reading records.
- An explicit profile projection strips private record fields and rejects a
  mismatched workspace or malformed included fact.
- `scripts/check-client-mcp.mjs` checks discovery, legacy handshake, first-call
  schema and a proper unauthenticated 401 without tokens or business writes.

No dependency, production migration, environment change, deployment, customer
message, provider write or client record was created.

## Proof and limits

Local October 8 evidence:

- Six focused Vitest files: **69 tests passed**, including 11 new protected-tool
  cases and one new token-resolution case. Existing public/booking contracts
  remain covered.
- `pnpm typecheck` and ESLint on changed JavaScript/TypeScript passed.
- Ordered throwaway Postgres schema plus agent contracts passed. The new fixture
  checks an unpublished business, wrong resource, unknown/expired/revoked token,
  missing scope, removed owner, sealed RPC privileges and actual rollback/reapply.
- A real local Next HTTP probe passed metadata, CIMD/PKCE advertisement,
  2025-11-25 handshake, first-call catalog and the private-context 401.

The local dev server initially failed because Turbopack rejects a node_modules
symlink outside its root. Using the installed dependencies with `--webpack`
completed the HTTP rehearsal. The first typecheck caught a nullable selector;
that was corrected and typecheck then passed.

Unauthenticated production reads on `app.strelva.com` returned 405 for
`GET /api/mcp/public` and 404 for both OAuth discovery paths. GET 405 alone
does not establish a working POST contract. Hosted Claude client metadata
fetches returned 403 from this environment; real client identity/redirect
compatibility remains unproved.

## Before handing it to the firm

1. Reconcile this preparation with the selected release head and run the
   required combined release checks. The migration depends on the prepared
   OAuth/schema lane; it is not standalone production SQL.
2. Verify the firm's actual Strelva identity, direct owner membership and
   business workspace. The product record describes Mooney as a walkthrough,
   not an active legacy tenant. Do not guess or create its binding from a name.
3. Review the specific business facts for this first job. Confirm the owner's
   chosen Claude plan, connector administration access and data-handling settings.
4. Address one-hour tokens with no refresh and the absent owner-facing OAuth
   connection list/disconnect control. Session revocation currently needs the
   raw token, which an ordinary owner should not have to handle. Client-side
   disconnect/reconnect needs actual proof; it is not automatic renewal.
5. Rehearse with a disposable, non-confidential business on an explicitly
   authorized HTTPS staging host. Test consent/denial, code exchange, expiry,
   revocation and another-business refusal in real Claude. Observe the
   published client identity and redirect metadata rather than assuming it.
   Show the client identity host on consent; current UI names the self-asserted
   client label and return host, which needs review before client release.
6. For website management, establish the native website/work binding, then
   reuse `src/lib/agent/shared-tools.ts` (`read_site`/`patch_site`) and the
   existing revision/review/publication workflow. A local source repository or
   public URL does not establish connector editing authority.
7. Prepare the exact deployment/migrations/flags and customer onboarding
   evidence for Jacob's separate production decision. No firm invitation until
   discovery and actual Claude sign-in work on the selected host.

## Onboarding rehearsal copy

Use only after those gates pass:

1. In Claude, open **Customize → Connectors → Add custom connector**. Name it
   **Strelva** and enter the qualified host's `/api/mcp/public` URL.
   Choose the published Claude identity when supported; no shared API key.
   For Team/Enterprise, the organization administrator adds the connector,
   then the individual owner connects with their own Strelva account.
2. Sign in, choose **The Mooney Firm**, and approve the basic business-facts
   permission. Review the business name and permissions before confirming.
3. Enable Strelva in the conversation and use the first-job prompt above.
   Ask Claude to identify missing/unverified facts before suggesting copy.

The production URL is not an invitation yet. Do not send this copy to the firm
until the qualified endpoint and actual grant are confirmed.

## Resume

Current objective: prepare the first client-owned Claude connection for website
work. This branch completes safe profile bootstrap and the repeatable public
readiness probe; it remains isolated and unmerged.

Exact next action: implement renewable, owner-visible OAuth connections against
the prepared authorization lane, then run real Claude sign-in/expiry/disconnect
with an authorized fictional staging business. In parallel, verify the firm's
workspace/site binding before adding a revision-bound website proposal tool.
No provider, production or sensitive-access authority is implied.

Primary sources checked October 8:

- [Claude custom-connector setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Claude connector authentication, CIMD, callbacks and refresh](https://claude.com/docs/connectors/building/authentication)
- [Claude lazy-authentication 401 and tool retry](https://claude.com/docs/connectors/building/lazy-authentication)

These sources establish an available user authorization path. They do not prove
Strelva's integration, commercial acceptance, client adoption or support cost.
