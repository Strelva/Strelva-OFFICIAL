# Integration keys: what to add, where to get it, what turns on

Adding a key is Jacob's yes and a new production deploy, not a redeploy. Nothing
in this document has been set in any environment. Add a provider's keys and that
Connection starts working with no code change.

Until the keys exist, Connections reads **Not set up yet** (Strelva hasn't added
them) or **Waiting on Google** (Google hasn't approved Strelva's Business Profile
access). Each missing key is logged once per process, by name only. The list the
code checks is `src/platform/connections/provider-keys.ts`; a test keeps this page
in step with it.

Facts not re-checked against the provider this session are marked
**UNVERIFIED (2026-10-15)**.

## Shared by several providers

| Key | What it is |
| --- | --- |
| `SECRETS_ENC_KEY` | Encrypts stored tokens. Never skip it: the stores refuse plaintext. Setup: `first-time-production-secrets.md`. |
| `OAUTH_STATE_SECRET` or `INTERNAL_API_SECRET` | Signs the OAuth state on calendar and HighLevel connections. One of them must exist. |
| `APP_URL` or `NEXT_PUBLIC_APP_URL` | The public address redirect URLs are built from. |

## Google Business Profile

- **Keys.** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (required), plus `NEXT_PUBLIC_APP_URL` and `SECRETS_ENC_KEY`.
- **Where.** Google Cloud Console, Credentials, an OAuth client of type Web application.
- **Redirect URLs to register.**
  - `/api/oauth/google/callback`
  - `/api/workspace/publishing/google/oauth/callback`
  - `/api/workspace/publishing/google/discover/callback`
  - `/api/oauth/google/agency/callback`
  - `/api/workspace/google/read-grant/callback`
- **Separate from the keys.** Google's Business Profile API access application. Until Google approves it, every write is rejected with quota 0.
- **Turns on.** Set `STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE=platform` and `STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE=pending`. Connections then reads "Waiting on Google"; reply approvals stay pending and nothing posts a FAILED alert. When Google approves, change `pending` to `approved`.
- **Before and after.** Default: "Coming soon". With the keys and access set: "Waiting on Google", then connectable.

## Google bindings (Postgres)

`STRELVA_GOOGLE_BINDINGS=1` on its own breaks every Google reconnect. It also needs
`STRELVA_CLIENT_RECORDS_DUAL_WRITE=1`, `DUAL_WRITE_PG` not `0`, and
`STRELVA_CLIENT_RECORDS_READ` listing `provider_connections` and `provider_metadata`.
Run `npx tsx scripts/google-bindings-readiness.ts`: it names what is missing, counts
30 days of Redis fallbacks and dry-runs the grant copy. It is read-only, and a
non-local database needs `--i-have-jacobs-yes`.

## Google Calendar

- **Keys.** Optional `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`; they fall back to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Needs the shared state secret and app URL.
- **Redirect URL.** `/api/workspace/calendar-connections/oauth/google/callback`.
- **Turns on.** Google Calendar in Scheduling and Connections.

## Outlook Calendar

- **Keys.** `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`. Needs the shared state secret and app URL. Apply the migration below first; the keys alone are not enough.
- **Where.** Microsoft Entra admin center, App registrations, a new registration. Supported account types: any organization plus personal Microsoft accounts (the `/common` endpoint).
- **Redirect URL.** Web, `/api/workspace/calendar-connections/oauth/outlook/callback`.
- **Permissions.** Delegated: `offline_access`, `Calendars.ReadWrite`, `openid`, `profile`.
- **Renewal.** Client secrets expire (24 months at most). Write the renewal date down when you create it. **UNVERIFIED (2026-10-15):** Microsoft's current maximum and whether publisher verification is required for multi-tenant apps.
- **Needs the migration (hard prerequisite).** `20261026150000_conn_outlook_calendar.sql` is held and unapplied. Apply it before adding the `MICROSOFT_*` keys: without it, every Outlook connect fails (the holder cannot be recorded) and Apps that declare `outlook_calendar` are refused.
- **Before and after.** "Not set up yet", then connectable; the scheduling panel disables Connect until then.

