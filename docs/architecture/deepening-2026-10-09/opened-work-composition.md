# Opened work composition

Source: `reborn-1.0` at `e9511b044b217fc233bde6b174c12988eaa2e950`.
Stream: `opened-work-composition`; isolated branch, no production authority.

## Scoped PRD

A business member or maker opens saved work from its workspace or its System
to use the actual tool. The entrance must not change the reader selected for
that saved identity or silently change what the person may do.

Before: WorkspaceApp and SystemPage import and wire tracker, document, website,
onboarding, custom application and bounded application/scheduling tools separately.
After: one opened-work composition module owns those imports and dispatch. Each
entrance keeps its surrounding context, authority decisions and save effects.
System kinds with external or registry-only surfaces remain SystemPage concerns.
Existing System local-preview document/tracker fallback remains unchanged.

Existing rules: identity includes workspace and saved work; website v2 reader
selection does not grant publication; management, runtime use, Version editing,
creator-draft editing and Make real are independent facts. Native stop and
calendar-recovery restrictions remain. Requests and retained website attempts
must survive same-scope rerenders; changing scope must discard old tool state.
Local preview uses existing fictional adapters and establishes no Auth/provider
or production proof. No migration, API, dependency or domain-meaning change.

Deletion targets: duplicate tool imports, duplicate JSX prop wiring, caller-owned
website reader selection. Do not add a universal System registry, context provider,
memoization or lazy imports. Static graph is inspected; no bundle claim is made.

Owned files: `src/experience/workspace/OpenedWork.tsx` (new composition owner),
SystemPage tool dispatch/imports, WorkspaceApp tool dispatch/imports, directly
affected composition tests and this record. Update only the System surface
inventory entry. Location peer owns WorkspaceApp navigation/start/save/history
and WorkspaceLayout; website peer owns tool implementations/transports.

Failure cases: denied/failed reads, unsupported or missing work, unknown saves,
workspace stop, delegated read, member runtime without management, maker draft
without publish, mismatched website projection, stale responses and scope change.
Tools own read/write failure recovery; composition must not recreate that logic.

Acceptance: shared dispatch opens the same real tool for common products from
both entrances; existing authority matrix and save callback behavior stay intact;
reader version includes the bounded website projection; rerenders retain tool
state and scope changes reset it; existing local preview adapters remain usable.
System tools already reread/update their saved state. Their surrounding snapshot
has no refresh callback from WorkspaceLayout; no stale-view fix is claimed without
a failing behavior test. Workspace save callbacks still refresh/navigate as before.

## Implementation plan and exact checks

1. Trace dispatch, keys, save effects and authority; record baseline and add
   meaningful regression coverage before source changes.
2. Introduce a module-scope, typed opened-work composition owner. Compose it in
   both callers, retaining caller keys and callbacks. Keep unrelated surfaces.
3. Run `pnpm exec vitest run src/__tests__/opened-work-composition.test.tsx
   src/__tests__/systems-runtime.test.tsx src/__tests__/workspace-history.test.tsx`
   and affected website/preview suites. Retain initial failure and final output.
4. Run `pnpm typecheck`, `pnpm check:boundaries`, `pnpm check:ontology`,
   `git diff --check`. SQL/custom-client checks are required only if native
   contracts/permissions change; no such change is planned.
5. Use Croki preview_status then preview_open for fictional local UI proof at
   1440px/390px: populated/loading/empty/error/read-only and keyboard/focus.
   Never load repository production env or use real customer data.
6. Review identity, authority, acceptance versus verification, stale response,
   scope reset and compatibility; commit owned work, create/link a draft PR
   against reborn-1.0 and queue exact coordinator handoff.

## Handoff

Implemented one module-scope `OpenedWork`, shared by the two entrances. No tool,
transport, native permission, API or save/navigation function changed. The bounded
website projection now selects the same reader from System and workspace. The
System tool updates its own current state; workspace still invokes its existing
snapshot refresh. No stale System surrounding-context fix is claimed.

### Evidence and limits

Final local checks: 113 tests across 11 suites, 24 browser cases, typecheck,
boundaries, ontology, targeted ESLint and diff whitespace check passed. The added
stale-read fixture initially failed typecheck because its callback was not async;
that fixture typing is corrected and its 10-test suite passed again.

The new projection case failed on the starting runtime: 1 failed / 21 passed,
expected the native rebuild read but System selected v1. Initial output and final
check summaries are retained in [opened-work-evidence.txt](opened-work-evidence.txt).
The authority tests retain member app use without management, booking use without
pause authority, delegated read, and creator draft editing without publishing.
The new seam tests use real WorkspaceApp and website tools with closed fictional
responses: pending and unknown attempts survive parent rerenders without new reads
or replay; each save entrance keeps its snapshot refresh count and URL; work scope
changes discard superseded reads. Existing website and preview suites are included.

