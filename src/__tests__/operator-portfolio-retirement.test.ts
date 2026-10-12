import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), verified: vi.fn(), active: vi.fn(), tenants: vi.fn(), escalate: vi.fn(), audit: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.admin }));
vi.mock("@/lib/operator-decisions", () => ({ verifiedOperator: mocks.verified, operatorStillActive: mocks.active, auditOperatorDecision: mocks.audit }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: mocks.tenants }));
vi.mock("@/lib/event-actions", () => ({ escalateEventToOwner: mocks.escalate }));
import { draftPortfolioOpportunity, escalatePortfolioActions, resolvePortfolioActions } from "@/app/admin/actions/actions";
const operator = { userId: "operator", verifiedEmail: "operator@example.test", actorId: "operator:operator" };
const item = { tenantId: "fixture", eventId: "pending" };
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue(true); mocks.verified.mockResolvedValue(operator); mocks.active.mockResolvedValue(true); mocks.tenants.mockResolvedValue([{ id: "fixture" }]); mocks.audit.mockResolvedValue(undefined); mocks.escalate.mockResolvedValue({ changed: true }); });
describe("retired platform portfolio writer actions", () => {
  it("refuses authored or approved content before tenant reads", async () => {
    expect(await resolvePortfolioActions([item])).toEqual({ ok: false, results: [{ ...item, changed: false, reason: "platform_content_authority_retired" }] });
    expect(await draftPortfolioOpportunity("unreplied_reviews", ["fixture"])).toEqual({ ok: false, results: [{ tenantId: "fixture", drafted: false, reason: "platform_content_authority_retired" }] });
    expect(mocks.tenants).not.toHaveBeenCalled(); expect(mocks.escalate).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("refuses unauthenticated entry points", async () => {
    mocks.admin.mockResolvedValue(false); mocks.verified.mockResolvedValue(null);
    expect((await resolvePortfolioActions([item])).ok).toBe(false);
    expect((await draftPortfolioOpportunity("low_health", ["fixture"])).ok).toBe(false);
    expect(mocks.tenants).not.toHaveBeenCalled();
  });
  it("keeps an audited owner handoff and rechecks access immediately before its effect", async () => {
    expect(await escalatePortfolioActions([item])).toEqual({ ok: true, results: [{ eventId: "pending", changed: true }] });
    expect(mocks.audit).toHaveBeenCalledTimes(2); expect(mocks.active).toHaveBeenCalledWith(operator);
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.escalate.mock.invocationCallOrder[0]!);
    expect(mocks.active.mock.invocationCallOrder[0]).toBeLessThan(mocks.escalate.mock.invocationCallOrder[0]!);
  });
  it("holds owner routing when support authority is revoked or the audit cannot be persisted", async () => {
    mocks.active.mockResolvedValue(false);
    expect((await escalatePortfolioActions([item])).results[0]).toMatchObject({ changed: false, reason: "operator_access_changed" });
    expect(mocks.escalate).not.toHaveBeenCalled();
    mocks.active.mockResolvedValue(true); mocks.audit.mockRejectedValue(new Error("Unavailable"));
    expect((await escalatePortfolioActions([item])).results[0]).toMatchObject({ changed: false, reason: "audit_unavailable" });
    expect(mocks.escalate).not.toHaveBeenCalled();
  });
});
