# Provider health alerts — issue #271

Prepared source only. No migration, flags, provider writes, email, DNS change or
deployment is authorized by this packet. Synthetic form submission is still
unimplemented; the existing inquiry rehearsals are not proof of a public
website form accepting a submission.

With `STRELVA_OPERATOR_QUEUE_RELEASE=1`, agency Home reads the current provider's
health queue through `read_provider_health_alerts`. The additive migration
`20261020143000_provider_health_alerts.sql` requires the actor's verified
email and current membership in the named agency, current provider relationship,
active seat and active client staff assignment on every read. No super-admin or personal customer membership is
required. A provider mark alone grants nothing. The SQL reader does not mutate
records, retry an accepted write, or expose receipt payloads, secrets or raw
provider error messages. This read permission does not check agency KYB or
grant permission for an outside effect. The existing effect gates still own
writes.

The projection includes domain downtime, domain-registration expiry, SSL
certificate expiry, seven-day domain verification, stored website health,
current published-revision failures, listing and outside-write read-back failures,
and disconnected calendars on a live booking System. It reads the existing
sources; no second alert store or approval authority was created. Provider and
staff revocation remove access on the next read. Missing/stale cached evidence
is named as a queue gap. Hosted evidence must match the current publication's
revision and hash and be checked after publication within 50 hours; old healthy
revisions cannot certify a new publication and unpublished failures are excluded.
Cached tenant evidence is projected only through authorized links and Systems on the current page.

The domain and website crons retain evidence and stop global
`LEAD_NOTIFY_EMAILS` health mail while this flag is on. Required domain evidence
storage fails the cron if Redis is absent or unreachable. Flag-off legacy
delivery remains unchanged. Businesses without a current staffed provider do
not gain a provider queue or synthesized recipient; their existing internal
operator source records stay available. Global health email is suppressed
portfolio-wide when this flag is on; no new unassigned notification lane is
implemented here. Certificate checks perform a bounded DNS-plus-TLS operation
to a validated, pinned public IPv4 address with hostname verification enabled;
failed or unavailable expiry stays unknown. They send no HTTP form request.

Local checks: focused provider/certificate/cron/health/agency projection units,
`pnpm typecheck`, targeted ESLint, and `git diff --check`. The rolled-back native
SQL fixture is `tests/provider-health-alerts-schema.sql`, run through
`PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-provider-health-alerts-sql.sh`.
The root coordinator ran it successfully across all 277 ordered migrations:
current verified actor, provider/seat/staff, revocation, service-only ACL,
sanitized listing/calendar and current-publication evidence, missing/stale
health, actual read-only transaction and rollback/reapply catalog parity.
Final log: `/tmp/strelva-271-native-qualified.log`. Its owned cluster cleanup
completed with no remaining listener. Two earlier fixture failures are retained:
`/tmp/strelva-271-native-failed-fixture.log` (fictional live System lacked a revision pointer)
and `/tmp/strelva-271-native-failed-readonly-flip.log` (Postgres refused changing back to
read-write after read-only queries). Both fixture corrections were re-run;
the actual read-only gate remains in the final proof.

The coordinator also rendered 11 fixture scenarios across five widths from
320 to 1600px, including keyboard/focus and overflow checks. Retained evidence:
`.scratch/provider-alerts-ui/` and `/tmp/strelva-271-ui.log`. The dev-only
`/preview/strelva/provider-alerts` fixture reuses the production
`AgencyQueueList`; ready/missing/empty/revoked states use fictional alerts.
The full `pnpm check:agency-workflow` also passed all 277 ordered migrations,
including payer concurrency and exact rollback/reapply/read-only projection checks
(`/tmp/strelva-271-agency-workflow.log`). Actual signed-in Auth and a
provider-specific browser journey remain unqualified by this packet. No local result
establishes deployed routing or provider operation.

The combined issue checkout initially reported 9,091 passing unit tests,
67 skipped and 15 release-inventory failures: this migration was not classified.
Its boundary check also rejected the workspace importing the legacy tenant store.
The repair appends only proposed, unapplied batch 17 to
`scripts/release-safety/batches.json`; every historical batch, digest and recovery
scope is unchanged. The forward SHA256 is
`412550da8b83094487126a1d0b44a883672bf96504aeee6a00ec30d05a6023f6`;
the rollback SHA256 is
`0d1fd0971f14ded3e8353836c76fd1d543def76f11ece1a0cded9eca7c4bf6fd`.
Both SQL files remain byte-identical to the qualified source. Batch 17 is not
added to the active staging packet and grants no release or flag authority.

`src/platform/infra/domain-health` now owns the existing domain-health store
and evidence types. The legacy `src/lib/domain-monitor-store.ts` and scanner
type exports re-export that owner. Redis keys, 30-day TTLs, signatures,
snapshot shape and required-store behavior are unchanged; a compatibility test
exercises writes and reads through both paths against the same mocked store.
The repair passed 151 tests across the three release suites, ten provider-health
suites and two boundary suites, plus `pnpm check:boundaries`, scoped ESLint,
`pnpm typecheck` and `git diff --check`. The first repair typecheck caught an
unchecked mock-call access in the new test; the guarded access was rerun.
These focused checks do not establish that the coordinator's full combined
suite has passed; its final combined run remains separately owned.

Next: run a signed-in current-provider queue journey against the local ordered
schema when the separately owned disposable Auth stack is available.
Complete a separately specified synthetic form-submit contract that cannot
send email or create customer records, then test each managed-site consumer;
do not close #271 until its original form-submit acceptance is met.
