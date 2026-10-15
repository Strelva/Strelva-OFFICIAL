import { describe, expect, it, vi } from "vitest";
import { AskAgencyRequiredError, type AskRequestPort } from "@/platform/ask";
import { ServiceRequestConflictError } from "@/platform/service-requests";
import { withConnectedSiteChangeRequests, type ConnectedSiteRequestDeps } from "@/app/api/workspace/ask/connected-site-requests";

const WS = "7d000000-0000-4000-8000-000000000001";
const SYSTEM = "7d000000-0000-4000-8000-000000000002";
const actor = { userId: "7d000000-0000-4000-8000-000000000003", verifiedEmail: "owner@example.test" };
const input = { workspaceId: WS, systemId: SYSTEM, words: "Change the banner on my site", outcome: "The banner says the new offer", read: [], askedOnBehalf: null, topic: "website", idempotencyKey: "ask-1" };

function setup(patch: Partial<ConnectedSiteRequestDeps> = {}) {
  const base = {
    agency: vi.fn(async () => ({ kind: "one" as const, agencyWorkspaceId: "7d000000-0000-4000-8000-000000000004", name: "North Studio" })),
    file: vi.fn(async () => ({ id: "base-request", status: "requested" as const, agencyName: "North Studio" })),
    list: vi.fn(async () => []),
  } satisfies AskRequestPort;
  const deps = {
    released: vi.fn(async () => true),
    connectedSite: vi.fn(async () => ({ id: "site", siteHost: "bakery.example", platform: "wix" as const })),
    ask: vi.fn(async () => ({ requestId: "site-request" })),
    ...patch,
  } as unknown as ConnectedSiteRequestDeps & { released: ReturnType<typeof vi.fn>; connectedSite: ReturnType<typeof vi.fn>; ask: ReturnType<typeof vi.fn> };
  return { base, deps, port: withConnectedSiteChangeRequests(base, deps) };
}

describe("Ask files connected-site changes as connected-site Requests", () => {
  it("files as before while keep your site is off", async () => {
    const { base, deps, port } = setup({ released: vi.fn(async () => false) as never });
    expect((await port.file(actor, input)).id).toBe("base-request");
    expect(base.file).toHaveBeenCalledTimes(1);
    expect(deps.ask).not.toHaveBeenCalled();
    expect(deps.connectedSite).not.toHaveBeenCalled();
  });
  it("files as before for a System that is not a connected site", async () => {
    const { base, deps, port } = setup({ connectedSite: vi.fn(async () => null) as never });
    expect((await port.file(actor, input)).id).toBe("base-request");
    expect(base.file).toHaveBeenCalledTimes(1);
    expect(deps.ask).not.toHaveBeenCalled();
    expect((await port.file(actor, { ...input, systemId: null })).id).toBe("base-request");
  });
  it("files a connected-site Request with the person's words, as Ask", async () => {
    const { base, deps, port } = setup();
    expect(await port.file(actor, input)).toEqual({ id: "site-request", status: "requested", agencyName: "North Studio" });
    expect(deps.ask).toHaveBeenCalledWith(actor, { workspaceId: WS, systemId: SYSTEM, words: "Change the banner on my site", outcome: "The banner says the new offer", origin: "ask_strelva", idempotencyKey: "ask-1" });
    expect(base.file).not.toHaveBeenCalled();
  });
  it("asks the person to bring in an agency when there is none", async () => {
    const { port } = setup({ ask: vi.fn(async () => { throw new ServiceRequestConflictError("No active agency access is available for this business."); }) as never });
    await expect(port.file(actor, input)).rejects.toMatchObject({ name: "AskAgencyRequiredError", agency: { kind: "none" } });
    await expect(port.file(actor, input)).rejects.toBeInstanceOf(AskAgencyRequiredError);
  });
  it("asks the person to choose when more than one agency could take it", async () => {
    const { base, deps } = setup();
    base.agency.mockResolvedValue({ kind: "several", names: ["A", "B"] } as never);
    const port = withConnectedSiteChangeRequests(base, { ...deps, ask: vi.fn(async () => { throw new ServiceRequestConflictError("Choose one agency for this website Request before continuing."); }) as never });
    await expect(port.file(actor, input)).rejects.toMatchObject({ agency: { kind: "several", names: ["A", "B"] } });
  });
  it("lets other failures through", async () => {
    const { port } = setup({ ask: vi.fn(async () => { throw new Error("boom"); }) as never });
    await expect(port.file(actor, input)).rejects.toThrow("boom");
  });
  it("delegates agency and list to the base port", async () => {
    const { base, port } = setup();
    await port.agency(actor, WS);
    await port.list(actor, WS);
    expect(base.agency).toHaveBeenCalledTimes(1);
    expect(base.list).toHaveBeenCalledTimes(1);
  });
});
