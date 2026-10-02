# Inquiry-first architecture and security review

Reviewed 2026-09-11. Status: independent local implementation review.

This review applies the selected
[inquiry-first product specification](./inquiry-first-product-spec-2026-09-11.md)
and the repository trust boundaries to the local inquiry implementation. It is
not release approval and it does not establish production behavior.

## Scope reviewed

- Canonical engine contracts, lifecycle operations, fixed components, receipts,
  rehearsals, publication, Undo, Why, responsibilities, and bulk changes in
  `src/products/inquiries/`.
- Postgres workspace and publication-claim repository plus migration
  `20260911100000_inquiry_capability_workspace.sql`.
- Redis delivery checkpoints, claims, timeline, and daily budget enforcement.
- Public inquiry-form projection and the additive `/api/v1` read and submission
  path.
- Private business route, connection projection, preview UI, tenant rename
  registry, privacy routing, and persistence documentation.

## Required architecture

1. The engine owns one versioned inquiry lifecycle. UI, delivery, public forms,
   and persistence consume its contracts instead of defining competing domain
   models.
2. Postgres stores capability configuration, rehearsals, receipts, and a
   compare-and-swap revision. Redis remains authoritative for customer inquiry
   records under the existing v1 lead contract.
3. A publication claim is acquired before a provider call. The claim binds the
   tenant, business, actor, capability, change, action, version, idempotency key,
   and command digest. Only the claim holder may record the result.
4. Provider acceptance is final write evidence. A failed read-back becomes
   `verification_failed` or an equivalent accepted-unverified state and never
   reopens the external write.
5. Delivery reads current policy immediately before send, enforces a current
   Responsibility evaluation and atomic daily budget, and stores a
   tenant-scoped accepted-write marker before verification.
6. Public reads return only a validated fixed form projection. Private routing,
   responsibilities, connections, receipts, customer records, and drafts do
   not enter that payload.
7. Rehearsal owns no live adapters. Every recorded check must have run and
   passed before the UI may report an exact passed count or permit Make live.
8. Every server entry derives tenant and business scope from authenticated
   membership or trusted tenant routing before service-role persistence access.

## Review findings

The following findings were serious enough to block acceptance when first
observed. A disposition of **Implemented, evidence pending** means the source was
corrected during review but the required final command or browser evidence is
still recorded as Pending in the
[acceptance matrix](./inquiry-first-acceptance-2026-09-11.md).

| Finding | Required resolution | Current disposition |
| --- | --- | --- |
| Competing inquiry models existed in engine and storage. | Store the canonical engine state and remove duplicate domain contracts. | Implemented, evidence pending |
| Durable state validation checked only top-level business ids. | Validate nested definitions and references before load or write. | Implemented, evidence pending |
| A publication retry could repeat an accepted provider write. | Use an acquired durable claim, exact command digest, ownership token, immutable accepted evidence, and a closed verification-failure state. | Implemented, evidence pending |
| Publication claims did not bind the actor and provider receipts could retain secrets. | Include actor identity in the digest and command immutability check; redact sensitive receipt keys and personal data. | Implemented, evidence pending |
| Delivery keys and markers could collide across tenants. | Include the tenant in every checkpoint, claim, timeline, and budget key and validate stored identity on read. | Implemented, evidence pending |
| A Responsibility could be omitted or treated as trusted without a current allow decision. | Fail closed without a current policy and evaluation; start supervised and promote through a separate evidenced action. | Implemented, evidence pending |
| Daily message limits were advisory. | Reserve the tenant and policy budget atomically before claiming delivery work. | Implemented, evidence pending |
| Follow-up could act without a fresh reply and version check. | Recheck reply state, policy, exact capability version, pause, connection, and recipient state immediately before send. | Implemented, evidence pending |
| Approval did not bind the exact rendered message and capability version. | Bind approval to message digest, policy version, capability, and version. | Implemented, evidence pending |
| Rehearsal could count skipped checks as a pass. | Require eight named checks to run and pass, including external-write blocking, and derive the displayed count from stored results. | In review |
| A public form submission did not bind the definition version it rendered. | Require the current published capability id and version, reject a stale form, and retain the version on the inquiry record. | In review |
| Why could infer causation from event order alone. | Follow `causedByEventId` or shared receipt evidence and say when the causal link is missing. | Implemented, evidence pending |
| Caller-provided receipt outcomes could fabricate a clean operating record. | Require sponsor-bound approval, a unique idempotency key, concrete outcome evidence, and engine-derived budget use. | Implemented, evidence pending |
| Redis delivery authority was absent from rename and persistence maps. | Register all slug-keyed inquiry keys and document Postgres and Redis authority separately. | Implemented, evidence pending |

## Release blockers and limitations

- The acceptance matrix remains authoritative for final status. Source presence
  alone is not a local pass.
- The public end-to-end path must prove a rendered form version, stale-version
  rejection, Redis inquiry persistence, routing, safe notification behavior,
  and receipt projection without using a live transport.
- Private reads and writes need focused tests for same-tenant access,
  wrong-tenant access, revoked membership, and agency assignment.
- The workspace and publication migration is prepared locally and has not been
  applied. Database trigger and privilege behavior requires the isolated
  workspace SQL check before release consideration.
- The preview must be inspected with realistic populated, empty, loading,
  error, and read-only data on desktop and mobile. Fixture behavior is not
  production authorization evidence.
- No production migration, deployment, environment change, live email,
  provider write, or production data repair was performed or authorized by this
  review.

## Evidence handling

Record command output, test counts, and rendered artifacts in the acceptance
matrix only after direct inspection. Keep local, hosted preview, and production
evidence separate. A failed check remains visible until the underlying issue is
fixed and the same check passes.
