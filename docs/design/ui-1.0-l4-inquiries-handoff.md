# L4 inquiries and bookings · October 9, 2026

The owner inbox, inquiry record and message review, booking list and rules editor, and existing visitor token pages now use the 1.0 composition. Canon-only data is isolated in labeled fictional previews. This is local source and test evidence; visual acceptance remains unfinished for all 17 frames.

## Frame coverage

All source renders were opened. No rendered app screenshot was obtained, so **frames done: none; frames partial: all 17**. The table records implementation coverage, not visual approval.

| Frames | Preview route | Real integration and remaining gap |
| --- | --- | --- |
| `pxaTj` | `/preview/strelva/inquiry-canon?view=system` | Real System details and embedded inbox use the kit. Form checking/rehearsal and canon business content are fixture-only. |
| `xQ3JS` | `/preview/strelva/inquiry-canon?view=record` | Actual inquiry records, submitted facts, factual history and exact message review use the kit. Rehearsal timing and test-person delivery remain fictional. |
| `ynPFX`, `AHSG5`, `PdOfa` | `/preview/strelva/inquiry-canon?view=people` (phone detail: `&detail=1`) | Real workspace inbox selects people and preserves unsent/unknown reply state while switching. The linked-lead reader does not provide Strelva's drafted text; canon drafts are fixture-only. Existing inquiry-engine drafted-message review is integrated separately. |
| `PAqss` | `/preview/strelva/inquiry-canon?view=spam` | Real held records show their stored reason and existing release/confirm controls. Canon-specific spam counts and reasons are fictional. |
| `S7NYUi` | `/preview/strelva/inquiry-canon?view=people&mode=dark` | Dark kit composition exists in the fixture. Dark appearance is unobserved. |
| `Ib8gr` | `/preview/strelva/inquiry-canon?state=loading\|empty\|error\|permission\|disconnected` | Separate fictional state views exist. Real inquiry load/access/failure handling is retained. No screenshot proof of the states. |
| `W9Eas2`, `mQFZx` | `/preview/strelva/booking-confirm` | Hold-to-confirm, other dates and decline reason exist in browser-local fixtures. Real requested-booking approval stays in Needs you; no new approval/calendar endpoint was invented. Busy-event comparison, named calendar and freshness are unavailable to this surface. |
| `g9jb8` | `/preview/strelva/booking-rules` | Actual owner settings editor reads and saves the existing settings API behind its existing release and owner-management gates. Calendar identity/freshness and reminder controls are unavailable; the actual editor says so. |
| `N57Sh` | `/preview/strelva/bookings?view=sessions` | Session-phone composition is fictional. Actual workspace booking rows, hours, calendar controls, manual creation and time proposals retain their data/actions and use kit controls. |
| `FGT4x`, `qD7w0`, `QKcUT` | `/preview/strelva/visitor-inquiries?view=request\|received\|inquiry` | Client-style form/date/receipt structures are fixture-only. Actual inquiry choice/offer and token confirmation pages are recomposed without changing their native forms. |
| `CxXZy`, `zIeTC` | `/preview/strelva/visitor-inquiries?view=instant\|manage` | Canon instant booking, location/capacity and calendar export are fictional. Actual account-free manage page preserves confirm/change/cancel forms and reports pending separately from confirmed. Client-theme values are unavailable in its reader; neutral visitor defaults have separate `--visitor-*` hooks. |

Owner booking canon previews accept `state=loading|empty|error|permission` and `mode=dark`. Visitor canon previews accept `state=loading|empty|error|permission`. Actual inbox fixtures remain at `/preview/strelva/inquiry-system`, booking list at `/preview/strelva/bookings`, and existing visitor/booking preview routes remain compatible. Fixture decisions do not call providers. The inquiry-system fixture suppresses its reply transport locally; its explicit existing `state=fetch` read-proof mode is retained.

## Contracts and conflicts

