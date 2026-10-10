# Standing-check history — prepared October 8, 2026

Standing checks keep 200 recent runs and 500 recent history events in their saved-work payload. Those are current snapshots, not evidence retention limits. `investigation_history_events` retains every run and command event, atomically with the revision-checked saved-work update. The new migration first copies all existing investigation evidence. History rows cannot change; source removal does not remove check evidence. Deleting the containing work retains the existing workspace deletion boundary and cascades its history.

`GET /api/bounded-work?productId=investigations&workId=<id>&view=history&limit=50&beforeRevision=<revision>` returns newest-first complete run pages plus `nextBeforeRevision`. The cursor is an exclusive revision, so new runs cannot shift older pages. Every page and old-request lookup rechecks verified identity and direct membership. `requestId` is unique for the check's lifetime, including after payload eviction and process restart. Unknown history storage fails explicitly before another run. V3 exports include the full `investigation_history` category.

The last successful public-page snapshot survives more than 200 consecutive failures; recovery compares with that last good evidence. A failed read records its reason and retry schedule without inventing agreement. Existing accepted documents and outputs are unchanged.

Local proof: 501 runs, including 300 consecutive failures and 201 successes, restart at run 251, old-key replay, complete five-plus-page history, and current selected-grant health tests. These are deterministic tests. Native SQL upgrade, concurrent SQL writers, Auth/Redis journeys and actual provider operation remain integration qualification requirements.

## Client-record cutover

Before cutover, existing Redis writes, bounded Postgres mirroring, repair, backfill and seven-day parity remain. A store named in `STRELVA_CLIENT_RECORDS_READ` now requires dual write enabled, Postgres available and seven-day qualification. Failed parity/read queries are explicit errors; removing the read flag is the deliberate compatibility rollback.

Connections and storefront order capture write to Postgres first after qualified cutover. Unconfirmed durable writes fail the request. Redis becomes a best-effort rollback mirror. Connection revocation is a durable tombstone; saved secret fields remain encrypted. Orders dedupe atomically by tenant plus provider external ID, including legacy random record IDs and concurrent retries. Store totals use the complete durable history and exclude unsigned records. This does not change the client's Stripe as financial authority.

Other client-record writers retain their existing pre-cutover write adapters; their Postgres-first mutation qualification is not established by these connection/order tests. Historical completeness still requires actual backfill/retention inventory and seven-day parity per store.

## Google Make real

`make_real_live:google_listing` uses its own default-off `STRELVA_GOOGLE_MAKE_REAL_RELEASE` environment switch plus the existing workspace release rows and Systems gate. No flag is activated by this change.

An effect names the existing governed draft event, tenant, location and SHA-256 from `googleMakeRealDraftDigest` over the canonical frozen draft, workspace/location, record revision, Version pin and maintenance pin. The adapter rechecks the current owner, exact selected connected grant/location and paused/API-access state, then invokes the existing claimed publishing approval executor. Record and Version pins, provider pacing, receipts and unknown-effect handling remain with that executor. Recovery reads the exact receipt by idempotency key, independent of recent-receipt pagination. Readback rereads Google's current location/post/reply. Compensation calls the existing governed undo; unknown undo effects cannot be replayed.

Google project approval, ordinary business grant, exact release configuration and actual provider qualification remain required. A listing authorization is not proof of a working connection or API approval. No provider writes were performed.
