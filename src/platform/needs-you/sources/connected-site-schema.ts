/** Acknowledges published-fact follow-up; never changes facts or a provider. */
import type { SourceAdapter } from "../adapters";
import { readConnectedSiteSchemaDecision } from "../repository";

export function connectedSiteSchemaAdapter(read = readConnectedSiteSchemaDecision): SourceAdapter {
  return {
    lifecycle: "connected_site_schema", needsMemberActor: false,
    async propose() { return { items: [], complete: true }; },
    async currentRevision(ctx, sourceId) {
      return (await read(ctx.workspaceId, sourceId))?.revisionHash ?? null;
    },
    async resolve(_ctx, _item, decision, by) {
      return { outcome: "done", reason: by.kind === "expiry" ? "Expired, nothing changed" : decision === "approve" ? "Acknowledged for website-platform follow-up; no facts changed" : "Not yet; no facts changed" };
    },
  };
}
