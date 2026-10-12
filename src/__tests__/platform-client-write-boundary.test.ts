import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), support: vi.fn(), inspect: vi.fn(), write: vi.fn(), getContent: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => ({ id: "operator", email: "operator@example.invalid", email_confirmed_at: "2026-01-01" }) }));
vi.mock("@/platform/infra/db/repositories", () => ({ getMembershipRole: mocks.role, isSuperAdminUser: mocks.support }));
vi.mock("@/platform/infra/inspect-mode", () => ({ isInspecting: mocks.inspect }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeTenantOperatorRead: async () => undefined }));
vi.mock("@/lib/tenant", () => ({ requireTenantFromHeaders: async () => "client", getTenantFromHeaders: async () => "client" }));
vi.mock("@/lib/storage", () => ({ getContent: mocks.getContent, setContent: mocks.write, recordSectionUpdate: mocks.write, logActivity: mocks.write, logAuditEvent: mocks.write, getDraftContent: mocks.getContent, setDraftContent: mocks.write, clearDraft: mocks.write, appendVersion: mocks.write }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/review-replies", () => ({ draftReviewReply: mocks.write, buildDeterministicReply: mocks.write }));
import { GET, PUT, DELETE } from "@/app/api/content/[section]/route";
import { POST as draftReply } from "@/app/api/reviews/draft-reply/route";
import { PUT as contentAutonomy } from "@/app/api/dashboard/content-autonomy/route";
const section = { params: Promise.resolve({ section: "hero" }) };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("REB_DEV_UNGATED_ACCESS", "0"); vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "0");
  mocks.role.mockResolvedValue(null); mocks.support.mockResolvedValue(true); mocks.inspect.mockResolvedValue(false); mocks.getContent.mockResolvedValue({});
});
describe("client routes under the actual shared tenant permission guard", () => {
  it("preserves a support content read but refuses live/draft writes and deletion before effects", async () => {
    expect((await GET(new Request("http://localhost/api/content/hero"), section)).status).toBe(200);
    for (const suffix of ["", "?draft=true"]) {
      expect((await PUT(new Request("http://localhost/api/content/hero" + suffix, { method: "PUT", body: "{}" }), section)).status).toBe(403);
    }
    expect((await DELETE(new Request("http://localhost/api/content/hero", { method: "DELETE" }), section)).status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("refuses platform review authoring and automation settings before model or policy writes", async () => {
    expect((await draftReply(new Request("http://localhost/api/reviews/draft-reply", { method: "POST", body: '{"author":"Visitor","rating":5}' }))).status).toBe(403);
    expect((await contentAutonomy(new Request("http://localhost/api/dashboard/content-autonomy", { method: "PUT", body: '{"mode":"auto"}' }))).status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("keeps a double-hat owner in inspection read-only", async () => {
    mocks.role.mockResolvedValue("owner"); mocks.inspect.mockResolvedValue(true);
    expect((await PUT(new Request("http://localhost/api/content/hero", { method: "PUT", body: "{}" }), section)).status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("does not draft a deterministic fallback when the authority read fails", async () => {
    mocks.role.mockRejectedValue(new Error("membership unavailable"));
    expect((await draftReply(new Request("http://localhost/api/reviews/draft-reply", { method: "POST", body: '{"author":"Visitor","rating":5}' }))).status).toBe(503);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
