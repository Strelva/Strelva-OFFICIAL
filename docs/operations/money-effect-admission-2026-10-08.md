# Money effect admission race repairs — 2026-10-08

Source lane: `codex/full-model-money-agent-20261008`, starting at
`9de7fe7046902a1e9f1821a19bfe7c1031f16279`. Parent integration owns the
combined source, release manifest and all native/provider execution. This packet
is source preparation, not deployment or external payment qualification.

The SPT provider receives a required request-owned `assertAdmission` callback.
After the bounded token GET, the adapter calls it immediately before its new
PaymentIntent POST. The native routine checks the immutable request/payment/
reservation/rail, merchant readiness and exact generation, request cancellation
and clock expiry, and the held deposit backing. Provider retrieval and signed
observation/binding recovery retain their existing paths. Stable payment keys
and the 23-hour unknown-attempt reconciliation stop are preserved.

Agency fulfillment binds reauthorization to the originating exact verified actor,
accepted owner's current verified email and owner membership, accepted immutable
intent, current agency payer, and exact merchant generation. It rechecks before
customer and Price creates, uses an actor-authorized atomic term binding, and
injects a callback inside checkout/subscription helpers after their own awaited
preparation/merchant reads and immediately before new provider creates. Existing
provider observation RPCs remain available to retain effects already sent after
revocation. No actor bypass or replacement manager is selected for this attempt.

The protected quote successor takes the exact quote advisory lock and lead row
lock before its final token checks. It locks the exact verified user identity,
then retains existing family/token/membership locks and rechecks bearer/family
clock expiry immediately before delegating to the original immutable receipt
writer. Original owner/lead/request/amount/currency/terms replay semantics stay
with that writer. Approval records terms; it does not charge.

Forward migration `20261021132000_money_effect_admission.sql` adds the three
admission/binding routines and replaces only the current protected-tool wrapper.
No historical migration bytes changed. Its inverse deliberately refuses with
`money_effect_admission_forward_only`: removing the admission gates would restore
the reviewed races. A reviewed forward successor is the recovery path.

Executed source checks: four focused Vitest files, 51 tests passed, maxWorkers=2;
scoped ESLint; `git diff --check`; native quote race script JavaScript syntax.
The paused SDK unit tests simulate committed-state changes; they do not prove
Postgres locking, real Stripe effects, or commercial/provider permission.

Prepared native checks, not executed in this lane:

- `tests/money-effect-admission-schema.sql`: exact admission, merchant disconnect
  and generation replacement, request cancellation/expiry, cancelled held deposit,
  recovery of an already-sent effect, accepting-owner verification withdrawal,
  current payer replacement, removed manager denial and no term binding, role grants.
- `scripts/check-protected-quote-admission-races.mjs`: two actual PostgreSQL
  sessions hold quote serialization while a bearer expires or the exact user's
  verification is withdrawn; require `oauth_invalid_token` and zero receipts.
  It requires `STRELVA_MONEY_RACE_PROOF=1`, loopback `STRELVA_LOCAL_DB_URL`, and
  a disposable clone database name beginning `money_admission_`. Fixtures remain
  for failure inspection; the parent owns clone destruction and retained logs.

Native schema installation, fixture validity, actual serialization behavior,
combined typecheck and provider qualification remain pending. Parent next action:
compose the commit, refresh exact migration/inverse hashes, run the ordered native
fixture and guarded quote race script in a new disposable clone, retain both
successes and failures, then run the combined source checks. No new provider write,
production mutation, dependency, price or email activation was authorized here.

The admission SQL transaction completes before an outside SDK request. A
revocation committed before final admission is denied; a revocation racing after
that admission can still overlap an already-started effect. Existing immutable
bindings, signed observations and refund-review recovery cover that distributed
boundary; these local checks do not promise atomicity with Stripe.
