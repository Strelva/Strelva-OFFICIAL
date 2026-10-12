# L9 email integration · October 9, 2026

Objective: prepare Strelva 1.0 owner and visitor email presentation and the
signed-link confirmation previews. Branch: `ui/1.0-l9-email`.
No senders are switched to the new presentation. No sending gates, release
flags, authorization paths, production data or live approval routes change.

## Prepared surfaces

All fourteen source renders were opened and read. These are implemented as
pure data-driven templates and fictional preview states; rendered comparison
and mail-client qualification remain pending.

| Frame | Preview query on `/preview/strelva/email` | Source status |
| --- | --- | --- |
| GJ5k6 | `?template=urgent` | Urgent reply, draft, Send / Not yet / Change it |
| IT5pq | `?template=urgent-alt` | Alternative wording, white email |
| iFaQj | `?template=morning` | Every open item plus recorded handled summary |
| cugJG | `?template=morning-alt` | Alternative morning items, white email |
| xYZON | `?view=confirm` | Explicit confirmation; opening changes nothing |
| JSqmy | `?view=confirm&state=sent` | Fictional provider acceptance receipt |
| J2LyNY | `?view=confirm&state=handled` | Already handled; expired/changed variants also supplied |
| JxKNy | `?template=inquiry` | New inquiry with recorded outcome, nothing to decide |
| AM2vD | `?template=recap` | Outcome loop and optional Possibility |
| putrG | `?template=invitation` | Invitation; exact-email sign-in required |
| P6ZsKe | `?template=declined` | Card declined; no inferred retry schedule |
| m3fSCD | `?template=export` | JSON export, included/omitted/unavailable coverage |
| y8xNFR | `?template=booking`, `?template=reminder` | Separate confirmation and reminder templates |
| qzX73 | `?template=dates` | Three open dates; opening does not reserve |

Loading, empty, error and permission examples are available with
`?template=<key>&state=loading|empty|error|permission`. Confirmation variants
include those states plus expired, changed, unverified, not-yet, edit and
conversation. Confirmation can be shown with `&mode=dark`. Email HTML stays
light, matching the supplied mail frames.

The urgent alternatives and new inquiry carry their fictional person into the
preview destination. Edits are local; Cancel restores the prior candidate.
Confirming changes React state only. Reload restores the original fixture.
There is no API, provider or sending transport in the preview interaction.

Other destinations (website, Google review, Possibility, invitation, billing,
export download, booking management and offered-date request) are explicit
explanatory placeholders. Their real operations stay with existing routes and
the corresponding implementation lanes. They are partial destinations, not
new operational implementations or authenticated proofs.

## Architecture and changed files

- `src/platform/infra/email/paper-templates.ts`: pure typed templates, caller
  data and caller-issued URLs; no fixture names or values.
- `src/platform/infra/email/paper.ts`, `paper-tokens.ts`, `escape.ts`: email-safe
  tables, inline styles, light token serialization, escaped text and validated
  URLs; HTML/plain-text counterparts.
- `src/platform/infra/email/layout.ts`: additive `EmailOptions.paper` dispatch
  through the existing `renderEmailHtml` and `renderEmailText`. Legacy callers
  retain their existing output. The escaping function remains exported.
- `src/lib/email/paper.ts`: compatibility exports, following the existing
  infrastructure ownership pattern. The single send path is untouched.
- `src/experience/workspace/preview/email-fixture.ts`, `EmailPreview.tsx`:
  fictional content, gallery and isolated confirmation interaction.
- `src/app/preview/strelva/email/page.tsx`, `html/route.ts`: existing preview
  gate; dynamic, no indexing. Raw HTML is no-store with restrictive CSP.
- `src/components/ui/strelva/Kit.tsx`, `kit.module.css`: additive `StEntry`
  narrow standalone composition. Shared change is limited to this piece.
- `src/app/preview/strelva/kit/KitSpecimen.tsx`: disclosure specimen for StEntry.
- `docs/design/component-system.md`: StEntry ownership and proof limits.
- `src/__tests__/email-paper.test.ts`, `email-confirm-preview.test.tsx`:
  presentation, escape/URL failures, preview gate, explicit confirm, handled
  states, not-yet, cancel and fictional identity coverage.

