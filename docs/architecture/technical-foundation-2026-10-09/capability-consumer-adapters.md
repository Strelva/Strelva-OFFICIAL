# E03 consumer adoption proposals — source preparation

**Post-1.0 deferred:** Jacob's release convergence directive pauses consumer
expansion. The historical preparation below grants no application authority.
See the [lane disposition](./capability-qualification.md#release-convergence-disposition).

Root authorized exact consumer source preparation against frozen union
`77fc4ea49f61aecc901f92062d8646bd125f21ee` after the PR625 validator repair.
The [frozen delta handoff](./capability-consumer-frozen-77fc4ea.md) and its patch
supersede the illustrative interface sketches below. No consumer changes are
applied. Root coordinates the actual branch/base before application.

Not applied. Architecture union owns the workspace route, contracts and rendered
surfaces until freeze. These proposals preserve existing gates and authority.
Reconcile against the union's final head before preparing exact patches.

## Workspace/operator server read

After actor/workspace selection and current release viewer resolution:

```diff
+import { capabilityAvailabilityView } from "@/capability-availability";
+import type { CapabilityAvailabilityView } from "@/platform/capabilities/inventory-contracts";
 // WorkspaceSnapshot browser contract (type-only)
+  capabilityAvailability?: readonly CapabilityAvailabilityView[];
 // GET /api/workspace snapshot, after authorized workspace selection
+  capabilityAvailability: await capabilityAvailabilityView({
+    workspaceId: selected.id,
+    viewer: { operator: await operator, tester: false, userId: current.userId },
+  }, ownerAvailabilityReaders),
```

`ownerAvailabilityReaders` is not implemented or assumed. Each owner must supply
read-only, exact-workspace prerequisite observations. Default production scope
will currently return qualification unknown for runtime entries: no stronger
receipts exist in the current adapters. Do not hide existing working routes or
rename their commercial availability based solely on this newly stricter proof
view. Decide explicitly whether the UI shows proof status alongside usability.

Use the same projection/readers for the operator's selected workspace and viewer.
Retain the existing operator and business access checks. Project only selected
capability keys for the opened job when the full inventory is unnecessary.

## Ask composition

Keep the app-edge import in `src/app/api/workspace/ask/route.ts`, after membership
and workspace selection. Platform Ask must receive browser-safe values through
its existing dependency interface; it must not import the app-edge registry or
create a new workspace-to-tenant edge.

```diff
 // app-edge route supplies a read-only projection dependency to Ask
+  availability: () => capabilityAvailability(relevantCapabilityKeys, {
+    workspaceId, viewer, evidenceMode: "production",
+  }, ownerAvailabilityReaders),
 // Ask dependency interface: values only
+  availability?(): Promise<readonly CapabilityAvailabilityView[]>;
```

The tool-to-capability mapping awaits E04 and A07. Don't identify a tenant tool as
an executable registry operation by name coincidence. Do not remove the fresh
per-call `authorizeAskTool` read, forceReview or Needs you handoff.

## MCP composition

`tools/list` remains constant/public and grants nothing. Do not embed business
status or scoped flag rows in public discovery. A new authorized status read, or
an existing protected-context response after token validation, may receive the
same availability values through app-edge composition:

```diff
 // protected server dependency supplied by application composition
+  readAvailability?(workspaceId: string): Promise<readonly CapabilityAvailabilityView[]>;
 // only after validating token/principal for the connected workspace
+  availability: await readAvailability?.(principal.workspaceId),
```

Preserve OAuth scope escalation, owner-only proposal authority, native adapters,
quote approval immutability and the current public transport schemas. Adding a
protected response field needs protocol/negative route tests. No write wiring is
included in this proposal.

## Acceptance before adoption

Run the actual workspace/Ask/MCP/operator projections for the same business,
viewer, mode and owner observations and compare `key/state/reason/message`.
Wrong business, revoked membership/token, failed flag read, missing resources and
flags off must keep existing authoritative refusals. Then inspect affected UI on
desktop/mobile, focus and empty/loading/error/permission states with Croki preview.
A global inline-flag ratchet needs a retained source inventory and a seeded new
inline-read failure. Parent must authorize reserved file overlap and resource use.
