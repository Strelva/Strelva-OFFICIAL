# Import clients from GoHighLevel: operator steps (2026-10-12)

An agency connects its HighLevel agency account once. Strelva lists every
sub-account and shows each one as a row in the Import clients preview, the same
preview a sheet uses. Nothing is added until the agency confirms a row, and
nothing is sent to an owner.

Status: built and tested locally against fabricated fixtures only. No call has
been made to HighLevel. Off unless `STRELVA_GHL_IMPORT_RELEASE=1` (on top of
`STRELVA_WORKSPACE_RELEASE=1`).

Code: `src/products/agency-clients/gohighlevel/`. Routes:
`/api/workspace/agency-clients/gohighlevel` (state, rows, disconnect),
`.../gohighlevel/oauth` and `.../oauth/callback`, and `/api/webhooks/gohighlevel`.
Storage: `supabase/migrations/20261024600000_agency_source_connections.sql`
(not applied anywhere but a throwaway local cluster).

## What Jacob does

Each step needs your yes. None is done.

1. **HighLevel developer account.** Sign up at
   <https://marketplace.gohighlevel.com>. HighLevel's help article
   ([48001060529](https://help.gohighlevel.com/support/solutions/articles/48001060529-highlevel-api-documentation))
   says OAuth is part of Advanced API access, on the Agency Pro plan. Unknown:
   whether each installing agency also needs Agency Pro. Ask HighLevel support
   before promising this to an agency.
2. **Create the Marketplace app** (My Apps, Create App).
   - Distribution: target user **Agency**, who can install **Agency Only**,
     bulk installation **Yes** (it can't be turned off later)
     ([AppDistribution](https://marketplace.gohighlevel.com/docs/oauth/AppDistribution)).
   - Listing name and copy say "Strelva". Our listing is not one of Strelva's
     Apps (GLOSSARY).
3. **Scopes.** Read only, exactly these three:
   `locations.readonly`, `users.readonly`, `oauth.readonly`
   ([Scopes](https://github.com/GoHighLevel/highlevel-api-docs/blob/main/docs/oauth/Scopes.md)).
   No write scope. If the scope picker refuses one at agency level, stop and
   tell the build; don't add others.
4. **Redirect URL.** `https://<app host>/api/workspace/agency-clients/gohighlevel/oauth/callback`.
   Use the preview host first.
5. **Webhook URL.** `https://<app host>/api/webhooks/gohighlevel`. Turn on
   **AppInstall**, **AppUninstall** and **LocationCreate**. Nothing else.
6. **Keys into env** (needs your yes; a new production deploy, not a redeploy):
   `HIGHLEVEL_CLIENT_ID`, `HIGHLEVEL_CLIENT_SECRET`, and optionally
   `HIGHLEVEL_APP_ID` (deliveries for any other app are ignored). Also needs
   `SECRETS_ENC_KEY` set: the store refuses to keep a token unencrypted.
   `OAUTH_STATE_SECRET` or `INTERNAL_API_SECRET` must exist (already used by
   calendar OAuth).
7. **Migration** `20261024600000_agency_source_connections.sql` (needs your
   yes). Its rollback refuses while any agency is still connected.
8. **Sandbox check before review.** Install the app on a test agency with two
   or three sub-accounts and confirm the UNVERIFIED items below. Capture one
   real AppInstall delivery (headers and body) for the fixture file.
9. **Review submission.** HighLevel reviews public apps and asks for a Loom
   demo as the last step
   ([AppReviewGuidelines](https://marketplace.gohighlevel.com/docs/oauth/AppReviewGuidelines)).
   Show: connect, preview of sub-accounts, confirm a few, owner claim links not
   sent. Review time is not published.
10. **Flag.** `STRELVA_GHL_IMPORT_RELEASE=1` per environment, its own yes.

## What the sandbox has to confirm

- `state` comes back on the callback. The connect route also sets an HttpOnly
  cookie as a fallback; if `state` does come back, the cookie is only a backup.
- The token from the agency consent has `userType: "Company"`. A Location token
  is refused with a plain message.
- `GET /users/search?companyId=` with the agency token returns sub-account users
  (`roles.type: "account"`) with their `locationIds`. If not, the adapter
  already falls back to one search per sub-account. Each fallback search
  costs one request.
- The largest `limit` `/locations/search` honours. The adapter asks for 100
  and moves on by what it receives, so a smaller cap only costs requests.
- `X-GHL-Signature` signs the exact body bytes we receive.
- What a 401 for a missing scope looks like (we treat "not authorized for this
  scope" as missing access, not a revoked connection).
- Whether an unreviewed app can be installed by a named design-partner agency.

## Cost at 500 clients

About 5 location pages plus users pages (usually fewer than 10), paced at 90
requests per 10 seconds per agency. HighLevel allows 100 per 10 seconds and
200,000 per day per app per agency
([Authorization FAQ](https://github.com/GoHighLevel/highlevel-api-docs/blob/main/docs/oauth/Authorization.md)).
The per-sub-account fallback would be about 505 requests, roughly a minute.
