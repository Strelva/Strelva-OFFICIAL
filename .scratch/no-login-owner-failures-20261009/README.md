# Email-only owner failures — source preparation

Base: 5841f62e9e384d947d133ac4738dbbd34c011415. Independent lane; coordinator owns integration and native runtime.

Captured no-login run: `/private/tmp/strelva-full-journeys.Dnck69/no-login-local/results-raw.json`. Both complete-job cases failed. Booking expected an urgent suppressed delivery; actual deliveries were empty. Make real expected an open decision after chase; no matching row existed. Original case names and 240-second budgets are unchanged.

## Booking correction

The full-native-derived no-login environment deliberately leaves BOOKING_OWNER_NOTICE off. The real chase previously continued without recording that suppression. It now records one urgent suppressed delivery with reason `booking_owner_notice_disabled` for a new urgent booking ask, increments ownerNotTold, and leaves the decision open. Sequential chase calls see the persisted suppressed state and avoid another record. Concurrent calls and a close/revision race remain unproven: recordDelivery has no revision/state compare-and-set or uniqueness constraint. An atomic metadata-recording successor needs a separately reviewed new migration; do not rewrite historical SQL to claim it. No recipient, provider receipt, email, or resolver is manufactured or invoked.

Focused regression reproduced the empty-deliveries failure before the source edit (38 passed, 1 failed); after the correction all 39 tests in needs-you-service.test.ts passed. Scoped ESLint and git diff --check passed. Native owner-link workflows remain unverified for these bytes; coordinator must import/review and run the unchanged two-case no-login window.

## Make real investigation remains open

The captured reviewedRebuild fixture fits the current rebuild contract. The source needs a legitimate needs_you_sync service session, saved-work access, and an existing website System bound to its tenant. Projection skips a rebuild if no matching site exists. make_real proposal catches read errors and returns complete:false. The captured chase ignored that completeness, so its failed:0 did not prove successful discovery. This packet now counts incomplete sync once per workspace, and an unreadable linked-business enumeration as a failure. Authenticated cron discovery records admitted/unavailable service context plus each adapter's complete/proposed counts for at most 100 workspaces, with an explicit omitted count. Heartbeat failure follows the existing failed count. No source error text, owner address, signed link or session ID is added. Do not fabricate a decision, owner account, session, or website binding to satisfy the case.

The retained Make real trace contains an actual 200 cron response with lapsed/reminded/digests/urgent/ownerNotTold/failed all zero. It has no server-side adapter trace. Original fixture cleanup removes the failed business; a later empty database cannot identify the original refusal.

The unchanged Make real case now attaches pre-cleanup diagnostics in finally, before its existing cleanup. One bounded `BEGIN READ ONLY` / SELECT / ROLLBACK reads existing needs_you_sync sessions created since chase (max 5), their actual `platform_service_session_holds` result, the stable tenant link count, and matching decision state/outcome (max 10). It creates no session. Only an existing currently held verified identity is used for actual `read_business_systems` / `read_existing_business_systems` RPCs; production parsers and projection calculate the bound website count. Saved work is parsed using the actual rebuild/candidate contracts. Identity emails/IDs stay internal and are not attached. Diagnostic failure stays explicit as diagnostic_unavailable and cannot replace the original assertions.

Focused tests prove the original reviewedRebuild parses as review_ready, an actually projected tenant website matches, absent/revoked admission stays unknown without RPC reuse, and output excludes identity details. This is fixture/pure evidence, not a claim that the failing native business had those states. Incomplete Make real and linked-business read tests both reproduced failed:0 before their respective corrections.

Next action: coordinator independently reviews/imports this successor and runs the original two-case no-login window on the owned qualified schema. Inspect no-login-make-real-precleanup-discovery before cleanup; trace the actual producer refusal/missing state and fix its owner. Both complete native jobs remain unproven for these bytes. No native SQL, database/server/browser/native tests or provider actions were executed in this lane.
