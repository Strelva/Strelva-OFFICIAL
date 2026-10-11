import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn(), list: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/platform/workspaces/agency-onboarding", () => ({ readAgencyOnboarding: mocks.read, listMemberAgencies: mocks.list }));

import { GET } from "@/app/api/agency-onboarding/route";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";

const AGENCY = "5a000000-0000-4000-8000-000000000010";
const get = (query = "") => GET(new Request(`https://strelva.com/api/agency-onboarding${query}`));

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_AGENCY_SIGNUP_RELEASE", "1");
  mocks.user.mockResolvedValue({ id: "5a000000-0000-4000-8000-000000000001", email: "Owner@Northside.example", email_confirmed_at: "2026-10-07" });
  mocks.list.mockResolvedValue([{ id: AGENCY, name: "Northside Web Care", role: "owner" }]);
  mocks.read.mockResolvedValue({ agency: { id: AGENCY, name: "Northside Web Care", role: "owner" }, steps: [], next: "team" });
});

describe("GET /api/agency-onboarding", () => {
  it.each([["the agency front door", "STRELVA_AGENCY_SIGNUP_RELEASE"], ["the workspace release", "STRELVA_WORKSPACE_RELEASE"]])("answers 503 while %s is off", async (_label, flag) => {
    vi.stubEnv(flag, "0");
    expect((await get()).status).toBe(503);
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it.each([null, { id: "x", email: "owner@northside.example" }])("requires a confirmed session", async (user) => {
    mocks.user.mockResolvedValue(user);
    expect((await get(`?workspaceId=${AGENCY}`)).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("lists the actor's agencies without a workspace id", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ agencies: [{ id: AGENCY, name: "Northside Web Care", role: "owner" }] });
    expect(mocks.list).toHaveBeenCalledWith({ userId: "5a000000-0000-4000-8000-000000000001", verifiedEmail: "owner@northside.example" });
  });

  it("reads one agency's checklist under the signed-in actor", async () => {
    const response = await get(`?workspaceId=${AGENCY}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ onboarding: { agency: { id: AGENCY }, next: "team" } });
    expect(mocks.read).toHaveBeenCalledWith({ userId: "5a000000-0000-4000-8000-000000000001", verifiedEmail: "owner@northside.example" }, AGENCY);
  });

  it("answers 403 for an agency the actor is not a member of, and 503 when the store fails", async () => {
    mocks.read.mockRejectedValueOnce(new WorkspaceAccessError());
    const denied = await get(`?workspaceId=${AGENCY}`);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(await denied.json())).not.toContain(AGENCY);
    mocks.read.mockRejectedValueOnce(new WorkspaceStoreError("db down: secret detail"));
    const failed = await get(`?workspaceId=${AGENCY}`);
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("secret detail");
  });
});
