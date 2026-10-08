## Summary

Approved newsletter issues now have a default-off sender. Approval words remain immutable; delivery claims and batch receipts live separately.

```text
approved issue → stable audience batches → exclusive claim
  gated/configuration off → not-sent receipt → retry after one hour
  current opt-outs removed → durable sending marker → shared email transport
    accepted → append-only batch receipt, no resend
    uncertain → held for reconciliation, no automatic resend
```

- Sends at most 100 recipients per batch through `src/platform/infra/email/send.ts`, with provider idempotency, signed one-click unsubscribe, customer gate and strict tenant-aware client gate. Unreadable tenant override storage fails closed.
- Adds authenticated cron + heartbeat, bounded to ten batches. `STRELVA_NEWSLETTER_SENDER_RELEASE=1` is the independent opt-in; existing publishing/customer/client gates still apply. No shared flag-name list edit.
- Exposes receipt history and honest acceptance/suppression/unconfirmed counts beside approved issues.
- Backfill derives `auth.uid()` from the request session and checks verified, unrevoked operator authority. Removes the spoofable email signature in a new migration with rollback. Anonymous/service-role backfill execution is denied.

## Evidence

- **Before:** w6 approved issues stayed permanently paused; backfill trusted a supplied operator email.
- **After:** final targeted run passed **57 tests / 6 files**:
  `pnpm exec vitest run --maxWorkers=2 src/__tests__/newsletter-sender-cron.test.ts src/__tests__/workspace-newsletter-sender.test.ts src/__tests__/newsletter-client-gate.test.ts src/__tests__/newsletter-override-failure.test.ts src/__tests__/newsletter-contacts.test.ts src/__tests__/newsletter-send-path.test.ts`.
- `pnpm typecheck`, `pnpm lint`, `pnpm check:boundaries`, `git diff --check`: passed. Additional targeted ESLint passed for tests and UI updated after the broad lint started.
- `LC_ALL=en_US.UTF-8 PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`: passed, including sender/backfill rollback and reapply, exclusive claims, receipt replay, suppression, mixed-case unsubscribe and revoked/signed-out/nonoperator denials.
- Same locale/PATH with `pnpm check:workspace-upgrade`: full-schema upgrade rehearsal passed, including function exposure and both new SQL fixtures.
- Full `pnpm exec vitest run`: **6902 passed, 39 skipped, 3 five-second timeout failures** outside this change. All affected files passed on `pnpm exec vitest run --maxWorkers=2 --testTimeout=30000 src/__tests__/workspace-ports.test.ts src/__tests__/workspace-session-outage.test.ts src/__tests__/booking-one-store.test.ts`: **41 passed, 1 skipped**. Earlier failures and final logs are retained locally under `.scratch/a1-newsletter-sender/`.
- Local browser: desktop accepted receipts and 390px gated/unconfirmed receipts; no horizontal overflow. Fictional fixtures only, no email/provider writes.

## Merge Danger

**Door:** two-way for code. New migrations have rollback; stop the sender and export receipts before dropping delivery tables. Backfill rollback restores the prior identity trust boundary.

**Blast Radius:** email.

Shared files touched: email send/override helpers, heartbeat, `vercel.json`, workspace SQL/upgrade checkers, readiness sentinel and component inventory. Excluded integration-round-2 files are untouched. Pinned migrations are unchanged.

Unproven: deployed cron behavior and real provider delivery. Sending remains off by default. Provider timeouts/crashed sends require operator reconciliation; this PR deliberately does not automatically resend them or add a reconciliation command. No production actions, dependencies, pricing or customer commitments.

Closes #465
Closes #511

🤖 Generated with [Claude Code](https://claude.com/claude-code)
