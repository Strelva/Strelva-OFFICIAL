# Booking native fixture diagnostics — 2026-10-08

The frozen native Auth browser run failed both booking cases in the read-only effect counter before journey assertions: business_booking_updates has history_id, not booking_id. The counter now joins its exact history row to the booking and retains the originating workspace filter. No cleanup or broader delete was introduced.

Local SQL failures now capture stderr and emit at most three actionable diagnostic lines, bounded to 1,000 characters, with connection URLs and passwords redacted. Child-process messages and causes, which can contain credential argv, are never forwarded. Invalid JSON emits a generic failure.

Verification: focused diagnostic unit file passed three tests; scoped lint and diff checks passed. Native Auth/browser rerun remains with the coordinator; this source repair does not establish that either booking journey passes.
