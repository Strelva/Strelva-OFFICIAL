# Ontology Phase 4 (#10) — Content resource / revision / publication spine

**Scope:** verify-and-harden of the *existing* content-versioning model — **not** a new
abstraction. The proposal's "resource / revision / publication storage" already exists,
content-scoped. This pass read the whole append → get → restore path, confirmed it is
sound (no restore/order/draft bug — unlike the Phase-5 pass, no real gap surfaced), and
locked the semantics with tests so the invariant the agent's undo tool depends on can't
silently drift.

## The model that already exists

There is exactly one versioned resource today — **content sections** — so the spine is
content-scoped, not generic:

| Ontology concept | Where it lives | Shape |
|---|---|---|
| **Publication** (the live thing) | `content` table via `setContent`/`getContent` (`src/lib/storage/content-store.ts`) | the current published section data, Redis-cached |
| **Draft** (unpublished edit) | `draft_content` table via `getDraftContent`/`setDraftContent`/`clearDraft` (`src/lib/storage/draft-store.ts`) | a pending edit awaiting approval |
| **Revision** (history) | `content_versions` table via `appendVersion`/`getVersions`/`restoreVersion` (`src/lib/storage/version-store.ts`), typed `ContentVersion` | append-only log of every published state |

A `ContentVersion` carries `{ id, section, data, author, timestamp, status, changes }`.
`changes` is the field-level diff (`diffFields` in `src/lib/utils.ts`) computed at publish
time between the previous live content and the new content.

Both a Postgres branch (`DATA_SOURCE=postgres`) and a dev-file branch back each store; the
dev file is the source of truth for local/tests.

## Semantics (verified)

**append.** `appendVersion(section, data, author, tenant, changes?)` mints a
`v_<ts>_<rand>` id, stamps `status:"live"`, and prepends. The dev-file path `unshift`es the
new version and marks every earlier `status:"live"` → `"rolled-back"`, then caps history at
50 (`slice(0, 50)` keeps the newest 50, drops the oldest). The Postgres path inserts a row;
ordering is enforced on read.

**get — newest-first, consistently.** `getVersions` returns newest-first on **both**
branches (dev-file returns the `unshift`ed array as-is; Postgres orders `created_at DESC`,
limit 50). This is a load-bearing invariant: `buildUndoTool` (`src/lib/agent-shared.ts`)
treats `versions[0]` as the current live content and `versions[1]` as the prior state that
"undo" reverts to. The lock test asserts this order explicitly.

**restore — an append, never a rewind.** `restoreVersion(section, versionId, tenant)`:
1. finds the target by id in history (returns `null` — a safe no-op — if not found, and on
   an **empty** history, *before* any write);
2. writes the target's data live via `setContent` (the same publish path as any edit);
3. `appendVersion`s a **new** head equal to the target's data, tagged with a
   `{ field: "_restore", … }` change marker.

The prior head (the pre-restore live state) is left untouched in history, so a restore
loses nothing — you can restore *forward* again to undo the restore. History is append-only;
`restoreVersion` never mutates or deletes an existing revision.

**publish clears the draft.** The section-content approval branch in
`src/lib/event-actions.ts` writes the draft live (`setContent`), resolves the event,
`appendVersion`s the published state with the computed `diffFields`, records the section
update, revalidates, and *then* `clearDraft(section, tenant)` — the draft is cleared only
after the live write succeeds, so a storage failure can't produce a "published but draft
gone" state. The `/api/content/[section]`, `/api/publish`, and `/api/admin/drafts` routes
follow the same append-then-clear order.

## What was deliberately NOT built

A **generic multi-resource resource/revision/publication abstraction** was intentionally
not built. Content is the only versioned resource in the platform today; a generic
`Resource<T>` + revision table keyed by resource-type would be premature abstraction —
unused scaffolding maintained for a second resource that does not exist. Three similar
lines beat a speculative framework. If a second versioned resource ever appears and proves
the same need, that is when the shape gets extracted (the "two repos prove it" rule).

The other Phase-4 proposal items — the canonical `/api/v1/*` wire contract and the
execution-based custom-repo conformance check (`pnpm check:custom-repos`) — are already
done and live; see `AGENTS.md` (Multi-tenant architecture) and
`scripts/custom-repo-workspace-check.ts`.

## One cosmetic inconsistency (left as-is, not a bug)

The dev-file `appendVersion` flips earlier `status:"live"` → `"rolled-back"`; the Postgres
`appendVersion` does not (older rows read back as `"live"`). This is harmless: `status` is
never read for logic or display — `VersionHistory.tsx` and `buildUndoTool` both key off
list *position*, not `status`. "Fixing" it would add a Postgres `UPDATE` on every append for
a field no consumer reads (YAGNI), so it is documented rather than changed.

## Test coverage

`src/__tests__/content-versioning.test.ts` locks the model against the dev-file path
(8 cases): empty-history get + restore no-op, unknown-id restore no-op, N-append newest-first
order (and the dev-path `status` flip), `changes` recording, restore-appends-a-new-head +
preserves-prior-head (no data loss) + live content reflects the restore, the `_restore`
marker, and single-version restore. The existing `src/__tests__/version-store-postgres.test.ts`
covers the Postgres row mapper / insert path.
