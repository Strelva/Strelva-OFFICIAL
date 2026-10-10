# Strelva 1.0 UI integration (October 9, 2026)

Jacob, October 9: "make all of this into the UI and UX and integrate ALL of
it." This file is the contract every implementation lane works from. Branch
`ui/1.0-design` off `reborn-1.0`. Nothing here is merged, deployed or
released without Jacob's yes.

## Sources

- **Design canon:** `../design/Strelva-Reborn-UI-UX-2026-10-08.pen`. Renders of
  every canon frame after the composition pass:
  `../design/foundation/renders/canon/<frame id>.png`, index in
  `INDEX.tsv` there. Each lane brief lists its frame ids.
- **What each page is for:** `../design/foundation/PAGES.md` (76 pages and
  flows, each mapped to its frames and to the product spec it comes from).
- **Rules:** `../design/foundation/FOUNDATION.md` sections 0 (clear, not
  minimal), 6 (kit and motion) and 7 (composition).
- **Product truth:** `docs/product/strelva-1.0.0.md` and the specs it links.
  When a design and a spec disagree, the spec wins and the lane says so.

## The foundation (done in this branch, use it)

| Piece | Where |
| --- | --- |
| Paper tokens `--st-*`, light and dark (`data-workspace-mode="dark"`), remapped onto every shared role | `src/app/styles/workspace-paper.css` |
| Floating light sidebar card on 24 px dot paper; header without rule or fill | `src/experience/app-frame/*.module.css` |
| Geist Mono as `--font-mono-st` (data only) | `src/app/layout.tsx` |
| The kit: `StPage`, `StHead`, `StSection`, `StLabel`, `StRows`/`StRow`, `StBeacon`, `StState`, `StMono`, `StKbd`, `StStamp`, `StPill`, `StPillLink`, `StTextButton`, `StSegmented`, `StSteps`, `StLedger`, `StHold`, `StToast`, `StSurface`, `StNotice`, `StEmpty`, `StSkeleton`, `StComposerBar`, `StComposerDock` | `src/components/ui/strelva/Kit.tsx` |
| Specimen, light and dark | `/preview/strelva/kit`, `/preview/strelva/kit?mode=dark` |

If the kit can't do something a screen needs, extend the kit (and its
specimen) instead of styling around it in page CSS.

## Composition rules (from FOUNDATION.md section 7)

1. **One calm column.** `StPage` (about 920 px). `width="wide"` only for dense
   comparison (tables across clients, calendars).
2. **No box around a list.** Lists are `StRows`. `StSurface` only for a real
   object: a draft, a preview of the page, a receipt, a form.
3. **Sentence-case labels.** No uppercase mono eyebrows. Mono (`StMono`) only
   for times, counts, paths, keys and record values.
4. **One solid primary per view** (`StPill` or `StHold` for consequential
   yeses). Everything else is `StPill variant="soft"` or `StTextButton`.
5. **Titles 28 / 500.** Section titles 16 / 600. Body 14–15.
6. **States are words plus a mark** (`StState`), not a mark alone.
7. **Density follows the job.** Decision lists breathe; tables are tight.
8. **Ask Strelva** is the floating `StComposerBar`, scoped to the place.

## Product rules that the UI must keep

- Screens never say AI, agent, automation, workflow or task. "Assistants" is
  allowed for third-party assistants (Gemini, ChatGPT) acting for people.
- Strelva is the only name that acts. Name whoever acted.
- A typed "yes" in Ask Strelva never approves. Every write is a Needs you
  item with its own control.
- Who decides can only be made stricter than Strelva's default.
- Lifecycle (Draft, Live, Paused) and health are separate marks.
- Nothing invented: no fake counts, people or promises in product UI.
  Fixture data lives only in `src/experience/workspace/preview/*` and is
  labeled fictional there. Unknown values in copy are `[placeholders]`.
- Owner notifications (email, reminders, owner entry) stay off during the
  rollout. Email templates may be built and previewed; nothing is sent.

## How a lane works

1. Work only in your worktree and branch (`ui/1.0-<lane>`), based on
   `ui/1.0-design`. Run `git status` first; touch only your area.
2. Find the code that renders each of your frames today (routes under
   `src/app`, experiences under `src/experience`, preview fixtures under
   `src/experience/workspace/preview`). Recompose it on the kit. Keep every
   data path, authorization check, flag and test intact. Presentation
   changes only, unless a frame needs a surface that doesn't exist yet: then
   build it on existing data and APIs, and if the data doesn't exist, build
   the preview fixture and state that it is fixture-only.
3. Each frame gets its loading, empty, error and permission states, desktop
   and phone (390 px).
4. Prove it: `pnpm typecheck`, the vitest files that cover what you touched,
   `pnpm lint` on changed files, and screenshots of each surface at 1440 and
   390 from your own dev server with `STRELVA_UI_PREVIEW=1` (use
   `node ../design/foundation/code-shots/shoot.mjs`, `CH=1` to use the
   installed Chrome). Put them in `../design/foundation/code-shots/<lane>/`.
