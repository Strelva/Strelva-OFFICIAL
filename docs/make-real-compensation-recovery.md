# Make real compensation recovery

Accepted provider effects keep their forward receipt permanently. Undo is a
separate durable outcome: running, failed, unknown, compensated or unavailable.
The runner persists a compare-and-set claim before calling the provider and
checks the effect's current authority. A refused undo leaves the activation
attached and needs attention; a confirmed no-effect failure may be retried.

An exception, a lost checkpoint or an expired claim means unknown. The runner
never automatically repeats that undo. An authorized operator must reconcile
with evidence of the provider's terminal outcome before another attempt or
closure. The 120-second grace period is a settling delay, not provider fencing;
elapsed time alone does not prove a request finished. Adapter `ok: false` must
mean confirmed rejection without an effect; ambiguous results must throw.

Compensable effects without an adapter, provider reference or current authority
also stay open. Irreversible accepted effects remain visible as cannot undo.
Rollback can restore internal references without reconstructing deleted data
or pretending irreversible effects disappeared.

Apply `20261014030000_make_real_compensation_claims.sql` before the corrected
runner. Its rollback companion disables activation creation/saves while keeping
all safety validators, claims, receipts and history. It is permission recovery,
not schema reversal. Forward reapplication restores service writes. An older
runner must not write these rows.

Local proof: `bash scripts/check-make-real-compensation-sql.sh` applies the full
ordered schema in a disposable Unix-socket PostgreSQL cluster. It exercises the
actual RPC repository, stale revisions, accepted-receipt preservation, refused
and ambiguous undo, forged claim replacement/removal/closure, private-helper
ACLs and disable/reapplication. Provider operations use isolated adapters;
this does not qualify a hosted database or a real provider cancellation.
