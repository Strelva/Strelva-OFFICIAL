import { expect, it } from "vitest";
import { websiteRebuildSchema } from "@/products/websites/rebuild-contracts";
import { websiteCapabilityOptionsSchema } from "@/products/websites/contracts";
import { websiteDomainRequestSchema, websiteCutoverUndoReceiptSchema } from "@/products/websites/recovery-contracts";
import { parseRebuildView } from "@/experience/websites/rebuild-transport";
import { domainReceipt, routingRecord, routingOptions, undoReceipt, workId, workspaceId } from "../../tests/support/website-routing-browser-fixture";

it("published fictional raw envelope supplies the actual default parent and forms controls", () => {
  const raw = routingRecord(), item = websiteRebuildSchema.parse(raw.rebuild), view = parseRebuildView(raw);
  expect(item.launch.receipt?.status).toBe("published");
  expect(view.candidate?.contentHash).toBe(item.candidate?.contentHash);
  expect(view.tenantId).toBe("fictional-bakery");
  expect(view.publishedUrl).toBe("https://published.example.test");
  expect(websiteCapabilityOptionsSchema.parse(routingOptions).tenants[0]?.inquiry).toHaveLength(2);
  const withoutPublication = parseRebuildView(routingRecord(false));
  expect(withoutPublication.publishedUrl).toBeNull();
  expect(withoutPublication.candidate?.contentHash).toBe(view.candidate?.contentHash);
});
it("domain fixture binds exact request, work, workspace and hostname without a provider receipt", () => {
  const id = "55555555-5555-4555-8555-555555555555", receipt = websiteDomainRequestSchema.parse(domainReceipt(id, "bakery.example.test"));
  expect([receipt.id, receipt.workId, receipt.workspaceId, receipt.hostname]).toEqual([id, workId, workspaceId, "bakery.example.test"]);
  expect(receipt.receiptEmail?.status).toBe("suppressed");
  expect(receipt.result).toBeNull();
  const stale = websiteDomainRequestSchema.parse(domainReceipt(id, "bakery.example.test", false));
  expect(stale.current).toBe(false);
  expect([stale.id, stale.publishedRevision, stale.publishedHash]).toEqual([receipt.id, receipt.publishedRevision, receipt.publishedHash]);
});
it("undo fixture uses exact captured command and candidate identity with the full strict receipt", () => {
  const candidate = routingRecord().rebuild.candidate;
  const command = { commandId: "66666666-6666-4666-8666-666666666666", tenantId: "fictional-bakery", candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash };
  const receipt = websiteCutoverUndoReceiptSchema.parse(undoReceipt(command));
  expect(receipt.receiptId).toBe(command.commandId);
  expect(receipt.contentHash).toBe(candidate.contentHash);
  expect(receipt.revision).toBe(candidate.revision);
  expect(websiteCutoverUndoReceiptSchema.safeParse({ ...receipt, revision: 0 }).success).toBe(false);
});
