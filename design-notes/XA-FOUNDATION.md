# XA foundation

October 15, 2026. Branch `xa/build-20261015`. Every XA lane branches from this.

XA is now the default workspace look. Wherever the linen theme is set, the
workspace is paper `#faf9f6` with a quiet side rail. The ink pill is the one
primary action on a screen. Moss means live or confirmed, and clay means
something waits. Type is DM Sans only, with no monospace anywhere. The October 9
paper look is still reachable through the existing theme switch:
`<StrelvaShell theme="paper">`, or `data-workspace-look="paper"` on the linen
element.

Design sources:
- Pen board `design/Strelva-Board-2026-10-15.pen`, chapter `01 · Luxury minimal`
  (LX kit) and chapter `XA · Every flow, redesigned` (P8XhMx)
- Renders in `design/xa-2026-10-15/` and `design/lx-2026-10-15/`
- Motion in `design/motion/xa-motion/index.html`

To see it, run `STRELVA_UI_PREVIEW=1 pnpm exec next dev -p 3199` and open
`/preview/strelva/xa`. The page takes these query options:
- `?screen=owner|yes|agency|record`
- `&state=ready|empty|loading|error`
- `&mode=dark`

The kit appears inside the real `StrelvaShell` and XA sidebar, not on a
style-guide grid. Screenshots are in `design/xa-build-2026-10-15/foundation/`.

## Import

```ts
import { XaButton, XaComposer, XaYes, XaStatus, ... } from "@/components/ui/strelva/Xa";
```

The `St*` kit (`@/components/ui/strelva/Kit`) is still exported. It has been
restyled to the same LX look: no mono, 7 px status dots, an ink primary pill, a
white secondary pill, notices as sentences, and hairlines only between rows.
Existing screens therefore read as XA already. When a lane touches a screen, it
moves that screen to the `Xa*` parts.

## Tokens (`src/app/styles/workspace-xa.css`)

| Token | Light | Use |
|---|---|---|
| `--st-canvas` | `#faf9f6` | Page paper |
| `--st-sidebar` | `#f3f2ee` | Side rail |
| `--st-surface` | `#ffffff` | Composer, page preview, decision, sheet |
| `--st-hover` / `--st-selected` | `#edece7` / `#e8e7e1` | Row hover, current item |
| `--st-chip` / `--st-inset` | `#f4f3ef` / `#f1f0ec` | Chips, waiting item, segmented track |
| `--st-line` | `#e6e5e0` | Hairlines |
| `--st-text` / `--st-text-body` / `--st-text-2` / `--st-text-3` | `#161715` / `#3a3c38` / `#6b6f68` / `#81847d` | Ink, body, secondary, meta |
| `--st-faint` | `#a3a69f` | Placeholders and marks only, never information alone |
| `--st-action` | `#161715` | The one primary pill, send |
| `--st-accent` | `#2f5236` | Moss: quiet buttons, focus, Working |
| `--st-live` / `--st-tint` | `#3e8e5a` / `#edf1ea` | Live dot, new words in a Page |
| `--st-need` / `--st-need-dot` / `--st-need-tint` | `#9c522c` / `#c9773f` / `#f6ebe1` | What waits |
| `--st-shadow-sm` / `--st-shadow-lg` | LX shadows | Small for things on paper, large only for the one object a page is about |

Radii are 8 for chips, 10 for nav and rows, 12 for fields, and 16 for doors,
a Page, a decision, the felt stage and every panel (October 16 kit tune:
`--st-r-xl` is 16). Pills and the composer stay round (999 and 28). Shadows
never exceed `0 1px 2px` plus `0 4px 12px` soft, the Undo toast included.

Dark mode comes from `data-workspace-mode="dark"`, either on the linen element
or on any ancestor. `--st-font-mono` and `--font-mono` resolve to DM Sans. The
`.font-mono`, `code`, `kbd` and `pre` elements inside the workspace render
tabular figures. Geist Mono is no longer loaded.

## Components

