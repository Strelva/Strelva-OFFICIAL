import { createHash } from "node:crypto";
import type { WebsiteDomainRequest } from "@/products/websites/domain-requests";
import type { SourceAdapter } from "../adapters";
import type { ProposedItem } from "../contracts";

export interface WebsiteDomainPorts {
  list(workspaceId: string): Promise<WebsiteDomainRequest[]>;
  approve(request: WebsiteDomainRequest, decisionId: string): Promise<WebsiteDomainRequest>;
  now?(): number;
}
export function websiteDomainItem(request: WebsiteDomainRequest, now = Date.now()): ProposedItem | null {
  if (!request.current || request.decisionId || Date.parse(request.expiresAt) <= now) return null;
  return {
    kind: "system.go_live", route: "owner_decides", title: `Connect your website to ${request.hostname}`,
    detail: request.records.map(record => `${record.type} ${record.name} → ${record.value}`).join("\n").slice(0, 1000),
    approveEffect: "Strelva attaches this exact domain to your published site. You or your registrar update these DNS records; routing waits for verification.",
    notYetEffect: "Nothing changes on your website or domain.", sourceLifecycle: "website_domain", sourceId: request.id,
    revisionHash: request.revisionHash, urgent: false, adminMayDecide: false,
    openHref: `/workspace?workspaceId=${request.workspaceId}&view=websites&work=${request.workId}`,
  };
}
export function websiteDomainAdapter(ports: WebsiteDomainPorts): SourceAdapter {
  const pending = (request: WebsiteDomainRequest) => websiteDomainItem(request, ports.now?.() ?? Date.now());
  const find = async (workspaceId: string, sourceId: string) => (await ports.list(workspaceId)).find(row => row.workspaceId === workspaceId && row.id === sourceId);
  return {
    lifecycle: "website_domain", needsMemberActor: false,
    async propose(ctx) { return { items: (await ports.list(ctx.workspaceId)).filter(row => row.workspaceId === ctx.workspaceId).flatMap(row => pending(row) ?? []), complete: true }; },
    async currentRevision(ctx, sourceId) { const row = await find(ctx.workspaceId, sourceId); return row && !row.current ? createHash("sha256").update(`${row.revisionHash}:stale`).digest("hex") : row && pending(row) ? row.revisionHash : null; },
    async resolve(ctx, item, decision, by) {
      if (decision === "not_yet" || by.kind === "expiry") return { outcome: "done", reason: by.kind === "expiry" ? "Expired, nothing changed" : "Not yet" };
      const row = await find(ctx.workspaceId, item.sourceId);
      if (!row || !pending(row) || row.revisionHash !== item.revisionHash) return { outcome: "failed", reason: "source_changed" };
      try {
        // SQL consumes the already-claimed Needs you decision and rechecks its
        // owner, hostname, DNS snapshot and published revision before writes.
        const saved = await ports.approve(row, item.id);
        return saved.result?.status === "verified" && saved.result.routing === "verified" ? { outcome: "done", receiptRef: `website_domain:${saved.id}` }
          : { outcome: "done_unverified", reason: "Domain attached; DNS or public-site verification is still pending.", receiptRef: `website_domain:${saved.id}` };
      } catch { return { outcome: "failed", reason: "domain_approval_or_attachment_failed" }; }
    },
  };
}
