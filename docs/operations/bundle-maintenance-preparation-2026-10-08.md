# Private bundle maintenance preparation — #297

Prepared on the isolated `prepare/launch-bundle-maintenance-20261008` branch from
`e28e1a5fcf89d43f4d3fc123a1fbceaee3bb6d00`. This is a manual preparation path,
not a deployed or operated maintenance service. Original #297 remains open.

## Contract

An optional `maintenance` input to the existing `keep_me_found` command attaches
one exact Google binding/location to the five original standing responsibilities
in the same native transaction. The accepted service request must contain the
same `maintenanceAttachment` object (`bindingId`, `locationId`,
`hoursSource: business_record`, `replyPolicy: approve`). Its requester must still
be the verified business owner. This does not upgrade older bundles implicitly.
Failed attachment creation rolls back the new bundle and its five policies.

The dedicated `maintenance_prepare` command takes `attachmentId` and `cycleKey`
from an actual signed current agency staff actor. Native admission checks the
current provider seat, Google verification, exact resource mandate, accepted
service request, scope and cadence, original owner, pinned responsibility
Versions, connected binding, granted scope and unpaused location. It does not
substitute an owner's identity for a stale agency caller. Admission checks are
VOLATILE commands with row locks; the receipt reader is STABLE and works in a
READ ONLY transaction. No general standing or engine operation changes.

Hours come from the current business record. A Google read must demonstrate a
difference before an exact pending owner draft is queued. Missing hours never
clear Google. Replies use the existing tenant reply mode, dismissal history and
drafter through app-edge ports, with strict dismissal storage availability and
a maximum of five unanswered reviews from two pages. `off` stays off. Existing
`auto` mode still queues human approval here. Each attachment/review has one
immutable preparation, including after owner dismissal; changed copy or source
requires explicit reconciliation, not another automatic proposal.

Preparations freeze the actual agency actor, business record revision and exact
draft. Existing pending owner events carry the preparation and binding pins.
Missing event/link persistence stops for reconciliation; a retry never invents
a replacement event. This introduces no automatic reconciliation or new queue.

The existing owner event authorizer still owns the human decision. A native
qualification check runs before token refresh/provider reads, again after the
listing context resolves, and immediately before the existing Google write.
Accepted write uncertainty still uses the original event and Google receipt
semantics. Original receipt identities, matched readback, replay and undo remain
owned by the existing listing executor. The weekly proof card reader links these
original receipts to `hours_sync` and `gbp_replies`; it does not duplicate the
outside-write ledger or report checks as maintained outcomes. Weekly email
delivery is not extended or qualified by this preparation.

## Runtime and rollback

`STRELVA_BUNDLE_MAINTENANCE_RELEASE` defaults OFF. No flag, cron, Google project,
provider credential or production value was activated. The private API command
is manual; cadence is an authority pin, not an installed maintenance schedule.
Historical migrations, the generic standing runner and engine are unchanged.

Migration `20261020090036_bundle_maintenance.sql` and its guarded rollback are
proposed batch 18 only. The rollback refuses when any attachment, preparation or
event link exists, preserving receipts rather than deleting admitted evidence.
An empty rollback and forward reapply are rehearsed by the native check.

## Proof commands

Run `bash scripts/check-bundle-maintenance.sh` on the existing local PostgreSQL
toolchain. It creates and cleans its own disposable socket cluster, applies the
ordered migrations, exercises actual admission/source/Version failures and
atomic replay/rollback, holds an authorization transaction against concurrent
staff revocation, and runs the stored executor seam with a fictional Google
implementation. The seam uses actual native provider identity, business record
authorization, preparations, links and original Google receipt storage. Owner
session and event transports are fictional; this is not actual Supabase Auth,
Redis event claim/settlement or browser proof. No real model or provider is used.

Affected verification also includes focused Google/standing/review/proof/release
tests, typecheck, lint, product boundaries and ontology. The parent coordinator
owns combined full-unit/build qualification after source convergence. Receipts,
failed attempts and the exact commit manifest belong in the private
`bundle-maintenance` artifact directory; they do not establish live acceptance.

## Still unqualified

Google's agency automation/project eligibility, client-specific programmatic
access and consent rules, temporary content storage limits (30 days), operated
revocation/disassociation, actual provider readback and human owner UI are
outside gates. Immutable retained draft/receipt evidence needs an accepted
retention implementation before live use; this code guard is not legal
certification. See the dated investigation for primary Google policy links.

Native locks protect one database command, not an external request already in
flight after its transaction ends. External revocation races remain subject to
the original listing uncertainty and receipt handling; no stronger atomicity is
claimed. This work supplies genuine local preparation machinery, not the full
original maintained outcome. Next: independent seam review and exact combined
source qualification, then a real Auth/Redis owner approval journey and resolved
Google operating facts before any activation decision.
