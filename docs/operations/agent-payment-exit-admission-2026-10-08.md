# Agent payment exit admission successor — 2026-10-08

Independent review found that final new-charge admission omitted the completed workspace-exit condition already enforced when reserving a business payment. A workspace could exit while shared-token GET was pending, then pass final admission and send the first charge POST.

Additive migration 20261021132100 replaces only assert_agent_payment_admission and checks workspace_exit_completed after all potentially blocking row locks, beside request expiry/cancellation/paid checks. Historical migrations and provider observation/readback/reconciliation routines are unchanged. Its inverse fails explicitly because restoring the omission would allow new charges after exit.

The actual requestAgentPayment → Stripe provider unit now includes completed exit during a paused token GET and verifies the exact admission call, one GET, zero POST and no provider binding. Existing known-intent recovery asserts it never calls new-charge admission. Focused Stripe tests: 18 passed; scoped lint and diff checks passed.

The native fixture now prepares a valid request and attempt before inserting completed exit, expects admission denial, and then expects recovery of a previously sent effect. This SQL fixture is prepared but unrun; the coordinator owns native verification. The final SQL check remains separate from the external Stripe write and does not promise atomic cross-system serialization.
