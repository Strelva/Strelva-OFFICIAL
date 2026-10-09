# Email-only owner failures — source preparation

Base: 5841f62e9e384d947d133ac4738dbbd34c011415. Independent lane; coordinator owns integration and native runtime.

Captured no-login run: `/private/tmp/strelva-full-journeys.Dnck69/no-login-local/results-raw.json`. Both complete-job cases failed. Booking expected an urgent suppressed delivery; actual deliveries were empty. Make real expected an open decision after chase; no matching row existed. Original case names and 240-second budgets are unchanged.

## Booking correction

The full-native-derived no-login environment deliberately leaves BOOKING_OWNER_NOTICE off. The real chase previously continued without recording that suppression. It now records one urgent suppressed delivery with reason `booking_owner_notice_disabled` for a new urgent booking ask, increments ownerNotTold, and leaves the decision open. The persisted suppressed delivery state prevents repeat records. No recipient, provider receipt, email, or resolver is manufactured or invoked.

Focused regression reproduced the empty-deliveries failure before the source edit (38 passed, 1 failed); after the correction all 39 tests in needs-you-service.test.ts passed. Scoped ESLint and git diff --check passed. Native owner-link workflows remain unverified for these bytes; coordinator must import/review and run the unchanged two-case no-login window.

## Make real investigation remains open

The captured reviewedRebuild fixture fits the current rebuild contract. The source needs a legitimate needs_you_sync service session, saved-work access, and an existing website System bound to its tenant. Projection skips a rebuild if no matching site exists. make_real proposal catches read errors and returns complete:false; chase currently ignores that completeness, so failed:0 does not prove successful discovery. Do not fabricate a decision, owner account, session, or website binding to satisfy the case.

Next action: coordinator supplies a bounded native read of failing-business service admission and existing Systems projection while maintaining its sole runtime window. Trace the actual producer refusal/missing state, add a focused regression, and correct the owning source if feasible. No database/server/browser/native tests or provider actions were run in this lane.
