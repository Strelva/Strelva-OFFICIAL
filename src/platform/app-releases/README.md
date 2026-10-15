# Built-in App Releases

A built-in App is an App the platform ships in code to every business:
Bookings, Inquiries, Recaps, Documents, Ask Strelva and Internal tools. Each
declares an identity, numbered Releases, the gates that turn each Release on,
and the Connections each Release needs. Nothing here stores state: the gates
are the existing release flags and env switches.

## Built-in vs Library

- **Built-in App** (this module): made by Strelva, credited "Strelva", never an
  agency id (ADR 0012: Strelva Agency gets no carve-out). Releases are numbered
  in `catalog.ts` and shipped with the code.
- **Library App** (`src/platform/system-versions`): published by an agency,
  adapted per business as a Version with its own Releases and lineage. Not
  touched by this module. Internal tools keep their own application Releases,
  so `labelOnSystems` is false for them and no built-in label is shown.

## The gate rule

Each Release lists only the gates it introduces. Release N is on only when
every Release 1..N has its own gates on (a prefix). The first gate that is off
holds the business at the Release before it, and later gates are never read.
Release 1 of every App is the 1.0.0 production baseline and has no gates, so
it changes nothing live.

An App can also have `availability` gates, which decide whether it is present
for a business at all (Inquiries needs the `inquiries` flag, Ask Strelva needs
`STRELVA_ASK_RELEASE=1` and the `systems` flag). Availability is not a Release.

## Rollback

Turning off Release N's own gate returns the business to Release N-1.
`rollbackPlan(app, n)` says which gates to turn off and the scope:

- `business`: workspace flags only. Turn it off for one business (agency
  Client feature availability, the operator panel, or `pnpm
  workspace-release-flag`).
- `everywhere`: an env switch. Set it to 0 for everyone.
- `redeploy`: no gate. Only a redeploy returns it.

Release 1 is the baseline and has no rollback.

## Reading a Release

- `readBuiltInAppRelease(appId, workspaceId)` (server.ts): current Release,
  latest, what holds the next one back, and the Connections that Release needs.
- `builtInAppReleaseReached(appId, key, workspaceId)`: gate code by key. Never
  compare numbers in feature code.
- `builtInAppReleaseMayReach(appId, key)`: cheap env-only early gate.
- `effectiveRequiredConnections(appId, workspaceId)`: what Make it live waits
  for. It ignores availability, so it never depends on the display flag.
- `STRELVA_APP_RELEASES=1` (with `STRELVA_WORKSPACE_RELEASE=1`) only shows the
  labels ("Bookings Release 1") and each App's Needs on screen.

`inquiryReleaseEnabledForWorkspace` falls back to the env-only
`STRELVA_INQUIRIES_RELEASE` when the workspace release is off; the
`workspace_flag` availability gate does not. Every surface that shows App
Releases sits inside the workspace release, so this is acceptable.

## Email is off

With customer email off by decision, the `resend` Connection row reads
"Business customer email is off" with state disconnected
(`src/platform/infra/email/connection-source.ts`). Inquiry forms and internal
tools require that Connection, so they cannot be made live today. That is
unchanged and honest. Bookings and Recaps list it as optional.

## Adding a Release (for other lanes)

1. Pick a stable key `<appId>.<slug>`.
2. If the Release changes live behavior, add a workspace release flag:
   - append the key to `RELEASE_FLAGS`, `RELEASE_FLAG_ENV` and
     `RELEASE_FLAG_LABELS` in `src/platform/release-flags/resolve.ts`;
   - add migration `supabase/migrations/<timestamp after the latest file>_<lane>_release_flag.sql`
     that appends the key to `public.workspace_release_flag_names()`, copying
     the do-block of `20261010153000_newsletter_contacts.sql` lines 6-16, plus
     `rollback-<same name>.sql`;
   - add the key to `tests/release-flag-names-final-schema.sql` (conditional on
     the lane's own table, like `agent_channel`, if the key ships with a table);
   - add it to the list in `src/__tests__/release-flags.test.ts` "covers every
     flag the spec names".
3. Append `{ key, number: <last+1>, summary, shippedIn: null, changesLiveBehavior: true, gates: [{ kind: "workspace_flag", flag }], requiredConnections: <full list> }`
   to the App in `catalog.ts`. The list is the full set for that Release, not a delta.
4. Gate code with `await builtInAppReleaseReached(appId, key, workspaceId, viewer)`,
   or with `builtInAppReleaseMayReach` as the early gate. Never compare numbers
   in feature code.
5. If two lanes both add Release N, the integrator renumbers at merge. Keys keep
   code stable, and `src/__tests__/app-releases-catalog.test.ts` enforces
   contiguity.
6. Set `shippedIn` to the product version when it deploys.

`pnpm app-releases` prints the catalog; `pnpm app-releases --workspace <uuid>`
prints where one business stands.
