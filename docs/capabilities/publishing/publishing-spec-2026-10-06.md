# Publishing at 1.0.0: reviews, Google, blog and newsletter

Status: draft spec; workspace implementation extended on `w6/publishing`,
2026-10-07. Local Google doubles, isolated SQL and desktop/mobile fixtures;
no production deployment, migration, Google write or live email in this stream.
See the Wave 6 status below and [stream handoff](../../product/streams/w6-publishing.md).

Publishing here means four jobs: replying to reviews, keeping the Google
Business Profile right (hours, info, posts), publishing blog and collection
entries, and sending a newsletter. At launch, all four run from the workspace, through
approval, and leave a receipt. The original tenant stores remain shared with
the workspace behind the publishing release gate. Newsletter workspace issues
are approved immutable snapshots with sending paused; approval sends no email.

## 1. The moment

**The Mooney Firm, a new Google review.** A client leaves a 5-star review on
Google. The owner never signs in.

- Strelva reads the review within the poll window. Today that is
  `poll-google-reviews`.
- Strelva drafts a reply in the firm's voice. Today that is
  `draftReviewReply` in `src/lib/review-replies.ts`, linted against
  `BANNED_PHRASES`.
- The owner gets one email: the review, the reply, **Approve** and **Not
  yet**. This already exists as the approve link (`src/app/api/approve/route.ts`,
  `src/lib/approve-link.ts`). A GET only shows a confirm page; the POST posts.
- They tap Approve. Strelva posts the reply to Google, reads it back, and
  records "Strelva replied to Dana's review on Google". If the firm chose
  `auto` mode, the reply posts itself after the 12-hour window
  (`AUTO_POST_DELAY_MS`), and the owner only sees the receipt.
- In the workspace, if anyone opens it, the firm's Google listing shows the
  review, the reply, and the receipt under **Strelva handled**.

**The Mooney Firm, holiday hours.** The owner emails "we're closed the
Friday after Thanksgiving". Strelva changes the business record once. The
website reads it. The Google listing gets a governed change: the owner
approves one thing, and both the site and Google update. If Google takes the
change but holds it for its own review, the receipt says so. It does not say
"done".

**gldf, a newsletter.** Strelva drafts a newsletter about a new product
collection. The owner approves it by email. Strelva sends it to active
subscribers through the one email path, and the receipt says how many were
accepted by the provider, not how many were delivered.

## 2. In the model

Publishing is not one System. "Publishing" is a bucket of verbs, not a thing
the business has. Recommended split:

| Job | Noun | Why |
| --- | --- | --- |
| Blog, videos, product catalog (`collection_entries`) | Part of the **website System** | Entries are site content. They appear on the site through `/api/v1/collections/[tenant]/[type]`. A blog with no site has nowhere to live |
| Google listing (hours, info, posts, photos, reviews, replies) | Its own **System**: "The Mooney Firm on Google" | It is a thing customers see. It exists without a Strelva website (connected sites, new businesses). It has its own health (verified, suspended, edits pending). Pausing the website must not stop review replies |
| Newsletter | Its own **System**, only for businesses with subscribers | It issues outputs (each send). An issued send never rewrites, which is `RULE_SYSTEM_OUTPUT_IDENTITY` |
| The Google account grant (OAuth) | A business-level **account binding**, the target of `act` and `read` **Connections** | One grant can serve the listing System and the website's Search Console and GA4 reads. The grant gives access. It never gives authority |
| "Every Google review gets a reply" | A **Running** item | Each item is named by the sentence it keeps true |
| A post, a reply, a send | Outputs of their System, with receipts | — |

Connections, using the existing `system_connections` vocabulary
(`supabase/migrations/20261004120000_systems.sql`, kinds `read`, `act`,
`appear`; target types `business_resource`, `account_binding`, `audience`):

- Google listing **reads** the business record: hours, address, phone,
  services. Source of truth: the business record. Freshness: on change.
  Failure behavior: hold the Google change and show "Google hours differ from
  your record".
- Google listing **acts on** `account_binding:google:<binding>`. Authority:
  the owner's policy per change type (section 4). Failure behavior: the
  listing's health goes to "Google disconnected"; drafts keep, nothing posts.
