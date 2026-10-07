# Native publishing and booking email — Agency 1.0

2026-10-07. Issues #466 and #512. Branch `a1/tenantless-publishing`.
Local implementation evidence; no deployment, provider write, email, migration
application to a shared database, or release enablement is authorized by this record.

## Outcome and boundaries

A native website System can compose, review, publish, read its receipt, and
prepare a baseline-bound restore without a linked tenant. Its content lives in
`workspace_collection_entries`, keyed by business and System. Native newsletter
Systems use the existing immutable issue store, with no tenant reference and
sending paused. The integrated tenant newsletter sender excludes native issues
before its queue limit and rejects native claims; its tenant mail path is preserved.
Content-store confirmation does not prove external website rendering.

A native Google grant (the existing workspace binding with no origin tenant)
can author hours, info and post drafts through the existing event approval,
listing receipt, read-back and undo services. The same encrypted Google token
refresh path persists native tokens in the binding; it never falls back to a
legacy tenant connection. A Google grant, eligible profile, API access and OAuth
configuration remain prerequisites. Existing native reconnect handling is reused.

`workspace-<business UUID>` is a compatibility target key for the existing
Redis-authoritative event queue, not a tenant row. Needs you discovers that
queue through its existing adapter. Owner sessions and recipient-bound signed
owner links use current business authority; an agency, generic sessionless actor
or operator access alone cannot approve a native publishing event.

Publishing remains behind the existing default-off workspace, Systems,
publishing and Google-binding gates. No release flag names or defaults changed.
Newsletter sending and publishing notices retain their separate gates.

Native booking emails require explicit SQL state `on` for that business,
plus both global client/customer email gates and the existing booking delivery
gates. Missing, `inherit`, `off`, invalid or unreadable state means no native
email. An old Redis workspace override cannot arm it. Legacy tenant email
behavior is unchanged. Enablement itself sends nothing.

## Logged operator action

Confirmed super-admin session, same-origin JSON request:

`POST /api/admin/businesses/<workspace UUID>/booking-email`

Body: `{"state":"on","reason":"Explicitly approved test-business enablement"}`.
Use `off` to stop native booking email, or `inherit` to return to its off default.
The route takes the actor from the session, never the body. SQL verifies the
active operator again and commits the setting with an immutable event containing
actor ID/email, reason, prior/new state and time. `GET` on the same route returns
enabled state and the last 100 actor events. This path remains deliberately
uninvoked on production or real businesses.

## Prepared migrations

- `20261011102000_native_publishing_targets.sql`: native collection storage,
  System ownership checks, existing-ledger content receipts, native immutable
  newsletter issues, native Google binding read.
- `20261011101000_business_booking_email.sql`: per-business switch and immutable
  operator history, with RPC-only access.

Both have rollback files. Rollback refuses after native outputs/receipts or
booking-email history exist, preserving commitments and audit evidence. Both
SQL harnesses apply, test, roll back and reapply these migrations. The focused
harness now includes the retained collection fixture and existing Wave 6 content
migration; its previous content test used a nonexistent `users.email_confirmed_at`
column, corrected to the canonical `verified_at`.

## Verification and continuation

Final results are recorded in the PR. Logs and failure history are retained in
`.scratch/a1-tenantless/`. Targeted proof covers native scope/owner checks,
flags off, baseline-bound drafting, atomic publication and receipt failure,
restore, replay, paused recovery, immutable issues, native grant isolation/token
refresh, Google acceptance/read-back/undo, signed owner links, API CSRF/operator
checks, and native booking global/per-business gates.

Browser evidence uses the existing local fictional HTTP-double page at
`/preview/strelva/publishing`: compose → review → publication receipt at 1280 px,
receipt at 390 px, read-only and storage-error states with no horizontal overflow.
It proves rendered controls and copy, not authenticated storage or real providers.

Outstanding proof: real authenticated owner sessions,
production migration rehearsal against the actual release schema, real Google
profile writes/read-back/undo, native website rendering and live mail. Keep every
release/send gate off during integration. Production activation requires Jacob's
explicit authority; no decision is needed for the local implementation.

The integrating coordinator owns project-model/overhang/vault propagation.
This delegated implementation supplies the evidence delta; it makes no commercial
or production claim. Newsletter sender overlap and migration timestamp collision were resolved locally;
the shared SQL harness and readiness manifest preserve both streams. Next action:
integrate this PR and rehearse the combined release before any rollout decision.
