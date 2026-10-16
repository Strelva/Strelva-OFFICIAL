// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TwoDoorsPreview, twoDoorsPreviewTransport } from "@/experience/workspace/preview/TwoDoorsPreview";
import { serviceRequestSchema } from "@/platform/service-requests/types";

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });

describe("owner help preview", () => {
  it("renders the same request, agency and platform-support sections as owner Help", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const network = vi.fn(async () => Response.json({ brand: null }));
    vi.stubGlobal("fetch", network);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(TwoDoorsPreview, { surface: "owner", state: "with-agency" })));
    expect(container.textContent).toContain("What do you need?");
    expect(container.textContent).toContain("Your requests");
    expect(container.textContent).toContain("Bring in an agency");
    expect(container.textContent).toContain("Email platform support");
    // One agency that can take requests: the request says where it goes, with no picker (XS shell states).
    expect(container.textContent).toContain("Goes to North Studio");
    expect(network).not.toHaveBeenCalled();
  });

  it("retains a fictional request for the selected accepted agency without giving any grant", async () => {
    const transport = twoDoorsPreviewTransport("with-agency");
    const providers = await (await transport("/api/service-requests?providersBusinessId=preview")).json();
    const provider = { kind: "agency", agencyWorkspaceId: providers.providers[0].agencyWorkspaceId };
    const result = await (await transport("/api/service-requests", { method: "POST", body: JSON.stringify({ provider, request: "Prepare a booking page", outcome: "Customers can book", context: {}, scope: ["bookings"] }) })).json();
    expect(serviceRequestSchema.safeParse(result.request).success).toBe(true);
    expect(result.request.providerAcceptance.status).toBe("pending");
    const saved = await (await transport("/api/service-requests?businessId=preview")).json();
    expect(saved.requests).toHaveLength(1);
    const agencies = await (await transport("/api/workspace/agencies?workspaceId=preview")).json();
    expect(agencies.agencies[0].scopes).toEqual([{ scope: "website", level: "full_control", status: "active" }, { scope: "google", level: "prepare", status: "active" }]);
  });

  it("refuses a fictional work request before the agency has accepted access", async () => {
    const transport = twoDoorsPreviewTransport("empty");
    const response = await transport("/api/service-requests", { method: "POST", body: JSON.stringify({ provider: { kind: "agency", agencyWorkspaceId: "d2950000-0000-4000-8000-0000000000a1" }, request: "Prepare a website" }) });
    expect(response.status).toBe(409);
  });
});
