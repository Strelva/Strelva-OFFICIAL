import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn(), release: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
vi.mock("@/experience/workspace/leads/leads-server", () => ({ readAgencyLead: mocks.read }));
vi.mock("@/platform/agency-prospecting/server", () => ({ agencyProspectingEnabled: () => true }));
vi.mock("@/products/agency-clients", () => ({ agencyAddClientReleaseEnabled: mocks.release }));
import Page from "@/app/workspace/agency/clients/new/page";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const idempotencyKey = "00000000-0000-4000-8000-000000000003";
const leadToken = "a".repeat(36);
const lead = { statusToken: leadToken, businessName: "Northside Bakery", email: "owner@bakery.example", currentWebsite: null };
const conversion = { actorId, idempotencyKey, fingerprint: "digest", input: { action: "add", agencyWorkspaceId: workspaceId, leadToken, idempotencyKey, name: "Reviewed bakery" } };
beforeEach(() => {
  vi.clearAllMocks(); mocks.release.mockReturnValue(true);
  mocks.actor.mockResolvedValue({ userId: actorId, verifiedEmail: "agency@example.test" });
  mocks.read.mockResolvedValue({ lead, workflow: { status: "new" } });
});
describe("server-authorized lead handoff", () => {
  it("prefills only the lead read under the actor's ordinary agency authority", async () => {
    const page = await Page({ searchParams: Promise.resolve({ workspaceId, leadToken, name: "Query injection", email: "query@example.test" }) });
    expect(mocks.read).toHaveBeenCalledWith({ userId: actorId, verifiedEmail: "agency@example.test" }, workspaceId, leadToken);
    expect(page.props.initialLead).toEqual({ token: lead.statusToken, businessName: lead.businessName, email: lead.email, currentWebsite: null });
    expect(page.props.prospecting).toBe(false);
    expect(page.props.initialProspectId).toBeNull();
  });
  it("resumes the creator's exact stored body and key after a reload", async () => {
    mocks.read.mockResolvedValue({ lead: { ...lead, conversion }, workflow: { status: "converting" } });
    const page = await Page({ searchParams: Promise.resolve({ workspaceId, leadToken }) });
    expect(page.props.initialConversion).toEqual(conversion.input); expect(page.props.conversionHeld).toBe(false);
  });
  it.each(["other_actor", "foreign_agency", "wrong_key", "legacy"])("holds a conversion that cannot safely resume (%s)", async variant => {
    const saved = { ...conversion, input: { ...conversion.input } };
    if (variant === "other_actor") saved.actorId = workspaceId;
    if (variant === "foreign_agency") saved.input.agencyWorkspaceId = actorId;
    if (variant === "wrong_key") saved.input.idempotencyKey = actorId;
    mocks.read.mockResolvedValue({ lead: { ...lead, conversion: variant === "legacy" ? undefined : saved }, workflow: { status: variant === "legacy" ? "converted" : "converting" } });
    const page = await Page({ searchParams: Promise.resolve({ workspaceId, leadToken }) });
    expect(page.props.initialConversion).toBeNull(); expect(page.props.conversionHeld).toBe(true);
  });
  it("allows the initial add when the handoff is converting but no client-add request has started", async () => {
    mocks.read.mockResolvedValue({ lead, workflow: { status: "converting" } });
    const page = await Page({ searchParams: Promise.resolve({ workspaceId, leadToken }) });
    expect(page.props.initialConversion).toBeNull(); expect(page.props.conversionHeld).toBe(false);
  });
  it("returns sign-in to the token-only handoff and sends refused reads back to the lead list", async () => {
    mocks.actor.mockResolvedValueOnce(null);
    const next = `/workspace/agency/clients/new?${new URLSearchParams({ workspaceId, leadToken })}`;
    await expect(Page({ searchParams: Promise.resolve({ workspaceId, leadToken }) })).rejects.toThrow(`redirect:/sign-in?next=${encodeURIComponent(next)}`);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockRejectedValue(new Error("Denied"));
    await expect(Page({ searchParams: Promise.resolve({ workspaceId, leadToken }) })).rejects.toThrow(`redirect:/workspace/leads?workspaceId=${workspaceId}`);
  });
  it("rejects malformed and mixed source handoffs before reading a lead", async () => {
    for (const searchParams of [{ workspaceId, leadToken: "bad" }, { workspaceId, leadToken, prospect: actorId }]) {
      await expect(Page({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow("redirect:/workspace/leads?");
    }
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