| Component | Import | Pen node | Notes |
|---|---|---|---|
| `XaButton` `variant="primary\|secondary\|quiet"` `size="sm\|md\|lg"` `block` `busy` `hint` | `Xa` | E87CJ, sC9X5, A1nRFX | Primary carries `data-xa-primary`. Use one per screen. |
| `XaButtonLink` | `Xa` | same | For navigation only, never a write |
| `XaIconButton label tone="raised\|plain\|chip"` | `Xa` | OABIG | `label` is required |
| `XaTextLink` | `Xa` | XA · R1 footer | For "See it · Undo" inside a sentence |
| `XaStatus kind="live\|waits\|draft\|working\|down" size breathe` | `Xa` | jLAL3, H9Qdxq, Jilw8 | Shows exceptions only. Live breathes only when `breathe` is set. Waits pulses once. |
| `XaDot`, `XaMark`, `XaKbd`, `XaInitial` | `Xa` | hb8WJ, z6OmJ | `XaInitial` is round for people and square for a business. One initials rule (`xaInitialOf`): a person known by a title goes by the surname (Dr. Amy Lin and Dr. Lin are both L); everyone else by the first letter |
| `XaSystemTile kind size label`, `xaSystemKind()` | `Xa` | lSPfW … GQmKR | Ten clays live in `public/xa/system-*.webp`. A tile is never shown sad. |
| `XaAddTile` | `Xa` | O1 "Tile add" | |
| `XaPebbleAvatar` | `Xa` | gxqij | Appears wherever Strelva speaks |
| `XaPebbleScene pose size bare` | `Xa` | O1 "Felt" | Poses are `resting`, `fixing`, `waving`, `adds`, `lineup`, `alone` and `website`. Changes crossfade on Base. |
| `XaComposer value onChange onSubmit placeholder waiting scope system onAdd onVoice busy disabled shape` | `Xa` | T4ln9, LHF4o, cLOpj, JIgmC | **The one composer** (October 16): `StComposerBar` and `WorkspaceComposer` both render it, and no screen shows two. Resting it is a bar. With a waiting item, scope or System it becomes a card. Plus and mic appear only when they do something. `scope` takes `short` (the phone label, usually the System name), a `state` dot, and `onPick` to make the chip open a scope picker (`picking`, `pickerId` for aria). Keyboard focus in the field draws a solid 2px ring on the card. |
| `XaWaiting` | `Xa` | LHF4o "Waiting" | Holds one item, with whoever acted |
| `XaComposerDock` | `Xa` | | Puts the composer in the frame's composer row |
| `XaWorking title steps state="working\|done\|failed"` | `Xa` | rYq00 | Steps are the caller's real progress events |
| `XaStream text` | `Xa` | motion "Ask, streamed" | Streams 28 ms per word. Screen readers get the whole text once. |
| `XaPage address title replaces flat bleed` + `XaPageChange` | `Xa` | viaGc | The page as its visitors see it. `bleed` (added by XA-4) drops the body padding so a live frame sits edge to edge (S1, S5). |
| `XaYes state onYes onNotYet onUndo working liveLabel failure settled disabledReason disabled question yesAriaLabel notYetAriaLabel` | `Xa` | O3 decision + N2cSZg | **The one yes gesture.** See below. |
| `XaDecision status meta yes label` | `Xa` | O3 panel | The one object that gets the large shadow |
| `XaUndo onUndo windowMs onExpire shortcut` + `XaUndoDock` | `Xa` | N2cSZg | Has a draining 2 px bar, and ⌘Z works when `shortcut` is set |
| `XaHeadline quiet size="sm\|md\|lg"`, `XaLede`, `XaAnswers`, `XaLabel`, `XaLines` | `Xa` | O1, O3 | The headline is two-tone and must never repeat itself. Labels use sentence case at 13/500. |
| `XaSays links` | `Xa` | R1 footer | Pebble, one plain sentence, then text links |
| `XaRows` / `XaRow lead title detail tone meta action href onClick current` | `Xa` | AG1 rows, O6 | Open rows with a hairline between them |
| `XaEmpty pose job title action secondary` | `Xa` | xLm8z | `job` is required, so Pebble is always doing something |
| `XaSheet open onClose title actions art` | `Xa` | zY9qV | A native `<dialog>`. Use it for a confirmation that needs its own moment, never for an inline task. |
| `XaField`, `XaTextArea` | `Xa` | UzKBr, SZgyj | Native inputs; errors are announced |
| `XaSelect label options hint error` | `Xa` | UzKBr look | A native select in the field look, for long or recorded lists (agreements, payments). Added by the money lane. |
| `XaChoices` | `Xa` | jDLle, GCgEy | A radiogroup of open rows; the chosen one gets an ink ring and a check |
| `XaDoors` | `Xa` | XkDG8 | Choices that change what happens next. Each says where it leads. |
| `XaSegmented` | `Xa` | qIVLf | The thumb glides on Fast. Arrow, Home and End keys work. |
| `XaCollapse show onGone` | `Xa` | motion "Queue" | Rows on screen at load stay still |
| `XaRollingCount value` | `Xa` | motion "Queue" count | |
| `XaGlideList as label` | `Xa` | motion "nav" | Selection slides; the page itself swaps instantly |
| `XaEntry aside corner footnote mode width`, `XaEntryCaption`, `XaEntryStack` | `Xa` | XA · A1, A2, C1, C2 | Added by lane XA-2. The entry frame outside the workspace: paper task column with the mark, one corner link and a footnote; a felt panel on the right that holds Pebble doing this step's job or a true preview. Without `aside` the task centers. Phone puts the panel under the task. |

