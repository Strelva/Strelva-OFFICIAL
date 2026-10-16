# Switch-on

October 16, 2026. Branch `xa/fix-switch-on`. The machine-readable plan is
[`scripts/release-safety/switch-on.json`](../scripts/release-safety/switch-on.json).
Nothing here has touched production. The main session runs the cutover when
every gate is green.

## What "everything on" means

Every Strelva-controlled switch goes on in deploy 1, once the held migrations it
needs are applied. Owner email goes on in deploy 2, and it is only two kinds:
the **owner claim** (an agency's claim link, or the operator's owner
invitation) and **Needs you** (a decision waits on the owner). Everything that
needs money, Google, a provider key or counsel stays off, and the plan says how
each of those renders.

Client email stays globally off. `EMAIL_SENDING_ENABLED` is not touched,
because opening it would also open weekly and monthly reports, domain notices,
reconnect notices, export mail and team invitations. Instead, each chosen kind
has its own stream:

```
STRELVA_OWNER_EMAIL_STREAMS=owner_claim,needs_you
STRELVA_OWNER_EMAIL_SINCE=<the cutover instant, ISO with zone>
```

## The guarantees, and where they are proven

Every stream send passes through the one transport
(`src/platform/infra/email/send.ts`, new helper `owner-streams.ts`). The rules
hold whichever gate let the send through, so turning the global switch on later
cannot skip them.

| Guarantee | How | Proof |
| --- | --- | --- |
| Only confirmed owner addresses | `public.owner_email_confirmed(workspace, email)`: an operator-recorded confirmation (`confirm_owner_email`, with a note saying how Jacob confirmed it), or the business's own verified signed-in owner. An address that is only on file (a site contact, a converted tenant's `owner_email`, an agency's claim recipient) never counts. Staff addresses are refused even when confirmed. Read failure or a missing migration holds the send. | `src/__tests__/owner-email-switch-on.test.ts`, `tests/owner-email-confirmations-schema.sql` via `pnpm check:owner-email-sql` |
| No backfill on first enable | A Needs you decision opened before `STRELVA_OWNER_EMAIL_SINCE` is recorded once as `opened_before_owner_email_on` and never mailed; it stays on Home. Claims and invitations issued before the switch time are held too. The transport rechecks with the earliest decision in a digest. Unset or malformed switch time: no stream mail at all. | same test file, "Needs you on first enable" and "never mails something from before the switch time" |
| Respects `reb:client-email:{tenant}` | The existing audience gate runs first: an `off` override on any linked tenant, or on the business, silences its stream mail. | "respects a per-tenant off" cases |
| Every send logged | One line per stream attempt: `[email] owner-stream <stream> <accepted\|suppressed\|failed> workspace=<id> recipient=<sha256 prefix> message=<id> \| reason=<why>`, plus `[email] accepted audience=... message=...` for every accepted send. Never the address or subject. Needs you and claims also keep their durable delivery rows. | "logs it without the address", "logs the hold", "logs a provider failure" |
| Only its own stream | A stream opens the client gate for itself. Reports and other client mail stay behind `EMAIL_SENDING_ENABLED`. Reminders are a separate stream (`needs_you_reminders`) that is not in the list. One recipient per send; the stream's business must match the send's. | "opens only its own stream", "refuses a stream send to several recipients" |
| Plan keeps Jacob's calls | No STAYS_OFF name is changed, email is the last deploy, every change has a rollback and a registered migration, no address appears in the plan. | `src/__tests__/switch-on-plan.test.ts` |

What the owner gets: one decision is the XA "Waits for you" email (E1) with the
same signed yes link the old layout carried; several decisions keep the list.
The claim email is the existing XA paper claim. When Strelva does not send, the
agency and operator screens say why in one sentence:
"Strelva didn’t email … : Strelva hasn’t confirmed it’s the owner’s address yet.
Copy the link and send it yourself."

## Run order

**Step 0, read-only.**

1. Pull production env to a temp file and run `pnpm tsx scripts/prod-flag-report.ts <file>`. It prints names and normalized states only. Fill in every `unknown` in the plan from it.
2. Read every `reb:client-email:*` value (Redis) and each `tenant_settings` `client_email` row. Each must be `inherit` or `off`. An `on` arms *all* client email for that tenant; set it to `inherit` before deploy 2.
3. Confirm the held migrations from `MIGRATION-PLAN.md` are applied, now 29 including `20261028120000_owner_email_confirmations.sql` (registered in `batches.json`, batch `xa-build-2026-10-16`).

**Deploy 1: code plus Strelva switches.** Apply migrations in plan order
(`20261026160000` and `20261027120100` before or with the code), then set phases
A to J from the JSON and make a fresh production deploy. Phase A needs no held
migration; B to J each name the migrations they wait for.

**Record confirmations.** Only for an exact address Jacob has confirmed for an
exact business:

```sql
select public.confirm_owner_email('<operator user id>', '<operator verified email>',
  '<business workspace id>', '<owner email>', 'How Jacob confirmed it, e.g. by phone Oct 16');
```

The six candidate owner emails in the vault (site contact info for Leslie,
McLears, Orange Crate, RHM, Smokin Buddha and Vermont) are **unconfirmed**. None
is recorded until Jacob confirms that exact address. Cocard has none.

**Deploy 2: email.** Set phase K (switch time first, streams second, then the
releases) and make a fresh production deploy. Set `STRELVA_OWNER_EMAIL_SINCE`
to the instant of this deploy.

**Verify.** In runtime logs, every stream line names a stream, an outcome and a
reason. Before any confirmation exists, every attempt reads
`reason=owner_email_unconfirmed`. Home still shows every waiting decision.

## Rollback

- Email: remove `STRELVA_OWNER_EMAIL_STREAMS` and make a fresh deploy; every stream send is held at once. To stop one address without a deploy, `revoke_owner_email_confirmation`.
- Flags: each change in the JSON carries its rollback value (empty means remove the variable; it assumes the variable was unset, so if step 0 read another value, go back to that). Env changes need a fresh deploy, or promote the previous deployment.
- Migration: `rollback-20261028120000_owner_email_confirmations.sql` drops the table and functions. Recorded confirmations are lost, so capture them first; with the read gone every stream send is held.

## What I found on the way

