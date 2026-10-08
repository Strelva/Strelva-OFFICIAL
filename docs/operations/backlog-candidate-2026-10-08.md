# October 8 backlog candidate — prepared, not released

Jacob requested parallel implementation through the GitHub backlog. This private
candidate combines nine reviewed drafts on `release/security-runtime-20261007`
at baseline `e9ac136f9a0eecf362421c4046a333f0c20496fd`. It does not replace the
[deployed-release owner](security-runtime-production-2026-10-07.md), close issues,
authorize a migration or establish full 1.0 acceptance.

## Prepared behavior

| Draft | Change | Remaining boundary |
| --- | --- | --- |
| [591](https://github.com/Strelva/Strelva-OFFICIAL/pull/591) | Recovery instructions match scoped runtime permission recovery | Hosted disaster recovery and historical empty-only catalog reversal remain separate |
| [592](https://github.com/Strelva/Strelva-OFFICIAL/pull/592) | Service role cannot directly update, delete or truncate audit history | Hosted role graph unproven; explicit lifecycle deletion exceptions remain |
| [593](https://github.com/Strelva/Strelva-OFFICIAL/pull/593) | Public business page/MCP expose bounded verification evidence honestly | Google verification unknown; recurring domain-proof refresh unqualified |
| [594](https://github.com/Strelva/Strelva-OFFICIAL/pull/594) | Content receipts use the actual authorized actor; native Live requires verified owner approval | Actorless converted automation refused; storefront delivery/provider undo unproven; denial HTTP 500 remains a usability followup |
| [595](https://github.com/Strelva/Strelva-OFFICIAL/pull/595) | Nested prospects SQL checker removes its owned cluster directory | Closed #500 is background, not reopened; hosted CI remains separate |
| [596](https://github.com/Strelva/Strelva-OFFICIAL/pull/596) | Exact public booking routes, verified sign-in freshness, guarded Ready retry, actual native fixtures | Anonymous approval expectations are replaced by refusal plus signed-owner proof, not fulfilled account-free promises |
| [598](https://github.com/Strelva/Strelva-OFFICIAL/pull/598) | Booking/operator email and CRM behavior move to platform owners | Partial extraction: 199 legacy edges in 91 files; cold recipient API requires registry initialization |
| [599](https://github.com/Strelva/Strelva-OFFICIAL/pull/599) | Website refresh observes the current System revision without writes or silently replacing rehearsal | Stacked on 596; local Auth matrix passes, hosted qualification remains |
| [600](https://github.com/Strelva/Strelva-OFFICIAL/pull/600) | Ask prepares, Try previews, owner approval creates a native inquiry and request-only booking service | Existing converted/bound tenant and connected calendar required; fresh provisioning/provider onboarding remain Asked Requests |

All drafts remain open. Seven target the release branch, 599 targets 596's
branch, and 600 was created against `main`. The aggregate candidate targets the
release branch so its combined source and migration inventory can be reviewed
without implying a main-targeted release. Component PRs are review breadcrumbs,
not independent release packets to merge in arbitrary order.

## Integration invariants

Runtime checkpoint `ded8e14d9658a034e65170403c29095756f1504a` contains all nine
lanes. `753edc9321087df55e90f8ab1fb11636de8fd76f` adds only faithful browser
fixture/profile and critical-gate repairs, with their testing instructions. Runtime and SQL are
unchanged between these checkpoints.

Proposed batch 12 contains five **unapplied** forwards, with guarded companions:
`20261020110000`, `20261020111000`, `20261020112000`, `20261020113000`,
`20261020114000`. Prior batches and prior proposed inventory retain baseline
contents. Ask forward SHA256:
`fec9e56cf6c214424fd24fd35eb7f9ca3f012a28742da08d88ad09e1b8bd64b2`.
Every writing System sync requires `canWrite === true && !readOnly`, including
Ask. Current permission recovery retains the original 85 files/238 signatures
and 188 active original scoped RPCs; it does not turn later APIs into the old
destructive catalog-reversal contract.

## Local evidence

The final compound `pnpm check:ci` passes at
`753edc9321087df55e90f8ab1fb11636de8fd76f`: lint, typecheck, boundaries (199 legacy
edges/91 files), ontology, workspace SQL, **8,614 tests/50 skips**, coverage floors,
configured audit, production build, **94 public browser passes/332 profile skips,
39 workspace passes and 20 surface passes**. No browser retry or flaky result is
reported. This is local CI-faithful proof, not a hosted Actions run.

Fresh real loopback Auth/Postgres/Redis passes **14 enabled and 8 disabled
journeys**, zero retries, at `72e28786ff2269279b936cb68df23906e31adaf6`.
All **1,209 public RPCs** pass read-only transaction checks. The expanded
critical-case validator at `753edc93` also passes both retained reports, requiring
the new two stale-refresh cases. Its regression suite rejects their absence,
incomplete execution and retries. Only the validator/tests/instructions changed
between these checkpoints. Retained final captures are in ignored
`output/release-safety/backlog-journeys-{on,off}-final-20261008/`.

- At the runtime checkpoint, Ask passes **271 ordered migrations and four
  handler/SQL cases**. `output/ask456/` retains the local results. The handlers
  use actual Request/Response and socket SQL, with mocked email/lead/config/
  limiter boundaries; this is not hosted network/PostgREST/Auth proof.
- Current-tail recovery passes **271 migrations/45 tails**, two 188-RPC rounds,
  exact catalog/public rows/ACL and ordinary behavior. Receipt:
  `output/release-safety/batch8-1791471924494/runtime-recovery-receipt.json`, SHA256
  `72197bfaae0cbcfb89ad94d1f7f0d063b555f20a5f0c3924ddca2d094e25512c`.
- Complete ordered workspace upgrade passes 271 migrations and its existing
  reader, audit, mandate, calendar, writer-lock and conversion contracts.
- Agency workflow passes **271 ordered migrations**, including public
  verification/provider-owner contracts; owned cluster/socket cleanup is verified.
  Custom-repository compatibility passes **196 checks, zero skips/failures**,
  including 11 executable contract cases. Structural checks read local sibling
  files and V1 checks available pinned sources; no exact checkout/deployment claim.
- Five separate UI preview specs pass **50 browser cases with zero retries**
  at `f666e9d1`. Fictional/intercepted data, desktop/mobile and permission/error
  states are covered. Seventeen captures are retained in ignored
  `output/release-safety/backlog-preview-final-20261008/`.
- Full-history redacted gitleaks passes through `ded8e14d`: 2,811 commits,
  27.77 GB scanned, no findings. Pair it with the final committed source/evidence
  tail using `gitleaks git --redact --no-banner --log-opts='ded8e14d..HEAD'`.
  The aggregate PR records that result; retained log:
  `/tmp/strelva-backlog-final-secrets-tail-20261008.log`.
- Configured dependency audit exits zero. Raw metadata still reports one HIGH:
  accepted dev-only ESLint/braces `GHSA-vfj7-8cjw-p6xm`, no patched version.
  Existing policy is in [the October 5 audit](reborn-integration-audit-2026-10-05.md).
  This is not a zero-advisory claim or a new waiver.

Exact source is recorded at the start of `/tmp/strelva-backlog-final-*.log`.
Local private receipts/logs are retained, not published as credentials or
customer data. Lane-specific owners retain narrower implementation proof and
known limitations; the aggregate does not strengthen their claims.

## Preserved failures and corrections

The first combined full unit run had one stale publish-actor mock assertion;
594 corrected its incomplete mock without changing product behavior. Earlier
journey failures and ENOSPC interruptions remain in dated stream evidence.

The first complete CI attempt passed 8,609 tests/50 skips, coverage floors and
production build, then failed public smoke: a provider workspace fixture was
run with workspaces off. The fixture correctly reached the release gate. The
second attempt again passed these gates and public smoke (94 pass/332 skip),
then had 37 workspace passes/two failures from a retired eight-row Next/Previous
agency fixture. Its broad mock returned WorkspaceSnapshot to the current strict
batched clients endpoint. Surface smoke was not reached.

The fixture repairs retain provider permission assertions under the explicit
workspace-on command and use the actual 100+2 client page/cursor contract. They
check keyboard Show more, preserved rows/queue, named unavailable-client retry,
exact client/work opening, and no discovery writes or per-client fanout. Runtime
gates, access checks and malformed/foreign/error tests are unchanged. An
independent source review found no actionable findings. The third full CI
still failed its request-count assertion: development Strict Mode cancelled one
initial read before its replacement completed. The fixture now requires exactly
one completed initial page and permits only one explicitly aborted initial
attempt; subsequent page/retry requests remain exact. A focused mobile assertion
also had to open the real responsive navigation before inspecting its workspace
selector. Both final focused cases pass with zero retries; viewports were
inspected. Retired navigation expectations remain historical, unqualified.

The first final Auth matrix had 13 enabled passes/one Make real failure and eight
disabled passes. An unchanged narrow retry reproduced the failure. The unscoped
rebuilt-site list selector switched to the earlier Waiting on you row once
details loaded. The retained frame shows the actual Ready Possibility with
enabled Make real. The Home/hot-reload hypothesis from compressed trace DOM was
withdrawn. Scoping the single row to Possibilities preserves all approval,
refusal, POST 200 and partial-result assertions. Its corrected narrow case passes;
the filtered wrapper intentionally refuses to qualify the absent full suite.
The subsequent full 14/8 matrix passes. No runtime guard was weakened.

Failure logs are retained separately as `final-ci-first`, `final-ci-second`,
`final-ci-third`, `final-journeys-first`, and `final-make_real-ambiguous-first`
under `/tmp/strelva-backlog-*-20261008.log`, with private copies of generated
browser artifacts under `output/release-safety/`. Passing reruns do not erase them.

The final Auth preflight initially failed on Docker API EOF before any cases.
Docker's VM had stopped during disk exhaustion while its control plane remained
alive. Supported force-stop/start recovered engine 29.6.2/API 1.55 and `/_ping`
HTTP 200 `OK`. No Docker data, volumes or containers were deleted. Croki preview
returned explicit unavailable/DoNotRetry; automated browser proof is separate,
and no Croki visual proof is claimed.

## Hosted and product limits

The October 8 read-only GitHub inventory still has **224 open issues**. Projects
draft tasks remain inaccessible without `read:project`. No issue was closed.

All nine component heads have zero hosted checks at inspection. Release/head
workflow revisions filter PR targets to `main`; draft readiness alone cannot
make those release-targeted runs appear. Actual hosted `main` workflows differ.
PR 600 targets `main` but has a merge conflict, which suppresses `pull_request`
runs under [GitHub's documented behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).
No bases, workflow triggers or Actions settings were changed. Hosted Actions,
a later combined main-targeted review and intended-target qualification remain
separate evidence.

Continuation triage found #510 already implemented in the baseline: an active
provider verified for the specific effect is required; a tenant link grants no
provider authority. The old helper is an email alias and later owner-link guards
check execution effects. Current ordered upgrade and workspace SQL exercise the
existing provider/effect fixtures. The stale owner-ask handoff is marked
historical; no duplicate migration or issue closure was made.

No production migration, deployment, release flag, provider write, email, billing,
DNS, external commitment or merge occurred. Existing client operation, full
hosted recovery, provider delivery, customer use and recurring economics remain
unproven by this candidate. Local gates and inspected desktop/mobile outputs are
complete. The next action is to qualify the exact intended release target
under its separate authority and checklist.