- Website **reads** the same Google binding for Search Console and GA4
  (`GSC_READ_SCOPE`, `GA4_READ_SCOPE` in `src/lib/google-token.ts`). It is a
  separate Connection to the same binding.
- Newsletter **appears to** `audience:subscribers`, and optionally **reads**
  the website's collections (a "new posts" issue).

**Versions.** A business with two locations has one Google location each. The
second is a Version of the listing System with its own hours and its own
`locationId`. Twin Trees, per the Reborn page, already gets two Systems.

**Possibilities.** A Google post, a reply or a newsletter issue drafted for
review is a draft output, not a Possibility. A Possibility here would be a
working alternative, such as a weekly-post cadence the owner can preview
before turning on. Not needed at 1.0.0.

**Alternative models, rejected for now:**

- *All Connections of the website System* (the Reborn table, row 4). Simplest
  with one site. It breaks for a business whose site Strelva doesn't host, it
  ties review replies to the site's Paused state, and newsletter sends have no
  website meaning. It stays valid if Jacob wants the fewest Systems on Home;
  then the listing shows inside the website page.
- *One "Publishing" System.* A bucket with no identity, health or audience of
  its own. It fails "shown by its own name".

## 3. What it does at 1.0.0

Each behavior is testable on a Strelva-owned test business.

1. A converted tenant with a Google connection shows a Google listing System
   by its profile name, Live, with health from the last successful read.
2. A converted tenant with no Google connection shows no listing System. It
   offers "Connect Google" in context, not an empty page.
3. New Google reviews become review records on the listing System within one
   poll cycle. The poller already paginates (`fetchGoogleReviews`); the July
   audit's note is out of date. It did build its reviews URL as
   `accounts/accounts/{id}` from the `accounts/{id}` that `google-meta`
   stores, so it likely never read a review; fixed on `build/publishing`.
4. Every new review gets a drafted reply unless the mode is `off`
   (`src/lib/reviews/auto-reply.ts` modes `off`, `approve`, `auto`).
5. In `approve` mode the owner gets an approve-link email per reply, or one
   batched digest email with per-item links. Approving posts the reply, reads
   it back, and writes a receipt.
6. In `auto` mode the reply posts after the safety window and the owner gets a
   receipt, never a request.
7. A reply already published can be edited or withdrawn. Withdraw calls
   Google `deleteReply`; edit calls `updateReply` with the previous text kept
   for undo.
8. A change to hours or special hours in the business record produces one
   approval covering the website and Google. After approval, Strelva patches
   the location (`updateBusinessHours`, `src/lib/gbp-management.ts`) and
   reads it back.
9. Business info beyond hours (phone, website URL, description) follows the
   same path. This is new; today only hours, posts and photos are written.
10. A Google post (STANDARD, EVENT, OFFER with CTA) is drafted, approved and
    posted through `createGbpPost`, with read-back and a delete-based undo.
11. A blog or collection entry drafted by Strelva (`save_entry`, always
    `status:"draft"`) reaches the owner as an approve-link email. Approval
    publishes it, and the receipt links the live URL from
    `/api/v1/collections`.
12. A newsletter draft is approved by email and sent through
    `src/lib/email/send.ts`. The receipt states provider-accepted count,
    suppressed count and failures.
13. Every outside write has a receipt with: what changed, before and after,
    who approved or which policy allowed it, read-back result, undo
    availability.
14. A disconnected or revoked Google grant changes the listing's health, not
    its lifecycle. Drafts stay. The owner gets one email with a reconnect link
    that works without a workspace session (it needs a new signed token).
15. Tenants whose owners still use `/dashboard/reviews`, `/dashboard/google`
    or `/dashboard/collections` see the same state there. Both surfaces read
    the same stores.

## 4. States and rules

**Listing System lifecycle:** Draft (connected, not yet adopted), Live,
Paused. Paused means Strelva stops writing to Google and stops drafting
replies; reviews still sync. Health is separate: `ok`, `google_disconnected`,
`scope_missing`, `api_access_pending` (project quota is 0), `edits_pending`
(Google holding a change), `profile_suspended`, `stale` (no successful read in
48 hours).