- **The 11 legacy clients can't get an agency claim email.** `prepare_agency_owner_claim_email` (20261025132000) refuses any business linked to a tenant. Their claim is the operator's owner invitation, which now rides the `owner_claim` stream (`invitation-delivery.ts`). Team invitations still need both global switches and stay off.
- **Six of those clients' trusted owner address is a Strelva staff address** (vault Oct 14). The staff check refuses them in Needs you (`owner_contact_staff_reason`) and in `owner_email_confirmed`, so they get nothing until Jacob gives a real address.
- **Per-source Needs you switches** (website change, connected-site change, listings) required `EMAIL_SENDING_ENABLED`. They now accept the `needs_you` stream instead, so their own switch plus the stream is enough. Dental intake's owner email stays off.
- **`scripts/silent-rollout.ts` would stop this cutover**: it lists `STRELVA_MAKE_REAL_OWNER_LINK_RELEASE` as a client-send flag. Jacob's Oct 15 email call supersedes that preflight for deploy 2. The script is unchanged.
- **The $0 cap is not yet a waitlist.** Ask says "Building is paused because this business has no included building usage. Bring in an agency to continue with help." (`src/platform/infra/business-ai-budget.ts:11`, link at `src/experience/ask/AskStrelva.tsx:413`). It is a path, not a wall, but it is not the "we'll tell you when plans open" Jacob asked for, and this app has no waitlist store. That belongs to the money lane. Telling people later is itself an email Jacob hasn't turned on.
- Listings in sync has no cron in `vercel.json` and care reports have no generation cron (grade, Oct 15). Turning them on shows the Apps; they run on request.

## How the STAYS_OFF surfaces read

- **Google Business Profile writes**: set `STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE=pending` (phase A). Writes then read "Google hasn't approved Strelva's Business Profile access yet, so nothing was posted…" (`src/lib/gbp-setup-pending.ts:15`) instead of failing. REVIEW still lists a disabled gray "Make it live" on Google disconnected; that is a UI-lane fix.
- **Provider keys (HighLevel, Microsoft, Instagram)**: the connections read reports `platformReady: false` from `providerKeyStatus`, and the connection page says "Strelva hasn't switched {name} on yet. Connecting works once it has." (`src/components/dashboard/ConnectionDetailPage.tsx:234`). Outlook also needs `20261026150000` before any `MICROSOFT_*` key is added.
- **Dental intake**: `STRELVA_VERTICAL_INTAKE_RELEASE` unset means the App is not offered at all, so there is no dead end to hit. The plan test fails if any phase sets it.
- **Booking, inquiry, reminder and marketing email**: requests and inquiries still land on Home and in the inbox. The booking widget says no confirmation email was sent (`enabled.ts` customer policy).
- **Money**: no price is published, billing says "No plan price is published yet. Nothing is charged until you see one and agree to it." (`StartWorkspacePlan.tsx`).

Proven locally only (Vitest, the PG18 throwaway cluster). Nothing above was
observed in a browser or in production.

## Inventory

170 entries: every switch the source reads, including the two new stream variables. Classes:
**EMAIL_ON** (claim and Needs you only), **STRELVA_ON** (Strelva-controlled,
turn on), **STAYS_OFF** (email Jacob kept off, money, Google, provider keys,
Dental, cost or scope), **UNCHANGED** (already on, data-path switches with their
own parity proof, dev-only). "Prod now" is what the vault records; `unknown`
means nothing was recorded and step 0 must read it.

### EMAIL_ON

| Name | Where | Controls | Prod now | Held migration | Change | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `STRELVA_AGENCY_OWNER_CLAIM_EMAIL_RELEASE` | `src/products/agency-clients/claim-email.ts:14` | Agency 'email the owner the claim link' (also needs STRELVA_WORKSPACE_RELEASE and the owner_claim stream) | off (vault Oct 14: claim email off) | 20261028120000 | `1` (rollback `unset`) | Owner claim email, confirmed owners only. SQL still refuses clients already linked to a tenant (the 11 legacy clients). |
| `STRELVA_CONNECTED_SITE_CHANGE_OWNER_EMAIL` | `src/products/connected-sites/keep-your-site-release.ts:27` | Needs you email for a planned connected-site change | off | 20261026100000, 20261026120100, 20261027160000, 20261027160100, 20261027160200 | `1` (rollback `unset`) | A Needs you email. Only reaches confirmed owners through the stream. |
| `STRELVA_INVITATION_EMAIL_RELEASE` | `src/platform/workspaces/invitation-delivery.ts:23` | Workspace invitation email. Owner invitations ride the owner_claim stream; team invitations still need the global switches | off (grade Oct 15) | 20261028120000 | `1` (rollback `unset`) | The operator's owner invitation is the claim for a converted client (gldf, rohlax). Team invitations stay off. |
| `STRELVA_LISTINGS_SYNC_OWNER_EMAIL` | `src/products/listings-sync/release.ts:25` | Needs you email for a listings fix | off | 20261028100200, 20261028100300 | `1` (rollback `unset`) | A Needs you email. Only reaches confirmed owners through the stream. |
| `STRELVA_MAKE_REAL_OWNER_LINK_RELEASE` | `src/platform/release-flags/resolve.ts:97` | Make it live approved by signed email link for an owner with no account | off (silent rollout preflight) | none | `1` (rollback `unset`) | Same reason for Make it live decisions. scripts/silent-rollout.ts lists it; that preflight is superseded for this cutover. |
| `STRELVA_OWNER_DECISION_LINKS_RELEASE` | `src/platform/release-flags/resolve.ts:103` | Owner decides a Needs you item from the email link without an account (owner_decision_links) | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Without it the Needs you email's yes answers 'Sign in to decide this'. Links bind to the recipient the item was sent to. |
| `STRELVA_OWNER_EMAIL_SINCE` | `src/platform/infra/email/owner-streams.ts:57` | NEW. Switch time; nothing that happened before it is mailed (no backfill). Unset = no stream mail | unset (new in this build) | 20261028120000 | `<cutover instant, ISO with zone, e.g. 2026-10-16T18:00:00Z>` (rollback `unset`) | Set to the moment of the email deploy so decisions already waiting are never blasted. |
| `STRELVA_OWNER_EMAIL_STREAMS` | `src/platform/infra/email/owner-streams.ts:51` | NEW. Owner email streams that open the client gate for themselves only: owner_claim, needs_you, needs_you_reminders | unset (new in this build) | 20261028120000 | `owner_claim,needs_you` (rollback `unset`) | Jacob: claim + Needs you on, reminders off. Mails only addresses confirmed for the business (owner_email_confirmed). |
| `STRELVA_SITE_CHANGE_OWNER_EMAIL` | `src/products/websites/site-change-email.ts:10` | Needs you email for a website change preview (needs a sending gate: global or the needs_you stream) | off | 20261027120000, 20261027120100, 20261027120200, 20261027120300 | `1` (rollback `unset`) | A Needs you email. Only reaches confirmed owners through the stream. |

