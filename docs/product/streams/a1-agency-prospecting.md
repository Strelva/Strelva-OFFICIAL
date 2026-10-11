# Agency prospecting — #276 / #277

Updated October 7, 2026. Local implementation on `a1/agency-prospecting`; no
migration, flag, email, profile or extension has been changed in production.

## Current contract

`STRELVA_AGENCY_PROSPECTING_RELEASE=1` opens agency-sourced checks. Unset / `0`
keeps public Strelva behavior, including its acquisition copy and lead routing.
The flag is env-only so this stream does not redefine the shared workspace flag
catalog. An agency also needs an enabled `agency_prospecting_profiles` row tied
to a workspace whose kind is `agency`. Its unique slug, HTTPS contact URL and
contact email are explicit configuration. Profiles default disabled. There is
no special Strelva agency, implicit provider, or member/staff bypass.

Configuration stays service-only pending agency profile / brand work (#264).
Workspace name supplies the display name. `AgencyAttribution.brand` reserves
nullable logo and accent-color fields; this stream supplies name-only identity.
Do not infer approval for agency sender domains or new sending credentials.

- Entry: `/ai-visibility?agency=<slug>` or `/audit?agency=<slug>`.
- API entry: `agency` in the check/scan/lead JSON body or URL query; query wins.
- Embed: `/embed/agency/<slug>/ai-visibility` or `/embed/agency/<slug>/audit`.
  These use the product-owned form without account navigation. Only the agency's
  configured contact URL **origin** (and self) can frame them; other app routes
  keep their existing framing rules. Embeds stay on their own URL after scoring.
- Share: attribution is pinned in the retained result. Reading a different
  agency query on a shared result does not move its ownership. Export rendering
  uses the pinned identity; the caller-supplied audit-export endpoint resolves
  its explicit agency slug from the server and ignores body-forged identity.
- Advice: attributed results replace `Ask Strelva` / `ask Strelva` with
  `Ask your web provider` / `ask your web provider`. Raw scanner results and the
  shared scan cache keep their original copy. Findings, reports and email
  summaries derive from the attributed result.
- CTA: agency contact URL, with “on Strelva” platform credit. Copy asks the agency
  to discuss work; it makes no accepted delivery or monitoring commitment.

`prospects` is the durable agency-owned lead store. Monitor signup takes agency
ownership **only from the stored scorecard**, bypassing `delivery_leads` and its
email-level dedupe even when Strelva already knows that email. Audit lead creates
an attributed report and prospect before emailing; it sends no Strelva Slack
notification. The report email uses name-only agency identity, the existing
platform prospect sender/gates, and the agency contact email for replies. An
attributed send without agency reply routing is suppressed.

A missing profile, persistence failure, exceeded quota, or disabled flag never
falls back to Strelva. Legacy unattributed requests retain their existing path.
Existing attributed monitor links reject writes while the flag is off, rather
than turning their agency leads into Strelva leads. Existing retained reports
continue to show their original attributed identity.

Agency members open **View prospects** in their agency workspace, leading to
`/workspace/prospects?workspace=<uuid>` (latest 200 requests). The JSON endpoint
is `/api/workspace/prospects?workspace=<uuid>`. It derives a confirmed Supabase
identity and the service RPC checks current direct membership and verified
email. Direct authenticated database reads have JWT-bound membership RLS;
anonymous reads and all public-key writes are denied. No delegated-client or
operator bypass grants prospect visibility.

## Quota and schema

Migration `20261011170000_agency_prospects.sql` is additive; the version was
checked against integrate, open w6 migration trees, and agency worktree files.
Its rollback refuses acquired leads, then drops the new stores/functions only
before adoption. The SQL gate checks actual rollback/reapply and refusal.

Each profile has a UTC-day check quota and lead quota, default 100 each,
configurable 1–1000. These are abuse/cost ceilings, not pricing or entitlements.
Check attempts are admitted durably before scoring (including cached scans);
failed admitted scans still count. IP limits remain in place. Lead admission is
transactional with insert. Dedupe is agency + source + result + normalized email;
a retry costs no lead quota and another agency's lead never suppresses it.

## Extension handoff — remains #276

The Chrome extensions are a separate repository and were not edited. They need:

1. Explicit agency-slug configuration with no hardcoded Strelva agency fallback.
2. Carry that slug in scan/check API calls, and use the returned pinned agency
   identity in result/export display and agency contact CTA.
3. Carry retained check/report IDs into deep links and monitor/audit lead calls;
   never use a later query/body agency to reassign a saved result.
4. Honor unavailable-profile, quota and persistence errors; preserve legacy
   behavior when unattributed or the release is off.
5. Jacob's review and Web Store resubmission. Agency profile logos/colors and
   per-agency sender domains remain with #264 / their owning streams.

No matched-agency discovery changed: the requested compatibility scope keeps
unattributed public pages as they are. #276 remains partial for extensions,
matching, and richer profile branding.

## Evidence and next action

Local proof: frozen-lockfile install; typecheck; lint; boundaries; route/copy,
email, proxy and existing public-product regression tests; custom-repo check;
isolated Postgres RLS/quota/rollback suite; full workspace SQL and full-schema
upgrade rehearsal. Exact final test counts and commands belong in the PR.

Browser proof uses a fictional local profile endpoint and browser-intercepted
scoring/signup responses. Desktop/mobile AI result, agency CTA, signup success,
embed form and CSP were inspected; no real provider scoring, email or production
write occurred. Profile setup, real agency demand, production migration and
email delivery remain unproven. No production rollout is authorized.

Next: integrate the PR; reconcile shared proxy, email layout, workspace
contracts, readiness sentinels and SQL-gate edits with other agency streams.
Keep the flag off until #264 profile configuration and the release gate have
been reviewed. Larger prospect-to-client work (#259) is not activated here.

Final targeted verification after rebasing onto integrate (October 7): 144 tests
passed across 15 files, including new acquisition/member UI tests and existing
AI visibility, audit, email, middleware and agency-home regressions. Typecheck
and boundaries passed. The initial upgrade rehearsal correctly rejected the new
RLS security-definer helper under the exposure gate; the gate now allows only its
exact JWT-bound signature and verifies its authenticated-only execute grant.
Initial strict type checking also found unchecked indexing in test assertions;
those assertions were corrected. These failures were resolved locally, not
waived. The first cold browser navigation timed out during compilation; the
loaded page was subsequently inspected successfully.
