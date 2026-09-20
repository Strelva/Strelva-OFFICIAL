# Offer and module completion task map

**Snapshot:** 2026-09-19 local source review
**Owner:** `/root/offer_modules_plan`
**Purpose:** give the integration owner small, executable vertical slices for the remaining Apps, Intake, Bookings, Onboarding, Checks, Websites, and commercial work.

This is an implementation queue, not a new product or pricing decision. It is grounded in [`CONTEXT.md`](../../CONTEXT.md), the proposed module map in [`docs/strelvav2-module-map-2026-09-19.md`](../../docs/strelvav2-module-map-2026-09-19.md), and the acceptance record in [`docs/strelvav2-horizontal-acceptance.md`](../../docs/strelvav2-horizontal-acceptance.md). The acceptance record remains the verification ledger. The root agent owns assigning these tasks, merging their evidence, and deciding whether a local result is ready for a preview or production decision.

**Completed local slices (2026-09-19):** APP-01 and BOOK-01/02 are implemented and locally verified. The canonical acceptance ledger records the result in [`Local implementation and verification`](../../docs/strelvav2-horizontal-acceptance.md#local-implementation-and-verification); provider, hosted, and customer-acceptance proof remain separate.

## Status vocabulary and execution rule

- **Ready-local** means that the repository already has the engine and the task can be implemented and tested with local Auth, Postgres, fixtures, and injected external boundaries. It does not prove a live provider, customer acceptance, or production release.
- **Decision-gated** means that a local slice is technically approachable, but its record shape, release policy, or customer promise has not been accepted. Do not fill the gap with an invented provider, price, allowance, or retention rule.
- **External-gated** means that the local boundary is clear, but execution needs an authority outside this repository: a customer agreement, provider contract and credentials, domain or email verification, Stripe event/terms, or a production permission.
- **Proof-only** means the engine and focused tests already exist. The remaining work is to exercise the complete public journey and record the evidence; do not create a second implementation merely to make a module look complete.

Every implementation slice follows the TDD contract: add one failing test at the public seam first, use real local collaborators, inject only the genuine external boundary, then make the smallest change that makes the behavior true. The first test named below is a proposed addition when it is not already present. A test that passes before the change converts that row to proof-only; it is not a reason to add a parallel engine.

## The first remaining tasks to launch

APP-01 and BOOK-01/02 are complete locally and linked above. These remaining slices are independently schedulable local tasks; they do not require a live calendar, billing provider, email provider, or production deployment.

| ID | First slice | Status | First failing public-seam test | Prerequisite and handoff |
| --- | --- | --- | --- | --- |
| **ONB-01** | Compose customer, employee, and supplier requirements as a bounded checklist over existing native app/document records. | Ready-local | Add `tests/onboarding-requirements-authenticated-local.spec.ts` case `assigned recipient completes one requirement and reopens its evidence state`; there is no general requirements destination today. | Use existing app/document routes and a local checklist record shape. Customer-specific requirement definitions and release evidence come after the local lifecycle. |
| **APP-02** | Add an explicit record-edit grant with optimistic revision handling to the native app lifecycle. | Ready-local | Add `tests/application-record-edit-authenticated-local.spec.ts` case `recipient edits an owned record through the app public seam and stale revision is rejected`; the current route is submit-only. | Existing released application and local recipient grant. Decide own-record versus shared-record scope in the grant before presenting it as a customer promise. |
| **APP-03** | Add a date-only field that round-trips as a calendar date without timezone conversion. | Ready-local | Extend `tests/application-use-authenticated-local.spec.ts` with `date-only value round trips through the released app without timezone mutation`; date-time and booking remain separate. | Existing app release/use seam. A routine `YYYY-MM-DD` representation is sufficient for this local slice; no calendar provider is required. |

Root can launch these three without waiting for the remaining commercial decisions. ONB-01 composes the customer/employee/supplier requirement lifecycle and stays separate from file extraction and hosted website provisioning.

## Compact queue for the acceptance ledger

| ID | Domain | Small vertical slice | Status | Depends on |
| --- | --- | --- | --- | --- |
| APP-01 | Apps | Native `select` field through release, recipient use, submit, validation, and recovery. | Completed-local | Existing app release and use grant; local Auth/Postgres and focused contract/UI proof passed |
| APP-02 | Apps | Edit an existing record through an explicit `recordEdit` grant and optimistic revision check. | Ready-local | Access policy decision; can run after APP-01 because both change app access/route seams |
| APP-03 | Apps | Date-only field with an explicit calendar-date representation; date-time stays separate. | Ready-local | Existing app release and use seam |
| APP-04 | Apps | Prove published app rollback/reopen from Home and Connected work with the same resource identity. | Proof-only / R4-R5 | Navigation and offering recovery slices |
| INT-01 | Intake | Install and discover the existing inquiry workspace through the customer inquiry offering release gate. | Ready-local behind existing gate | Local release fixture/flag and existing inquiry workspace; external release proof remains separate |
| INT-02 | Intake | Complete install → publish → receive → assign → governed reply → read-back failure recovery with existing inquiry engines. | Ready-local after INT-01 | INT-01 and service-request/delivery visibility work |
| INT-03 | Intake | Live outbound email, recipient delivery, and customer-facing retry/unavailable states. | External-gated | Sending authority, provider credentials, domain, consent, and customer acceptance |
| BOOK-01 | Bookings | Public authenticated seam over native schedule read/reserve/cancel and injected provider state. | Completed-local | Existing scheduling engine; local Auth/Postgres route proof passed |
| BOOK-02 | Bookings | Native reschedule updates one reservation in place with stable `requestId`, availability conflict checks, cancellation handling, and retry idempotency. | Completed-local | BOOK-01; provider-accepted/unknown lifecycle remains governed and needs separate provider proof |
| BOOK-03 | Bookings | Real calendar write, reminders, webhook/read-back, and provider outage recovery. | External-gated | Calendar provider, OAuth/credentials, authority, reminders channel, and customer acceptance |
| ONB-01 | Onboarding | Customer/employee/supplier requirements checklist with missing, supplied, correction, accepted, and unavailable states. | Ready-local | Existing application/document seams |
| ONB-02 | Onboarding | Link existing document revisions/evidence to checklist requirements and preserve correction history. | Ready-local | ONB-01; existing document route |
| ONB-03 | Onboarding | Attach a synthetic local file to a requirement with tenant-scoped provenance and correction history. | Ready-local | ONB-01/02; existing upload/storage boundary |
| ONB-04 | Onboarding | Extraction, external coordination, and rechecks over attached documents. | External-gated | Extraction authority, retention, customer/regulated-doc policy, and communication channel |
| CHECK-01 | Checks | Make saved-source investigations reopenable as a named Check through existing standing operations. | Ready-local | Existing investigations/standing engines; Home/Ongoing display can follow |
| CHECK-02 | Checks | Read-only live-source adapter with freshness, unavailable, credential-revoked, and retry evidence. | External-gated | Explicit source/provider, API authority, consent, freshness/SLA, and data boundary |
| WEB-01 | Websites | Preserve managed-website installation identity through request, governed proposal, approval, publish, verification, and history. | Ready-local after R6 | Website binding plus service-request route/visibility work |
| WEB-02 | Websites | Reopen canonical site-audit/check results from the managed-website destination with dated source evidence. | Ready-local | `scan.ts`/`scan-store.ts` and website-audit surfaces |
| WEB-03 | Websites | New-customer website setup, domain lifecycle, and custom-repo continuity. | External-gated | Customer agreement, domain/DNS authority, client repository and production permissions |
| WEB-04 | Websites | Make tenant/site provisioning resumable after a durable project step without changing identity, secret, or edited content. | Ready-local | Existing provisioning, Vercel, tenant, and encrypted-secret seams |
| BILL-01 | Commercial | Read-only service/commercial status projection from existing subscription and work-economics authorities. | Ready-local | Accepted response shape; no new billing source |
| BILL-02 | Commercial | Synchronize an accepted subscription entitlement into period/unit allowances and future payer transitions. | Decision-gated / external-gated | Price, allowance, event, account/tenant ownership, and Stripe reconciliation contract |
| BILL-03 | Commercial | Reconcile provider/model usage evidence into accepted work-economics receipts. | External-gated | Provider cost receipt shape, identity/key, and customer spending authority |
| BILL-04 | Commercial | Preserve one-off build payments, website subscriptions, grandfathered agreements, and horizontal allowances as separate modes. | Proof-only unless a red test appears | Existing billing mode guards and agreement records |

## Apps

### APP-01: practical choice field

**Customer behavior:** An owner creates or revises a bounded app with a choice field, publishes it, grants a recipient `recordRead` plus `recordSubmit`, and the recipient submits one of the published options. The recipient sees a useful option control, cannot submit an option outside the released definition, and can reopen the released form after the owner rolls back or republishes. Existing text, number, and boolean apps continue to work.

**Exact source owners:** [`src/products/applications/contracts.ts`](../../src/products/applications/contracts.ts), [`src/products/applications/server.ts`](../../src/products/applications/server.ts), [`src/products/applications/access.ts`](../../src/products/applications/access.ts), [`src/app/api/apps/[workId]/route.ts`](../../src/app/api/apps/[workId]/route.ts), [`src/experience/applications/ApplicationUseRenderer.tsx`](../../src/experience/applications/ApplicationUseRenderer.tsx), and the application release/use migrations under [`supabase/migrations/20260914020000_application_releases.sql`](../../supabase/migrations/20260914020000_application_releases.sql) and [`supabase/migrations/20260914030000_application_use_access.sql`](../../supabase/migrations/20260914030000_application_use_access.sql). Add or extend the focused fixture in [`tests/application-use-authenticated-local.spec.ts`](../../tests/application-use-authenticated-local.spec.ts) and the contract test in [`src/__tests__/application-use.test.ts`](../../src/__tests__/application-use.test.ts). Inspect the JSON persistence shape before adding a migration; do not introduce a new application store.

**Prerequisite:** A released native application and a real local recipient grant. The owner of the customer workflow must choose the option labels and whether an empty choice is valid; that is a fixture/product input, not a provider decision.

**First failing public-seam test (completed):** `owner publishes a select field and recipient submits an allowed option`, followed by `recipient cannot submit an option absent from the released field definition`, through the authenticated app-use journey. The red test drove the schema, renderer, option validation, owner editing, and rollback proof; the current contract now carries the bounded choice field.

**Meaningful done criterion:** The owner can publish a `select` field; the recipient can see and submit allowed values; an unknown option is rejected without a record write; a revoked grant, foreign workspace, stale release, and rollback remain denied or recoverable according to the existing access contract; and existing app tests plus the authenticated browser journey pass. The test must prove the stored value and the released field version, not only that a control rendered.

**External evidence or authority needed:** None for the local slice. Before calling it a customer offer, obtain the customer’s field/options and recipient permission policy. Do not infer a provider, price, or choice taxonomy.

### APP-02: recipient edits to existing records

**Customer behavior:** A recipient with an explicit edit grant can edit an existing record they are allowed to edit, receives a conflict when the record changed since it was read, and cannot edit another owner’s record or an application outside the released version. Owners can revoke the edit grant and reopen the resulting audit/history.

**Exact source owners:** [`src/products/applications/access.ts`](../../src/products/applications/access.ts), [`src/products/applications/server.ts`](../../src/products/applications/server.ts), [`src/app/api/apps/[workId]/route.ts`](../../src/app/api/apps/[workId]/route.ts), [`src/app/api/apps/[workId]/access/route.ts`](../../src/app/api/apps/[workId]/access/route.ts), the application use migration [`supabase/migrations/20260914030000_application_use_access.sql`](../../supabase/migrations/20260914030000_application_use_access.sql), and [`src/experience/applications/ApplicationAccessControls.tsx`](../../src/experience/applications/ApplicationAccessControls.tsx). Extend the existing application audit/event path; do not add a second record API.

**Prerequisite:** Accept the scope vocabulary (`own` versus `all`, field-level edit versus whole-record edit, and revision conflict behavior). APP-01 is a useful fixture but this can be implemented independently against text/number/boolean records.

**First failing public-seam test:** New `tests/application-record-edit-authenticated-local.spec.ts`, test `recipient edits an owned record through the app public seam and stale revision is rejected`. The current route only accepts the submit action, so a PATCH/update action should fail before implementation.

**Meaningful done criterion:** The route and UI expose editing only when the grant allows it; a successful edit preserves record identity, increments the durable revision, records actor and time, rejects stale revisions, and denies revoked/foreign/expired grants. The existing submit-only journey remains unchanged. A local browser test must reopen the edited record from the app destination.

**External evidence or authority needed:** Customer decision on who may correct an existing submission and whether corrections require owner review. No provider is needed locally.

### APP-03: date-only field

**Customer behavior:** A customer can collect a calendar date and see the same date in owner and recipient views. This local slice is date-only; it does not create a reservation or silently introduce a timezone conversion.

**Exact source owners:** The same app contract/server/route/renderer owners as APP-01, plus [`src/products/scheduling/contracts.ts`](../../src/products/scheduling/contracts.ts) only if the field is intentionally linked to a reservation. Do not couple a plain date field to scheduling by implication.

**Prerequisite:** Use the existing app release/use journey and store the value as a calendar date string (`YYYY-MM-DD`). A date-time value, timezone display, or booking action is a separate follow-up and must not be inferred from this field.

**First failing public-seam test:** Extend `tests/application-use-authenticated-local.spec.ts` with `date-only value round trips through the released app without timezone mutation`; the current application field contract has no date type.

**Meaningful done criterion:** The public contract validates an ISO calendar date, the value survives release/rollback and record read, and owner/recipient views display the same date. A date-time or reservation remains outside this slice and belongs to a separately accepted scheduling task.

**External evidence or authority needed:** None for the local date-only implementation. Customer workflow evidence is needed before choosing date constraints or exposing it as a published offer; a live calendar provider is only relevant to a later booking action.

### APP-04: published recovery and destination proof

**Customer behavior:** After an owner publishes or rolls back an app, Home and Connected work reopen the same app/resource with its current status and the recipient journey uses the released version. A retired or unavailable resource says so and does not expose stale write controls.

**Exact source owners:** Application release/rollback in [`src/products/applications/server.ts`](../../src/products/applications/server.ts), app route [`src/app/api/apps/[workId]/route.ts`](../../src/app/api/apps/[workId]/route.ts), and the Home/Connected work owners tracked by R4/R5 in [`docs/strelvav2-horizontal-acceptance.md`](../../docs/strelvav2-horizontal-acceptance.md).

**Prerequisite:** R4/R5 navigation and offering recovery work. The application engine and local release tests already exist.

**First failing public-seam test:** Add a browser assertion to [`tests/application-use-authenticated-local.spec.ts`](../../tests/application-use-authenticated-local.spec.ts) named `rollback and Home reopen the same released application resource`. If the assertion already passes after R4/R5, record it as proof-only.

**Meaningful done criterion:** The route, destination, release version, and grant all identify the same resource; rollback does not destroy records; unavailable/retired states are explicit; and local browser evidence covers owner, recipient, and permission paths.

**External evidence or authority needed:** Human acceptance of the destination language and resource status. No provider.

## Intake

### INT-01: inquiry offering installation

**Customer behavior:** An eligible workspace can install the existing inquiry intake offer, see its inquiry workspace and surface, activate or retire it, and use the existing published form/delivery path. A workspace that is not eligible receives the existing release-gated response and does not get a half-installed resource.

**Exact source owners:** [`src/platform/offerings/definitions.ts`](../../src/platform/offerings/definitions.ts), [`src/platform/offerings/service.ts`](../../src/platform/offerings/service.ts), [`src/app/api/offerings/route.ts`](../../src/app/api/offerings/route.ts), [`src/products/inquiries/server.ts`](../../src/products/inquiries/server.ts), [`src/products/inquiries/publication.ts`](../../src/products/inquiries/publication.ts), and [`src/app/api/inquiry-workspace/route.ts`](../../src/app/api/inquiry-workspace/route.ts). The current definition is `release_gated` and `installability: "not_enabled"`; do not silently remove that guard.

**Prerequisite:** A local workspace release fixture/flag and the existing inquiry workspace path. Keep the current release gate and permissions; no general inbox or new intake engine is required. Consent, retention, recipient, and public-release evidence are needed before a live offer claim, not before local implementation.

**First failing public-seam test:** Extend [`src/__tests__/offering-route.test.ts`](../../src/__tests__/offering-route.test.ts) with `eligible workspace installs customer_inquiry_intake and receives an inquiry workspace surface`; today the service should reject the definition as not enabled.

**Meaningful done criterion:** Installation creates the existing inquiry resource with workspace ownership, required scope, surface, revision, and retirement behavior; publication remains governed; `/api/v1/inquiries/[tenant]` and the portable client use the same canonical inquiry workspace; ineligible workspaces receive a deterministic release-gated response. The focused offering and inquiry route tests pass without weakening tenant or permission checks.

**External evidence or authority needed:** Before release, record the consent language, retention/erasure policy, notification recipient, sending-domain authority, and customer acceptance. Local installation behind the existing gate does not prove live email or public-site delivery.

### INT-02: inquiry delivery and recovery composition

**Customer behavior:** A submitted inquiry is received once, assigned to the intended work/person, and handled through the governed reply path. An accepted provider write resolves the approval; a failed read-back remains separate verification-failure evidence and is not retried as if the original write never happened. The customer can see the item as pending, accepted, unavailable, or needing attention.

**Exact source owners:** Existing inquiry engines in [`src/products/inquiries/receive.ts`](../../src/products/inquiries/receive.ts), [`src/products/inquiries/reconciliation.ts`](../../src/products/inquiries/reconciliation.ts), [`src/products/inquiries/delivery.ts`](../../src/products/inquiries/delivery.ts), [`src/products/inquiries/delivery-store.ts`](../../src/products/inquiries/delivery-store.ts), [`src/products/inquiries/server.ts`](../../src/products/inquiries/server.ts), and [`src/lib/ai-governance.ts`](../../src/lib/ai-governance.ts). Use the portable storefront contract in [`src/app/api/v1/inquiries/[tenant]/route.ts`](../../src/app/api/v1/inquiries/[tenant]/route.ts) and the existing tests `src/__tests__/inquiry-reconciliation.test.ts`, `src/__tests__/inquiry-delivery*.test.ts`, and `tests/inquiry-authenticated-local.spec.ts`. R6 owns the service-request destination; do not add a second request inbox.

**Prerequisite:** INT-01 and the service-request/delivery visibility slice. The local inquiry journey already has a portable client, canonical workspace, publication, receipt, assignment, and reconciliation pieces.

**First failing public-seam test:** Add `tests/inquiry-authenticated-local.spec.ts` case `installed intake reopens receipt, assignment, governed reply, and read-back failure state from its offering destination`. Keep the provider fake at the actual delivery boundary.

**Meaningful done criterion:** The complete local sequence is visible from the installed offering, uses one inquiry/workspace identity, is idempotent on receipt, records assignment and consent, preserves accepted-but-unverified outcomes, and exposes retry only for a genuinely retryable failure. Existing inquiry publication and delivery failure tests remain green.

**External evidence or authority needed:** Live sending-domain/provider credentials, recipient consent, customer acceptance of response timing, and any public website deployment. Do not call the local provider fake live evidence.

### INT-03: live delivery

**Customer behavior:** A real customer form sends an inquiry to an authorized recipient and the customer can recover from provider outage, bounced delivery, revoked credentials, and duplicate submission.

**Exact source owners:** The same inquiry delivery/reconciliation owners as INT-02, [`src/lib/email/send.ts`](../../src/lib/email/send.ts), [`src/lib/email-enabled.ts`](../../src/lib/email-enabled.ts), and the deployed `/api/v1` contract. No direct email call may bypass the email boundary or governance.

**Prerequisite:** INT-02 local evidence plus an accepted provider/domain, recipient, consent, and deployment authority.

**First failing public-seam test:** A live-provider test cannot honestly be authored until the provider and test tenant are selected. The contract test should be named and added only after those authorities are recorded; until then, keep the existing local provider-boundary tests as the red seam.

**Meaningful done criterion:** Preview or production evidence separately proves public submission, one receipt, recipient delivery, provider read-back/recovery, and tenant isolation. No local test may be reported as that evidence.

**External evidence or authority needed:** Provider contract/credentials, sending-domain verification, consent and retention authority, customer acceptance, deployment permission.

## Bookings

The horizontal scheduling engine and the legacy managed-website booking system are separate. The horizontal tasks below use [`src/products/scheduling/server.ts`](../../src/products/scheduling/server.ts). The legacy endpoints in [`src/lib/booking.ts`](../../src/lib/booking.ts), [`src/app/api/booking/route.ts`](../../src/app/api/booking/route.ts), and the booking store remain compatibility behavior; they do not establish a horizontal booking offer or a calendar integration.

### BOOK-01: authenticated native scheduling seam

**Customer behavior:** An authorized owner creates or reads a workspace schedule, reserves an available interval, cancels a reservation, and sees a provider state such as writing, unknown, accepted, or verification-failed. Repeating the same command does not double-book or double-write.

**Exact source owners:** [`src/products/scheduling/contracts.ts`](../../src/products/scheduling/contracts.ts), [`src/products/scheduling/server.ts`](../../src/products/scheduling/server.ts), and the existing generic bounded-work seam [`src/app/api/bounded-work/route.ts`](../../src/app/api/bounded-work/route.ts). Reuse `SchedulingProvider.reserve`, `find`, `verify`, and `authorize`; do not add `/api/scheduling`, a parallel workspace route, or a provider-specific implementation. The operations route remains the separate responsibilities/standing-work seam.

**Prerequisite:** Existing workspace Auth/tenant permission and the injected local provider fake. No provider choice or live credential is required.

**First failing public-seam test (completed):** [`tests/horizontal-operations-authenticated-local.spec.ts`](../../tests/horizontal-operations-authenticated-local.spec.ts) now exercises `schedule cancel and injected provider recovery use the bounded-work seam`; the same route proves create/read/reserve/cancel, overlap, retry, and local Auth/Postgres persistence. Focused scheduling tests cover provider accepted, unknown, and verification-failed boundaries.

**Meaningful done criterion:** The existing route remains same-origin/authenticated, derives the tenant and actor server-side, validates intervals and permissions, returns durable reservation status, carries a stable idempotency key, reconciles `writing`/`unknown` through the injected provider boundary, and denies foreign/revoked work. The authenticated browser test exercises success, overlap, cancel, provider failure, accepted-but-unverified, retry, and cross-tenant denial.

**External evidence or authority needed:** None for the local slice. A real calendar is a separate task.

### BOOK-02: native reschedule and recovery

**Customer behavior:** An owner or authorized operator reschedules a native reservation to an available interval. The existing reservation row keeps its stable `requestId` and title while its interval changes at the expected local revision. An overlap, cancelled reservation, or provider-governed state leaves the existing row unchanged; an identical retry returns the same reservation instead of creating a duplicate. Provider accepted or unknown reservations remain on the governed provider lifecycle and are not falsely moved by native reschedule.

**Exact source owners:** [`src/products/scheduling/contracts.ts`](../../src/products/scheduling/contracts.ts) (`scheduleCommandSchema`), [`src/products/scheduling/server.ts`](../../src/products/scheduling/server.ts) (`command`/`deliver`), the existing [`src/app/api/bounded-work/route.ts`](../../src/app/api/bounded-work/route.ts), and its durable schedule store. Add no new route or provider abstraction; the existing provider interface is the boundary.

**Prerequisite:** BOOK-01. Use the native in-place local update: validate availability and overlap, then update the same reservation atomically under the expected revision. Do not model local reschedule as cancel-then-reserve replacement. A live provider’s atomic capability remains an external question.

**First failing public-seam test (completed):** [`tests/horizontal-operations-authenticated-local.spec.ts`](../../tests/horizontal-operations-authenticated-local.spec.ts) now proves `reschedule keeps the same reservation identity, rejects a conflict, and makes an identical retry idempotent`; the red contract test began with `scheduleCommandSchema` supporting only reserve and cancel.

**Meaningful done criterion:** The public command validates the new interval, updates one local reservation while preserving `requestId` and title, honors idempotency and expected revision, and leaves the original row unchanged on conflict or cancellation. Existing reserve/cancel behavior remains green. Provider accepted/unknown rows stay unchanged under native reschedule; their read-back or verification evidence is a separate governed provider proof.

**External evidence or authority needed:** Local implementation needs none beyond the accepted command semantics. Customer cancellation/reschedule policy, calendar-provider atomic capability, and live provider read-back are needed before live release; no provider choice is made here.

### BOOK-03: real calendar lifecycle

**Customer behavior:** A customer connects an authorized calendar, sees real availability, creates/reschedules/cancels an event, receives reminders where promised, and recovers from expired auth, provider outage, webhook delay, and read-back mismatch.

**Exact source owners:** BOOK-01/02 scheduling seam, provider secret encryption [`src/lib/crypto/secrets.ts`](../../src/lib/crypto/secrets.ts), connection/permission boundaries, and the selected external adapter. Do not put real credentials in fixtures or documentation.

**Prerequisite:** Calendar provider and account/tenant authority, OAuth/credential lifecycle, timezone/availability rules, reminder channel, and customer acceptance.

**First failing public-seam test:** Pending provider selection. After it is selected, add a contract test at the existing `/api/bounded-work` seam with recorded provider responses and separate read-back failure evidence.

**Meaningful done criterion:** Preview/production evidence proves the entire lifecycle, provider identity and tenant isolation, retry/reconciliation rules, and reminder behavior. Local injected-provider tests remain the compatibility suite.

**External evidence or authority needed:** Provider documentation and credentials, customer consent, calendar/account ownership, reminder/email authority, and production permission.

## Onboarding

### ONB-01: customer, employee, and supplier requirements

**Customer behavior:** An onboarding owner can list requirements for a customer, employee, or supplier, assign a requirement to the right recipient, and see `missing`, `supplied`, `needs_correction`, `accepted`, or `unavailable` without losing the underlying evidence. The recipient can submit or correct one requirement and reopen the same requirement later. Completion is a visible projection of the requirement states, not a hidden boolean.

**Exact source owners:** Compose this over the existing bounded application and document work: [`src/products/applications/contracts.ts`](../../src/products/applications/contracts.ts), [`src/products/applications/server.ts`](../../src/products/applications/server.ts), [`src/app/api/bounded-work/route.ts`](../../src/app/api/bounded-work/route.ts), [`src/app/api/apps/[workId]/route.ts`](../../src/app/api/apps/[workId]/route.ts), [`src/products/documents/contracts.ts`](../../src/products/documents/contracts.ts), [`src/products/documents/server.ts`](../../src/products/documents/server.ts), and [`src/app/api/documents/route.ts`](../../src/app/api/documents/route.ts). The website-only facts/corrections helper [`src/products/inquiries/onboarding.ts`](../../src/products/inquiries/onboarding.ts) is not a general onboarding source and must not be stretched into one. Do not create a generic onboarding engine or route.

**Prerequisite:** Existing workspace Auth, one native application or document work item, and a local fixture with customer/employee/supplier requirement subjects. Use a simple checklist record composition for local work; customer-specific requirement names and recipient permissions are fixture inputs, not a reason to block the engine.

**First failing public-seam test:** New `tests/onboarding-requirements-authenticated-local.spec.ts`, test `assigned recipient completes one customer requirement and owner reopens its evidence state`, using the existing `/api/bounded-work`, app-use, and document seams. The public journey currently has no requirement-state composition.

**Meaningful done criterion:** A local checklist records requirement identity, subject role, assignee, status, evidence reference, actor, and revision; the recipient can submit/correct only the assigned requirement; owner and recipient can reopen the same record; foreign workspace, revoked access, stale revision, and unavailable source states are explicit; and the checklist uses existing app/document persistence and audit paths.

**External evidence or authority needed:** Customer/employee/supplier requirement definitions, recipient authority, retention/erasure language, and human acceptance of completion wording before a published offer. None is needed to exercise the local fixture.

### ONB-02: document evidence and correction history

**Customer behavior:** A recipient can attach an existing document work item or document revision to a requirement, see which revision supplied the evidence, submit a correction, and retain the previous evidence in history. The owner can mark the evidence accepted or unavailable without claiming that a file was extracted or verified.

**Exact source owners:** ONB-01 composition plus [`src/products/documents/contracts.ts`](../../src/products/documents/contracts.ts), [`src/products/documents/server.ts`](../../src/products/documents/server.ts), [`src/app/api/documents/route.ts`](../../src/app/api/documents/route.ts), and the existing document revision/store tests. Use a document work ID/revision as the local evidence reference; do not treat website media upload as onboarding evidence.

**Prerequisite:** ONB-01 local checklist and existing text/document records. This slice intentionally uses already-created document work. Binary upload is ONB-03; OCR, extraction, and external rechecks remain ONB-04.

**First failing public-seam test:** Extend `tests/onboarding-requirements-authenticated-local.spec.ts` with `requirement retains prior document revision after recipient correction`; use the existing document and app public seams and assert the requirement points to the new revision while history retains the old one.

**Meaningful done criterion:** Evidence references are tenant-isolated, revision-aware, and auditable; correction does not erase prior evidence; an unavailable or missing document remains unresolved; and owner/recipient permissions follow the existing app/document access contract.

**External evidence or authority needed:** Customer retention/erasure policy and allowed document authority before release. No extraction provider is required for this linked-document slice.

### ONB-03: synthetic file evidence

**Customer behavior:** A recipient attaches a synthetic local file to one requirement, sees its tenant-scoped name/type/size and upload state, corrects it with a replacement, and reopens the requirement without losing the prior evidence. This slice records a file and its provenance; it does not claim extraction or verification.

**Exact source owners:** ONB-01/02 composition, [`src/app/api/upload/route.ts`](../../src/app/api/upload/route.ts), [`src/lib/storage/upload-store.ts`](../../src/lib/storage/upload-store.ts), [`src/lib/media-store.ts`](../../src/lib/media-store.ts) where the existing tenant storage boundary is reused, and the requirement/document persistence owner. Existing upload code is tenant-scoped and image-only, so keep its auth, tenant isolation, size, MIME, and byte-signature checks; do not quietly turn website media into a general document authority.

**Prerequisite:** ONB-01/02 local requirement and evidence reference. Use a synthetic allowed file in the local fixture, then attach the resulting tenant-scoped reference. Any expansion to PDF or other non-raster types requires a separate contract and validation test.

**First failing public-seam test:** Extend `tests/onboarding-requirements-authenticated-local.spec.ts` with `recipient attaches a synthetic file, replaces it, and reopens prior evidence`; exercise the authenticated upload seam and the existing requirement/document seam. Today upload returns a URL but no onboarding requirement can retain and reopen that evidence.

**Meaningful done criterion:** The uploaded file is tenant-isolated, accepted only by the existing boundary’s validation, linked to exactly one requirement revision, replaceable without erasing history, and shown as missing/unavailable when storage fails. The test uses a synthetic local file and proves cross-tenant denial; it does not use a real Blob provider.

**External evidence or authority needed:** None for the synthetic local slice. A customer document policy is needed before broadening file types, retention, or visibility.

### ONB-04: extraction, coordination, and rechecks

**Customer behavior:** A customer supplies an authorized document, sees extraction provenance and missing fields, corrects errors, receives requests for clarification, and the system rechecks until a human or trusted source accepts completion.

**Exact source owners:** ONB-01/02/03 composition, the existing document engine, email/communication boundaries, and any selected extraction or external source adapter. Do not add an extractor or outbound coordination path to the synthetic-file slice.

**Prerequisite:** ONB-03 local evidence plus file type/size/retention policy, extraction authority and accuracy threshold, human review policy, outbound communication authority, and external source credentials.

**First failing public-seam test:** Pending the extraction and communication authority. Once selected, add a route test that records provenance, exercises extraction failure and correction, and reopens the requirement. Do not represent a fixture-only extraction as customer verification.

**Meaningful done criterion:** Files and extracted facts are tenant-isolated, encrypted/retained by policy, provenance is visible, extraction and external-source failures are explicit, and completion cannot be claimed from an unverified extraction.

**External evidence or authority needed:** File/document policy, extraction provider or model authority, customer consent, retention/erasure, communication provider, and any external verification source.

## Checks

### CHECK-01: saved-source Check composition

**Customer behavior:** An owner creates a named Check over two permitted saved sources, schedules or runs it through the existing standing responsibility path, and reopens the result from its work destination. The result names the source versions, reports agreement/discrepancy/no-change, and distinguishes unavailable or conflicted data from a clean result. Pause, resume, cancel, and retry remain available under the existing lifecycle.

**Exact source owners:** [`src/products/investigations/contracts.ts`](../../src/products/investigations/contracts.ts), [`src/products/investigations/server.ts`](../../src/products/investigations/server.ts), [`src/platform/work-execution/standing.ts`](../../src/platform/work-execution/standing.ts), [`src/products/operations/server.ts`](../../src/products/operations/server.ts), and [`src/app/api/operations/route.ts`](../../src/app/api/operations/route.ts). Reuse the existing investigation and standing stores. Do not create a check scheduler, scoring engine, or arbitrary source reader.

**Prerequisite:** Existing document/tracker/application work IDs in one workspace and the standing responsibility permission. Home/Ongoing destination rendering can follow R4/R5 without blocking the engine slice.

**First failing public-seam test:** Extend [`tests/standing-responsibilities-authenticated-local.spec.ts`](../../tests/standing-responsibilities-authenticated-local.spec.ts) with `saved-source Check reopens source versions and no-change or unavailable result through /api/operations`. The test should assert named source/result fields and version evidence, not just a 200 from the generic standing route. If current output already satisfies it, this row is proof-only.

**Meaningful done criterion:** One run invokes the existing investigation exactly once per source snapshot, records source/version/fingerprint evidence, distinguishes no-change from unavailable and mutation conflict, and can be reopened after a retry or pause. The standing engine continues to reject paid arbitrary work and unsupported operations.

**External evidence or authority needed:** None for saved local sources. Customer acceptance is needed for what counts as a meaningful discrepancy and notification destination.

### CHECK-02: live read-only source adapter

**Customer behavior:** A Check reads one explicitly authorized live source, shows freshness and source identity, and reports unavailable, expired credentials, rate limit, and retry states without treating a failed read as agreement.

**Exact source owners:** [`src/products/investigations/server.ts`](../../src/products/investigations/server.ts) source boundary, [`src/platform/work-execution/standing.ts`](../../src/platform/work-execution/standing.ts), encrypted connection storage, and the selected adapter. Keep the existing two-source/same-workspace validation unless a decision changes it.

**Prerequisite:** Select the source/provider, read-only API scope, freshness/timeout rule, credential owner, data retention boundary, and whether the source is authoritative for the check.

**First failing public-seam test:** Pending source authority. After selection, add an authenticated `/api/operations` or approved adapter contract test with fresh, stale, revoked, rate-limited, and malformed responses.

**Meaningful done criterion:** The adapter is read-only, tenant-isolated, provenance-preserving, bounded by time/size/cost, and produces explicit unavailable/retry outcomes. No live source is represented by a fixture-only green test.

**External evidence or authority needed:** Provider API documentation, credentials/consent, rate and retention terms, source owner’s authority, and customer acceptance of freshness.

## Websites

### WEB-01: managed website continuity

**Customer behavior:** A managed-website installation opens the correct website destination. A customer request carries the installation and tenant identity into the existing governed proposal/change path, requires the intended approval, publishes through the canonical website executor, verifies the result, and leaves dated history. Revoked, unavailable, or read-only installations cannot publish.

**Exact source owners:** Managed website definition and binding in [`src/platform/offerings/definitions.ts`](../../src/platform/offerings/definitions.ts), [`src/app/api/offerings/websites/route.ts`](../../src/app/api/offerings/websites/route.ts), and [`supabase/migrations/20260915060000_offering_websites.sql`](../../supabase/migrations/20260915060000_offering_websites.sql). Request/governance owners are [`src/lib/event-actions.ts`](../../src/lib/event-actions.ts), [`src/lib/ai-governance.ts`](../../src/lib/ai-governance.ts), [`src/lib/agent-shared.ts`](../../src/lib/agent-shared.ts), [`src/app/api/change-requests/route.ts`](../../src/app/api/change-requests/route.ts), approval/event routes, and the existing publish/preview routes. R6 owns the immediate service-request integration; do not duplicate it.

**Prerequisite:** Existing managed website binding and R6 service-request/visibility path. The canonical scan/publish/event engines already exist.

**First failing public-seam test:** New `src/__tests__/website-offering-continuity.test.ts`, test `bound managed website request carries installation identity through governed proposal and verification`, starting with the authenticated offering bind and request seam. Assert tenant/resource mismatch and revoked binding failures. Use the existing event/action executor.

**Meaningful done criterion:** One resource identity survives bind, request, approval, publish, verification, and history; the event action is governed; an accepted external write resolves approval; a failed read-back records verification failure without retrying the non-idempotent write; and no alternate publisher or request store is introduced.

**External evidence or authority needed:** Managed website agreement, real tenant/site capability, customer approval, provider read-back, domain/deploy authority, and production permission. Local event/scan evidence is not live proof.

### WEB-02: canonical website checks and history

**Customer behavior:** From a managed website destination, a customer can reopen the latest and historical site-health/check result with the source period, findings, unavailable state, and next action. A report does not silently become a score or claim a fresh scan when the source is stale.

**Exact source owners:** Canonical scanner and store [`src/lib/scan.ts`](../../src/lib/scan.ts), [`src/lib/scan-store.ts`](../../src/lib/scan-store.ts), checks [`src/lib/audit/checks.ts`](../../src/lib/audit/checks.ts), website-audit server/work [`src/products/website-audit/server.ts`](../../src/products/website-audit/server.ts), [`src/products/website-audit/work.ts`](../../src/products/website-audit/work.ts), and [`src/app/api/dashboard/site-audit/`](../../src/app/api/dashboard/site-audit/). Bind the result to WEB-01’s managed website identity; do not create another scanner or history store.

**Prerequisite:** Existing scan/audit fixtures and the managed website destination. R5 can own presentation while this slice owns data continuity.

**First failing public-seam test:** New `src/__tests__/website-check-projection.test.ts`, test `managed website destination reopens dated canonical scan result and explicit unavailable state`; use the existing site-audit route/history seam and assert source timestamps and tenant identity.

**Meaningful done criterion:** Current/history responses point to the canonical scan record, preserve source date and check evidence, distinguish unavailable/stale from clean, respect tenant permission, and retain the original result through website retirement. No composite score or parallel scanner is added.

**External evidence or authority needed:** Local slice needs none. Live proof needs a real site, scan authorization, domain/analytics/source authority, and customer acceptance of check cadence and result language.

### WEB-03: new-customer continuity and domains

**Customer behavior:** A new customer can understand the managed website promise, complete authorized setup, connect its domain, request a change, approve it, and recover from deployment or domain failure while preserving history.

**Exact source owners:** WEB-01/02, [`custom-repo-starter/`](../../custom-repo-starter/), [`src/lib/vercel.ts`](../../src/lib/vercel.ts), domain/DNS routes, content/publish/preview routes, and the shared compatibility checks. Client-specific behavior stays in each client repository; reusable behavior lands in the starter first.

**Prerequisite:** Customer offer and agreement, domain/DNS authority, target repository/Vercel project, release/version contract, deployment permission, and at least two client repositories before promoting shared client behavior.

**First failing public-seam test:** Pending the customer/domain/repository selection. Once selected, add a preview contract test that binds the website, provisions or attaches the selected project, changes content through governance, and exercises deploy/domain failure recovery.

**Meaningful done criterion:** A selected customer journey proves installation, domain/project identity, governed change, deployment/read-back, rollback/recovery, and client-repo compatibility. Existing managed-client behavior and the frozen storefront contract remain intact.

**External evidence or authority needed:** Customer agreement, client repository evidence, domain/DNS/Vercel authority, deployment permission, and production acceptance. No new public website offer or price is implied by this row.

### WEB-04: resumable tenant/site provisioning

**Customer behavior:** If managed-site setup fails after a durable project step, an operator resumes the same tenant and project. The stored revalidation secret stays stable, customer-edited sections survive, only missing defaults are filled, and signed revalidation still verifies. A project that already exists is not recreated under a second identity.

**Exact source owners:** [`src/lib/provisioning.ts`](../../src/lib/provisioning.ts), [`src/lib/vercel.ts`](../../src/lib/vercel.ts), [`src/lib/crypto/secrets.ts`](../../src/lib/crypto/secrets.ts), [`src/lib/tenants.ts`](../../src/lib/tenants.ts), [`src/app/api/admin/provision/route.ts`](../../src/app/api/admin/provision/route.ts), and the provisioning tests in [`src/__tests__/provisioning.test.ts`](../../src/__tests__/provisioning.test.ts) and [`src/__tests__/provision-route.test.ts`](../../src/__tests__/provision-route.test.ts). Preserve the native tenant mapper and encrypted secret boundary.

**Prerequisite:** Local Vercel/project and content-store fakes that can fail after each durable step. No production environment or real provider call.

**First failing public-seam test:** Add `src/__tests__/provisioning.test.ts` case `resume after project creation preserves project identity, secret, and edited sections` through the admin provisioning request or its route-level harness. The current implementation generates a new revalidation secret on each call, identifies an existing tenant only by tenant ID, and rewrites all nine defaults on resume.

**Meaningful done criterion:** A failure matrix covers project creation, tenant write, secret write, content defaults, and revalidation. Resume is idempotent, preserves project/tenant/secret/edit identity, fills only absent setup, and verifies the signed revalidation token. The route retains auth/permission checks and existing deprovision coverage passes.

**External evidence or authority needed:** Before a real run, Vercel project identity/recovery semantics, domain/revalidation authority, customer content acceptance, and production permission. Local fakes are not hosted proof.

## Commercial and billing

The local work-economics, allowances, payer transition, subscription gates, and pay-link engines are useful boundaries. They do not select the horizontal price, allowance, provider royalty, or subscription authority. Existing website Stripe behavior and one-off historical pay links remain separate modes.

### BILL-01: read-only commercial status projection

**Customer behavior:** A customer can see the service status that the system actually knows: payer, accepted allowance/cap, known billing mode or next event, and what is unavailable or requires support. Unsupported fields are absent or explicitly unknown. Reading the summary never mutates Stripe, allowances, or payer state.

**Exact source owners:** [`src/app/api/work-economics/route.ts`](../../src/app/api/work-economics/route.ts), [`src/platform/work-economics/service.ts`](../../src/platform/work-economics/service.ts), [`src/platform/work-economics/allowances.ts`](../../src/platform/work-economics/allowances.ts), [`src/lib/subscription.ts`](../../src/lib/subscription.ts), [`src/lib/billing-type.ts`](../../src/lib/billing-type.ts), and the existing payer-transition/evidence services. Use one projection over existing authorities; do not add a second subscription table or commercial source.

**Prerequisite:** Accept the response shape and provenance labels. The existing local sources already expose the underlying facts and unknown states.

**First failing public-seam test:** Extend [`src/__tests__/work-economics-route.test.ts`](../../src/__tests__/work-economics-route.test.ts) with `summary returns only authoritative commercial fields and omits unsupported pricing`; exercise the authenticated `GET /api/work-economics` seam and a foreign-workspace denial.

**Meaningful done criterion:** The projection joins only existing authoritative sources, shows payer/allowance/cap and known mode with provenance, omits unverified price/usage fields, preserves grandfathered and one-off distinctions, and cannot mutate state. Local tests cover unknown, missing, foreign, and accepted values.

**External evidence or authority needed:** Local implementation needs none. Release requires accepted commercial terms and customer language; exact prices and allowances remain open.

### BILL-02: subscription entitlement to allowances

**Customer behavior:** When an accepted subscription or entitlement event changes, the customer sees the correct future period/unit allowance and payer. Already-created work keeps its payer boundary; a payer change affects future jobs only. Duplicate or out-of-order events do not grant work twice.

**Exact source owners:** [`src/lib/billing.ts`](../../src/lib/billing.ts), [`src/lib/subscription.ts`](../../src/lib/subscription.ts), [`src/app/api/billing/webhook/route.ts`](../../src/app/api/billing/webhook/route.ts), [`src/platform/work-economics/allowances.ts`](../../src/platform/work-economics/allowances.ts), [`src/platform/work-economics/payer-transitions.ts`](../../src/platform/work-economics/payer-transitions.ts), and allowance routes under [`src/app/api/work-allowances/`](../../src/app/api/work-allowances/). Preserve website Stripe authority and do not make a one-off pay link imply a subscription.

**Prerequisite:** Decide the horizontal price/allowance/unit model, Stripe account or tenant ownership, event types and idempotency key, entitlement period, grandfather rules, and reconciliation/read-back behavior. This row is blocked until those terms are accepted.

**First failing public-seam test:** After the event contract is accepted, add `src/__tests__/billing-allowance-sync.test.ts`, test `accepted subscription event updates future allowance exactly once and preserves existing payer`, using the webhook seam and a real local allowance store. There is no honest expected amount before the allowance contract exists.

**Meaningful done criterion:** An accepted event is authenticated, idempotent, reconciled to one allowance period/unit, separates future payer transition from existing work, and leaves unknown/reversed events visible without granting work. No live Stripe mutation is part of the local task.

**External evidence or authority needed:** Accepted price and allowance terms, Stripe event documentation/account authority, customer subscription agreement, webhook secret, account/tenant ownership, and production permission.

### BILL-03: provider usage evidence

**Customer behavior:** A billable provider/model execution either has an accepted cost receipt tied to the exact work and provider identity or remains unknown/held. A mismatched key, work ID, amount, or provider receipt cannot silently settle or be retried as a new billable job.

**Exact source owners:** [`src/platform/work-economics/provider-evidence.ts`](../../src/platform/work-economics/provider-evidence.ts), [`src/platform/work-economics/runtime.ts`](../../src/platform/work-economics/runtime.ts), [`src/platform/work-economics/types.ts`](../../src/platform/work-economics/types.ts), and their existing runtime/evidence tests. Use the existing token/read/propose and budget gates; do not build a new model runner or cost calculator.

**Prerequisite:** Select provider/model sources and the receipt contract: provider identity, usage unit, amount/currency, work/tenant key, timestamp, and read-back/reconciliation authority.

**First failing public-seam test:** The existing [`src/__tests__/work-economics-runtime.test.ts`](../../src/__tests__/work-economics-runtime.test.ts) and provider-evidence tests already cover mismatch/unknown behavior. Add `provider receipt with accepted identity settles once` only after the provider receipt shape is selected; until then this is an external-gated design task, not an implementation gap.

**Meaningful done criterion:** Valid receipts settle exactly once; unknown, stale, duplicate, mismatched, or missing evidence holds the work and exposes a recovery state; accepted provider writes cannot be replayed merely because read-back failed. Existing spending caps and payer boundaries remain enforced.

**External evidence or authority needed:** Provider billing/usage API or signed receipt, customer spending authority, currency/tax terms where applicable, and reconciliation access.

### BILL-04: payment-mode separation proof

**Customer behavior:** A one-off build payment remains one-off, an existing website subscription remains a subscription, grandfathered tenants retain their recorded agreement, and horizontal allowances do not get inferred from either without an accepted entitlement.

**Exact source owners:** [`src/lib/pay-links.ts`](../../src/lib/pay-links.ts), [`src/app/api/checkout/route.ts`](../../src/app/api/checkout/route.ts), billing webhook/portal routes, [`src/lib/subscription.ts`](../../src/lib/subscription.ts), and the existing [`src/__tests__/billing-webhook-mode-guard.test.ts`](../../src/__tests__/billing-webhook-mode-guard.test.ts), [`src/__tests__/pay-links-routes.test.ts`](../../src/__tests__/pay-links-routes.test.ts), and production-readiness checks.

**Prerequisite:** Existing mode records and grandfather agreements. No new implementation should start unless the cross-mode test is red.

**First failing public-seam test:** Add a regression case only if the existing mode-guard suite does not prove `one-off payment does not activate subscription or horizontal allowance`; otherwise record the current passing tests as proof-only.

**Meaningful done criterion:** The mode guards pass for normal, missing, duplicate, grandfathered, and invalid events; no route presents a one-off link as a recurring plan; and the distinction is recorded in the acceptance ledger.

**External evidence or authority needed:** Existing customer agreements and Stripe event records for any release claim. No researched or invented prices belong here.

## Genuine unresolved decisions and external gates

These are blockers that source work cannot honestly settle. They should become explicit decisions in the root ledger rather than hidden implementation assumptions.

| Decision or evidence | Rows held | What must be supplied |
| --- | --- | --- |
| Date-time or reservation semantics | APP-03 follow-up, BOOK-03 | Date-time representation, timezone owner, and whether an app value can create a reservation. The date-only APP-03 slice is local and does not wait on this. |
| Inquiry live release | INT-03 and live proof for INT-01/02 | Release flag owner, consent/retention policy, recipient destination, notification authority, and customer acceptance. Local installation remains behind the existing gate. |
| Calendar provider and authority | BOOK-03 and live part of BOOK-02 | Provider/API/OAuth, account ownership, availability/timezone rules, reminders, read-back, and outage policy. |
| Onboarding document policy and extraction | ONB-04 | File types, retention/erasure, human review, extraction and external verification authority. ONB-01/02/03 local synthetic evidence can proceed. |
| Live Check source | CHECK-02 | Named read-only source, API scope, credential owner, freshness and retry policy, and data retention boundary. |
| New-customer website and hosted provisioning release | WEB-03, WEB-04 | Agreement, repository/project, domain/DNS/deploy authority, revalidation/project recovery semantics, production permission, and two-client evidence before starter promotion. |
| Horizontal commercial terms | BILL-01 release language, BILL-02 | Price/allowance/unit definition, payer/tenant ownership, Stripe event contract, grandfather rules, and reconciliation authority. |
| Provider usage settlement | BILL-03 | Provider/model, signed usage receipt, unit/currency, work identity, and customer spending authority. |

## Dependency order for scheduling agents

1. APP-01 and BOOK-01/02 are complete and recorded in the acceptance ledger. Launch ONB-01, APP-02, and APP-03 in parallel. CHECK-01, BILL-01, and the synthetic-file part of ONB-03 are also ready-local if a slot is available; they use separate source owners.
2. After the remaining first wave, run ONB-02 and ONB-03. Run INT-01 behind the existing inquiry release gate; its local installation does not wait for live release proof. Run WEB-01 after R6 has a request/visibility seam; WEB-02 can proceed with local scan fixtures.
3. Keep INT-03, BOOK-03, ONB-04, CHECK-02, WEB-03, BILL-02, and BILL-03 in the decision/external queue. Their local contract tests should be written after the missing authority is recorded, not guessed in fixtures.
4. Root records each red test, focused result, local versus preview/production evidence, and human acceptance in [`docs/strelvav2-horizontal-acceptance.md`](../../docs/strelvav2-horizontal-acceptance.md). No row here authorizes a migration, live email, Stripe mutation, provider write, DNS action, or deployment.
