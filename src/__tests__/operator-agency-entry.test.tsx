import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const access = vi.hoisted(() => ({ actor: vi.fn(), agencies: vi.fn(), addClient: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "admin.strelva.com", "x-forwarded-proto": "https" }) }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: access.actor }));
vi.mock("@/platform/workspaces/agency-onboarding", () => ({ listMemberAgencies: access.agencies }));
vi.mock("@/products/agency-clients", () => ({ agencyAddClientReleaseEnabled: access.addClient }));
import { AgencyWorkEntry } from "@/app/admin/AgencyWorkEntry";
import ActionsPage from "@/app/admin/actions/page";
import OnboardPage from "@/app/admin/onboard/page";

beforeEach(() => {
  vi.clearAllMocks(); access.actor.mockResolvedValue({ userId: "member", verifiedEmail: "member@example.test" });
  access.agencies.mockResolvedValue([{ id: "strelva-agency", name: "Strelva Agency", role: "member" }]);
  access.addClient.mockReturnValue(true);
});

describe("operator route to ordinary agency workspace", () => {
  it("opens the member agency's scoped Queue on the workspace host", async () => {
    const html = renderToStaticMarkup(await AgencyWorkEntry({ destination: "actions" }));
    expect(html).toContain("https://app.strelva.com/workspace?workspace=strelva-agency&amp;view=home&amp;agencyView=queue");
    expect(html).toContain("Strelva Agency · Runs on Strelva");
    expect(html).not.toContain("Approve all");
    expect(ActionsPage().props.destination).toBe("actions");
  });
  it("uses ordinary add-client admission instead of rendering the operator provision form", async () => {
    const html = renderToStaticMarkup(await AgencyWorkEntry({ destination: "onboard" }));
    expect(html).toContain("https://app.strelva.com/workspace/agency/clients/new?workspaceId=strelva-agency");
    expect(html).not.toContain("Create client"); expect(html).not.toContain("<form");
    expect(OnboardPage().props.destination).toBe("onboard");
  });
  it("does not grant an agency seat to an operator without ordinary membership", async () => {
    access.agencies.mockResolvedValue([{ id: "other", name: "North Studio", role: "owner" }]);
    const html = renderToStaticMarkup(await AgencyWorkEntry({ destination: "actions" }));
    expect(html).toContain("Operator access grants no agency seat"); expect(html).not.toContain("workspace=other");
  });
  it("uses Clients while ordinary add-client admission is closed", async () => {
    access.addClient.mockReturnValue(false);
    const html = renderToStaticMarkup(await AgencyWorkEntry({ destination: "onboard" }));
    expect(html).toContain("workspace=strelva-agency&amp;view=home&amp;agencyView=clients");
    expect(html).not.toContain("/agency/clients/new");
  });
  it("does not read agency membership without an authenticated actor", async () => {
    access.actor.mockResolvedValue(null);
    const html = renderToStaticMarkup(await AgencyWorkEntry({ destination: "onboard" }));
    expect(html).toContain("membership could not be verified");
    expect(access.agencies).not.toHaveBeenCalled();
  });
  it("fails closed when the identity read throws", async () => {
    access.actor.mockRejectedValue(new Error("Auth unavailable"));
    const html = renderToStaticMarkup(await AgencyWorkEntry({ destination: "actions" }));
    expect(html).toContain("membership could not be verified"); expect(access.agencies).not.toHaveBeenCalled();
  });
});