**Draft output states:** drafted, needs you, approved, posting, posted,
posted_unverified, failed, withdrawn, declined. `posted_unverified` is the
AGENTS.md rule: once Google accepts a write, approval is done; a failed
read-back is recorded on its own and never retried as a write.

**Authority.**

| Action | Owner | Member | Strelva operator | Strelva unattended |
| --- | --- | --- | --- | --- |
| Connect or disconnect Google | Yes | No | Prepares, owner consents | No |
| Set reply mode | Yes | No | Yes, recorded, with owner notice | No |
| Approve a reply, post, info change, newsletter | Yes | If owner granted | Only with a recorded owner instruction | Only `auto` review replies |
| Publish a blog entry | Yes | If owner granted | Yes for typo fixes under a standing rule (decision 3) | No |
| Undo a published change | Yes | If owner granted | Yes | No |

**Never:**

- Never post to Google without approval, except `auto` review replies
  (AGENTS.md "Outside writes").
- Never re-draft a review the owner declined (`markReviewReplyDeclined`).
- Never send a newsletter outside `send.ts`, from the root domain, or to a
  non-active subscriber.
- Never treat a Connection as permission. Having the Google token is not
  approval to post.
- Never request new Google scopes from existing clients during the move.
- Never show "AI", "agent" or "automation". Strelva replied, Strelva posted.

## 5. Built on

**Reused as-is or wrapped:**

- Google writes: `src/lib/gbp-management.ts` (hours via Business Information
  v1 `locations.patch`; posts via v4 `localPosts`; photos), and
  `src/lib/gbp-replies.ts` (`publishReviewReply` with read-back).
- Operation registry: `src/lib/agent/gbp-operations.ts`, executed by
  `src/lib/event-actions.ts`.
- Review drafting and voice: `src/lib/review-replies.ts`,
  `src/lib/reviews/{auto-reply,reply-voice}.ts`; crons `poll-google-reviews`,
  `review-auto-post`.
- Reviews store: Postgres `reviews` table through `src/lib/reviews.ts`.
- Collections: `src/lib/cms/collections-service.ts`, `collection_entries`,
  `/api/v1/collections/*` (frozen contract, additive only).
- Newsletter: `src/lib/newsletter.ts`, `newsletter_subscribers`.
- Approve by email: `src/lib/approve-link.ts`, `src/app/api/approve/route.ts`.
- Secrets: `src/lib/crypto/secrets.ts`.
- Systems: `system_connections` with `account_binding` and `audience`
  targets (`src/platform/systems/contracts.ts`), projection in
  `src/platform/systems/from-existing.ts`.

**New:**

- `workspace_account_bindings` table: `id`, `workspace_id`, `provider`
  (`google` first), `subject` (Google account id, when known),
  `origin_tenant_stable_id`, `scopes text[]`, `refresh_token_ciphertext`,
  `access_token_ciphertext`, `token_expires_at`, `status`
  (`connected`, `needs_reauth`, `revoked`, `error`), `last_checked_at`,
  `last_error`, `migrated_from` (`redis` or `oauth`). RLS on, grants revoked,
  service-role RPCs only, mirroring `workspace_calendar_connections`
  (`supabase/migrations/20260920070000_workspace_calendar_connections.sql`).
  Unique on `(workspace_id, provider, origin_tenant_stable_id)` because a
  workspace can hold several linked tenants, each with its own grant
  (`tenant_workspace_links` allows many per workspace).
- `google_locations` binding detail: `account_id`, `location_id` per listing
  System or Version. Today this lives only in Redis `google-meta:{tenant}`.
- `listing` System kind and its projection from existing tenants.
- Receipts and undo snapshots for Google writes, keyed to the workspace.
  Built as `google_listing_receipts`, a per-source receipt store like
  `workspace_calendar_event_receipts`, not in the governed-work tables (that
  migration is unapplied shadow state, and the needs-you spec projects one
  receipt feed over per-source stores).
- A batch send in `src/lib/email/send.ts` (audience `customer`), with
  idempotency key per batch carried over from `newsletter.ts`, and RFC 8058
  one-click unsubscribe headers. Today `newsletter.ts` only sends a
  `mailto:` List-Unsubscribe.
- A signed reconnect link for owners who never sign in.

