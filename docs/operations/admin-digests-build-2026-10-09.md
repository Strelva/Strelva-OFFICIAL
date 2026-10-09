# Admin digest request-time rendering repair

Verified locally on October 9, 2026.

## Change and dependency

`/admin/digests` now exports `dynamic = "force-dynamic"`, so Next renders it
for each request. No authorization error is caught or suppressed, and no
credential, development bypass or authorization helper is changed.

The patch targets `release/security-runtime-20261007` at
`3f3eac4f341bb844f4775b8f2786dc851cf086e5`. It does not duplicate the
[security candidate in #614](https://github.com/Strelva/Strelva-OFFICIAL/pull/614).
Its audited current-operator behavior depends on that candidate and its migration
prerequisites. On the composed candidate, the existing
`await authorizeAdminOperatorRead("admin.digests.read")` still precedes
`listPendingDigests()` without alteration.

The same three added page lines and regression were applied to exact #614 head
`083e992fd3a2bb8b9a3ff339d351d34c6206aa0f` for local build validation.
The composed local commit was `6b1dc80913d6f208d35fc4b421cd1e2be216f4b7`;
this is a validation composition, not the publication branch.

## Evidence

- Before: the new rendering regression failed, and the preceding resource-qualified
  build failed while prerendering `/admin/digests` without a current operator.
- After: release-base rendering and maintenance-digest regressions pass (4 tests),
  and scoped ESLint passes. Standalone `pnpm typecheck` passes under the same no-upload
  configuration variant; all tracked bytes and generated-file state restore exactly.
- On #614 plus this patch: 48 focused tests pass. Six isolated page/helper cases
  cover the dynamic export, missing current operator, revoked authority,
  audit-storage failure, admission completing before the data reader, and
  authority rechecked on a subsequent invocation.
- The composed full no-upload build exits 0: compilation, TypeScript, all 246
  static-generation tasks and final optimization complete. Its route report marks
  `/admin/digests` as dynamic; the page is absent from prerendered routes.
- Independent review confirmed unchanged admission, authentication, server-client
  and admin-layout blobs, and independently passed the committed regression.
- The publication test bytes match the composed test exactly. Publication page
  bytes match after removing only #614's pre-existing admission import and call.

Build environment: Node 24.19.0, pnpm 10.34.5, Next 16.3.8, two-CPU affinity,
6 GiB Node heap, and over 25 GiB disk free during the run. Peak process RSS was
5,907,600 KiB. Compilation took 2.8 minutes; TypeScript took 117 seconds.
The frozen package and lockfile were unchanged.

## Safe qualification and limits

The local build temporarily used the installed Sentry wrapper's supported options
`telemetry: false`, `sourcemaps: { disable: true }`, and
`release: { create: false, finalize: false }`. Next telemetry was disabled;
provider credentials/DSNs were absent, and email and development-access bypasses
were off. A supplemental Sentry egress guard recorded 14 Node processes and zero
attempts. All tracked bytes were restored exactly, including `next.config.ts` and
`tsconfig.json`; the original absence of `next-env.d.ts` was restored.

This is a successful no-upload configuration-variant build, not qualification
of an unmodified telemetry-enabled build. No such ordinary build was run.
Node 22 CI, hosted execution, authenticated HTTP/native-database behavior and
production deployment are not established by these checks. The isolated page
fixture is unit-composition evidence, not end-to-end authorization proof.
No production credentials, migrations, deployment, telemetry transmission,
provider write or customer-data upload was performed.
