# E04 descriptor/schema conformance preparation

Status: prepared scope, blocked on A07 owning-writer authority qualification.
No tool execution, outside-write wiring, exposure, schema or grant changed here.

## Existing behavior

Ask's `ASK_TOOL_CATALOG` in `src/platform/ask/contracts.ts` owns tool IDs,
read/draft authority, tenant mapping and connection-use metadata. `buildAskTools`
in `tools.ts` owns Zod input schemas and fresh `authorizeAskTool` checks; writes
prepare changes and hand them to Needs you. `tenant-tools-adapter.ts` already
routes all tenant tools through `src/lib/agent-shared.ts` with `forceReview: true`.
Keep that one door; do not create a second agent implementation.

MCP's `protected-tools.ts` owns seven protected tools and hand-written JSON Schema.
`approve_quote` separately has a strict Zod `priceApproval`; website tool arguments
are validated by native website adapters. MCP discovery stays public/constant;
per-call token scopes and SQL/native authority decide execution. Protocol hints
are descriptive. Quote terms become an immutable receipt, not a charge or email.
The operation registry in `src/server/capabilities.ts` separately owns ten native
operation schemas/versions/entrances. Similar names are not identical tools.

## Gap and intended change

Hand-written MCP schemas can drift from the accepted Zod inputs. Ask metadata is
separate from its schema declaration. E04 should place each tool's id/input Zod
schema/authority/effect/approval metadata beside its current owner and derive the
AI SDK or MCP presentation there. Existing Zod 4 `z.toJSONSchema` is available;
no package is needed. Refined/runtime-only validations still run at execution.
Never invent a shared descriptor that flattens Ask, MCP and native operations.

## Owned files after unblock

`src/platform/ask/contracts.ts`, `tools.ts`, owner descriptor/projection tests;
`src/platform/agent-channel/protected-tools.ts`, `website-tools.ts`, protected
schema tests. Tenant `agent-shared.ts` changes require its owner's coordination.
App-edge availability composition requires the consumer adoption owner. No v1
change, SQL fixture/runner duplication or reserved architecture UI/read change.

## Failure proof and acceptance

- Derived schemas preserve valid/default arguments, reject unknown fields,
  conflicting selectors, wrong types, unsafe patch paths, oversize input and
  native identity/hash/revision substitution.
- Every exposed tool maps to one owner descriptor, retaining its version and
  entrance; JSON schemas conform to their actual accepted Zod payloads.
- Wrong-workspace actors, revoked membership/token, missing connection grants,
  stale revisions and unguarded writes refuse before native/provider effects.
- Listing descriptors and protocol hints grants no authority; fresh authority
  reads, exact review/Needs you, native admission and provider acceptance remain.
- An intentionally weakened schema or unsafe effect adapter makes conformance
  fail. No paid model, native client, live provider, Auth or production proof is
  inferred from mocked tests.

## Deletion and checks

Delete duplicated MCP JSON input schema declarations only after native accepted
schemas are the source; delete no executor, governance or authority owner.
Focused checks: Ask tools/turn/authority and native substitution suites; MCP
protected/website/protocol route suites; scoped ESLint; `pnpm typecheck`;
`git diff --check`. Native SQL authority acceptance requires parent's isolated
DB resource grant and A07 receipt. UI changes require Croki browser proof.

## Exact unblock

Parent supplies A07's reviewed head and current owning-writer failure-path receipt
(application plus SQL: wrong writer/business, stale revision, forged connection).
Then reconcile source and descriptor ownership, implement the first owner-sized
schema conversion, run targeted negative tests and open a draft E04 PR. Until
then this document carries the implementation steps without enabling effects.