### STRELVA_ON

| Name | Where | Controls | Prod now | Held migration | Change | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `STRELVA_AGENCY_PROSPECTING_RELEASE` | `src/platform/agency-prospecting/server.ts:6` | Agency prospecting (find businesses to add) | unknown (not recorded in vault) | none | `1` (rollback `unset`) | No external gate; adds nothing without the agency acting. |
| `STRELVA_AGENT_ABUSE_MONITOR` | `src/server/operator-queue/sources.ts:488` | Operator queue guard for agent booking confirmations | unknown (not recorded in vault) | none | `1` (rollback `unset`) | A protection; on is safer. |
| `STRELVA_AGENT_IDENTITY_LIMITS` | `src/platform/agent-channel/limits.ts:27` | Rate limits per agent identity | unknown (not recorded in vault) | none | `1` (rollback `unset`) | A protection; on is safer. |
| `STRELVA_AI_CONTROLS_RELEASE` | `src/platform/infra/ai-controls-release.ts:9` | Per-client AI pause, monthly limit and review-reply hold | off (grade Oct 15) | 20261026170000 | `1` (rollback `unset`) | Turn on before Google approval lands so the review hold exists (grade risk). |
| `STRELVA_AI_LIST_PRICE_CEILING` | `src/platform/infra/ai-controls-release.ts:14` | List-price ceiling for capped model calls (cost accounting, not a customer price) | off (grade Oct 15) | 20261026170000 | `1` (rollback `unset`) | Shares business_ai_budget_v2 with the controls; shows no price. |
| `STRELVA_APP_EVENTS_RELEASE` | `src/platform/release-flags/resolve.ts:79` | Delivery of business events to App handlers (capture is a separate DB switch, off) | off | 20261028100000, 20261028100100 | `1` (rollback `unset`) | Capture stays off per business until enabled in data. |
| `STRELVA_APP_EVENT_WEBHOOKS_RELEASE` | `src/platform/app-events/release.ts:41` | Signed outbound webhooks for App events | off | 20261028100000, 20261028100100 | `1` (rollback `unset`) | Needs app events; endpoints are registered by agencies. |
| `STRELVA_APP_RELEASES` | `src/platform/app-releases/release.ts:5` | App Releases catalog for agencies and operators | off (grade Oct 15: absent) | none | `1` (rollback `unset`) | No external gate. |
| `STRELVA_AUTO_POST_DECISION_RECORD` | `src/lib/reviews/auto-reply.ts:140` | Review auto-reply records a policy decision | off (grade Oct 15) | 20261027110000, 20261027111000 | `1` (rollback `unset`) | Records only; posting still needs Google approval. |
| `STRELVA_BUSINESS_RECORD_READS` | `src/platform/business-record/public-reader.ts:7` | Public reads of confirmed business facts | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Confirmed facts only. |
| `STRELVA_CARE_REPORTS_RELEASE` | `src/platform/release-flags/resolve.ts:81` | Care plan reports App | off | 20261028100400 | `1` (rollback `unset`) | No generation cron yet (grade); reports are made on request. |
| `STRELVA_CARE_REPORT_SHARE_LINKS` | `src/platform/care-reports/release.ts:21` | Revocable read-only care report links | off | 20261028100400 | `1` (rollback `unset`) | Strelva-controlled; no email. |
| `STRELVA_CONNECTED_SITES_RELEASE` | `src/platform/release-flags/resolve.ts:96` | Connect a site that runs elsewhere (per-business rows) | unknown (not recorded in vault) | 20261026100000, 20261026120100 | `1` (rollback `unset`) | No external gate; installer authority comes with 20261026120100. |
| `STRELVA_CONNECTED_SITE_SCHEMA_CONFLICTS_RELEASE` | `src/platform/needs-you/release.ts:24` | Connected-site published-fact observations (record only) | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Records only. |
| `STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE` | `src/lib/gbp-setup-pending.ts:50` | Tells Strelva Google's Business Profile approval is pending so writes read as 'waiting on Google' | unknown (not recorded in vault) | none | `pending` (rollback `unset`) | Honest state for the GBP gate: 'pending' is not approval and turns nothing on. |
| `STRELVA_DOCUMENT_HISTORY_RELEASE` | `src/products/documents/server.ts:10` | Document history | unknown (not recorded in vault) | none | `1` (rollback `unset`) | No external gate. |
| `STRELVA_EXIT_HANDOFF` | `src/app/api/workspace-exit/handoff/route.ts:6` | Site handoff when a business leaves | off (grade Oct 15) | none | `1` (rollback `unset`) | Owner control. |
| `STRELVA_EXPORT_RECOVERY` | `src/platform/workspace-exports/recovery.ts:9` | Export recovery for failed v3 exports | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Pairs with v3. |
| `STRELVA_EXPORT_SCHEMA_3` | `src/app/api/workspace/route.ts:342` | Workspace export v3 | off (grade Oct 15) | none | `1` (rollback `unset`) | Owner's data, no external gate. Link email stays off; the page shows the link. |
| `STRELVA_INQUIRIES_RELEASE` | `src/platform/release-flags/resolve.ts:87` | Workspace inquiries inbox and /business | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Exposure only; tenant authority still checked. Inquiry email stays off. |
| `STRELVA_INQUIRY_BUSINESS_FACTS` | `src/products/inquiries/business-context.ts:28` | Inquiry context from confirmed business facts | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Read only. |
| `STRELVA_INQUIRY_OUTCOMES` | `src/products/inquiries/outcome-proof.ts:10` | Inquiry outcomes (answered, booked) | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Read only. |
| `STRELVA_KEEP_YOUR_SITE_RELEASE` | `src/platform/release-flags/resolve.ts:83` | Connected-site health, change Requests and Releases | off | 20261026100000, 20261026120100, 20261027160000, 20261027160100, 20261027160200 | `1` (rollback `unset`) | Needs connected_sites on for the business. |
| `STRELVA_LISTINGS_SYNC_RELEASE` | `src/platform/release-flags/resolve.ts:80` | Listings in sync App: compare details with website, Google listing and booking page | off | 20261028100200, 20261028100300 | `1` (rollback `unset`) | Compare only; Google fixes stay off (GBP). Cron is not scheduled in vercel.json (grade). |
| `STRELVA_MAKE_REAL_LIVE` | `src/platform/release-flags/resolve.ts:90` | Make it live with real effects: hosted website, sections, inquiry form, booking page, internal app (per-business rows) | unknown (not recorded in vault) | none | `1` (rollback `unset`) | The owner's yes is what makes it live; nothing changes on a client site without one. Google listing is separate (STAYS_OFF). |
| `STRELVA_MCP_OAUTH` | `src/platform/agent-channel/oauth.ts:12` | Public MCP OAuth for assistants (Connections · assistants) | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Strelva-controlled; scopes are granted by the owner. |
| `STRELVA_ONE_APPROVAL_PATH` | `src/platform/needs-you/release.ts:20` | One approval path: tenant /api/approve links decide through Needs you | off (grade Oct 15) | 20261027110000, 20261027111000 | `1` (rollback `unset`) | Removes the second decision authority. |
| `STRELVA_ONE_INVITATION_PATH` | `src/platform/owner-entry/operator-invitations.ts:20` | Operator invitations go through the one owner invitation path | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Closes /api/admin/invites as a grant path that bypasses agency grants (grade). |
| `STRELVA_ONE_QUEUE` | `src/platform/provider-client-queue/release.ts:8` | One agency Queue for client work | off (grade Oct 15) | 20261027110000, 20261027111000 | `1` (rollback `unset`) | No external gate. |
| `STRELVA_OPERATOR_QUEUE_RELEASE` | `src/platform/operator-queue/release.ts:3` | Portfolio operator queue in the console | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Operator-only surface. |
| `STRELVA_OWNER_INVITATIONS_RELEASE` | `src/platform/owner-entry/operator-invitations.ts:9` | Operator owner invitations | likely 1 (silent invitations issued Oct 14), unverified | none | `1` (rollback `unset`) | Needed for the operator owner claim; no send by itself. |
| `STRELVA_OWNER_REACH_RELEASE` | `src/platform/owner-reach/release.ts:9` | Owner reach: can this owner be told, agency and operator views | off (grade Oct 15) | 20261027100000 | `1` (rollback `unset`) | No external gate; tells agencies why an owner can't be reached. |
| `STRELVA_PROVIDER_CHANGE` | `src/app/workspace/provider-change/page.tsx:10` | Owner changes agency (provider change page) | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Owner control; no external gate. |
| `STRELVA_SITES_BY_CODE_RELEASE` | `src/platform/release-flags/resolve.ts:78` | Coding agents pick up website Requests over MCP; previews need the owner's Make it live | off | 20261027120000, 20261027120100, 20261027120200, 20261027120300 | `1` (rollback `unset`) | Apply 20261027120100 before or with the code (it backfills gldf, rohlax, rhm content source). |
| `STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED` | `src/experience/systems/server.ts:375` | Website System reads business facts | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Read only. |
| `STRELVA_WEBSITE_NATIVE_FACTS_ENABLED` | `src/app/workspace/business-details/native-website-facts.ts:71` | Native websites follow confirmed business facts | unknown (not recorded in vault) | none | `1` (rollback `unset`) | Confirmed facts only. |

