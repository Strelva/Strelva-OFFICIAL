# Agency support model

Prepared 2026-10-07 for [#416](https://github.com/Strelva/Strelva-OFFICIAL/issues/416), against `integrate/reborn-1.0` at `115448a9`. **Proposed operating policy; not a staffed service or contractual SLA.** `[JACOB]` marks a decision or live action requiring Jacob. These documents do not authorize production access, messages, money movements or a launch.

The agency gets one accountable platform contact and a clear next action. Today that contact is Jacob. Agents gather evidence, reproduce failures in isolation and draft responses. They do not supply a second human, make verification judgments, accept liability, submit dispute evidence or promise recovery times. Existing client agreements remain in force; this proposal does not reduce them.

## Responsibility and coverage

| Work | Accountable human | Agent work | Boundary |
| --- | --- | --- | --- |
| Agency verification | Jacob, platform reviewer | Check completeness, compare provider result references, flag mismatches | `[JACOB]` acceptance policy and effect-specific approval; provider KYC is not client authority |
| App qualification | Jacob, platform reviewer | Run declared tests; inspect candidate, permissions, export/recovery; prepare evidence | `[JACOB]` listing acceptance and exception decisions; exact version only |
| Support / platform defects | Jacob | Reproduce, trace receipt, prepare fix and isolated checks | Agency owns its client service; platform owns its own failures |
| Billing / card disputes | Jacob for Strelva charges; actual merchant for its charges | Assemble timeline, agreements and amounts | `[JACOB]` refunds, contest/accept decisions and submission; see [billing runbook](./billing-ops-runbook.md) |
| Incidents | Jacob, incident lead and communicator | Read authorized evidence, correlate failures, draft update, prepare recovery | `[JACOB]` production changes and external communications; see [incident runbook](./incident-and-status.md) |

**Recommended coverage `[JACOB]`:** Monday–Friday, 09:00–17:00 `America/New_York`, excluding published US holidays and planned absences. During coverage, keep an urgent alert/contact path actively attended and sweep intake at least hourly to leave time for the proposed two-hour human response; review all operator boards at opening, mid-day and before closing. Interrupt planned work for confirmed harm. `[JACOB]` accept this interruption load and verify the urgent channel before publishing the two-hour target; otherwise choose a slower target. Alerting runs continuously where configured; human response outside coverage is best effort. No 24/7, weekend, guaranteed uptime or guaranteed fix-time claim.

Jacob must name a real backup, its permissions and accepted availability before selling extended coverage. An agent is not that backup. Until then, planned absence notices state the next staffed review time; urgent agency work stays with its authorized agency operator. `[JACOB]` choose the actual monitored support mailbox, urgent contact method and holiday/absence calendar. Do not publish an invented address or imply the in-app queue is a customer helpdesk.

## Intake, clocks and escalation

Use the existing agency/business conversation where authorized, or the selected mailbox. Record received time, verified requester, agency/business/System IDs, impact, evidence links, owner, next action and next update time. Never ask for card numbers, passwords, API keys or ID scans by email. Keep private cases in access-controlled storage, not this public repository. `[JACOB]` designate that storage and retention/access policy before accepting sensitive cases.

Proposed first-response targets below require sign-off. A response means a human has assessed impact, owns the case and gives a next step. An automatic acknowledgment or queue `take` alone is not an agency response. Count staffed hours from receipt; outside coverage the clock begins at the next opening. Record wall-clock impact separately. Provider/agency waiting time does not erase the response or update obligation; no resolution deadline is promised.

| Case | First human response `[JACOB]` | Next checkpoint `[JACOB]` |
| --- | --- | --- |
| Confirmed outage, cross-business access, duplicate charge/effect, likely lost accepted work | Within 2 staffed hours; act immediately when observed | Use incident cadence after human acknowledgment; security details privately |
| Individual blocked platform task / billing failure | Within 1 staffed business day | Update each staffed day while blocked, including provider waiting |
| Complete verification packet | Within 2 staffed business days | Decision or precise missing evidence; completion depends on provider/authority checks |
| Complete app qualification packet | Within 3 staffed business days | Decision or failed checks, scoped to submitted version |
| Refund request / service disagreement | Within 2 staffed business days | Give decision checkpoint; financial action remains separately authorized |
| Card dispute | Review at next staffed intake; immediate escalation if due within 2 business days | Stripe's actual evidence deadline overrides ordinary support scheduling |

The queue's existing two-hour P1 clock is **elapsed time from source opening**, not staffed time; `take` satisfies its acknowledgment test. It can show late overnight even if the proposed coverage target is met. Preserve both measurements rather than treating the queue as an SLA engine. Source: [rules.ts](../../src/platform/operator-queue/rules.ts), `PROPOSED_CLOCKS`, `dueAtFor`, `isLate`.

## Daily operator procedure

1. Open `/admin`, `/admin/queue`, `/admin/ops` and `/admin/uptime`. Check source gaps, failed heartbeats and evidence timestamps first. An empty incomplete queue is not an all-clear. [Queue loader](../../src/app/admin/queue/queue-data.ts) checks super-admin identity; [source readers](../../src/platform/operator-queue/sources.ts) name unavailable sources. No agency receives super-admin access to get support.
2. Take the relevant source item; add a short case reference and next action. Queue priorities P1–P4 mean harm now, waiting on Strelva, Strelva drafts and owner's call. Use the linked source screen for the real action. [Queue actions](../../src/app/admin/queue/actions.ts) save marks, not approvals or provider writes. Pinning does not change computed priority; snoozing requires a follow-up time and reason.
3. Inspect Needs you / owner reach. `/admin/needs-you` edits **Who decides** policy; it is not the owner's inbox. [Needs-you release](../../src/platform/needs-you/release.ts) defaults off. A stored item, suppressed send or `owner_told` mark is not proof that an agency/business received a message. Mark told only after actual authorized contact; record provider acceptance separately from delivery.
4. For an accepted outside write with failed/different read-back, compare the provider reference and current state before any retry. [Receipts](../../src/platform/operator-queue/receipts.ts) distinguish acceptance, read-back and undo; supported providers are Google Business, Vercel, routing and content, **not Stripe**. Missing receipt storage does not make an accepted effect safe to repeat.
5. Close with a reason and evidence once the source outcome is verified. Queue close does not repair the source. Log human minutes; close and effort logging are separate and can partially succeed. `/admin/work` is business effort, not a per-agency cost dashboard. Repair a missing minutes record without repeating the outcome.

Verification, listing qualification, general complaints and card disputes are not dedicated queue kinds in [contracts.ts](../../src/platform/operator-queue/contracts.ts). Use a private case record for those; link an existing source item only when one exists. Do not fabricate queue entries or bury untracked deadlines in agent memory. The released [agency Queue](../../src/experience/workspace/AgencyHome.tsx) uses the scoped client projection and [operator overview](../../src/experience/workspace/agency/operator-overview.ts). Delegated readers keep their scoped rows; full business memberships can receive the authorized operator projection. This is not evidence of incident broadcast or accepted support responsibility.

## Verification review

1. Verify requester identity and agency representation. Record person/entity or sole-proprietor trade evidence, provider result ID, policy version and date. Treat missing LLC registration as a structure question, not an automatic denial. `[JACOB]` set geography, acceptable evidence, sole-proprietor fallback and appeal policy. No manual review can waive Stripe payment requirements.
2. Review each requested effect and named client/resource: publication needs client delegation and domain control; Google writes need the target OAuth grant; email needs sender/domain authority and permitted recipient purpose; money needs seller identity, terms and current payment eligibility. A general verification badge grants none of these by itself.
3. Return approve / needs evidence / decline, with reason, scope, expiry/recheck trigger and reviewer. A future gate must save that decision through its implemented audited path; no verification service or operator approval route is established by the queue inspected here. Until the gate exists and is tested, retain the case as pending and leave effects gated. **Payment-account review is after #283** and the implemented payment gate, not a substitute for them.
4. On mismatch, suspected abuse or appeal, Jacob re-reviews original evidence. `[JACOB]` name an independent reviewer for contested decisions involving Strelva's own agency or a material conflict; none is assumed staffed. Strelva's agency meets the same bar, clocks and reasons as every agency.

Policy evidence: workspace research `docs/research/strelva-agency-money-and-verification-2026-10-07.md`, §§9–11. [Stripe Identity](https://stripe.com/identity) verifies individuals; [Connect requirements](https://docs.stripe.com/connect/saas/essential-tasks) concern payment eligibility. They do not prove a client mandate. Research is a proposal, not selected verification policy or vendor.

## App qualification review

Require creator identity, immutable definition/version or candidate revision + artifact digest, support owner, permission/effect declaration, data/export behavior, failure/recovery evidence and test results. Agents prepare build, desktop, mobile, keyboard and denied/cross-business checks; Jacob reviews the exact evidence and unresolved harm before accepting a platform listing. `[JACOB]` select the complete listing bar and maintainer obligations; no guaranteed directory approval or preferred Strelva placement.

Existing [custom-app contracts](../../src/products/custom-applications/contracts.ts) require four passed review checks (build, desktop, mobile, keyboard), the candidate revision and artifact digest. [Lifecycle](../../src/products/custom-applications/lifecycle.ts) exposes manager-authorized review/release/rollback; a changed candidate or release conflicts. These are **per-business app release checks**, not a marketplace certification. [Capability qualification](../../src/platform/capabilities/qualification.ts) binds passed evidence to an exact capability/version, but does not establish an agency marketplace review desk. Record findings and request the creator's correction; never use platform support access as the client's release consent. Re-review changed versions and preserve earlier decisions.

External channel problems use workspace research `docs/research/strelva-agent-channels-2026-10-07.md`: directory admission, protocol support and OAuth review are separate dependencies. Give agencies the observed rejection/timeout and supported fallback; do not promise listing placement or a provider's review turnaround.

## Disagreements and incidents

For service, verification, ownership or app disputes, identify the actual agreement and actors; preserve grants, versions and receipts; separate a platform defect from the agency's client contract. Jacob assesses the platform's responsibility and communicates a reasoned decision. `[JACOB]` approve appeal escalation, any credit or revised commercial commitment. Do not change client ownership, payer, attribution or grants to settle a complaint informally. Card disputes follow the [billing runbook](./billing-ops-runbook.md); live harm follows the [incident runbook](./incident-and-status.md).

Domain renewal remains the registrant's payment/authority decision. Email delivery complaints require accepted message ID, audience gate, sender account/domain and provider state. Workspace research `docs/research/strelva-domains-email-scale-2026-10-07.md` explains shared-team suppression and rate limits; BYOK/account isolation is proposed, not a deployed fix. An agent must not move senders, remove suppressions or contact a registrar to evade a failure.

## Cost per agency and capacity

**Planning assumptions `[JACOB]`, not measured costs or prices:** value human time at $75/hour; reserve 8 hours/week for platform support (34.64 hours/month using 4.33 weeks), of which 25% stays available for incident spikes. Compare agents assisting one human with fully manual handling using measured minutes; autonomous agents do not remove human approval or absence risk.

Illustrative recurring monthly workload per agency: two ordinary cases × 10 minutes + 0.25 app reviews × 30 minutes + 0.1 verification rechecks × 20 minutes + 0.1 billing/dispute cases × 45 minutes = **34 human minutes = $42.50**. Budget a further **$2/agency** for support-specific agent calls as an assumption. A platform incident costing four human hours/month adds $300 spread over supported agencies. Proposed Instatus Pro adds $20/month (see vendor comparison); verification/vendor fees are additional when used.

| Active agencies | Routine human hours/month | Routine labor + agent budget + $320 shared incident/status allowance | Cost/agency/month |
| --- | --- | --- | --- |
| 10 | 5.67 | $765 | $76.50 |
| 25 | 14.17 | $1,432.50 | $57.30 |
| 50 | 28.33 | $2,545 | $50.90 |

These are support floors, not contribution margins: exclude hosting, normal product compute, payment fees, money losses, taxes, acquisition, new-agency setup and backup staffing. They also exclude fixed intake sweeps, board review and deadline reconciliation, whose time is unmeasured, not zero. For `N` agencies and `T` fixed triage/reconciliation hours per month, add `$75 × T / N` to the table's cost/agency; routine capacity becomes `(25.98 − T) / 0.5667` agencies before onboarding. As a sensitivity assumption, 10 fixed hours/month adds $75/$30/$15 per agency at 10/25/50 agencies and lowers the routine ceiling to about 28 agencies. Measure this overhead before promising capacity.

Initial verification review 30 minutes + first app review 45 minutes adds **$93.75 human setup/agency**, plus provider fees and agent usage. No vendor verification purchase is selected. At 50 agencies, routine cases alone exceed the proposed 25.98-hour routine capacity before overhead/setup; if case counts double, 25 agencies also exceed it. The roughly **45-agency** calculation without fixed overhead or onboarding is an upper bound, not launch capacity proof. `[JACOB]` reserve measured fixed triage time within the routine budget before allocating the remaining hours to case handling.

For the first four weeks, record minutes by case type/agency, source gaps, missed targets, review arrival rate, agent spend, refunds/losses and oldest open case. Business effort entries need a separate private agency attribution summary; do not infer it from payer or sales attribution. `[JACOB]` if routine work exceeds 75% of the reserve for two weeks, targets are missed repeatedly, or an absence has no backup: reduce new review intake, revise the promise or authorize trained help before adding agencies. Choose staffing with measured p90 handling time and incident load, not this average.

## Sign-off and continuation

`[JACOB]` required: coverage/contact/absence plan; first-response and update targets; backup and conflict reviewer; review/appeal/retention policies; human cost and capacity budget. No SLA credits or unlimited support included. Objective remains #416 operating readiness; these documents prepare the policy only. Next action: approve the marked choices, verify implemented review gates and actual alert/intake receipt in a staging drill, then record authorized production evidence before publishing support terms. The current branch proves source inspection, not staffing, delivery economics or live operation.