- Existing authorization, release gates, tenant/workspace scope, request IDs, digest/token review, native form action URLs and failure recovery are retained. No API implementation, `/api/v1` contract or database changed.
- The actual booking setup maximum is **60 days**, while the canon shows 90. The editor and fixture use 60. Authority: [booking setup](../../src/platform/bookings/setup.ts).
- The canon says rule changes go through Needs you. The existing API saves request-mode rules directly and requires approval to enable instant mode. The real editor describes that runtime; the illustrative canon preview retains its design wording. Authority: [settings route](../../src/app/api/workspace/bookings/settings/route.ts).
- Settings GET does not return cancellation cutoff although POST requires it. The editor asks the owner to choose it explicitly, carries recorded service policies/intake forward, uses the exact revision, blocks duplicate submission, and requires a fresh read after an unknown save.
- No owner notification/reminder sending was enabled. Booking request decisions in the new calendar fixture are browser-local. Local tests prove neither provider delivery nor a hosted calendar change.
- Shared changes are limited to optional React 19 button refs in `StPill`/`StTextButton`, their kit specimen focus example, and the [component inventory](component-system.md). Refs preserve existing inquiry focus recovery; kit geometry is unchanged. Existing shared app-shell utility/header differences remain outside this lane.

## Local verification

Final source checks:

```text
pnpm typecheck
> next typegen && tsc --noEmit
✓ Types generated successfully
exit 0

Test Files  29 passed (29)
     Tests  272 passed (272)
  Duration  13.61s

npx eslint <every changed/new .ts and .tsx file>
ESLint exit 0

git diff --check
exit 0
```

The final Vitest run used `STRELVA_LOCAL_TEST_WORKERS=1`, `--maxWorkers=1 --testTimeout=30000` and these files under `src/__tests__/`:

```text
inquiry-action-recovery.test.tsx
inquiry-needs-you-and-held.test.tsx
inquiry-system-detail.test.tsx
inquiry-workspace-replies.test.ts
held-inquiry-route.test.ts
inquiry-system-detail-route.test.ts
workspace-bookings.test.tsx
booking-hours-edit.test.tsx
booking-inquiry-proposals.test.tsx
booking-owner-evidence.test.tsx
booking-service-intake-ui.test.tsx
booking-calendar-health.test.ts
agent-booking-visibility.test.tsx
booking-workspace-native.test.tsx
booking-manage-link.test.ts
booking-inquiry-receipt.test.ts
inquiry-booking-handoff.test.ts
inquiry-booking-handoff-routes.test.ts
inquiry-booking-receipt.test.ts
booking-visitor-preview.test.ts
visitor-booking-presentation.test.tsx
inquiry-canon-preview.test.tsx
booking-rules-panel.test.tsx
booking-settings.test.ts
inquiry-inbox-selection.test.tsx
inquiry-record-canon.test.tsx
inquiry-message-review-ui.test.ts
inquiry-message-review-outcome-ui.test.tsx
inquiry-message-review-route.test.ts
```

Earlier failures are retained here: two stale copy assertions were updated for permitted assistant wording; one new inbox test initially selected only buttons with an `aria-pressed` attribute and was corrected to select the named people list. An earlier booking-hours route test timed out at its default five seconds under host contention and passed in the final run. An initial concurrent typecheck was interrupted after hanging; subsequent typechecks completed with exit 0. Dev suffered Watchpack `EMFILE`/restart loops during concurrent work; the final test run completed with one worker. These do not establish browser behavior.

## Screenshots and next action

Screenshot directory: `/Users/jacobrhinehart/Desktop/strelva/design/foundation/code-shots/L4-inquiries/`. **No PNGs generated or inspected.** The prescribed `CH=1` shoot command reached Chrome launch and aborted with `SIGABRT`. The subsequent browser tool's automatic approval review rejected access to `localhost:3114`, stating permission was declined and prohibiting workarounds. Browser attempts stopped. The 3114 dev server was stopped.

Next agent: once browser access is available, start the prescribed four-flag server on 3114, capture every table route at 1440 and 390 (844 height for phone), inspect light, the dark inbox, and each state against its source render, then correct measured differences and record screenshot paths. Also inspect the kit ref specimen. Do not treat these changes as visually accepted. Real calendar decision data, linked-lead drafted text and client theme values need an existing approved contract before those fixture surfaces can become real; they are not activated by this handoff.

## Commit stop

Branch: `ui/1.0-l4-inquiries`. No commit was created. The final `git add` failed before staging:

```text
fatal: Unable to create '/Users/jacobrhinehart/Desktop/strelva/REB/.git/worktrees/REB-ui-L4-inquiries/index.lock': Operation not permitted
```

The filesystem approval policy provides no escalation in this session. All 65 changed/new repo files remain unstaged in the worktree. Once Git metadata writes are available, review and stage the inventory below, then commit with `Integrate inquiry and booking surfaces with Strelva 1.0 kit` (no coauthor trailer). Browser verification remains a separate pending step.

