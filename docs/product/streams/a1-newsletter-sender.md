# Agency 1.0 newsletter sender and backfill identity

October 7, 2026. Branch `a1/newsletter-sender`; issues #465 and #511.
Implementation and fictional local verification only. No production action or
live email is authorized by this record.

## Current behavior

Approved newsletter issues remain immutable. The sender snapshots the current
active audience once into stable batches of at most 100; new subscriptions never
shift accepted batches. Each batch claims a fresh token, rechecks current subscriber
status and the System/workspace pause, then crosses a durable sending marker.
The shared `src/platform/infra/email/send.ts` transport sends from
`newsletter@mail.strelva.com`, with provider idempotency and signed one-click
unsubscribe links. Stored mixed-case subscriber identity is preserved; malformed
or whitespace-padded addresses are excluded rather than issued broken links.
Only exact current `active` rows are sent; all other statuses are suppressed.

Batch receipts are append-only, with accepted/suppressed counts and provider IDs.
The existing issue read exposes a separate delivery projection and receipt history;
the approval snapshot is never rewritten. Accepted is not delivered.

Cron `/api/cron/newsletter-sender` is registered every five minutes with cron auth
and heartbeat, bounded to ten batches per invocation. It defaults off unless
`STRELVA_NEWSLETTER_SENDER_RELEASE=1`; existing workspace `publishing` release,
`CUSTOMER_EMAIL_ENABLED=true`, and the tenant-aware client email policy must also
permit sending. This independent sender gate needs no shared flag-name list edit.
The client policy uses the existing `EMAIL_SENDING_ENABLED`/`reb:client-email`
override semantics, with unreadable override storage failing closed for this sender.

Gate/configuration failures record `not sent: gated` or the specific unconfigured
reason and retry after one hour. Expired claims can be reclaimed only before the
sending marker. Accepted and ambiguous sends are never automatically resent,
even after a provider's idempotency retention expires. A timeout, crashed worker,
or unresolved receipt persistence after sending remains held for operator
reconciliation. This PR does not provide an automatic ambiguous-send recovery
command. Receipt persistence itself retries without another provider call.

Backfill now uses the signed-in request client and validated `auth.getUser()`.
SQL derives `auth.uid()`, locks the verified user and unrevoked `super_admins`
authority rows, and rejects signed-out, unverified, revoked and nonoperator actors.
There is no supplied operator identity. Only authenticated request sessions can
execute the replacement RPC; anonymous and service-role backfill calls are denied.

## Migration and rollback

New migrations `20261011100000_workspace_newsletter_sender.sql` and
`20261011100100_newsletter_backfill_identity.sql` leave pinned migrations unchanged.
Their named rollback files restore the original issue reader and backfill signature.
Stop the sender and export receipts before rolling back the delivery tables.
The identity rollback restores the prior email-string trust boundary; use only as
an explicit rollback, never as a security recommendation.

## Verification and continuation

Tests cover exclusive claims, pre-send reclaim, accepted replay, unchanged batch
membership, current unsubscribes/suppression, mixed-case unsubscribe identity,
gated/configuration paths, receipt retries/outages, ambiguous holds, provider IDs,
request-session identity, revocation, and SQL rollback/reapply. The checker now
loads and exercises the previously omitted immutable publishing content migration.
The old publishing fixture used a nonexistent `users.email_confirmed_at` column;
it now uses the actual public `verified_at` column.

Visual fixtures expose accepted, gated and unconfirmed receipts without provider
or database writes. Desktop acceptance and mobile gated/unconfirmed states were
observed locally; mobile content width matched its 390px viewport.

Exact final command results are recorded in the PR. Remaining operational proof:
provider acceptance/delivery, deployed cron behavior, and operator reconciliation
of ambiguous batches. Keep the sender flag off until the orchestrator integrates,
reviews the migrations, and Jacob authorizes any production rollout or live sends.
This implementation changes no offer, price, customer responsibility or commercial
claim. Broader capability/vault reconciliation belongs to the coordinating agent.
Next action: integrate/review this PR against `integrate/reborn-1.0`, preserving
paused production gates and excluded integration-round-2 files.
