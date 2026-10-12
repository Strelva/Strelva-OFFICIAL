# C02 — local pinned consumer proof

Depends on C01 commit `30a22e0cc65e28af2aed70f3b09922760c31bf5a`.

Existing behavior: `runWorkspaceChecks` already supports `verifyPins` and `checkoutRoot`, refuses missing/dirty/wrong-SHA strict checkouts, and reads pinned call sites. The CLI assumes somebody has prepared the checkouts. Default missing siblings count as skips.

Gap: repeatable local preparation and retained per-consumer exact-source receipt. Cross-private-repo CI checkout access is separately gated; no new credential or repository secret is authorized.

Owned files: new `scripts/custom-repo-pinned-check.ts`, existing `scripts/custom-repo-workspace-run.ts` (opt-in CLI route), scoped runner tests and this lane record. Keep release manifest pins/profile requirements unchanged. Reuse the strict workspace/conformance checker.

Implementation: validate the manifest, then fetch only each exact full SHA from explicitly selected existing local clones into new detached temporary repositories. Disable global/system git config, hooks, credential prompts, non-file transports, lazy remote fetch, submodule recursion and checkout filters from inherited configuration. Never reset/stash/checkout/fetch an owner's folder. Store exact platform source, manifest digest, local HEAD/status count, already-fetched origin refs, selected pin, isolated checkout SHA/cleanliness and per-consumer checks in a JSON receipt. Deployed SHA is null/unread; tenant mapping stays unconfirmed when the manifest says so. Missing local source/pin or a failed clone is an explicit failure, never a skip or mutable-source fallback. No package install/build occurs in a consumer.

Failure tests: missing source, unavailable/malformed pin, malformed tenant/path traversal, changed checkout, wrong SHA, absent sibling, profile mismatch and incompatible removed call site; success from a dirty source with old reviewed pin; exact source/receipt and no owner changes. Existing strict-checker tests own wrong/dirty checkouts; reuse them.

Acceptance: all nine profiles run at clean exact manifest pins, zero missing-sibling skips, per-consumer proof retained. Hosted CI/Auth/provider/deployment/customer mapping remain unproven. No live client repository changes.

Deletion targets: none; expose preparation through the existing checker rather than build a second compatibility guard.

Checks: targeted runner + existing consumer contract/conformance/release/profile tests; `pnpm typecheck`; scoped ESLint; `git diff --check`; actual local nine-pin run through the opt-in CLI. No broad suite, Next build, native SQL, Docker/Auth or production/provider reads.

## Running the local-only proof

From this isolated platform checkout:

```bash
CUSTOM_REPO_MATERIALIZE_PINS=1 \
CUSTOM_REPO_LOCAL_SOURCE_ROOT=/Users/jacobrhinehart/Desktop/strelva \
pnpm check:custom-repos
```

`CUSTOM_REPO_LOCAL_SOURCE_ROOT` is the parent containing the existing local consumer clones, not a network URL. `CUSTOM_REPO_PROOF_OUTPUT_ROOT` optionally selects a parent for a new owned run directory; default `.validation-artifacts/custom-repo-pins/` is ignored. The command prints the receipt path. It keeps successful and failed owned output; remove only explicitly selected run directories when no longer needed. Default development checking is unchanged.

The runner also passes a sanitized Git environment through the existing workspace checker (`scripts/custom-repo-workspace-check.ts`). No global/system Git config, inherited credentials, replacement-object source graph, origin fetch, lazy remote fetch, consumer hook or consumer command is needed. The shallow detached repositories have their own object databases and contain only source from the selected pin. This is hermetic pinned-source checking, not hermetic consumer build qualification.

## Local evidence, October 9

- First actual run: all nine consumers materialized at the existing reviewed manifest pins; 223 pass / 0 fail / 0 skip. A second run after receipt/source validation changes also passed 223/223.
- Runner tests exercise dirty/ahead owner source, missing local source/pin, malformed pin/tenant/path, source URLs, duplicate tenants, symlink output protection, parent-repository discovery refusal, named profiles and deliberately removed pinned call sites. Existing release-check tests cover dirty/wrong/missing exact-pin checkout refusal.
- Initial runner fixture detected self-generated untracked output in platform dirty count. The receipt now captures platform source state before materialization; it does not count its own newly created artifact as prior source. Initial typecheck required the Next-augmented `NODE_ENV` field on the sanitized Git environment; Git receives a constant test value.
- No local consumer source checkout, working file, manifest pin or shared state was modified. The staged/committed source remains prepared in this branch. Receipts retain exact platform SHA/dirty count and manifest SHA-256; precommit runs explicitly show dirty platform source. The final committed-source run is returned with its exact receipt path.
- SmokinBuddha receipt retains `tenantConfirmed:false` and its manifest's UNCONFIRMED evidence. Every `deployedCommit` is null. Origin refs are already-fetched local metadata with unknown freshness.

Remaining acceptance: review C01/C02 against the approved F01 union and rerun contracts there; hosted cross-private-repo CI needs separately approved access/secret configuration. Fresh deployed-SHA and real customer-mapping reads require approval. Consumer builds, Auth, provider behavior and production compatibility were not tested. There is no runtime UI change to qualify.

Proposed coordinator delta: C02 local pinned-source implementation and behavior are prepared, with nine exact-pin source profiles proven and zero missing-sibling skips. Retain hosted CI/deployment/customer mapping as unknown/gated. Reuse this factory proof to reduce manual owner-checkout coordination; shared model and both vault updates/reviews stay with the coordinator.