**Retires (after the move is proven):**

- Redis `connections:{tenant}:google` as the source of truth. It stays as a
  read fallback during the move.
- Redis `google-meta:{tenant}`.
- The direct Resend calls in `src/lib/newsletter.ts`.
- Redis event lifecycle for publishing approvals, once "one approval store"
  (Reborn section 2) lands. Publishing must not build a sixth approval store.

**Tenant model vs workspace model.** Stores stay keyed by tenant (`reviews`,
`collection_entries`, `newsletter_subscribers` all carry tenant ids). The
workspace reaches them through `tenant_workspace_links`. Only the Google grant
and location ids move to workspace-keyed storage, because a grant belongs to
the business, not to one site.

## 6. Moving today's clients

**Tenant Google tokens to workspace bindings, without re-consent.**

Facts that make this safe:

- A Google refresh token is tied to the OAuth client ID, not to where it is
  stored. Google documents a limit of 100 refresh tokens per Google account per
  client ID, which only makes sense with that binding
  ([Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2),
  updated 2026-05-26). Moving the encrypted token between stores does not
  invalidate it, as long as the same `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` mint access tokens.
- `getConnection` already decrypts both plaintext and `enc:v1:` values
  (`src/lib/connections.ts`, `decryptSecret` dual-read). So the move can read
  every existing row whatever its encryption state.

Steps:

1. **Dry run (read-only).** A script lists every tenant with
   `connections:{tenant}:google`, its link to a workspace, status, scopes
   present or absent, and whether `google-meta:{tenant}` has an account and
   location. It prints counts only, never token values (AGENTS.md "Secrets").
2. **Guard.** The Postgres write refuses unless `SECRETS_ENC_KEY` is set and
   `encryptSecret` returned an `enc:v1:` value. `encryptSecret` is a
   pass-through with no key, so without this guard plaintext would land in
   Postgres.
3. **Copy.** For each linked tenant, write a binding row with the re-encrypted
   refresh token, scopes, status, and `migrated_from = 'redis'`. Write the
   location ids. Idempotent by `(workspace_id, provider,
   origin_tenant_stable_id)`.
4. **Verify without writing to Google.** For each row, mint one access token
   from the Postgres copy (`refreshAccessToken`) and call one read (account
   list or location get). This touches Google but changes nothing. It still
   runs only with Jacob's yes, because it is production Google traffic.
5. **Dual-read.** A single adapter, `getGoogleAccessToken(scope)`, reads the
   binding first and falls back to Redis. Every caller (`google-token.ts`,
   `google-resources.ts`, `gbp-replies.ts`, `gbp-management.ts`, the poller)
   moves to the adapter. `gbp-replies.ts` keeps a duplicate token refresh
   (`getValidToken`), noted in the July audit; it goes.
6. **Dual-write.** The tenant OAuth callback
   (`src/app/api/oauth/google/callback/route.ts`) writes both stores while the
   fallback exists. A reconnect during the move can't strand either side.
7. **Cut.** After 30 days with zero Redis fallbacks logged, reads stop at
   Postgres. The Redis key is kept, not deleted, for another 30 days, then
   removed with Jacob's yes.

Facts the move must not break:

- Connections made before scope tracking have no `scopes` field.
  `connectionHasWriteScope` treats that as "attempt the call". Keep that
  behavior; copy `scopes` as null-equivalent, not as `{}`.
- `refreshAccessToken` ignores a rotated refresh token in Google's response.
  Google does not usually rotate here, but the adapter should store one if it
  arrives.
- `tenant-rename` had a `google-meta` key gap (July audit). Keying bindings by
  `stable_id` removes it.

**Other stores.** Reviews, collections and subscribers stay where they are and
are read through the link. Nothing in `/api/v1` changes. `/dashboard` pages
keep working against the same stores until Reborn section 6 redirects them.

**Approvals in flight.** Pending Redis events (`review_reply_draft`,
`gbp_*_draft`, `newsletter_draft`) keep resolving through `event-actions.ts`.
Old approve-link emails keep working until they expire. New drafts go to the
new store only after it exists.

## 7. Failure and undo

