# L5 publishing: Strelva 1.0 UI preparation

October 9, 2026. Branch `ui/1.0-l5-publishing`. Local source preparation;
no deployment, push, merge, migration, environment change or provider write.
Changes remain uncommitted: managed filesystem permissions rejected Git index
creation in the shared worktree metadata.

## Current objective and evidence

Recompose the Google listing, review replies, newsletter, in-app recap and
unsubscribe page against FG3sU, DswEC, AM2vD and iGaEL. All four supplied canon
renders were opened and inspected. The active commitment remains UI integration
on the current APIs and approval boundaries. The existing product specs own
capability truth; this lane introduces no strategic or lifecycle promotion.

**No frame is visually accepted.** Browser proof did not complete. No desktop,
phone, dark, keyboard, focus, contrast or reduced-motion acceptance is claimed.

| Frame | Implemented | Remaining limit |
| --- | --- | --- |
| FG3sU | Kit listing/review composition, exact reply transport, existing Google draft/approval/undo forms, paused/access-pending/disconnected/read-only states | Public listing appearance, Google-versus-record hours and photo review status are presentation fixtures only. The live projection lacks them. Tenant-scoped reviews are embedded only when the tenant has one listing; multiple locations retain the Reviews link to avoid attributing reviews or reply writes to the wrong location. No frame comparison performed. |
| DswEC | Draft issue object, hold approval using the existing exact event command, last approved issue in the aside, provider acceptance/suppression/unconfirmed receipt rows | Audience, sender and proposed schedule are fixture-only. Sending remains paused under the product spec. Bounce and unsubscribe counts are unavailable, never inferred from suppression. No frame comparison performed. |
| AM2vD | Open outcome rows in the real recap page, existing weekly/monthly filters, summary/highlights/next suggestion retained | Real saved recaps expose visits, booking/phone clicks and recorded review events. Where the existing inquiry-outcomes flag had saved proof, the projection now carries its inquiry and first-business-reply acceptance counts. Older/failed proof is explicitly unavailable. Confirmed bookings remain fixture-only. Review-event counts do not identify Google; replies accepted by a provider do not prove delivery. Clicks remain distinct from bookings. No frame comparison performed. |
| iGaEL | Plain paper signed unsubscribe HTML response; kit preview of confirmation, success, failure, missing-link and loading states | Business name and masked address exist only in the fictional preview. Undo is memory-only in that preview; no resubscribe API exists. The real signed endpoint remains an HTML response without React. No frame comparison performed. |

## Preserved contracts and deliberate differences

- Google page retains `openWorkspacePlace`, the publishing release check,
  `readPlace`, and its existing server action. The additional linked-review read
  retains its own existing membership and tenant checks. Listing refusal skips
  the review read. Provider writes and authorization implementations are unchanged.
- Exact Google context fields, command UUIDs, event/receipt IDs, post fields,
  reply editing and withdrawal, pause/resume, and undo controls remain.
- Review replies keep `/api/workspace/reviews/reply`, same-origin credentials,
  the original payload and published-versus-saved response distinction.
  Review-level **Not yet** is absent: its linked-review projection supplies no
  event ID or dismissal command. The existing Google draft decline remains.
- Newsletter uses the original content GET/POST and exact event IDs. Hold to
  approve does not enable sending. Receipt history stays discoverable, including
  when no draft remains. Declined drafts remain visible.
- The shared `ContentWorkspace` website branch retains its original presentation
  and commands, so the newsletter lane does not redesign L2's content surface.
- Recaps retain direct membership reads and weekly/monthly meaning. The recap projection additively passes existing saved inquiry evidence and review-event counts; it performs no new measurement read and changes no release flag. Removed
  unsupported reassurance that owner email keeps going; rollout owner notices
  remain off. The in-app adaptation uses Home navigation rather than the email
  frame's Inbox and sender chrome. Suggestions start nothing.
- Unsubscribe GET still never mutates, POST keeps signed identity, rate limiting,
  privacy-neutral success, status codes and no-store/noindex. The direct mail-client
  HTML transport is the kit exception: its standalone CSS uses a snapshot of the
  current paper roles and system font. The React preview uses the kit. A future
  common document stylesheet should replace the snapshot when that transport is
  redesigned; no new route or dependency was introduced here.
- The canon proposes a newsletter send and offers unsubscribe undo. The current
  product contract wins: sending is paused, and live undo is unavailable. The
  fictional schedule says Wednesday Oct 14, 2026; the frame's Tuesday is not the
  weekday of that date. Google hours correction prepares an approval, rather than
  promising a write from unavailable live comparison data.

## Kit changes and shared touch points

Only two additive kit props: `StMono size="value"` for count rows and
`StPillLink current` for `aria-current` on the actual period link. Both have
specimens in the kit preview and an entry in the component inventory. No shell,
SystemPage, WorkspacePlace or WorkspaceResults changes. Existing shell is
composed by the labeled publishing preview.

## Verification

Local source/DOM tests, not browser or production evidence:

