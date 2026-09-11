# Inquiry migration initial checkpoint

Historical checkpoint, superseded by the ongoing [horizontal implementation](./horizontal-first-scope-2026-09-11.md) and its [release checklist](./horizontal-release-checklist-2026-09-11.md). The 60% estimate below describes this earlier snapshot, not current completion.

September 11, 2026. Local, uncommitted work. No production deployment, database
migration, sending switch, customer message, or client-site installation occurred.

The full migration is not complete. A rough engineering estimate is **60%**,
based on the [28 acceptance areas](./inquiry-first-acceptance-2026-09-11.md):
10 have narrow local evidence, 16 are partial, and 2 remain pending. This is not
a claim that 60% of production traffic has migrated. Nothing was enabled in
production during this work.

## What works locally

- A narrow sidebar and four ordered business-home sections.
- A request becomes a removable shape before Go, then one Work page containing
  its shape, plan, editable fixed form, receipt, and Make live control.
- Manual edits and written edits use the same canonical change engine.
- Saved rehearsals run eight named checks. Removed optional steps are checked
  for absence of messages, rather than reported as executed sends.
- Public forms bind submissions to the published capability and version.
  Invalid fields, unknown choices, stale versions, and unavailable storage fail
  explicitly. Existing v1 forms remain compatible.
- Canonical server commands derive the actor and check tenant membership and
  permission. Browsers cannot submit an authoritative lifecycle snapshot.
- Publishing commits configuration and its acceptance receipt atomically to
  the Postgres authority read by the public endpoint. The existing approval
  executor handles the event. Lost responses and failed read-back do not cause
  repeat publication.
- Undo creates a new version, preserves inquiries and their timeline, and
  restores prior content. Later edits retain earlier receipts.
- Grouped record status changes and their inverses share the durable receipt
  transaction. Status is reconstructed from that history on read.
- Explicit email permission is distinct from mail-provider configuration.
  Revocation pauses the standing job; provider and audience switches remain
  enforced. Consent does not authorize unattended customer messaging.
- The follow-up worker is registered and authenticated. It refuses to send
  without a fresh reply-state adapter and the current responsibility approval.

## Remaining implementation and proof

1. **Real operation of the first inquiry.** Connect the worker to verified reply
   and bounce evidence. Implement the customer-message approval journey or an
   explicitly configured standing rule. Route to the capability's selected
   staff destination; the existing intake notification still owns the owner
   notice. Prove the complete first inquiry with a real provider in an
   authorized test environment.
2. **Capture reconciliation.** Intake stores the lead in Redis before appending
   its canonical receipt in Postgres. A retry repairs missing evidence through
   the deduplication identity, but a durable repair queue is still required for
   clients that never retry after a receipt-store outage.
3. **Agency work.** Attention must aggregate only granted clients and open one
   decision at a time. The engine can import a source definition without
   credentials, but the server still needs authorized cross-client pattern
   discovery, target brand/staff adaptation, and a fresh rehearsal journey.
4. **Onboarding.** Current statements come from existing tenant settings.
   Pasting a website does not yet extract sourced facts. Add that read workflow,
   correction receipts, failure states, and desktop/mobile evidence.
5. **Inspector and responsibility editing.** The record timeline and basic
   actions exist. The contextual “on this” request box, editable responsibility
   document, and complete plain-language capability-rule editing remain.
6. **Connections.** Email permission and existing integration projections exist.
   Finish the provider-specific consent/disconnect journeys and verify grants
   for Google, calendar, Stripe, and MLS. A platform key is never tenant consent.
7. **Authenticated end-to-end proof.** Unit tests and the isolated browser
   preview pass. Run the real server adapter against representative local
   Postgres/Redis/auth fixtures, including reload, revoked access, partial
   outages, grouped undo, and concurrent changes. Review all final changes
   against the acceptance matrix before promotion.

## Local evidence

- Full Vitest suite: 295 files passed, 2,333 tests passed, 1 skipped.
- TypeScript, ESLint, product boundaries, ontology, and production build passed.
- `pnpm check:workspace-sql` passed using isolated PostgreSQL 18, including the
  new inquiry migration. It did not connect to production.
- `pnpm check:custom-repos` passed 54 checks against representative consumers.
- `tests/inquiry-ui-preview.spec.ts` passed four desktop/mobile journeys.
- Rendered artifacts: `output/inquiry-receipt-desktop-verified.png`,
  `output/inquiry-new-mobile-verified.png`, and `output/inquiry-home-mobile.png`.

Four delegated agents stopped when the account usage limit was reached. The
root coordinator continued locally to stabilize and test their changes. These
remaining items are implementation work, not an approval request to deploy an
unfinished migration.

## Eventual release prerequisites

After the remaining work is accepted, prepare the exact migration and rollout
for separate authorization. Required configuration includes the release flag,
an adequately generated `INQUIRY_PUBLICATION_CLAIM_SECRET`, authorized sending
switches, provider consent, and installation of the shared form renderer in a
representative client repository. Do not enable these as a side effect of this
checkpoint.
