import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), agency: vi.fn(), lead: vi.fn(), brand: vi.fn() }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/experience/workspace/billing/payment-links-server", () => ({ paymentLinkAgency: mocks.agency }));
vi.mock("@/experience/workspace/leads/leads-server", () => ({ readAgencyLead: mocks.lead }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: mocks.brand }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
vi.mock("@/experience/app-frame/StrelvaShell", () => ({ StrelvaShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
import Page from "@/app/workspace/payment-links/page";
const agency = "11111111-1111-4111-8111-111111111111", token = "a".repeat(36);
beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.mockResolvedValue({ userId: "owner", verifiedEmail: "owner@example.test" });
  mocks.agency.mockResolvedValue({ id: agency, role: "owner" }); mocks.brand.mockResolvedValue({ agencyId: agency, name: "Strelva Agency" });
  mocks.lead.mockResolvedValue({ lead: { businessName: "Northside Bakery", description: "x".repeat(2000) } });
});
it("authorizes the opaque lead token server-side and bounds the payment description for review", async () => {
  const page = await Page({ searchParams: Promise.resolve({ workspaceId: agency, leadToken: token }) });
  expect(mocks.lead).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.test" }, agency, token);
  const content = page.props.children.props.children;
  expect(content.props.initialProspect).toEqual({ token, name: "Northside Bakery", description: "x".repeat(1000) });
});
it("does not fall through to unprefilled creation when the source lead is forbidden", async () => {
  mocks.lead.mockRejectedValue(new Error("foreign lead"));
  const page = await Page({ searchParams: Promise.resolve({ workspaceId: agency, leadToken: token }) });
  const html = renderToStaticMarkup(page);
  expect(html).toContain("This lead is unavailable to your agency"); expect(html).not.toContain("Prospect name");
  expect(mocks.brand).not.toHaveBeenCalled();
});
it("preserves the agency and opaque source token through sign-in", async () => {
  mocks.actor.mockResolvedValue(null);
  const next = `/workspace/payment-links?workspaceId=${agency}&leadToken=${token}`;
  await expect(Page({ searchParams: Promise.resolve({ workspaceId: agency, leadToken: token }) })).rejects.toThrow(`redirect:/sign-in?next=${encodeURIComponent(next)}`);
  expect(mocks.lead).not.toHaveBeenCalled();
});