### STAYS_OFF

| Name | Where | Controls | Prod now | Held migration | Change | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `CUSTOMER_EMAIL_ENABLED` | `src/platform/infra/email/enabled.ts:81` | End-customer (visitor) email: booking confirmations, inquiry replies, intake patients, newsletters | off (vault Oct 14) | none | none | Booking, inquiry and marketing email stay off by Jacob's call (Oct 15). |
| `EMAIL_SENDING_ENABLED` | `src/platform/infra/email/enabled.ts:19` | Global client (owner) email gate for every client-audience sender: weekly/monthly reports, domain, reconnect, exports, invitations, Needs you without a stream | off (vault Oct 14/15: client email off) | none | none | Opening it would turn on every owner email, not just claim + Needs you. The two chosen kinds go out on their own streams (STRELVA_OWNER_EMAIL_STREAMS). |
| `STRELVA_AGENCY_PAY_LINKS` | `src/platform/agency-pay-links/release.ts:9` | Agency pay links (needs STRELVA_CONNECT) | off (grade: stub) | 20261026180000 | none | Money. |
| `STRELVA_AGENCY_PAY_LINKS_LIVE` | `src/platform/agency-pay-links/release.ts:10` | Pay links with a live Stripe key | off | 20261026180000 | none | Money. |
| `STRELVA_AGENT_CHANNEL_RELEASE` | `src/platform/release-flags/resolve.ts:77` | Agent customer confirmation (owner consent required) | unknown (not recorded in vault) | none | none | Confirms bookings to customers; customer email is off. |
| `STRELVA_AGENT_INQUIRIES` | `src/platform/agent-channel/inquiries.ts:13` | Assistants send inquiries | unknown (not recorded in vault) | none | none | Inquiry email off; needs its own proof. |
| `STRELVA_AGENT_PAYMENTS` | `src/platform/connect/agent-payments.ts:14` | Agent payments | unknown (not recorded in vault) | none | none | Money; needs seller terms. |
| `STRELVA_AGENT_PAYMENT_MERCHANT_PROFILES` | `src/platform/connect/stripe-agent-payments.ts:28` | Agent payment merchant profiles | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_AGENT_PAYMENT_PROTOCOL` | `src/platform/connect/stripe-agent-payments.ts:22` | Agent payment protocol version | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_AGENT_PAYMENT_SELLER_TERMS_APPROVED` | `src/platform/connect/stripe-agent-payments.ts:23` | Agent payment seller terms approved | unknown (not recorded in vault) | none | none | Money; external terms. |
| `STRELVA_AGENT_READABLE` | `src/app/robots.ts:24` | robots allows assistants to read business pages | unknown (not recorded in vault) | none | none | Changes robots on public pages; needs Jacob's SEO call. |
| `STRELVA_BACKGROUND_WORK_RELEASE` | `src/app/api/cron/workspace-work/route.ts:44` | Background work cron | off (capabilities doc) | none | none | Spends AI money unattended; money call. |
| `STRELVA_BOOKING_AGENTS` | `src/products/websites/site-seo.ts:46` | Booking pages declared to assistants | unknown (not recorded in vault) | none | none | Needs the Postgres booking store. |
| `STRELVA_BOOKING_AGENT_VISIBILITY` | `src/platform/agent-channel/public-tools.ts:167` | Booking tools visible to assistants | unknown (not recorded in vault) | none | none | Needs the Postgres booking store. |
| `STRELVA_BOOKING_CALENDAR_SCOPES` | `src/products/scheduling/calendar/oauth.ts:84` | Google Calendar write scopes | unknown (not recorded in vault) | none | none | Needs Google OAuth verification for the scopes. |
| `STRELVA_BOOKING_MESSAGES` | `src/platform/bookings/flags.ts:118` | Booking messages to customers | unknown (not recorded in vault) | none | none | Customer email stays off. |
| `STRELVA_BOOKING_OWNER_NOTICE` | `src/platform/bookings/flags.ts:53` | Immediate owner email for a new booking request | off (vault Oct 6/15) | none | none | Booking email stays off. Requests still wait on Home. |
| `STRELVA_BOOKING_REMINDERS` | `src/platform/bookings/flags.ts:64` | Booking 24 h / 72 h reminders and expiry | off (vault Oct 6/15) | none | none | Reminder email stays off. |
| `STRELVA_BUNDLE_MAINTENANCE_RELEASE` | `src/products/operations/recurring.ts:24` | Bundled maintenance (recurring paid work) | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_BUSINESS_BILLING` | `src/app/api/workspace/route.ts:342` | Owner billing surfaces (Plan and billing) | unknown (not recorded in vault) | none | none | Money: honest 'not yet', no Stripe switch-on. |
| `STRELVA_BUSINESS_OUTCOME_REPORTS` | `src/platform/business-outcomes/reports.ts:9` | Monthly outcome reports grouping | unknown (not recorded in vault) | none | none | Report email is off; needs its own proof. |
| `STRELVA_BUSINESS_PAGES` | `src/products/connected-sites/business-pages.ts:28` | Business pages on connected sites | unknown (not recorded in vault) | none | none | Writes pages onto client sites; separate yes. |
| `STRELVA_CARE_REPORT_EMAIL` | `src/platform/care-reports/release.ts:16` | Email a shared care report to the owner (needs EMAIL_SENDING_ENABLED) | off | 20261028100400 | none | A report email, not claim or Needs you. The page says it was not sent. |
| `STRELVA_CATALOG_REPORTS_RELEASE` | `src/platform/release-flags/resolve.ts:101` | Search Console catalog reports | unknown (not recorded in vault) | none | none | Needs Search Console access (provider key), unverified. |
| `STRELVA_CONNECT` | `src/app/workspace/billing/page.tsx:133` | Stripe Connect | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_CONNECTED_SITE_EMAIL_ENABLED` | `src/products/connected-sites/notify.ts:69` | Connected-site rollout notices | off | none | none | Not claim or Needs you. |
| `STRELVA_CONNECT_CHECKOUT_TENANTS` | `src/app/api/checkout/route.ts:146` | Tenants using Connect checkout | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_CONNECT_FEES_COLLECTOR` | `src/platform/connect/index.ts:27` | Connect fee collector profile | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_CONNECT_LOSSES_COLLECTOR` | `src/platform/connect/index.ts:27` | Connect losses collector profile | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_CONNECT_PROFILE_VERSION` | `src/platform/connect/index.ts:27` | Connect liability profile version | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_CUSTOMERS_RELEASE` | `src/platform/customers/release.ts:3` | Enterprise customers | off | none | none | Not a 1.0 surface. |
| `STRELVA_CUSTOM_APPLICATION_BUILD_PROVIDER` | `src/products/custom-applications/lifecycle.ts:543` | Vercel Sandbox build provider for custom Apps | unknown (not recorded in vault) | none | none | Paid provider, not authorized. |
| `STRELVA_EXPORT_LINK_EMAIL` | `src/app/api/workspace-export/v3/route.ts:59` | Emailing a v3 export link | off | none | none | Not claim or Needs you; the export page shows the link. |
| `STRELVA_GHL_IMPORT_RELEASE` | `src/products/agency-clients/gohighlevel/config.ts:22` | HighLevel client import | off (vault Oct 12) | none | none | HighLevel provider keys are not in hand. |
| `STRELVA_GOOGLE_MAKE_REAL_RELEASE` | `src/platform/release-flags/resolve.ts:95` | Make it live on the Google listing | unknown (not recorded in vault) | none | none | Google Business Profile writes have no approval. |
| `STRELVA_GOOGLE_OWNER_CONNECT` | `src/products/google-listing/connect/flags.ts:13` | Owner connects their own Google account | off (vault Oct 12) | none | none | GBP approval unknown. |
| `STRELVA_GOOGLE_READ_GRANT` | `src/products/google-listing/connect/flags.ts:14` | Google read grant | off (vault Oct 12) | none | none | GBP approval unknown. |
| `STRELVA_INQUIRY_BOOKING_HANDOFF` | `src/products/inquiries/booking-handoff.ts:15` | Inquiry to booking handoff | unknown (not recorded in vault) | none | none | Needs Postgres inquiry records and booking store. |
| `STRELVA_INQUIRY_FORWARDING_RELEASE` | `src/products/inquiry-forwarding/release.ts:17` | Forward your inquiries (inbound mail) | off (vault Oct 12) | none | none | Needs Postgres inquiry records and an inbound domain (DNS/receiving). |
| `STRELVA_INQUIRY_OWNER_NOTICES` | `src/products/inquiries/owner-notice.ts:11` | Immediate owner email for a new inquiry (also needs CUSTOMER_EMAIL_ENABLED) | off | none | none | Inquiry email stays off. Inquiries still land in the inbox. |
| `STRELVA_INQUIRY_REPLIES` | `src/products/inquiries/workspace-replies.ts:11` | Owner replies to an inquiry by email from the workspace | unknown (not recorded in vault) | none | none | Customer email stays off. |
| `STRELVA_INTAKE_OWNER_EMAIL` | `src/products/vertical-intake/release.ts:41` | Needs you email for Dental intake | off | 20261028100500, 20261028100600, 20261028100700 | none | Dental intake is blocked until counsel. |
| `STRELVA_INTAKE_SENSITIVE_FIELDS` | `src/products/vertical-intake/release.ts:27` | Dental member ID field (ciphertext) | off | 20261028100500, 20261028100600, 20261028100700 | none | Blocked until counsel. |
| `STRELVA_INTERNAL_TOOL_NOTICES_RELEASE` | `src/platform/release-flags/resolve.ts:100` | Internal tool submit notices (email) | unknown (not recorded in vault) | none | none | Not claim or Needs you. |
| `STRELVA_LISTINGS_SYNC_GOOGLE_FIX` | `src/platform/app-releases/catalog.ts:133` | Listings in sync applies fixes to Google | off | 20261028100200, 20261028100300 | none | GBP writes have no approval. |
| `STRELVA_LISTINGS_SYNC_YELP` | `src/products/listings-sync/release.ts:22` | Listings in sync reads Yelp | off | none | none | Provider key / terms not in hand. |
| `STRELVA_MONEY_RECONCILIATION` | `src/app/workspace/money-reconciliation/page.tsx:28` | Money reconciliation page | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_NEWSLETTER_CONTACTS_RELEASE` | `src/platform/release-flags/resolve.ts:102` | Newsletter contacts in the business record | unknown (not recorded in vault) | none | none | Only useful with newsletter sending, which stays off. |
| `STRELVA_NEWSLETTER_SENDER_RELEASE` | `src/products/publishing/newsletter-sender.ts:43` | Receipted newsletter batch sender | off | none | none | Marketing email stays off. |
| `STRELVA_PLANNING_ENABLED` | `src/products/work-plans/generation.ts:52` | Work plan generation | off (capabilities doc) | none | none | Spends AI money on Strelva's account; money call. |
| `STRELVA_PLATFORM_COLLECTION` | `src/platform/connect/platform-collection.ts:7` | Platform collection of payments | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_PRODUCT_LEARNING_RELEASE` | `src/products/product-learning/server.ts:9` | Product learning | off | none | none | Out of 1.0 scope (Oct 6 spec). |
| `STRELVA_PUBLISHING_NOTICES_SEND` | `src/platform/needs-you/publishing-delivery.ts:15` | Needs you email for publishing items (needs global + customer email) | off | none | none | Publishing is off (Google writes and newsletters are gated). |
| `STRELVA_PUBLISHING_RELEASE` | `src/platform/release-flags/resolve.ts:98` | Listing and newsletter Systems | unknown (not recorded in vault) | none | none | Both effects are gated (GBP, marketing email); showing them now would be a wall. |
| `STRELVA_RECORD_GOOGLE_APPROVAL_POLICY` | `src/platform/release-flags/resolve.ts:99` | Record approval includes the Google write | unknown (not recorded in vault) | none | none | GBP writes have no approval. |
| `STRELVA_REVENUE_SPLITS` | `src/experience/workspace/money/SourceAttributionView.tsx:64` | Revenue splits | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_SANDBOX_2048MB_CONTRACT_APPROVED` | `src/products/custom-applications/sandbox-runtime.ts:18` | Sandbox 2 GB contract | unknown (not recorded in vault) | none | none | Paid provider, not authorized. |
| `STRELVA_SANDBOX_RUNTIME_APPROVED` | `src/products/custom-applications/sandbox-runtime.ts:17` | Sandbox runtime approval | unknown (not recorded in vault) | none | none | Paid provider, not authorized. |
| `STRELVA_SELF_SERVE_BILLING` | `src/platform/business-billing/workspace-checkout.ts:20` | Self-serve plan checkout | off (grade: unpriced) | none | none | Money: no price decided. |
| `STRELVA_SPLIT_PAYOUTS_DRY_RUN` | `src/app/api/cron/split-payouts/route.ts:8` | Split payout dry-run cron | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_SPLIT_PAYOUT_EXECUTION` | `src/app/admin/money/page.tsx:21` | Split payout execution | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG` | `src/platform/work-economics/subscription-entitlements.ts:94` | Subscription allowance config | unknown (not recorded in vault) | none | none | Money. |
| `STRELVA_VERTICAL_INTAKE_RELEASE` | `src/platform/release-flags/resolve.ts:82` | Dental intake App (new-patient form) | off | 20261028100500, 20261028100600, 20261028100700 | none | Blocked until counsel. Off, the App is simply not offered. |
| `STRELVA_WEBSITE_DOMAIN_EMAIL_ENABLED` | `src/platform/needs-you/sources/website-domain-store.ts:53` | Needs you email for website domain requests (needs global + customer email) | off | none | none | Website building stays Coming soon (Oct 14). Domain decisions still show on Home. |
| `STRELVA_WEBSITE_MODEL_CALLS_ENABLED` | `src/products/websites/rebuild-runtime.ts:28` | Model calls for website rebuild | unknown (not recorded in vault) | none | none | Rebuild stays off; AI cost is a money call. |
| `STRELVA_WEBSITE_REBUILD_RELEASE` | `src/platform/release-flags/resolve.ts:88` | Website rebuild and hosted website documents | unknown (not recorded in vault) | none | none | Website building stays Coming soon (Oct 14, no sites domain). |
| `STRELVA_WEBSITE_REPORT_EMAIL_ENABLED` | `src/products/websites/site-report.ts:105` | Website report email | off | none | none | Report email, not claim or Needs you. |
| `STRELVA_WORKSPACE_ALLOWANCE_KEY` | `src/platform/business-billing/workspace-checkout.ts:18` | Included-usage key for the plan | unset | none | none | Money. |
| `STRELVA_WORKSPACE_PRICE_ID` | `src/platform/business-billing/workspace-checkout.ts:17` | Stripe price for the self-serve plan | unset | none | none | Money: no price decided. |

### UNCHANGED

| Name | Where | Controls | Prod now | Held migration | Change | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `CONTENT_SOURCE` | `src/platform/infra/db/source-flags.ts:26` | Content read source | unknown (not recorded in vault) | none | none | Data path. |
| `DATA_SOURCE` | `src/platform/infra/db/source-flags.ts:53` | Data read source | unknown (not recorded in vault) | none | none | Data path. |
| `DUAL_WRITE_PG` | `src/platform/infra/db/dual-write.ts:20` | Dual write to Postgres | unknown (not recorded in vault) | none | none | Data path. |
| `GOVERNED_WORK_DUAL_WRITE` | `src/platform/infra/db/dual-write.ts:32` | Governed work dual write | unknown (not recorded in vault) | none | none | Data path. |
| `GOVERNED_WORK_READ_PG` | `src/platform/infra/db/dual-write.ts:46` | Governed work read source | unknown (not recorded in vault) | none | none | Data path. |
| `OPERATOR_EMAILS_ENABLED` | `src/platform/infra/email/enabled.ts:40` | Operator alerts to Strelva staff (default on; 'false' kills) | default on | none | none | Internal staff alerts; not owner or customer mail. |
| `PROSPECT_EMAILS_ENABLED` | `src/platform/infra/email/enabled.ts:61` | Audit-report email to someone who ran the free /audit (default on) | default on | none | none | Already on; prospect mail warms the domain. Not part of this decision. |
| `REB_DEV_TENANT` | `src/platform/infra/dev-access.ts:12` | Dev tenant | n/a | none | none | Dev only. |
| `REB_DEV_UNGATED_ACCESS` | `src/platform/infra/dev-access.ts:6` | Dev ungated access | n/a | none | none | Dev only; never in production. |
| `STRELVA_AGENCY_ADD_CLIENT_RELEASE` | `src/products/agency-clients/index.ts:7` | Agency adds a client and issues the owner claim link | 1 (vault Oct 7/12) | none | none | Already on. |
| `STRELVA_AGENCY_IMPORT_RELEASE` | `src/products/agency-clients/index.ts:20` | Agency CSV client import | 1 (vault Oct 12) | none | none | Already on. |
| `STRELVA_AGENCY_SIGNUP_RELEASE` | `src/platform/agency-signup-release.ts:14` | Agency front door and setup checklist | 1 (vault Oct 12) | none | none | Already on. |
| `STRELVA_AGENCY_WORKSPACE_ID` | `src/platform/workspaces/strelva-agency.ts:5` | Strelva Agency's workspace id (config, not a switch) | set (vault Oct 12) | none | none | Config. |
| `STRELVA_APPROVAL_STORE_RELEASE` | `src/platform/release-flags/resolve.ts:85` | Unified approval store for Needs you | unknown (not recorded in vault) | none | none | Data path; own proof. |
| `STRELVA_ASK_RELEASE` | `src/platform/ask/release.ts:14` | Ask Strelva (the one composer) | 1 (vault Oct 14) | none | none | Already on; paused for unsubscribed businesses by the $0 cap. |
| `STRELVA_AUTH_EMAIL_CODE` | `src/components/auth/email-readiness.ts:12` | Sign-in code instead of link | unknown (not recorded in vault) | none | none | Auth presentation; not part of this decision. |
| `STRELVA_AUTH_EMAIL_READY` | `src/components/auth/email-readiness.ts:3` | Sign-in link email via Supabase Auth SMTP | 1 (vault Oct 15, dpl_J975) | none | none | Already on. |
| `STRELVA_BOOKING_CALENDAR_BUSY` | `src/platform/bookings/flags.ts:79` | Read calendar busy times | unknown (not recorded in vault) | none | none | Calendar provider proof. |
| `STRELVA_BOOKING_CALENDAR_MIRROR` | `src/platform/bookings/calendar-mirror.ts:34` | Mirror bookings into calendars | unknown (not recorded in vault) | none | none | Blocked by the booking store parity gate. |
| `STRELVA_BOOKING_INQUIRY_OFFERS` | `src/platform/bookings/inquiry-offers.ts:17` | Offer times from an inquiry | unknown (not recorded in vault) | none | none | Blocked by the booking store parity gate. |
| `STRELVA_BOOKING_MANAGE_PAGE` | `src/platform/bookings/flags.ts:69` | Visitor manage-booking page | unknown (not recorded in vault) | none | none | Blocked by the booking store parity gate. |
| `STRELVA_BOOKING_MANUAL` | `src/platform/bookings/manual.ts:21` | Manual bookings (needs Postgres store) | unknown (not recorded in vault) | none | none | Blocked by the booking store parity gate. |
| `STRELVA_BOOKING_READ_POSTGRES_DEFAULT` | `src/platform/bookings/flags.ts:49` | Default booking read source | unknown (not recorded in vault) | none | none | Parity gate. |
| `STRELVA_BOOKING_RECORD_FALLBACK` | `src/platform/bookings/record-fallback.ts:28` | Booking record fallback | unknown (not recorded in vault) | none | none | Parity gate. |
| `STRELVA_BOOKING_SETTINGS` | `src/platform/bookings/setup.ts:24` | Booking settings (needs Postgres store) | unknown (not recorded in vault) | none | none | Blocked by the booking store parity gate. |
| `STRELVA_BOOKING_STORE_READ` | `src/platform/bookings/flags.ts:47` | Read bookings from Postgres | unknown (not recorded in vault) | none | none | Parity gate. |
| `STRELVA_BOOKING_STORE_WRITE` | `src/platform/bookings/flags.ts:43` | Write bookings to the Postgres store | unknown (not recorded in vault) | none | none | Needs 7 parity days (grade). |
| `STRELVA_BUSINESS_AI_BUDGET` | `src/app/workspace/billing/page.tsx:213` | Enforce the AI budget for unsubscribed businesses | 1 (vault Oct 13) | none | none | Jacob kept the $0 cap (Oct 14). The paused state must say plans aren't open yet. |
| `STRELVA_BUSINESS_SIGNUP_RELEASE` | `src/platform/business-signup-release.ts:16` | Direct business sign-up | 1 (vault Oct 12) | none | none | Already on. |
| `STRELVA_CALENDAR_FIXTURE` | `src/products/scheduling/server.ts:176` | Fixture calendar adapter | n/a | none | none | Tests only; never set in production. |
| `STRELVA_CLAIM_REVIEW_RELEASE` | `src/products/agency-clients/index.ts:35` | Owner reviews what the agency prepared before claiming | 1 (vault Oct 12) | none | none | Already on. |
| `STRELVA_CLIENT_RECORDS_DUAL_WRITE` | `src/platform/account-bindings/flip-readiness.ts:22` | Client records dual write | unknown (not recorded in vault) | none | none | Data path. |
| `STRELVA_CLIENT_RECORDS_READ` | `src/platform/account-bindings/flip-readiness.ts:13` | Client records read list | unknown (not recorded in vault) | none | none | Data path. |
| `STRELVA_CONNECTIONS_LEGACY_GOOGLE` | `src/app/api/oauth/google/legacy-connection-source.ts:16` | Legacy Google connection source | unknown (not recorded in vault) | none | none | Data path. |
| `STRELVA_CSP_NONCE_REPORT_ONLY` | `src/lib/csp-nonce.ts:6` | Nonce CSP in report-only mode | unknown (not recorded in vault) | none | none | Security header rollout; separate proof. |
| `STRELVA_FINITE_JOBS_RELEASE` | `src/platform/release-flags/resolve.ts:84` | Unified finite jobs | unknown (not recorded in vault) | none | none | Data path; own proof. |
| `STRELVA_FREE_MONTHLY_AI_CAP_USD` | `src/app/api/workspace/agency-ai-controls/route.ts:11` | Free monthly AI usage for unsubscribed businesses | 0 (vault Oct 13) | none | none | Money: stays $0 until pricing is decided. |
| `STRELVA_FULL_MODEL_PROFILE` | `src/products/websites/owned-proof-readback.ts:6` | Local proof profile | n/a | none | none | Local proof only. |
| `STRELVA_GOOGLE_BINDINGS` | `src/platform/account-bindings/store.ts:55` | Google token binding store (with DUAL_WRITE_PG and the READ list) | unknown (not recorded in vault) | none | none | Alone it breaks every reconnect (grade). Data path, own proof. |
| `STRELVA_INQUIRY_RECORDS` | `src/products/connected-sites/store.ts:49` | Durable Postgres inquiry records | unknown (not recorded in vault) | none | none | Data path with DUAL_WRITE_PG. |
| `STRELVA_LEADS_AUTHORITY` | `src/lib/lead-reads.ts:51` | Lead authority (postgres) | unknown (not recorded in vault) | none | none | Data path. |
| `STRELVA_LEADS_READ` | `src/lib/lead-reads.ts:46` | Lead read source | unknown (not recorded in vault) | none | none | Data path. |
| `STRELVA_LOCAL_AUTH_PROOF` | `src/products/google-listing/native/server.ts:60` | Local auth proof harness | n/a | none | none | Local proof only. |
| `STRELVA_NATIVE_GOOGLE_ONLY` | `src/products/google-listing/native/server.ts:37` | Native-only Google grants | unknown (not recorded in vault) | none | none | Proof harness / data path. |
| `STRELVA_NEEDS_YOU_RELEASE` | `src/platform/needs-you/release.ts:9` | Needs you: Home decisions, /api/approve workspace links, the hourly chase | 1 (vault Oct 14) | none | none | Already on; its email now rides the needs_you stream. |
| `STRELVA_OWNER_ENTRY` | `src/platform/release-flags/resolve.ts:86` | Owner sign-in into the workspace (per-business rows) | 1 (vault Oct 14) | none | none | Already on. |
| `STRELVA_OWNER_INVITATION_CLAIM` | `src/platform/owner-entry/server.ts:33` | /account claims a pending owner invitation by verified email | 1 (vault Oct 14) | none | none | Already on. |
| `STRELVA_PAY_LINK_STORE` | `src/platform/agency-pay-links/release.ts:15` | Pay link store (redis or postgres) | unknown (not recorded in vault) | 20261026180000 | none | Data path; money stays off. |
| `STRELVA_SYSTEMS_RELEASE` | `src/platform/release-flags/resolve.ts:89` | Systems: Home, System pages, Possibilities, Make it live, Versions (per-business rows) | 1 (vault Oct 14) | none | none | Already on; one row is 'off'. |
| `STRELVA_TENANT_CONVERSION` | `src/server/tenant-conversion/review.ts:21` | Tenant to workspace conversion | unknown (not recorded in vault) | none | none | Operator migration tool. |
| `STRELVA_TENANT_CONVERSION_PRODUCTION_APPROVED` | `src/server/tenant-conversion/review.ts:22` | Conversion approved for production | unknown (not recorded in vault) | none | none | Operator migration tool. |
| `STRELVA_TENANT_RECEIPT_RETENTION` | `src/lib/deprovision.ts:199` | Keep receipts on deprovision | unknown (not recorded in vault) | none | none | Data retention. |
| `STRELVA_UI_PREVIEW` | `src/app/preview/strelva/agency-events/page.tsx:5` | Preview routes (development only) | n/a | none | none | Dev only; never set in production. |
| `STRELVA_WORKSPACE_RELEASE` | `src/platform/release-flags/resolve.ts:151` | Kill switch for the whole workspace: off, every workspace flag is off | 1 (since Sep 30) | none | none | Already on. |
| `STRIPE_BILLING_GRANDFATHER_TENANTS` | `src/lib/subscription.ts:31` | Grandfathered tenants (gldf, rohlax) | set | none | none | Money config. |
| `TENANTS_SOURCE` | `src/platform/infra/db/source-flags.ts:68` | Tenants read source | unknown (not recorded in vault) | none | none | Data path. |

### Config, not switches

Read by the source but not feature switches, so not changed here: `EMAIL_LOGO_URL`, `STRELVA_ASK_COST_ALERT_USD`, `STRELVA_CUSTOMERS_CURSOR_SECRET`, `STRELVA_MARKETING_ORIGIN`, `STRELVA_PAYMENT_LINK_SECRET`, `STRELVA_SANDBOX_BUILD_IMAGE`, `STRELVA_SANDBOX_POLICY_VERSION`, `STRELVA_SANDBOX_PROJECT_ID`, `STRELVA_SANDBOX_PROVIDER_TOKEN`, `STRELVA_SANDBOX_TEAM_ID`, `STRELVA_WEBSITE_MODEL_MAX_CALLS`.

Test-only names (`*_PSQL`, `*_PROOF`, `*_REDIS_PROOF`, `STRELVA_NATIVE_CHILD_OLD_SOURCE`) are read only under `src/__tests__` and never set in production.
