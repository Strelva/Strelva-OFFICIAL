# Wave 6 inquiries handoff

Branch: `w6/inquiries`. Worktree: `REB-w6-inquiries`.
Resumed October 7 from `9202136` and `a102896`, both unverified interruption checkpoints.
Local implementation only; no production, client repositories, provider calls, dependencies, pushes or PRs authorized.

## Current objective and continuation

Close the inquiry launch contract: retain every lead, review spam, reply from the workspace, notify the owner; complete the delta including durable read cutover and outcome proof.
The checkpoints contain direct owner replies and provider-event reconciliation, connected-site durable records/spam review, owner notices/repair queue, business-record routing context, urgent commitment decisions, pause-safe intake, paged lead reads and outcome SQL/report plumbing.
These require fresh verification before acceptance. Exact next action: focused inquiry tests and typecheck, inspect failure paths, finish missing wiring and proof, then run all required final gates.

## Production boundaries

All new switches remain off by default. Email must also pass `EMAIL_SENDING_ENABLED`, `CUSTOMER_EMAIL_ENABLED` and per-tenant `reb:client-email`. No live action is performed by this stream.
The coordinator owns strategic-state reconciliation and shared release/product docs; this handoff supplies the evidence delta without editing another worktree.

## Verification

Pending fresh checks. Earlier scratch logs are retained as failed/incomplete evidence, not final results: SQL authority race never reached its hold point; the interrupted full test run reported failures including event-actions, listing replies and inquiry-delivery-server.


## Round 4 continuation (October 7)

Coordinator-supplied production state: 0.2.1 is live and batch 0/backfill completed (43/43); this stream made no production calls. Read parity is still a separate seven-day gate. The Oct 7 missing-table readiness correction is preserved with the new inquiry migration sentinels.

Fresh focused proof: initial inquiry suite 45 files, 381 passed /13 skipped; closure subset 6 files /91 passed; client compatibility 196/196. Boundary imports corrected through public entry points/existing tenant adapters, baseline pruned. Typecheck checkpoint mock errors fixed; final check rerunning.

Newly found gaps being closed: summaries now retain Redis leads pending their Postgres copy without double counting; durable exclusions win over stale cache; a shared durable purpose prevents an engine reply racing an owner workspace reply; Needs you inquiry emails fail closed behind all required gates. Connected-site owner-notice receipts/repair visibility is under implementation.

Failures retained: initial SQL gate hit a 5-second timeout in Version-store proof; first full Vitest run overwhelmed the shared host and hit import/test timeouts. Full suite rerunning with two workers and 30-second runner timeouts. This changes runner capacity, not product policy clocks. Browser preview running only from this worktree on port 32766, no provider credentials, all email gates off.

Exact next action: finish connected owner notices and SQL proof, inspect reply/spam/empty/permission/error UI at desktop/mobile, run build and final checks, replace this continuation with final acceptance evidence and clean commits.