| `XaEntry account foot stage brand mode width`, `XaEntrySteps`, `XaEntryDoors` | `Xa` | XA · B1–B5 | Added by lane XA-1. Getting in, before a workspace shell exists. The stage hides below 1100 px. |
| `XaChecklist label items checked onChange listLabel` | `Xa` | XA · B2/B4 "List" | Added by lane XA-1. Several answers ticked in place; row actions sit outside the label. |

### The yes

`XaYes` is the only way a screen asks for a yes.

1. **waiting.** The ink pill states the consequence. It reads "Make it live" by
   default (`XA_YES_LABELS`). "Not yet" sits beside it as a quiet action. ⌘↵
   (or Ctrl+Enter) presses it from anywhere on the screen. If several are
   waiting, the newest owns the shortcut.
2. **going.** The pill gives way to the Working trail, and the caller streams
   real steps.
3. **live.** The trail settles, and the Undo pill rises with a 5 s window
   (`strelvaUndoWindowMs`).
4. **undone** or **expired.** One settled sentence.
5. **failed.** Pebble says what happened in one sentence, followed by "Try again".

A blocked yes (`disabledReason`) must pass `unblock`, the action or text link
that clears it; the type will not allow one without the other (October 16).

The caller owns authority and the server call. October 16: there is no other
yes gesture. Press-and-hold is gone; every non-preview caller of `StHold` now
renders `XaYes`, and `StHold` itself is a deprecated wrapper around `XaYes` for
the older preview harnesses. Where the server has a real reversal (Needs you
decisions through `POST /api/workspace/needs-you/undo`), Undo follows the yes.
Where it has none (cancel a booking, mark a no-show, leave Strelva, remove a
team member, complete an agency change), `XaYes question` asks its one plain
sentence inside the yes and the pill is the confirmation: still one gesture.
One label set lives in `XA_YES_LABELS`: **Make it live** / **Not yet**, with
GLOSSARY's own verbs **Confirm** (a booking) and **Send** (a reply). There is
no "Approve", "Put it live" or "Save and make it live".

The Working title no longer shimmers (`st-xa-sweep` is gone): the pulse dot and
the caller's real step text carry the work.

## Shell

`StrelvaShell` → `StrelvaSidebar` → `XaSidebar` (`src/experience/app-frame/XaSidebar.tsx`)

