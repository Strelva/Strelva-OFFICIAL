import { describe, expect, it, vi } from "vitest";
import { AskAgencyRequiredError, type AskRequestInput, type AskRequestPort } from "@/platform/ask";
import { ServiceRequestConflictError } from "@/platform/service-requests";
import { withWebsiteChangeRequests, type WebsiteChangeRequestDeps } from "@/app/api/workspace/ask/site-requests";

const WS = "11111111-1111-4111-8111-111111111111";
const SYSTEM = "aaaaaaaa-0000-4000-8000-0000000000a1";
const STABLE = "aaaaaaaa-0000-4000-8000-000000000002";
const AGENCY = "bbbbbbbb-0000-4000-8000-000000000001";
const actor = { userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const input: AskRequestInput = { workspaceId: WS, systemId: SYSTEM, words: "Add a private events page", outcome: "A private events page with an inquiry form", read: [], askedOnBehalf: null, topic: "website", idempotencyKey: "ask:1" };

function setup(over: Partial<WebsiteChangeRequestDeps> = {}) {
  const base = {
    agency: vi.fn(async () => ({ kind: "one" as const, agencyWorkspaceId: AGENCY, name: "North Studio" })),
    file: vi.fn(async () => ({ id: "base-request", status: "requested" as const, agencyName: "North Studio" })),
    list: vi.fn(async () => []),
  } satisfies AskRequestPort;
  const deps = {
    released: vi.fn(async () => true),
    repoSite: vi.fn(async () => ({ tenantStableId: STABLE, editing: "request" as const })),
    provider: vi.fn(async () => ({ kind: "agency" as const, agencyWorkspaceId: AGENCY })),
    execute: vi.fn(async () => ({ id: "site-request" })),
    ...over,
  } satisfies WebsiteChangeRequestDeps;
  return { base, deps, port: withWebsiteChangeRequests(base, deps) };
}

describe("Ask files repo-site changes as website Requests", () => {
  it("files as before with the flag off, with no System, or for a native site", async () => {
    const off = setup({ released: vi.fn(async () => false) });
    await off.port.file(actor, input);
    expect(off.base.file).toHaveBeenCalledOnce();
    expect(off.deps.repoSite).not.toHaveBeenCalled();

    const none = setup();
    await none.port.file(actor, { ...input, systemId: null });
    expect(none.base.file).toHaveBeenCalledOnce();
    expect(none.deps.released).not.toHaveBeenCalled();

    const native = setup({ repoSite: vi.fn(async () => ({ tenantStableId: STABLE, editing: "native" as const })) });
    await native.port.file(actor, input);
    expect(native.base.file).toHaveBeenCalledOnce();
    expect(native.deps.execute).not.toHaveBeenCalled();

    const other = setup({ repoSite: vi.fn(async () => null) });
    await other.port.file(actor, input);
    expect(other.base.file).toHaveBeenCalledOnce();
  });

  it("files a website Request the agency's coding agent can pick up, with the owner's words", async () => {
    const { port, base, deps } = setup();
    const filed = await port.file(actor, input);
    expect(base.file).not.toHaveBeenCalled();
    expect(deps.execute).toHaveBeenCalledWith(actor, expect.objectContaining({
      action: "save", businessId: WS, status: "requested", request: "Add a private events page", outcome: "A private events page with an inquiry form",
      provider: { kind: "agency", agencyWorkspaceId: AGENCY }, scope: ["website.repo_change"], idempotencyKey: "ask:1",
      context: { source: "website_change", origin: "ask_strelva", systemId: SYSTEM, tenantStableId: STABLE, implementation: "custom_repo" },
    }));
    expect(filed).toEqual({ id: "site-request", status: "requested", agencyName: "North Studio" });
  });

  it("says the business needs an agency when it has none, or must choose one", async () => {
    const none = setup({ provider: vi.fn(async () => { throw new ServiceRequestConflictError("No active agency access is available for this business."); }) });
    await expect(none.port.file(actor, input)).rejects.toMatchObject({ name: "AskAgencyRequiredError", agency: { kind: "none" } });
    const several = setup({ provider: vi.fn(async () => { throw new ServiceRequestConflictError("Choose one agency for this website Request before continuing."); }) });
    await expect(several.port.file(actor, input)).rejects.toBeInstanceOf(AskAgencyRequiredError);
    await expect(several.port.file(actor, input)).rejects.toMatchObject({ agency: { kind: "several" } });
    expect(none.deps.execute).not.toHaveBeenCalled();
    const broken = setup({ provider: vi.fn(async () => { throw new Error("boom"); }) });
    await expect(broken.port.file(actor, input)).rejects.toThrow("boom");
  });

  it("delegates agency and list to the base port", async () => {
    const { port, base } = setup();
    await port.agency(actor, WS);
    await port.list(actor, WS);
    expect(base.agency).toHaveBeenCalledWith(actor, WS);
    expect(base.list).toHaveBeenCalledWith(actor, WS);
  });
});
