# Agency incidents and status

Prepared 2026-10-07 for [#417](https://github.com/Strelva/Strelva-OFFICIAL/issues/417), source baseline `115448a9`. **Proposed procedure; no status vendor, public URL, subscriber list, on-call coverage or delivery integration activated.** `[JACOB]` marks approval, staffing or a live action. Use the [support model](./support-model.md) for proposed hours; this is not a 24/7 SLA.

## What detects trouble today

| Evidence | Actual code behavior | Operational limit |
| --- | --- | --- |
| `/api/health` | [Route](../../src/app/api/health/route.ts) and [health checks](../../src/lib/health.ts): Redis ping, Supabase tenant read, authenticated Stripe events read, Gemini models read; 3-second check timeouts; HTTP 503 for core down | Non-core error returns degraded **HTTP 200**. Inspect JSON, not only HTTP. No end-to-end booking/payment/mail/auth proof |
| Domain monitor | [Cron](../../src/app/api/cron/domain-monitor/route.ts): active tenant domains, downtime/parking/expiry; operator email when signature changes | Every 30 minutes in [vercel.json](../../vercel.json); persistent unchanged issue does not repeatedly email. No human acknowledgment or agency broadcast |
| Website health | [Cron](../../src/app/api/cron/website-health/route.ts): every active site's coverage; released hosted revision read-back | Daily at 05:30 UTC; general coverage is report-only, hosted mismatch email is release-gated. Old/unknown evidence is not green |
| Domain verification | [Cron](../../src/app/api/cron/website-domain-verification/route.ts): provider reads and local claim updates, every minute | Skips without Vercel token; seven-day escalation email tied to website rebuild release. It cannot perform registrant renewal/DNS work |
| Cron watchdog | [Cron](../../src/app/api/cron/heartbeat/route.ts), [age table](../../src/platform/infra/heartbeat.ts): checks freshness every 30 minutes; [monitoring](../../src/platform/infra/monitoring.ts) targets configured Slack/Sentry | Six-hour dedupe hashes the full context, including changing `ageSeconds`; a continuing stale cron can alert every scan. Missing Redis returns unknown last-seen without stale assertions. `lastOk=false` is distinct from age; not a separate watchdog trigger. Watchdog depends on the platform it monitors |
| `/admin/queue`, `/admin/ops`, `/admin/uptime` | Source gaps, operational attention, receipt/read-back failures and saved domain health | Operator-only. Queue ownership is not agency notification; closing marks does not fix the source |

Code and schedules do not establish current production configuration or alert delivery. Before launch `[JACOB]` verify actual destinations, credentials, release gates, last successful runs and one received staging alert. Operator mail defaults on unless explicitly disabled; client mail defaults off in [email policy](../../src/platform/infra/email/enabled.ts). A provider-accepted message is not proven delivery. Never report all systems healthy from one successful `/api/health` response.

## Severity and communication

Jacob is incident lead, recovery approver and communicator. Agents prepare a timeline, bounded hypotheses, source references, isolated reproduction and draft updates. There is no assumed second responder. `[JACOB]` select backup human, paging destination and out-of-hours arrangement; until then incidents outside staffed hours are best effort and the public support statement must say so.

Incident severity below is an operating classification, not a change to queue P1–P4 rules.

| Severity | Examples | Proposed communication `[JACOB]` |
| --- | --- | --- |
| SEV1 | Cross-business exposure, duplicate charges/effects, likely accepted-data loss, widespread platform outage | During coverage: human acknowledgment within 2 staffed hours; initial public impact note within 30 minutes of acknowledgment; update hourly while actively responding |
| SEV2 | One platform function unavailable to several agencies; individual live site down; blocked billing reconciliation | Confirmed live outage: acknowledge within 2 staffed hours, matching support targets. Other blocked functions: within 1 staffed business day. Initial affected-agency note within 1 staffed hour of acknowledgment; updates every 4 staffed hours |
| SEV3 | Review delay, isolated noncritical defect, stale evidence without confirmed customer impact | Case response per support model; next staffed-day update if still blocked |

Outside coverage, publish the next staffed update time once Jacob is available; do not schedule an hourly promise nobody can meet. A private security case can be SEV1 without publishing tenant IDs, exploit detail or an unverified breach claim. The public note can state the affected function and protective restriction; send sensitive impact only to verified affected contacts after review. Unknown scope is stated as unknown, not “no customers affected.”

## Respond, recover, reconcile

1. **Confirm and own.** Start a private incident ID and timeline with UTC times plus agency-facing timezone, first report, detection, human acknowledgment, evidence age, affected businesses/Systems/functions and last known-good evidence. Take the source queue item if present. Check an independent request and provider status; a failed monitor is a signal, not a diagnosis. A denied/unavailable operator board becomes an evidence gap in the incident.
2. **Bound harm.** Identify affected grants, release flags, provider operations and jobs. Prepare the smallest stop action. `[JACOB]` approve its exact target and expected customer effect before production pause, env change, provider mutation or deployment. Preserve unaffected existing client service. Do not claim a new kill switch exists from this document.
3. **Tell agencies.** Jacob approves impact, workaround and next update time before external posting/sending. Publish a broad function incident when there is broad impact; contact only verified affected agency/business representatives for specific cases. Do not let the owner/agency need to log in to discover a live failure. A status subscription is useful, but not a substitute for targeted action-required contact.
4. **Prepare recovery.** Read [rollback.md](./rollback.md), [release packet](./release-1.0-packet.md) and [release stop conditions](./horizontal-release-checklist-2026-09-11.md#stop-conditions-and-recovery). Pin the actual known-good deployment artifact, compatibility evidence and schema batch. A historical SHA rebuilt today is not necessarily the deployed artifact. `[JACOB]` approve promotion/flag/schema/record changes separately; no production action is authorized by this runbook.
5. **Reconcile effects.** Code rollback does not undo Stripe charges, messages, bookings, domain/provider writes or schema migrations. Preserve newly accepted records. Inspect provider IDs and [outside-write receipts](../../src/platform/operator-queue/receipts.ts); accepted + failed read-back is not a retry instruction. For money use the [billing runbook](./billing-ops-runbook.md). For custom apps, [rollback](../../src/products/custom-applications/lifecycle.ts) selects an existing released artifact; record preservation still needs relevant evidence, not an assumption that rollback reverses client work.
6. **Verify from the customer job.** Check ordinary auth and denied access, correct-business reads, affected live rendering, relevant v1/revalidation, recovered job/backlog and cron timestamps, and provider outcomes. Reuse the affected release proof; no universal all-green button. Record exactly what remains unverified and who owns it.
7. **Monitor then resolve.** Proposed `[JACOB]`: observe at least two successful checks over 30 minutes for fast probes, then verify the next affected scheduled job (daily work can remain pending after visible recovery). Post “monitoring” with residual impact until evidence supports resolution. Close queue/source records separately and log actual minutes. Jacob approves a final agency update and, for SEV1/2, a review within 2 staffed business days: impact, causes supported by evidence, recovery, unresolved losses/uncertainty and one owner per preventive action.

Never use a full production database restore as an automatic undo. The release packet owns fresh backup/restore and batch-specific rollback evidence; `rollback.md` owns general recovery invariants. This document supplies incident orchestration and agency communication, not an alternative release-safety plan.

## Status page options and costs

Official pages checked **2026-10-07**. USD list prices, before tax; optional usage, private pages and additional subscriptions can change costs. No plan purchased. Annual equivalents below assume the stated plan remains unchanged. Self-hosting estimates are assumptions, not a quote.

| Option | Public-page cost | Useful limits/features | Founder cost and decision |
| --- | --- | --- | --- |
| **Instatus** | Starter $0; Pro **$20/month monthly** ($240/year) or **$15/month annual** ($180 prepaid/year) | Current pricing: free 200 subscribers/15 monitors, no custom domain; Pro 5,000 subscribers/50 monitors/50 team members/20 on-call members, custom domain, email/SMS; phone escalation is a higher plan | Recommended Pro for a simple independent agency status page. Pricing/help pages disagree on older unlimited/private-page terms: `[JACOB]` confirm checkout limits, notice-delivery allowances and public-page suitability |
| **Better Stack** | Free is labeled personal projects; paid responder **$34/month monthly** ($408/year), **$29/month annual** ($348/year) | Paid includes one status page/custom domain/1,000 subscribers and SMS/phone alerting; another 1,000 subscribers $40/month. Extra responders cost more | Better if Jacob chooses integrated monitoring/paging and will actually receive pages. `[JACOB]` confirm commercial free eligibility if considering free, responder bundle and notification extras |
| **Atlassian Statuspage** | Free $0 (100 subscribers); Hobby **$29/month** ($348/year); Startup **$99/month** ($1,188/year) | Hobby 250 subscribers/5 team members/custom domain/email; Startup 1,000 subscribers/10 members and email/SMS/webhooks. Free does not list custom domain | Public incident communications tool; do not count it as external monitoring or staffed response. Higher communications floor than Instatus for the pilot; choose if its integrations/workflow justify it |
| **Self-hosted Cachet** | Software $0; assumed separate host $5–20/month + mail $0–20/month = **$5–40/month** cash ($60–480/year) | Components, incidents and subscribers; check the selected release's actual integration/notice behavior. Cachet 3.x app license permits commercial use with redistribution/trademark conditions; core README says 3.x is not completely production-ready | Assume 4–8 setup hours + 1–2 maintenance hours/month: $300–600 initial + $75–150/month at $75/hour, excluding incident labor. Own patching, backup/restore, mail and availability; use separate failure domain. Not recommended for current staffing |

Sources: [Instatus pricing](https://instatus.com/pricing), [Instatus monthly price explanation](https://instatus.com/blog/sentry-pricing), [Better Stack pricing](https://betterstack.com/pricing), [Statuspage public plans](https://www.atlassian.com/software/statuspage/pricing), [Cachet](https://cachethq.io/), [Cachet license](https://github.com/cachethq/cachet/blob/3.x/LICENSE.md), [Cachet core readiness](https://github.com/cachethq/core). Prices and licensing need rechecking at purchase; vendor hosting does not remove human communication work. Instatus [customer SMS](https://instatus.com/help/status-page/notifications/sms) requires a separate messaging provider and its costs; on-call SMS is a different feature. Start with vendor email subscriptions, not a promise of included agency SMS.

**Recommendation `[JACOB]`: Instatus Pro, month-to-month for the pilot.** Its $20 floor is lower than the cited paid alternatives, subscriber capacity fits the planning examples, and it keeps page hosting away from REB. Better Stack is a reasonable alternative if phone paging plus monitoring replaces another tool rather than adding another inbox. A free provider-hosted page can prove the publishing workflow before purchase, but is not the approved branded launch. No vendor selection, spend, DNS change or subscriber upload is made here.

## Activation checklist and component scope

Before publishing `[JACOB]`:

- Choose vendor, billing interval and page visibility. Use its provider-hosted URL until any custom domain/DNS change is separately approved. Confirm independent login/recovery access and test page availability while REB is unavailable.
- Publish only functions actually available at activation: app/sign-in, public websites/content API, publishing/domain changes, inquiries/bookings, billing, platform notifications, agent/API access where released. Decompose an incident by real impact; Stripe API availability is not payment processing proof. “Connect payouts” is **after #283** plus payout implementation and authorization.
- Configure external probes and paging after approval: HTTP and JSON health, customer-visible website probes and appropriately isolated synthetic checks. Probes must not create live charges/bookings/messages. Dependency status feeds are corroboration. A monitor may draft an incident, but public impact language requires review.
- Select an authorized agency incident contact list and subscription consent/opt-out path. Keep it outside REB's failure domain and in approved private storage; do not expose tenant names on the public page. Do not silently upload the sales CRM.
- Drill one staged incident: alert received, human acknowledgment, draft approved, test-only notification delivered, page readable signed out, recovery and final update. Record actual notification receipt, not only provider acceptance. Do not mark ready from code alone.

Existing email transport [send.ts](../../src/platform/infra/email/send.ts) can report accepted or suppressed and gates audiences separately; there is no inspected status-to-agency subscriber integration or fallback contact broadcaster. Vendor subscriber mail can be independent once selected/configured. For affected-agency mail, use the authorized existing transport/contact path and record outcome. If mail is unavailable, Jacob posts to the independent status page and uses the approved alternate contact; the missing fallback is a launch decision, not an automatic channel switch.

Workspace research `docs/research/strelva-agent-channels-2026-10-07.md` separates provider directory/OAuth availability from Strelva runtime. `docs/research/strelva-domains-email-scale-2026-10-07.md` separates domain control, SSL, mail acceptance/delivery and shared suppression. Do not label all such failures “platform down” or promise that changing providers immediately fixes them.

## Agency message drafts

These are templates for Jacob's approval; bracketed fields must be replaced with verified facts before sending.

**Investigating:** “We are investigating [affected function]. [Observed impact; scope unknown if not yet known]. [Safe workaround, if verified]. Next update by [date/time/timezone]. Reference [incident ID / approved public link].”

**Update / monitoring:** “[Function] is [still affected / recovering]. We have verified [specific recovery evidence]. [Remaining impact and action agencies should take]. [Do not retry only where duplication risk is confirmed]. Next update by [date/time/timezone].”

**Resolved:** “[Function] recovered at [time]. We verified [customer-visible check] and [provider/job reconciliation]. [Any residual work, owner and next checkpoint]. Review by [date] if promised.” Do not say “no data loss,” “no duplicate charges” or give a root cause until evidence supports it.

## Continuation

#417 remains partial for launch: documentation prepared, status page and communications unactivated. `[JACOB]` decide vendor, real incident contacts/backup, hours/cadence, component claims and publication authority. Next operator action: stage the chosen page and drill loss of REB + loss of mail; attach evidence and unresolved gaps before public activation. No production system or customer received an action in this documentation task.
