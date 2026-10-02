# Ontology Phase 5 (#11) — Connection status: authorization vs sync health

**Scope:** verify-and-harden of the *existing* typed connection-status model. This was
not a new abstraction — the capability the proposal asked for (tell "auth expired →
reconnect" apart from "sync broken", typed) already lived in
`src/lib/integration-registry.ts`. This pass verified it, fixed one real gap at the
producer side, and locked the whole model with tests.

## The model that already existed

`normalizeIntegrationStatus(definition, input)` collapses everything a source can be into
one typed `IntegrationStatus`:

```
"connected" | "needs_reauth" | "sync_failed" | "not_configured" | "unknown"
```

The two states that matter for this phase are separate enum values on purpose:

- **`needs_reauth`** — the **authorization** axis. The account's token is dead
  (revoked/expired refresh token); the owner must reconnect. The dashboard shows
  "Needs reauth" (warning) and routes to the reconnect flow.
- **`sync_failed`** — the **sync-health** axis. A transient/API failure that may
  self-heal on the next poll. The dashboard shows "Sync failed" (critical).

`deriveIntelligenceStatus` then maps both broken axes to a single `needs_attention` for
the intelligence surface — the axes reconverge only there, because that surface just says
"this needs you" while the status badge says *which kind* of attention.

### Why not a full authStatus × syncHealth matrix

We deliberately did **not** add an orthogonal `{ authStatus, syncHealth }` pair. No
surface renders both at once: the Sources list, the connection detail page, and the badge
each show exactly one status. A connection that needs reauth is not meaningfully also
"sync failing" — reauth is the blocking condition, and it is what the owner acts on. One
typed status per surface is the honest shape; a matrix would be unused scaffolding.

## The one real gap found and fixed

`Connection.status` (`src/lib/types.ts`) was `"connected" | "disconnected" | "error"` —
it had **no way to express reauth**. Both token pollers
(`src/app/api/cron/poll-google-reviews`, `poll-instagram`) write a failure status in
exactly one place: when `getValidAccessToken` returns `null`, i.e. the refresh token
itself is dead. Their own comments already called this "needs re-auth" — but they wrote
`status: "error"`, which `normalizeIntegrationStatus` buckets as **`sync_failed`**.

So a client whose Google/Instagram authorization was revoked saw **"Sync failed"**
(a transient-error, "we'll retry" message) when the truth was **"reconnect your
account"**. The authorization event was being reported on the wrong axis.

**Fix (behavior-changing, on purpose — this is the phase's point):**

1. Widened `Connection.status` to include `"needs_reauth"`.
2. Both pollers now write `status: "needs_reauth"` on a failed token refresh, aligning
   the persisted status with their own "needs re-auth" intent.

The normalizer already mapped `needs_reauth` (and its aliases `reauth_required`,
`requires_reauth`, `token_expired`, `expired`, `unauthorized`) to `needs_reauth`, and the
badge already had a distinct "Needs reauth" treatment — the only thing missing was a
producer that emitted the honest string. The transition-once alert behavior is preserved:
after the status flips off `"connected"`, the next poll returns early before re-alerting.

### Why expiry alone is *not* treated as needs_reauth

`RawConnectionStatus` intentionally does not carry `expiresAt`, and an expired access
token is **not** wired to `needs_reauth`. An expired access token with a valid refresh
token self-heals — `getValidAccessToken` refreshes it on the next poll. Only a *failed
refresh* is a true reauth signal, and that is now recorded explicitly by the pollers.
Flagging mere expiry would falsely alarm healthy connections.

## Credential at-rest security

The proposal's "credential references only" concern for the real threat (secrets at rest)
is satisfied by the AES-256-GCM envelope encryption already shipped:
`accessToken` / `refreshToken` / `apiKey` are encrypted at the `saveConnection` boundary
(`src/lib/connections.ts` `encodeConnection`, via `src/lib/crypto/secrets.ts`). The status
model carries no secret material — it is a typed health/authz signal only.

## Locked by tests

`src/__tests__/integration-status.test.ts` (table-driven) asserts:

- Every reauth-family raw status → `needs_reauth`; every sync/error-family → `sync_failed`
  (the explicit authz-vs-health separation), case-insensitive.
- The real poller→normalizer chain: a Google/Instagram `needs_reauth` connection surfaces
  as `needs_reauth`, not `sync_failed`.
- connected precedence, built-in sources, settings/config sources, and the unloaded
  (`unknown`) states.
- `deriveIntelligenceStatus` across all branches (both broken axes → `needs_attention`;
  built-in and connected capability paths).

`src/__tests__/integration-registry.test.ts` continues to cover registry shape + the
original error/reauth normalization cases.

## Known issues / TODO

- **Audit finding [MEDIUM][bug]**: `poll-google-reviews` cron does not paginate — reviews
  beyond the first API page are never ingested (`src/app/api/cron/poll-google-reviews/route.ts:116`).
  This means a location that receives many reviews per poll window will silently miss older ones.

- **Audit finding [MEDIUM][tech-debt]**: `src/lib/gbp-replies.ts` contains a private duplicate
  of `refreshAccessToken` that does NOT persist the refreshed token back to the connection store.
  Every subsequent call will re-refresh unnecessarily and the token will expire faster. Fix: delete
  the duplicate and delegate to the shared `getValidAccessToken` from `src/lib/google-token.ts`
  (which already persists the refreshed token).

- ~~**Audit finding [MEDIUM][security]**: Google OAuth callback (`src/app/api/oauth/google/callback/route.ts:93`)
  stores the connection without re-verifying the caller's session.~~ **FIXED 2026-07-30** — Google, Instagram, and Calendly OAuth callbacks now verify session and consume single-use state before writing.

- **Credential at-rest encryption** (AES-256-GCM via `src/lib/crypto/secrets.ts`) covers
  `accessToken`/`refreshToken`/`apiKey` at the `saveConnection` boundary. The `reb:tenants:all`
  Redis list cache now re-envelopes the 4 provider-secret fields on the Redis write and decrypts
  on read (shipped 2026-07-30) — no plaintext secret exists outside the Postgres at-rest boundary.
  The in-memory cache stays decrypted for the request lifetime; no-op without `SECRETS_ENC_KEY`.
  See `AGENTS.md` "Credential at-rest security" for the full picture.
