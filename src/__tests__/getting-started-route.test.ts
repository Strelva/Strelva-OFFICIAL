import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), readCheck: vi.fn(), start: vi.fn(), read: vi.fn(), readWebsite: vi.fn(), confirm: vi.fn(), limited: vi.fn(), funnel: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limited }));
vi.mock("@/platform/infra/funnel", () => ({ recordFunnelEvent: mocks.funnel }));
vi.mock("@/products/getting-started/server", async () => {
  const actual = await vi.importActual<typeof import("@/products/getting-started/server")>("@/products/getting-started/server");
  return { ...actual, gettingStarted: { readCheck: mocks.readCheck, startFromCheck: mocks.start, read: mocks.read, readWebsite: mocks.readWebsite, decide: mocks.confirm, websiteHost: actual.createGettingStarted().websiteHost } };
});

import { GET, POST } from "@/app/api/workspace/getting-started/route";
import { GettingStartedUnavailableError } from "@/products/getting-started/server";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const BUSINESS = "5a000000-0000-4000-8000-0000000000b1";
const ACTOR = { userId: "5a000000-0000-4000-8000-000000000001", verifiedEmail: "owner@northside.example" };
const get = (query: string) => GET(new Request(`https://strelva.com/api/workspace/getting-started${query}`));
const post = (body: unknown, headers: Record<string, string> = { origin: "https://strelva.com", "content-type": "application/json" }) =>
  POST(new Request("https://strelva.com/api/workspace/getting-started", { method: "POST", headers, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
  mocks.user.mockResolvedValue({ id: ACTOR.userId, email: "Owner@Northside.example", email_confirmed_at: "2026-10-12" });
  mocks.limited.mockResolvedValue(false);
  mocks.funnel.mockResolvedValue(undefined);
});

describe("/api/workspace/getting-started", () => {
  it.each(["STRELVA_BUSINESS_SIGNUP_RELEASE", "STRELVA_WORKSPACE_RELEASE"])("answers 503 and touches nothing while %s is off", async (flag) => {
    vi.stubEnv(flag, "0");
    expect((await get("?check=scan_abc")).status).toBe(503);
    expect((await post({ action: "start_from_check", resultId: "scan_abc", name: "Northside" })).status).toBe(503);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("requires a confirmed session", async () => {
    mocks.user.mockResolvedValue({ id: ACTOR.userId, email: "owner@northside.example" });
    expect((await get("?check=scan_abc")).status).toBe(401);
    expect((await post({ action: "start_from_check", resultId: "scan_abc", name: "Northside" })).status).toBe(401);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("previews a check with its name, website and a suggested name", async () => {
    mocks.readCheck.mockResolvedValue({ resultId: "audit_x", kind: "website_audit", name: null, website: "https://www.northside.example/" });
    const response = await get(`?check=audit_${"a".repeat(32)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).check).toMatchObject({ website: "https://www.northside.example/", suggestedName: "northside.example" });
    expect((await get("?check=../etc")).status).toBe(404);
  });

  it("starts the business from a check and points at Getting started", async () => {
    mocks.start.mockResolvedValue({ workspaceId: BUSINESS, workId: "5a000000-0000-4000-8000-0000000000c1", reused: false, alreadyCreated: false });
    const response = await post({ action: "start_from_check", resultId: "scan_abc", name: "Northside Bakery" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ workspaceId: BUSINESS, location: `/workspace/getting-started?workspaceId=${BUSINESS}&check=5a000000-0000-4000-8000-0000000000c1` });
    expect(mocks.start).toHaveBeenCalledWith(ACTOR, { action: "start_from_check", resultId: "scan_abc", name: "Northside Bakery" });
    expect(mocks.funnel).toHaveBeenCalledWith("business_created", BUSINESS, { workspaceId: BUSINESS });
  });

  it("answers 200 without a new business event on a retry or reuse", async () => {
    mocks.start.mockResolvedValue({ workspaceId: BUSINESS, workId: "5a000000-0000-4000-8000-0000000000c1", reused: true, alreadyCreated: true });
    expect((await post({ action: "start_from_check", resultId: "scan_abc", name: "Northside Bakery" })).status).toBe(200);
    expect(mocks.funnel).not.toHaveBeenCalledWith("business_created", expect.anything(), expect.anything());
  });

  it("refuses cross-site writes, unknown actions and maps failures without leaking detail", async () => {
    expect((await post({ action: "start_from_check", resultId: "scan_abc", name: "N" }, { origin: "https://evil.example", "content-type": "application/json" })).status).toBe(403);
    expect((await post({ action: "delete_business", workspaceId: BUSINESS })).status).toBe(400);
    mocks.start.mockRejectedValueOnce(new GettingStartedUnavailableError("This check has expired or is unavailable. Run another check."));
    expect((await post({ action: "start_from_check", resultId: "scan_abc", name: "N" })).status).toBe(422);
    mocks.readWebsite.mockRejectedValueOnce(new WorkspaceAccessError());
    expect((await post({ action: "read_website", workspaceId: BUSINESS, url: "northside.example" })).status).toBe(403);
    mocks.confirm.mockRejectedValueOnce(new Error("db password=secret"));
    const failed = await post({ action: "decide_found_facts", workspaceId: BUSINESS, revision: 1, decisions: [] });
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("secret");
  });

  it("rate-limits writes per person", async () => {
    mocks.limited.mockResolvedValue(true);
    expect((await post({ action: "read_website", workspaceId: BUSINESS, url: "northside.example" })).status).toBe(429);
    expect(mocks.readWebsite).not.toHaveBeenCalled();
  });
});