| What fails | What the person sees | Undo |
| --- | --- | --- |
| Google API access not granted (quota 0) | Listing health "Google access pending". Drafts kept; replies queue. Operator sees the count | n/a |
| Grant revoked or refresh token dead | Health "Google disconnected"; one owner email with signed reconnect link | Reconnect restores; drafts post after re-approval if older than 7 days |
| Scope missing (`business.manage`) | Same as above, "reconnect to let Strelva post" | — |
| Google accepts, read-back differs | Receipt "Posted. Google hasn't shown it yet." State `posted_unverified`. Never re-posted | Withdraw |
| Google holds an edit for its own review | Receipt "Google is reviewing this change" until read-back matches | Patch back to snapshot |
| Website updated, Google failed | Item-by-item: "Website: updated. Google: failed, retry or keep as is." The part that landed stays | Each part has its own undo |
| 429 or the 10 edits per minute per profile cap | Paced retry with backoff; no owner noise unless it exceeds an hour | — |
| Newsletter partially sent | Receipt with accepted batches and failed batches; retry reuses per-batch idempotency keys so no one gets two | No undo. Approval is final |
| Blog entry publish fails | Stays draft; owner told | Unpublish, or restore prior entry data |

Undo specifics: review reply undo is `deleteReply` or `updateReply` with the
prior text. Post undo is `localPosts.delete`. Hours and info undo is a patch
with the snapshot taken before the write. Google may itself hold the undo for
review. None of these is atomic across website and Google, and the receipt
never claims it is.

## 8. Proof

- **Unit, today:** 7 files, 95 tests pass locally on `reborn-1.0-model`
  (`gbp-management`, `review-replies`, `review-auto-post`, `secret-encryption`,
  `google-resources`, `cms-collections-service`, `newsletter-store-postgres`;
  run 2026-10-06). These prove the tenant path with mocked Google, not live
  Google.
- **New unit:** binding encryption guard refuses plaintext; adapter reads
  Postgres then Redis; dual-write on reconnect; scope-less legacy rows still
  attempt writes; listing projection from tenant plus `google-meta`; receipt
  plus undo snapshot for each Google write; newsletter through `send.ts` keeps
  idempotency and suppression.
- **Migration proof:** dry run on a scrubbed copy (`pnpm scrubbed-copy`), then
  production dry run counts, then a single-tenant production copy on a
  Strelva-owned test business, then verify step 4.
- **Journeys:** authenticated local journeys on desktop and mobile for the
  listing System (empty, loading, error, disconnected, access pending), using
  The Mooney Firm and gldf fixtures. Plus an email-only journey: the owner
  approves a reply from the approve link with no session.
- **Production proof:** on a Strelva-owned test business with a verified
  Google profile: one reply posted, read back and withdrawn; one hours change
  posted, read back and reverted; one post created and deleted; one blog entry
  published and unpublished; one newsletter to a Strelva-owned list. Each
  with its receipt. This needs a profile that is verified, 60+ days old and
  has a website (the API prerequisite), and Google API access approved.
- **Bar:** a converted client sees the same reviews and replies in the
  workspace and in `/dashboard` for 14 days, with zero Redis fallbacks for
  the last 7.

## 9. Open decisions

1. **Model shape.** (a) Google listing and newsletter as their own Systems,
   blog inside the website (recommended). (b) All Connections of the website
   System (fewer things on Home; breaks for non-hosted sites). (c) One
   Publishing System (not recommended). Changes: the System kinds, what Home
   lists, where Paused applies.
2. **How Strelva gets Google access for new businesses.** (a) Owner OAuth
   per business, as today. (b) Owner adds Strelva's Google account as a
   Manager on the profile; Strelva uses one grant for all profiles. (b) is
   how agencies usually work, avoids per-client tokens, and survives an owner
   changing their password. The owner stays Primary Owner. It concentrates
   risk in one Strelva account. Recommendation: (a) for existing clients
   (no re-consent), offer (b) for new businesses after API access is granted.
   Changes the binding table (owner-of-grant column) and the exit path.
3. **One approval for record plus Google.** AGENTS.md requires approval for
   every Google change. Recommendation: approving a business-record fact
   change is the approval for its Google write too, shown as one item with
   two effects. Needs Jacob's yes because it reads the rule more narrowly.