| Sidebar | What it shows |
|---|---|
| Owner (XA · O1) | Mark and business name, or the business switcher passed as `businessContext`. New request, Search (⌘K), Today (with the waiting count), Requests, Minutes. "Your business" lists pinned Systems with one quiet fact or an exception state (`StrelvaPinnedItem.detail`, `.state`), then "Add to your business". "Your agency" comes from `agency` or `ownerBrand`. At the bottom are the account and a Business details control. |
| Agency (XA · AG1, AG3) | Agency name or switcher. New request, Search, Today, Queue (`queueCount`), Library, Minutes. Clients (`agencyNavigation.clients`, built from the authorized workspace list by `agencyClientLinks`; the one that waits gets a clay dot), then Add a client, linking to `/workspace/agency/clients/new`. Inside one client, the same sidebar appears with that client current (`agencyWorkspaceId`). |
| Details (XA · R1) | Opens when `active` is settings, access, connections or help, or when `detailsPlace` is set. It shows Back, Business record, People & access, Plan and usage (`/workspace/billing`), Take it with you (`/workspace/export`), Connections when available, and Help. The agency version shows Team, Verification, Leads (when admitted) and Payment links. |
| Phone (XA · E6) | No tab bar. The header shows the mark and business name, which open the same navigation, with the account on the right. The composer floats at the bottom. |

Places map to the existing routes:
- Home → `home`
- Requests → `requests`
- Running → `ongoing`
- The full list → `apps`

Added by lane xs-legacy-dashboard (October 16): `StrelvaShell navigationOnly accountHref`
shows only the caller's `navigation` and the account, with no workspace places. The legacy
website dashboard (`ConversationShell`) uses it, since a tenant there has no workspace to link to.

No route or permission changed. All labels live in `XA_PLACE_LABELS`
(`src/platform/presentation/place-labels.ts`).

## Motion

Motion uses one ladder: Press 80, Fast 140, Base 220, Slow 360 ms, with the
settle ease and no bounce. It lives in `src/app/styles/motion.css` (the CSS
vars) and `src/platform/infra/motion.ts`, which adds `playStep()`,
`prefersReducedMotion()`, `strelvaUndoWindowMs` and `strelvaWordMs`. New
keyframes are `--kf-xa-halo`, `-pulse`, `-sweep`, `-drain`, `-palette` and
`-word`. Under reduced motion, travel is dropped and a 120 ms crossfade remains.
The Undo drain and progress spinners keep running because they carry meaning.
`pnpm check:motion` passes.

| Moment | Primitive |
|---|---|
| The yes | `XaYes` |
| Queue row out | `XaCollapse`, `XaRollingCount` |
| Sidebar glide, with an instant page swap | `XaGlideList`, used in `XaSidebar` |
| ⌘K palette | The workspace search dialog: Fast, starting from .98 |
| Ask, streamed with shimmer | `XaWorking`, `XaStream` |
| Pebble state poses | `XaPebbleScene` |
| Undo drain | `XaUndo` |

## Anti-slop checklist (every lane, every screen)

Each of these is a must-fix. Jacob has rejected all of them by name.

**Layout**
- [ ] No centered hero stack, except the owner Home composer.
- [ ] No groups of three identical cards, KPI rows, dashboard grids or bento.
- [ ] No cards inside cards, and no style-guide grids.
- [ ] No repeated icon, title, description and action blocks.
- [ ] No page that is only rows of name, dot, state, detail and chevron.
- [ ] No modal for an inline task. Edit in place, as in the preview's Business record.
- [ ] No stacked-desktop-as-mobile. Phone layouts follow XA · E6.

**Surface**
- [ ] No icons in colored squares. Initials are allowed for businesses and people only.
- [ ] No decorative gradients, glows or heavy shadows. Only the one object on a page gets `--st-shadow-lg`.
- [ ] No 22 px or larger rounding on ordinary things. 24 is for a Page or decision only.
- [ ] No alert banners. `StNotice` is now a sentence; put the decision beside the thing it changes.
- [ ] No legend rows. Label things in place.
- [ ] No gray slabs for empty or closed states.
- [ ] No unlabeled boxes.
- [ ] No receipts, tickets, tilted tags or "yes trail" timelines.

**Type and words**
- [ ] DM Sans only. No monospace.
- [ ] No uppercase letter-spaced overlines. Labels are sentence case at 13/500.
- [ ] No headline and subhead saying the same thing.
- [ ] No em dashes in UI copy, and no "$—" or lorem placeholders.
- [ ] No AI selling words: seamless, effortless, powerful, unlock, supercharge, magic, AI-powered.
- [ ] No builder words shown to owners: paths, "actor not recorded", ids.
- [ ] GLOSSARY.md words only. The pending items are below.