5. Update `docs/design/component-system.md` if you change the kit.
6. Commit on your branch (no Co-Authored-By trailers in this repo). Do not
   push, merge, deploy, migrate, send email, or touch env, DNS, Stripe or
   production data.
7. Finish with: what you changed (files), which frames are done, which are
   partial and why, test and typecheck output, screenshot paths, and any
   spec conflicts.

## Lanes

| Lane | Area | Frames |
| --- | --- | --- |
| L1 owner | Home, Needs you, Strelva handled, Requests, Running, Files, Ask Strelva, search, switcher, help, first run | A1 V0rljZ, A2 JI19w, A3 L4g0HR, A4 aseNA, A5 W0CoHN, A7 HQ5yA, A9 M57QND, F2 Y2Tn3F, F4 NGBdN, F5 yBqc4, F6 vwiLI, F12 ABt1D, G1 Q1IkY, G2 s7xyY, G3 E9H9d1, G4 LBP2f, G5 cvfYV, G7 T8pknG, N6 YsBMM, L1 luqhL, L2 h171q, L3 M3TlL, dark U4Va5 |
| L2 website | Website System: page, change review and publish, history, pause, failing checks, rebuild result, photos, look, articles, results, connect a site, domain | F3 eWqtI, N1 n5crO, N2 DVwBO, G6 jH56a, G8 T00vYE, B2a C6Scp, B2b OiF5E, B3 lNRUM, B4 NRUk3, B5 H0HBpJ, B6 KqcYl, B7 q6trU, B8 ydOpf, dark jnmS5 |
| L3 systems | System page pattern, Possibilities, Make real, Versions, Connections, internal tools, store, documents | F9 fhHa1, F10 f5ywBU, B9 uKByO, B10 D3FVqz, B11 EJA7A, B12 Xysdf, D4 Z4ysc, B20 irVxG, B21 iBzca, B22 bAWa5 |
| L4 inquiries | Inquiries and bookings, owner and visitor sides | F11 pxaTj, N5 xQ3JS, B14a ynPFX, B14b PAqss, B15 W9Eas2, B16 g9jb8, J1 FGT4x, J2 qD7w0, J3 QKcUT, P2 CxXZy, P3 zIeTC, L4 N57Sh, PH1 AHSG5, PH2 PdOfa, PH3 mQFZx, dark S7NYUi, states Ib8gr |
| L5 publishing | Google listing, reviews, newsletter, recaps view, unsubscribe | B17 FG3sU, B18 DswEC, P7 iGaEL, D6 AM2vD (in-app recap view) |
| L6 business | Business details and record, facts to confirm, Who decides, people and access, export, exit, billing, payments setup, invoices, entry (sign in/up, invite, no access, account, admin host, old-page bar) | F7 ZdtUM, F8 PKGTo, C2 EgfjN, C3 TFMBf, C4 BpbyP, C6 uJaBT, C7 t3V6Mm, C8 gM93P, TX2 ra178, TX3 b1nRhW, I1 msVLx, I2 a0RLm, I3 VlBD5, I4 WpFcd, I5 WpI2O, E2 dYd78, E3 I6CkkR |
| L7 agency | Clients, Queue, Library, Build, Package, Bulk review, a client's Version, team, verification, owner approval of agency work, minutes, attribution, handoff | H1 xtlef, H2 LTd5o, H3 Nxtao, H4 nn4JU, H5 gAkfA, N4 OuHYs, AG1 K5MHD, AG2 wYXA0, AG3 p3mZh, AG4 NGyFm, AG5 rOSFY, AG6 L8mZA4, AG7 vivag, AG8 oPCqd, AG9 eQWUh, AG10 wuTH2, PH4 u6ziyu |
| L8 operator | One queue, client detail with switches, convert, checks across sites, ask on behalf | K1 RpWy4, OP2 pNg1m, OP3 lRbrh, OP4 E8MFYs, OP5 S706C |
| L9 email | Owner emails and one-tap pages (templates and preview only, nothing sends) | D1 GJ5k6 (alt IT5pq), D2 iFaQj (alt cugJG), D3a xYZON, D3b JSqmy, D3c J2LyNY, D5 JxKNy, D6 AM2vD, D7 putrG, D8a P6ZsKe, D8b m3fSCD, P4 y8xNFR, P5 qzX73 |
| L10 public | The answer check, the profile assistants read and the owner's Assistants page, multi-location, deposits | P1a HOF2u, P1b yJgHU, P1c PJXvf, P6a F4QvgT, P6b eHDuU, EN1 vnQLw, EN2 XqBAV, EN3 TfToL, TX1 NsutT |

Frames named "(illustrative)" carry made-up people and numbers. Build the
structure; take content from real data or the existing preview fixtures.