Croki preview proved the real bounded Staff requests application at CSS widths
1440 and 390, from both entrances: empty preview, desktop/mobile, keyboard tab/radio
focus and a fictional test record. Native website System confirmation was also
observed through a disposable closed fixture. Croki subsequently reported no
available automation host and permitted fallback. Existing shell Playwright with
installed Chrome then passed all 24 cases: two widths, two entrances, ready save,
loading, failed read, denied read, delegated read-only and missing custom work.
The empty cases converge on the workspace empty surface because no System is
selected. Saved website assertions check the acknowledged revision's remaining
one decision, not merely a successful POST. Focus, page errors, foreign network
and horizontal overflow are asserted. Screenshots in `test-results/` were inspected.

The first browser matrix was 16 passed / 8 failed: error text was visible but the
harness used an exact text element locator for text inside an alert. The corrected
alert locator passes; this was not a runtime repair. Initial traces/context and log
remain locally in `/tmp/opened-work-browser-initial-artifacts/` and
`/tmp/opened-work-browser-initial.log`.
The default Playwright Chromium binary was absent; the installed Chrome channel
was used. Supplemental website identity/archive reads deliberately return 503;
archive availability stays unknown. The iframe is fictional static HTML. These
runs do not prove Auth, hosted delivery, provider acceptance, production, or current
website preview hash qualification. No production env or customer data was used.

SQL, agency workflow and custom-client checks were not run: this changes no native
contract or permission. Full production build/chunk measurements were not run;
there is no bundle-size claim. Static caller tool imports fell from 9+7 to 1+1;
the composition owner imports the real tools and existing local preview adapters.
Runtime source is +70/-36 lines (net +34); callers alone are +20/-36. The typed
owner increases total source by 235 bytes, while deleting duplicate dispatch and
reader knowledge. Tests/docs are counted separately in the completion handoff.

### Overlap and integration action

WorkspaceApp overlap is exactly the import block and original render regions at
478 (tracker/document) and 668 (horizontal tools). Location/start/save/history
functions and WorkspaceLayout are untouched. Preserve that peer's functions when
combining these hunks. The website stream's public props and workspace/work sessions
remain unchanged. Inventory overlap is only the existing Systems experience row;
retain other streams' additions to that row.

A slow browser save refresh exposes a pre-existing location concern: `loadWorkspace`
clears selectedWorkId before awaiting `/api/workspace`, momentarily opening a new
website and dropping a settled notice. Fast batched DOM tests do not expose that
paint. The location peer received the exact observation and owns the fix. This
composition preserves same-scope mounted pending/unknown attempts and existing
keys; it does not claim that location bug is fixed.

Mandatory combined acceptance case: combine the location owner's refresh behavior,
then deliberately defer the same-work `/api/workspace` snapshot response after a
save. While it is pending and after it settles, verify the selected saved work,
mounted tool/attempt identity and truthful save notice are preserved. Fast batched
DOM proof alone does not satisfy this case. The coordinator owns reconciliation
and union proof against location PR #619 (`ebbeda6e2ea0402220461c0a050c6f36c4cd70ba`)
and website PR #620 (`8ff3578f485f4b207fbbf5be5af2a78d13faa70c`), supplied as
integration inputs; neither peer's source or worktree was edited here.

Proposed canonical evidence deltas (integration owner only): shared internal-work
dispatch is locally implemented; bounded website projection reader divergence is
reproduced then fixed; current authority facts remain independent. No domain noun,
System kind registry or strategic commitment changed. Remaining semantic question:
should System surrounding history/health refresh after an internal save? No stale
behavior is demonstrated here; do not equate a tool acknowledgement with refreshed
history/health verification. Next action is review/combine the three isolated UI
streams, rerun the exact suites below, and review the delayed-refresh case before
promotion. No main/production merge is authorized.

### Replaying the disposable browser proof

Create only the disposable route, then start a server with a clean environment:

```sh
mkdir -p src/app/preview/strelva/opened-work-proof
cp tests/fixtures/opened-work-composition-page.tsx src/app/preview/strelva/opened-work-proof/page.tsx
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" STRELVA_UI_PREVIEW=1 NEXT_TELEMETRY_DISABLED=1 pnpm exec next dev --hostname 127.0.0.1 --port 3429
```

In another terminal:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3429 PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test tests/opened-work-composition.spec.ts
rm src/app/preview/strelva/opened-work-proof/page.tsx
rmdir src/app/preview/strelva/opened-work-proof
```

Stop that server. The disposable route is absent from the committed runtime.
Final targeted suites are the three above plus `website-experience`,
`website-rebuild-experience`, `website-recovery-focus`, `workspace-ui-preview`,
`workspace-preview-route-context`, `workspace-preview-service-request`,
`workspace-preview-alias` and `workspace-place-preview-alias` under `src/__tests__`.