## HighLevel

Full steps: `gohighlevel-import-2026-10-12.md`, steps 1 to 10.

- **Keys.** `HIGHLEVEL_CLIENT_ID`, `HIGHLEVEL_CLIENT_SECRET`; optional `HIGHLEVEL_APP_ID`. Also `SECRETS_ENC_KEY`, the shared state secret and app URL.
- **URLs.** Redirect `/api/workspace/agency-clients/gohighlevel/oauth/callback`; webhook `/api/webhooks/gohighlevel`.
- **Migration.** `20261024600000_agency_source_connections.sql`.
- **Gate.** `STRELVA_GHL_IMPORT_RELEASE=1` (on top of `STRELVA_WORKSPACE_RELEASE=1`). Off, nothing shows.
- **Before and after.** With the gate on and no keys, Import clients says "HighLevel isn't set up on Strelva yet" and offers paste or upload. With the keys, a Connect link.

## Calendly

- **Keys.** `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`; optional `CALENDLY_WEBHOOK_SECRET`.
- **Redirect URL.** `/api/oauth/calendly/callback`.
- **Turns on.** Calendly in Connections and the dashboard source page.

## Instagram

- **Keys.** `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`.
- **Redirect URL.** `/api/oauth/instagram/callback`.
- **Warning before adding keys.** The code requests Basic Display scopes `user_profile,user_media` (`src/app/api/oauth/instagram/route.ts`), and Meta retired the Basic Display API on 2024-12-04. It most likely cannot connect. **UNVERIFIED (2026-10-15):** confirm with Meta, or rebuild on Instagram API with Instagram Login first.

## Stripe

- **Keys.** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; for Connect, `STRIPE_CONNECT_WEBHOOK_SECRET` or `STRIPE_CONNECT_THIN_WEBHOOK_SECRET`.
- **Webhooks.** `/api/billing/webhook`; Connect, `/api/billing/connect/webhook`.
- **No prices here.** Amounts live in billing configuration, not in this page.

## Resend (email)

- **Keys.** `RESEND_API_KEY`; `RESEND_DOMAIN` (default `updates.strelva.com`); `RESEND_WEBHOOK_SECRET` for delivery events at `/api/webhooks/resend`.
- **Client and customer email stays OFF.** Adding the key does not send to clients: sending is gated by `EMAIL_SENDING_ENABLED` and `CUSTOMER_EMAIL_ENABLED`, which this page does not change. Without the key, a send is skipped and the missing key is logged once.

## Dental intake (no provider key)

Dental intake needs no outside account of its own. Its switches, all default off:

- `STRELVA_VERTICAL_INTAKE_RELEASE` (default off; `workspace` for per-business rows). Needs `STRELVA_WORKSPACE_RELEASE=1` and connected sites. Prod stays off until Jacob answers the health-information question in `docs/capabilities/apps/dental-intake.md`.
- `STRELVA_INTAKE_SENSITIVE_FIELDS` (default off; needs `SECRETS_ENC_KEY`). Lets an office ask for an insurance member ID. Held until a business associate agreement path exists.
- `STRELVA_INTAKE_OWNER_EMAIL` (default off; needs `EMAIL_SENDING_ENABLED` too). The owner's own Needs you emails about it. Patients are never emailed by this App.
- **Before and after.** With the switch off, the Inquiries page and Business details look as they do today. With it on and no member ID switch, the form never asks for one.

## Yelp

No Strelva key. The owner pastes their own Yelp Fusion API key and business ID.
Strelva reads reviews once a day, can draft a reply, and cannot post it: Yelp has
no way for apps to post replies. A refused key shows "Needs reconnect".
**UNVERIFIED (2026-10-15):** whether Yelp's current plan terms allow this use.
Yelp is not in the ADR 0016 Connections model yet.