## Files changed

The exact source inventory follows.

- `docs/design/component-system.md`
- `docs/design/ui-1.0-l4-inquiries-handoff.md`
- `src/__tests__/agent-booking-visibility.test.tsx`
- `src/__tests__/booking-rules-panel.test.tsx`
- `src/__tests__/inquiry-canon-preview.test.tsx`
- `src/__tests__/inquiry-inbox-selection.test.tsx`
- `src/__tests__/inquiry-message-review-ui.test.ts`
- `src/__tests__/inquiry-record-canon.test.tsx`
- `src/__tests__/visitor-booking-presentation.test.tsx`
- `src/app/book-inquiry/[token]/loading.tsx`
- `src/app/book-inquiry/[token]/page.tsx`
- `src/app/booking-confirm/[token]/loading.tsx`
- `src/app/booking-confirm/[token]/page.tsx`
- `src/app/inquiry-booking/[token]/loading.tsx`
- `src/app/preview/strelva/booking-confirm/page.tsx`
- `src/app/preview/strelva/booking-rules/page.tsx`
- `src/app/preview/strelva/bookings/page.tsx`
- `src/app/preview/strelva/inquiry-canon/page.tsx`
- `src/app/preview/strelva/inquiry-system/page.tsx`
- `src/app/preview/strelva/kit/KitSpecimen.tsx`
- `src/app/preview/strelva/visitor-inquiries/page.tsx`
- `src/app/workspace/bookings/page.tsx`
- `src/components/ui/strelva/Kit.tsx`
- `src/experience/bookings/BookingActions.tsx`
- `src/experience/bookings/BookingHoursEditor.tsx`
- `src/experience/bookings/BookingRulesPanel.tsx`
- `src/experience/bookings/InquiryBookingChoice.tsx`
- `src/experience/bookings/InquiryBookingOffer.tsx`
- `src/experience/bookings/InquiryBookingReceiptFixture.tsx`
- `src/experience/bookings/ManageBooking.tsx`
- `src/experience/bookings/ManualBookingForm.tsx`
- `src/experience/bookings/ManualBookingPreview.tsx`
- `src/experience/bookings/ProposeBookingTimes.tsx`
- `src/experience/bookings/ProposeBookingTimesPreview.tsx`
- `src/experience/bookings/VisitorBookingLoading.tsx`
- `src/experience/bookings/VisitorBookingShell.tsx`
- `src/experience/bookings/WorkspaceBookings.tsx`
- `src/experience/bookings/WorkspaceBookingsLoading.tsx`
- `src/experience/bookings/visitor.module.css`
- `src/experience/inquiries/InquiryMessageReview.tsx`
- `src/experience/inquiries/message-review.module.css`
- `src/experience/inquiries/record-canon.module.css`
- `src/experience/inquiries/views.tsx`
- `src/experience/places/HeldInquiryActions.tsx`
- `src/experience/places/InquiryBookingOfferComposer.tsx`
- `src/experience/places/InquiryInbox.tsx`
- `src/experience/places/InquirySystemDetails.tsx`
- `src/experience/places/WorkspaceInquiries.module.css`
- `src/experience/places/WorkspaceInquiries.tsx`
- `src/experience/places/WorkspaceInquiryReply.tsx`
- `src/experience/places/WorkspaceInquirySystem.tsx`
- `src/experience/scheduling/CalendarConnectionPanel.tsx`
- `src/experience/scheduling/ScheduleCalendarControls.tsx`
- `src/experience/workspace/preview/BookingCanonPreview.tsx`
- `src/experience/workspace/preview/BookingsPreview.tsx`
- `src/experience/workspace/preview/InquiryBookingReceiptPreview.tsx`
- `src/experience/workspace/preview/InquiryCanonPreview.tsx`
- `src/experience/workspace/preview/InquirySystemPreview.tsx`
- `src/experience/workspace/preview/ManualBookingPreview.tsx`
- `src/experience/workspace/preview/ProposeBookingTimesPreview.tsx`
- `src/experience/workspace/preview/VisitorInquiriesPreview.tsx`
- `src/experience/workspace/preview/booking-canon.module.css`
- `src/experience/workspace/preview/inquiry-canon-fixture.ts`
- `src/experience/workspace/preview/inquiry-canon.module.css`
- `src/experience/workspace/preview/visitor-inquiries.module.css`
