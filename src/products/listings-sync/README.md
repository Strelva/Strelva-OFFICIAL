# Listings in sync

A built-in App (`listings_sync`, credited Strelva). It keeps a business's
confirmed phone, address, hours, special hours, services and booking link
matching across the places they appear, and asks the owner before changing any.
Everything is off by default behind the `listings_sync` workspace release flag.

## Places and who changes them

| Place | How it is read | Who changes it |
| --- | --- | --- |
| Website (Strelva-hosted, code, or connected WordPress/Wix/Squarespace) | Pinned public fetch; JSON-LD, `tel:` links, text | A Request to the business's agency (owner to-do when none) |
| Google listing | `getLocation` with a fixed read mask | Strelva, in Release 2 only (`STRELVA_LISTINGS_SYNC_GOOGLE_FIX`); otherwise the owner. The address is never written |
| Booking page | The booking context | Strelva: booking-only hours are clipped to the record's hours |
| Yelp | Business endpoint, only if `STRELVA_LISTINGS_SYNC_YELP=1` | Nobody: read only |

Only owner-confirmed facts propagate (#509). A provider edit that is not yet
confirmed never reaches a place; the view counts it as waiting for the owner.
No model call is made, so a check costs about one page fetch plus one Google
read per location, at most about 14 reads, each bounded to 10 seconds.

## Flow

1. A check reads every place and compares it (`compare.ts`; a fact only differs when a shown value conflicts, never from absence).
2. `plan.ts` proposes fixes. They are stored with the readings (`listing_sync_*`, migrations 20261028100200 and 20261028100300).
3. One Needs you item per business (`listings_sync`, `system.change_live`, owner decides) shows the plan: "Hold to make it live".
4. Approving runs `applyListingFixes`: booking hours, the Google draft and approval path (with receipts), website Requests as the owner. Nothing is retried; ids make a repeat idempotent.
5. An `after_fix` check re-reads every place. An applied fix becomes `verified` only when its place reads as matching.
6. When every compared place matches, a numbered **Release N** of the listings state is recorded, only if the record revision or the readings changed. Releases are append-only.

## Triggers

- App events: `fact.confirmed` (not `fact.changed`: checks read only confirmed facts). Events arrive only when capture is on, `app_events` is on for the business and the App is available there.
- The sweep (`/api/cron/listings-sync`): records whose revision moved or whose last check is a day old. The route is not in `vercel.json`.
- "Check now" on Business details, at most 6 an hour per business.
- After a fix.

Until app events are on, the sweep and Check now are the triggers.

## Seams

- keep-your-site (lane 13): connected-site Requests use `context.source = "listing_fix"` and scope `website.platform_change`; replace with that lane's path when it lands.
- Tenant data and the Yelp key come through `ports.ts`, registered in `src/register-workspace-ports.ts`.

## Limits

- Website hours are compared only when machine-readable (JSON-LD).
- The Google address and the booking link are never changed.
- Yelp is read only, and its terms limit caching: only the check's readings are kept.
- Owner email for these items stays off unless `STRELVA_LISTINGS_SYNC_OWNER_EMAIL` and `EMAIL_SENDING_ENABLED` are both on.