**Behaviour**
- [ ] One ink primary per screen. Count `[data-xa-primary]:visible`. A sheet counts as its own screen.
- [ ] Use only one yes gesture: `XaYes`.
- [ ] Status shows exceptions only, as a dot and a word.
- [ ] Strelva speaks in plain sentences with one action and text links (`XaSays`).
- [ ] Every element says what it is, what state it is in, and what clicking it does.
- [ ] Name whoever acted: the owner, the agency person, or Strelva.

**Pebble**
- [ ] Pebble appears where Strelva speaks and is in frame for bad news (pose `fixing`).
- [ ] Pebble is always doing a job (`XaEmpty job`, `XaWorking`).
- [ ] Systems appear as clay tiles and are never sad.

**States**
- [ ] Every surface has empty, loading, error, waiting-for-someone and done states.
- [ ] It works at 1440 and 390, with keyboard focus, reduced motion, and dark mode.

**The test.** If a screenshot could be any AI startup's dashboard, it is slop.
Each screen needs one dominant element and a reason to remember it.

## Word calls (October 16, main session, reversible)

GLOSSARY.md wins over the Pen board. Each call is one edit in
`XA_PLACE_LABELS` / `XA_YES_LABELS` (`src/platform/presentation/place-labels.ts`):
**Home** (not Today), **Running** (not Minutes), **Time this month** for the
agency's own time place, **Business details** for the business menu's record,
**Make it live** / **Not yet** for the yes, **Release N** for numbered
history, and never "workspace" on owner or agency screens.

## One fixture day (October 16)

Every `/preview/strelva/xa` harness reads `src/experience/workspace/preview/xa-day.ts`:
Monday, November 23, 2026, 8:14 am. Harbor Dental (Dr. Amy Lin, 1180 Elmwood
Ave) runs Website, Bookings, Inquiries and a Draft New-patient form; one thing
waits on her. North Studio (Maya Okafor) runs Harbor Dental, North Coast
Realty, Lakeview Mediation and Fieldwork Studio at 96 / 74 / 39 / 22 minutes.
`xaOwnerPinned`, `xaAgencyClientHref` and `xaSearchItems` give every preview
the same sidebar, links that open their own preview screens, and a working ⌘K.
`/preview/strelva/api/*` answers the shell's owner-brand and agency-leads reads.

## Earlier pending calls (Jacob)

1. **GLOSSARY vs the board.** Settled October 16 by the word calls above.
   - The board says **Today**; GLOSSARY says Home.
   - The board says **Minutes**; GLOSSARY says Running and What changed.
     `app-frame-contract` used to list "Today" as retired. It now asserts the
     paper look keeps the old words and XA uses the board's.
   - The board says **Put it live**; GLOSSARY says Make it live. Settled
     October 16: **Make it live** everywhere (`XA_YES_LABELS`).
   - The board says **Business record**, which GLOSSARY lists under Underneath.
2. **Emails.** `src/platform/infra/email/paper-tokens.ts` still sets Geist Mono
   for metric values in email HTML. E1 and E3 are designs only and stay off
   during rollout, so this was left for the email lane.
3. **Minutes for agencies.** Minutes for an agency links to the agency
   workspace's `ongoing` view until an AG6 route exists.

## Lane XS · Connections (October 15)

Google listing, agency Google picker, assistants, assistant consent, website
domain, forwarding and the two domain emails, in `src/experience/connections`
(lane CSS, `FocusedPage`, `CopyButton`, `AssistantsPlace`,
`AuthorizeAssistantView`, `assistant-scopes`). Kit untouched. Two small shared
edits: `ReviewRows` takes `quiet` so the Google listing keeps one primary, and
`websites/client` and `domain-monitor` export the new email templates.
Preview: `/preview/strelva/xa/xs-connections/<google|google-agency|assistants|authorize|domain|forwarding>?state=…&mode=dark`
and `/preview/strelva/xa/xs-connections/email?which=domain-connected|monitor-down|monitor-several|monitor-recovered`.