```text
pnpm typecheck: exit 0
✓ Types generated successfully
Test Files  18 passed (18)
     Tests  214 passed (214)
ESLint exit code: 0
```

After the last presentation refinement, the four affected UI/recap/unsubscribe test files also passed (40 tests). The later saved-recap projection correction is covered by the final complete run above.

The focused additions cover exact newsletter commands, hold shortcut, declined
approval, retained words on refusal, read-only controls, reply command/failure,
Google pending gates/context, unavailable versus recorded-zero counts, existing saved inquiry proof and review-event projection, provider
acceptance versus bounce/suppression, unsubscribe nonmutating GET, privacy,
invalid tokens, rate limit and storage failure. Existing publishing, authority,
review, newsletter and recap tests remain and passed.

Retained failures: initial typecheck caught `TS2367` from narrowing the legacy
website JSX after the newsletter return; building that unchanged JSX before the
branch fixed it. Initial changed-file lint found one unescaped apostrophe in
Google error copy; corrected. Neither failure remains in the passing source.

The requested Chrome screenshot command failed before producing a PNG:
`browserType.launch: Target page, context or browser has been closed`, Chrome
process `SIGABRT`. In-app browser was unavailable. Browser Use then explicitly
rejected `http://localhost:3115/preview/strelva/kit` because permission was
reported declined and prohibited alternative browser paths. No further browser
attempt was made. The dev server also logged `EMFILE` watcher failures and
restarts around its generated directory. The owned server was stopped.

Commit preparation was also blocked: `git add` and `git commit` returned
`fatal: Unable to create '/Users/jacobrhinehart/Desktop/strelva/REB/.git/worktrees/REB-ui-L5-publishing/index.lock': Operation not permitted`.
No files were staged and no commit was created. The approval policy is `never`,
so an escalation was unavailable; no alternate Git metadata path was used.
All 27 changed/new files remain in this worktree for the coordinator.

**Screenshot paths: none.** Intended artifact directory:
`../design/foundation/code-shots/L5-publishing/` (contains a failure record,
not screenshots). Do not treat source or jsdom rendering as visual proof.

## Next action and outstanding review

Enable writing to this worktree’s existing shared Git metadata and commit the
prepared 27-file change on `ui/1.0-l5-publishing` (no coauthor trailer). Obtain
permitted local browser access, restart the specified server on 3115,
open `/preview/strelva/kit`, then capture and inspect every publishing/recap state
at 1440×900 and 390×844. Compare each populated surface to its supplied canon
render, repair mismatches, and check keyboard/focus plus reduced motion. Preview
controls terminate in memory; do not invoke real provider writes for this proof.
No release/production authority is implied by this lane.

- Google: `/preview/strelva/publishing?kind=google`; `state=loading|empty|error|permission|read_only|paused|pending|disconnected`.
- Newsletter: `/preview/strelva/publishing?kind=newsletter`; `state=loading|empty|error|permission|read_only|accepted|gated|unknown`.
- Unsubscribe: `/preview/strelva/publishing?kind=unsubscribe`; `state=confirm|loading|empty|error|permission` (default success).
- Recaps: `/preview/strelva/recaps`; `state=loading|empty|error|permission|unlinked|unavailable`, `period=week|month`.
- Publishing and recaps also accept `mode=dark` for optional theme inspection;
  the assigned frames have no dark counterpart. No dark proof is claimed.

## Changed files

- `docs/design/component-system.md`
- `src/__tests__/publishing-paper-ui.test.tsx`
- `src/__tests__/publishing-unsubscribe-ui.test.ts`
- `src/app/api/newsletter/unsubscribe/route.ts`
- `src/app/preview/strelva/kit/KitSpecimen.tsx`
- `src/app/preview/strelva/publishing/page.tsx`
- `src/app/preview/strelva/recaps/page.tsx`
- `src/app/workspace/google/page.tsx`
- `src/components/ui/strelva/Kit.tsx`
- `src/components/ui/strelva/kit.module.css`
- `src/experience/places/ReviewReplyForm.tsx`
- `src/experience/places/WorkspaceGoogle.tsx`
- `src/experience/places/WorkspaceReviews.tsx`
- `src/experience/publishing/ContentWorkspace.tsx`
- `src/experience/publishing/NewsletterSurface.tsx`
- `src/experience/publishing/PublishingPage.tsx`
- `src/experience/publishing/UnsubscribeView.tsx`
- `src/experience/publishing/publishing.module.css`
- `src/experience/publishing/unsubscribe.module.css`
- `src/experience/recaps/WorkspaceRecaps.tsx`
- `src/products/recaps/server.ts`
- `src/experience/workspace/preview/PublishingContentPreview.tsx`
- `src/experience/workspace/preview/PublishingGooglePreview.tsx`
- `src/experience/workspace/preview/PublishingPreviewFrame.tsx`
- `src/experience/workspace/preview/UnsubscribePreview.tsx`
- `src/experience/workspace/preview/publishing-fixture.ts`
- `docs/design/ui-1.0-l5-publishing-handoff.md` (this record).