## Spec corrections

The product spec and existing contracts win over the illustrative frames:

1. Owner invitations open exact-email verified acceptance; they do not sign
   someone in by themselves. Expiry comes from the issuance record. Operator
   owner invitations currently use 14 days; other invitation families differ.
2. Needs you expiry is item-specific: general decisions lapse on day 14;
   inquiry and booking budgets differ. No blanket five-day promise is shown.
3. Client-branded mail uses `mail.strelva.com`. The preview separates the
   sending address from the business reply address instead of claiming the
   owner’s root domain sends mail.
4. Card price, digits and retry dates must come from trusted billing data.
   Unknown charge values are placeholders. The public site survives payment
   failure; no unprovided retry or pause schedule is promised.
5. Schema-3 exports are JSON archives, not ZIP. Manifest coverage owns included,
   omitted and unavailable categories. Download links currently last seven days.
6. Offered dates contain one to three slots, expire after 72 hours, and are
   unreserved until owner confirmation. Existing issuance has one choice-page
   URL; the fixture’s three date links open an explanatory review page, not
   per-slot reservation endpoints.
7. Provider acceptance is distinct from inbox delivery or successful read-back.
   Unverified states offer no send/retry control.
8. Morning email composition retains the canon’s primary action per item;
   the one-primary-per-view rule conflicts with the multi-item mail frame.

## Verification and remaining proof

Local automated checks are recorded below after completion. None establishes
production delivery, owner adoption or actual Outlook/Gmail rendering.

Browser inspection of `http://localhost:3119` was rejected by browser security;
the tool stated that permission had been declined and prohibited workarounds.
A user question requesting local preview access remains pending. No screenshot
was captured, and `/preview/strelva/kit` could not be visually inspected.
The 21st CLI is unavailable (`command not found`); no dependency was added.

Required next action: with explicit local-browser access, restart the specified
port-3119 development server, open the kit, capture and inspect every frame and
state at 1440 and 390 px, compare against canon, fix discrepancies, then stop
the server. Screenshot destination:
`../design/foundation/code-shots/L9-email/` (currently no L9 screenshots).
Keep sending and all production changes off. Existing senders may adopt these
prepared templates only in the separately authorized rollout.

## Retained failures and commit boundary

The final typing pass initially rejected dynamic fixture lookups as possibly
undefined. The fixture map now preserves known keys with `satisfies`, and
both dynamic consumers check own keys before indexing. This failure is fixed
in source; the repeated typecheck result follows below.

Git staging was attempted on the authorized branch. The filesystem refused
creation of `/Users/jacobrhinehart/Desktop/strelva/REB/.git/worktrees/REB-ui-L9-email/index.lock`
with `Operation not permitted`. No files were staged or committed. The
workspace edits are retained for review. After visual proof and normal Git
write access, commit with:
`feat(ui): prepare 1.0 email templates and confirmation previews`.

Final focused Vitest summary (local):

```text
Test Files  6 passed (6)
     Tests  99 passed (99)
```

Scoped ESLint completed with exit 0 and no diagnostics. `git diff --check`
completed cleanly. Vitest includes existing email layout, approval-route,
Needs you service and agency-brand report tests in addition to the new tests.
No actual email client, provider send, authenticated owner or hosted route
was exercised. The development server was stopped after access was rejected.

Final `pnpm typecheck` completed with exit 0 after the last source edits:

```text
> next typegen && tsc --noEmit
✓ Types generated successfully
```

Final scoped ESLint also completed with exit 0 and no diagnostics. The new
React interaction is keyed by fixture person/state so soft navigation cannot
carry the previous person’s draft or sent state into a different preview.
Morning review and website links open their own explanatory destinations;
they do not reuse an inquiry’s confirmation or conversation.
Proof logs: `/tmp/l9-typecheck-proof.log`, `/tmp/l9-lint-proof.log`,
`/tmp/l9-tests-final.log`. Earlier failed type attempts are retained in
`/tmp/l9-typecheck-final.log`.