4. **Batched approval emails.** Per-item emails today. Recommendation: one
   daily digest per owner with per-item approve links, plus an immediate
   email for negative reviews. Changes cron and email volume.
5. **Newsletter sending domain.** `newsletter.ts` sends from
   `tenantConfig.resendDomain || RESEND_DOMAIN`. AGENTS.md says client-branded
   mail uses `mail.strelva.com` and no per-client domains. Recommendation:
   force `mail.strelva.com` in the `send.ts` move unless a client already
   relies on a custom domain (check before changing).
6. **Social (Instagram) and Yelp.** Recommendation: social stays on
   `/dashboard` for 1.0.0; Yelp stays read-only (no reply API is used today).
7. **Under assumption 1 (both existing and new businesses):** new businesses
   can't get Google writes until the API grant and the profile prerequisites
   are met. If 1.0.0 is existing clients only, decision 2 can wait.

## 10. Unknowns

**External facts, checked 2026-10-06:**

- Access needs an application. The project must request "Basic API Access"
  through the GBP API contact form, from an email that is an owner or manager
  on a profile verified and active for 60+ days that lists a website. Quota is
  0 QPM until approved, then 300 QPM
  ([Prerequisites](https://developers.google.com/my-business/content/prereqs),
  updated 2026-08-28).
- Limits: Business Information API 300 QPM, 10,000 updates per day, and 10
  edits per minute per profile. Increase requests are usually denied below 50%
  use or for spiky traffic
  ([Usage limits](https://developers.google.com/my-business/content/limits),
  updated 2026-08-28).
- Review replies are not deprecated. v4 `accounts.locations.reviews` has
  `list`, `get`, `updateReply`, `deleteReply`; reply max 4,096 bytes
  ([reviews reference](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews),
  updated 2026-07-24).
- Posts are not deprecated. v4 `localPosts` has `create`, `get`, `list`,
  `patch`, `delete`; only `localPosts.reportInsights` was discontinued
  (2023-02-20). Topic types STANDARD, EVENT, OFFER, ALERT; ALERT is not always
  available
  ([localPosts reference](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts),
  updated 2026-04-15;
  [sunset dates](https://developers.google.com/my-business/content/sunset-dates),
  updated 2026-08-28).
- Product posts can't be created through the API
  ([Posts guide](https://developers.google.com/my-business/content/posts-data),
  updated 2026-08-28).
- Google says API applications are backlogged with no timeframe
  ([Search Engine Roundtable](https://www.seroundtable.com/google-business-profile-api-application-delays-42085.html),
  2026-09-15). Third-party guides quote 3 to 10 business days in normal times;
  treat that as unreliable now.
- An OAuth app in Testing status gets refresh tokens that expire in 7 days
  ([Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2),
  updated 2026-05-26).
- A developer forum thread reports `business.manage` shown as non-sensitive
  in the console but blocked for external users as "not verified", with no
  submit path
  ([Google Developer forum](https://discuss.google.dev/t/oauth-business-manage-shown-as-non-sensitive-in-auth-platform-but-backend-blocks-all-external-users-with-error-403-access-denied-no-submit-for-verification-path-exists/384175),
  2026-07-23, unresolved as of 2026-08-17). One report, not confirmed.

**Strelva facts we don't have:**

- Whether Strelva's Google Cloud project has Basic API Access (quota above 0).
  The code comment in `gbp-management.ts` and the bookings spec say writes are
  blocked until approved. Find out: Jacob checks the quota page in Google
  Cloud console. If 0, apply now; this is the longest lead time in this spec.
- Whether the OAuth consent screen is "In production" and verified for
  `business.manage`, `webmasters.readonly`, `analytics.readonly`. If it is in
  Testing, every stored refresh token older than 7 days is already dead, and
  "without re-consent" is impossible for those. Find out: console check, then
  the step-4 verify.
- How many tenants have a Google connection, how many have scopes recorded,
  and how many have `google-meta`. Find out: the step-1 dry run.
- Whether `SECRETS_ENC_KEY` is set in production. Find out: Vercel env list
  (names only).
- Whether any client relies on a custom newsletter sending domain. Find out:
  read tenant `resendDomain` values.
- Whether Strelva has a verified 60+ day profile with a website for the
  production proof. Inference: strelva.com's own profile may qualify; not
  checked.

**Stays manual at 1.0.0:**

- Applying for API access and any quota increase (Jacob, by form).
- OAuth app verification, if Google requires it.
- Creating, claiming or verifying a profile, and ownership transfers.
- Product posts, Q&A and messaging. The repo's July research says the Q&A API
  shut down on 2025-11-03 and messaging in 2024
  (`docs/strategy/gbp-service-addon.md`); not re-checked here.
- Suspended or disputed profiles, and edits Google rejects.
- Setting the profile's booking link, until API access is granted (bookings
  spec).
- Yelp replies and Instagram posting.

## Built locally (2026-10-06, `build/publishing`)

Local proof only. Nothing here was run against production, Google or live
email. Working defaults from section 9 were followed (decision 1a, 5 forced to
`mail.strelva.com`); decisions 2, 3 and 4 are not built.

| Part | Where | Proof |
| --- | --- | --- |
| `workspace_account_bindings`, `workspace_google_locations`, `google_listing_receipts`, service-role RPCs, two new System origins | `supabase/migrations/20261007170000_workspace_account_bindings.sql` | `tests/workspace-account-bindings-schema.sql` in `check:workspace-sql`: plaintext refused by CHECK and RPC, cross-business grant/receipt denied, copy never overwrites, rotated token kept, accepted receipts only move forward, auto policy only for 3+ star replies |
| Token adapter: binding first, Redis fallback (counted), dual-write on reconnect, encryption guard | `src/lib/google-access.ts`, `src/platform/account-bindings/` | `google-access.test.ts`. Every caller moved: `google-token.ts`, `google-resources.ts`, `gbp-replies.ts` (duplicate refresh removed), `gbp-management.ts`, the poller, the OAuth callback. Behind `STRELVA_GOOGLE_BINDINGS=1`; off is Redis-only, as before |
| Copy script (steps 1 to 4) | `scripts/copy-google-bindings.ts`, `scripts/google-binding-copy.ts` | `google-binding-copy.test.ts`: dry run counts only; `--apply` refuses without `SECRETS_ENC_KEY` and on a non-local DB without `--i-have-jacobs-yes`; `--verify-google` always needs that yes |
| Google listing System: replies, withdraw, hours and info from the record, posts, receipts with read-back, undo | `src/products/google-listing/` | `google-listing-service.test.ts` against a fake Google client |
| 1 and 2 star replies go to the owner in `auto` mode | `src/lib/reviews/auto-reply-rule.ts`, poller, backlog, auto-post cron, receipt CHECK | `review-auto-post.test.ts` |
| Listing and newsletter Systems, blog and collections as website parts, Connect Google offer | `src/products/publishing/`, `src/experience/systems/` | `publishing-projection.test.ts`, `publishing-experience.test.tsx`; rendered in `/preview/strelva?scenario=mooney&systems=on&publishing=on|pending|disconnected|none` at 1280 and 390 px. Behind `STRELVA_PUBLISHING_RELEASE=1` |
| Newsletter through `email/send.ts` from `mail.strelva.com`, RFC 8058 one-click unsubscribe | `src/lib/newsletter.ts`, `sendBatchWithReceipt`, `/api/newsletter/unsubscribe` | `newsletter-send-path.test.ts` |

Not built: the signed reconnect link (item 14); wiring the tenant approve
path (`event-actions.ts`) to write `google_listing_receipts` (the old
`publishReviewReply` path still posts approved replies, and since the
operator merge it records them in `outside_write_receipts`); digest emails
(decision 4); one approval for record plus Google (decision 3, needs Jacob's
yes); a review-sync job into the workspace; Versions for a second location.

Behavior changes to know before deploy: the newsletter now uses the
`customer` email gate (`CUSTOMER_EMAIL_ENABLED`) instead of the client gate,
sends from `newsletter@mail.strelva.com` even when a tenant has a
`resendDomain`, and keeps sending later batches after one fails.

**One receipt per review reply (integration, 2026-10-06).** The operator
stream added an `outside_write_receipts` ledger and wired `publishReviewReply`
into it. Rule: every review reply write gets exactly one receipt, in one
ledger. Listing-System writes (`src/products/google-listing`) record in
`google_listing_receipts`; the legacy approve path (`publishReviewReply`)
records in `outside_write_receipts`. Neither path calls the other's writer
(`review-reply-receipt-home.test.ts`). When the approve path moves onto the
listing System, it switches ledgers rather than writing both. The poller URL
fix, v1 `locations/{id}` parsing and the 1–2 star rule are unchanged by the
merge. See `docs/architecture/persistence-boundaries.md`.

## Wave 6 implementation status (2026-10-07)

This supersedes the October 6 "Not built" list for the behaviors below. The
final local verification and preserved failures live in the stream handoff.

| Launch behaviors from section 3 | Implementation and local evidence |
| --- | --- |
| 1–2: named listing, no-grant connection offer, separate health/lifecycle | Existing projection plus persisted listing pause/access controls; `publishing-projection`, `publishing-experience`, `publishing-poll-health` tests |
| 3–6, 15: review sync/draft/approve/auto and shared tenant state | Existing poll/draft crons and shared review store, pause-aware drafting, listing reply execution/receipt through the existing event claim; `review-reply-listing-path`, `review-auto-post`, `publishing-pacing` tests. New decision notices remain off by default |
| 7: edit/withdraw published replies | Workspace owner actions keep previous text and undo; each reply command has identity, so identical text may be restored after withdrawal. Provider uncertainty blocks retry; `publishing-google-execution`, `google-listing-service` tests |
| 8–9: hours/special hours and phone/website/description | Owner record fields and revision-bound Google drafts; field removal produces an exact clear; record commit survives each location's failure. Default is separate Google approvals. Optional combined consent requires both its own release gate and the visible disclosure; `publishing-record-changes`, `publishing-record-route` tests |
| 10, 13: posts, governed writes, read-back and undo | STANDARD/EVENT/OFFER forms, date/CTA validation, profile pacing, immutable receipts, accepted/unconfirmed outcomes, stable approval receipt identity. Only durable definitive rejection permits another dispatch; accepted and uncertain retries block, including event-marker failures; Google service/execution tests |
| 11: blog/collection compose, approve, publish, restore | Website System content workspace and one shared store; SQL commits publication and receipt atomically, refuses stale writes and recovers a receipt without replacing later edits. Restore/unpublish is a fresh review; content-service tests and `workspace-publishing-content-schema.sql` |
| 12: newsletter approval and receipts | Immutable approved issue and paused receipt with provider-accepted zero, paused suppression count and delivery unknown; SQL proves replay and immutability. Approved history survives audience zero or audience-read failure. Sending these issued workspace snapshots is deliberately not wired; existing legacy newsletter sending remains separate |
| 14: reconnect without a workspace session | Signed expiring owner link, explicit GET confirmation, browser/state-bound OAuth, single use, live owner/binding recheck, dual-write token restoration, one outage notice claim; reconnect unit and SQL tests. Notice transport remains behind all email/release/tenant gates |

Four additive migrations and rollbacks are prepared in the assigned range:
`20261010140000`, `20261010141000`, `20261010142000`, `20261010143000`.
No new cron or dependency. Existing Needs you chase owns publishing decision
and reconnect notices. `STRELVA_PUBLISHING_RELEASE`,
`STRELVA_RECORD_GOOGLE_APPROVAL_POLICY` and `STRELVA_PUBLISHING_NOTICES_SEND`
default off. No flag was enabled.

**Not launch-complete.** Workspace newsletter snapshots have no delivery
executor, and sending remains paused. Native businesses with no linked tenant
do not yet have these tenant-backed authoring paths. Multiple Google locations
project as separate Systems; Version lineage is not added by this stream.
These are code/product scope limits, not production verification claims.

Production still must establish Google API quota/access, verified OAuth status
and scopes, encryption configuration, binding-copy counts, an eligible test
profile, real provider writes/read-back/undo, mail domain/consent readiness,
authenticated client parity for 14 days and zero fallback for the last seven.
Applying migrations, changing environment, enabling notices or policy, and
deploying require Jacob's explicit authorization and the release checklist.
