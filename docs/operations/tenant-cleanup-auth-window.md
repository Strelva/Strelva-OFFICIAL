# Closed cleanup recovery Auth window

Prepared October 8, 2026. Execute only in the coordinator's owned final Auth
stack/app/Redis window. This is a separate two-case receipt, not a replacement
for the required 34 native cases or full eight-rung acceptance.

`tenant-cleanup-journey-window.mjs` uses the existing full-native environment,
stack-baseline qualifier, source inventory and exact-report validator. It checks
the original native manifest, exact owned local Auth/DB endpoints/keys, current
flags and disabled providers before browser execution. Only the runner's explicit
`STRELVA_TENANT_CLEANUP_UI_PROOF=1` switch is added; it is a test admission switch,
not a product authorization or server rollout. All server native flags remain
unchanged. It starts no stack/app/Redis process and changes no reviewer policy.

Apply the prepared wiring patch after source review:

```sh
git apply --check .scratch/full-model-completion-2026-10-08/tenant-cleanup-journey-window.patch
git apply .scratch/full-model-completion-2026-10-08/tenant-cleanup-journey-window.patch
```

The patch targets `scripts/check-full-model-journeys.sh` and was checked against
the coordinator's current reviewer-wired version. It adds early recovery-spec
preflight, validates the original 34-case report unchanged, invokes this window
while that runner still owns its app/Redis, then stops only the owned processes.
An original native failure remains failed even if recovery passes. An unrelated
native failure does not conceal potentially useful independent recovery evidence.

The ordinary invocation remains:

```sh
bash scripts/check-full-model-journeys.sh --profile full-native --bundler webpack
```

Inside that runner, the exact callback is:

```sh
run_clean node scripts/tenant-cleanup-journey-window.mjs run "$root" "$work"
```

This requires the runner's existing owned `env`, `runtime.env`, `source.json` and
`manifest-native.json`; it refuses manifest/source/flags/stack drift. To inspect
without any execution:

```sh
node scripts/tenant-cleanup-journey-window.mjs manifest
node scripts/tenant-cleanup-journey-window.mjs preflight .
node --test scripts/tests/tenant-cleanup-journey-window.node-test.mjs
```

The window writes only its new private `$work/tenant-cleanup-recovery` evidence
directory: exact manifest, original native contract/report state, source before
and after, stack qualifications before and after, browser log, raw JSON report,
screenshots/traces/native receipt attachments and its separate `receipt.json`.
It refuses to overwrite an existing directory. Pass requires exactly the accepted
1440px and 390px title/project identities, one passed attempt each, zero skips,
retries, extras, global errors or flaky results. Both reports retain
`fullReleaseQualified:false`; provider and commercial gates remain open.

The actual fixture loads the operator editor, removes only a fictional unpaid
tenant, observes committed database removal with provider pending, then reloads
the deleted editor URL into the standalone super-admin recovery page. It recovers
the exact native receipt through GET, requires typed confirmation, retries that
id, reads native revision progress and checks ordinary-person UI/API denial and
retired-slug reuse refusal. It never fabricates provider completion or weakens
current super-admin authority.

Preparation evidence: three node tests pass against the existing exact-report
validator, including unchanged native 34 identities and rejection of wrong title,
project, duplicate, missing/extra case, skip, retry, global error, auth bypass,
flag/stack drift and provider credentials. Scoped ESLint, patch applicability and
shell syntax checks pass. Playwright lists the two real Auth cases. No native DB,
Redis process, Auth, browser, Docker, build, typecheck or provider operation ran
while preparing the window. Coordinator must execute it on frozen composed source.
