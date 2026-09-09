import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), run: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/audit-report-store", () => ({ getAuditReport: mocks.get }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/platform/workspaces", () => ({ runWorkspaceOperation: mocks.run }));
import { savePublicWebsiteAudit } from "@/products/website-audit/server";
import { presentWorkspaceWork } from "@/experience/workspace/result";
const result={ url:"https://example.com/", scannedAt:"2026-09-08T12:00:00Z", overallScore:80, grade:"B", categories:[{ name:"SEO",slug:"seo",weight:1,score:80,checks:[{ name:"Title",status:"pass",score:80,message:"Found",secret:"private",quantified:"invented dollars" }] }] };
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue({ result,lead:{email:"secret@example.com"} }); mocks.run.mockImplementation(async ({run}) => ({ payload: await run() })); });
describe("private website audit copies", () => {
 it("copies only the retained server result after the operation authorizes its actor", async () => {
  const args={actor:{userId:"person",verifiedEmail:"person@example.com"},workspaceId:"workspace",resultId:`audit_${"a".repeat(32)}`};
  const saved=await savePublicWebsiteAudit(args);
  expect((saved.payload as typeof result).categories[0]!.checks[0]).not.toHaveProperty("secret");
  expect((saved.payload as typeof result).categories[0]!.checks[0]).not.toHaveProperty("quantified");
  const first=mocks.run.mock.calls[0]![0].id;
  await savePublicWebsiteAudit(args);
  expect(mocks.run.mock.calls[1]![0].id).toBe(first);
 });
 it("rejects expired and malformed server records", async () => {
  mocks.get.mockResolvedValue({result:{...result,overallScore:1000}});
  await expect(savePublicWebsiteAudit({actor:{userId:"person",verifiedEmail:"person@example.com"},workspaceId:"workspace",resultId:`audit_${"a".repeat(32)}`})).rejects.toThrow("Report unavailable");
 });
 it("exposes only the product-approved report and hides source identity", () => {
  const presented=presentWorkspaceWork({id:"id",workspaceId:"w",productId:"website_audit",resourceKind:"website_audit_report",payload:result,input:{sourceReportId:"secret"},createdBy:"person",createdAt:"now",updatedAt:"now"});
  expect(presented.auditPayload?.url).toBe(result.url); expect(presented.input).toEqual({}); expect(presented.payload).toBeNull();
 });
});
