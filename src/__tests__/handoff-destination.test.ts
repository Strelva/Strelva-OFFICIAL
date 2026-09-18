import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rate: vi.fn(),
  inspect: vi.fn(),
  accept: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/platform/workspaces", async () => {
  const actual = await vi.importActual<typeof import("@/platform/workspaces")>("@/platform/workspaces");
  return { ...actual, inspectHandoff: mocks.inspect, acceptHandoff: mocks.accept };
});

import { POST } from "@/app/api/workspace/route";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const sourceWork = {
  id: "22222222-2222-4222-8222-222222222222",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  title: "Prepared assessment",
  productId: "ai_visibility",
  resourceKind: "ai_visibility_assessment",
  payload: {
    business: "Example",
    score: 70,
    grade: "C",
    verdict: "Readiness signals found",
    topFix: "Add business schema",
    signals: [],
    citation: { probed: false, mentioned: false, recommended: false, note: "Not measured" },
  },
  input: {},
  createdAt: "2026-09-05T00:00:00Z",
};

const destinations = [
  { id: "31111111-1111-4111-8111-111111111111", name: "First business" },
  { id: "32222222-2222-4222-8222-222222222222", name: "Second business" },
];
const firstDestination = destinations[0]!;
const secondDestination = destinations[1]!;

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260914010000_handoff_destinations.sql"),
  "utf8",
);

function request(value: unknown) {
  return new Request("https://strelva.com/api/workspace", {
    method: "POST",
    headers: { origin: "https://strelva.com", "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  mocks.user.mockResolvedValue({ id: "actor", email: "OWNER@example.com", email_confirmed_at: "2026-09-05" });
  mocks.rate.mockResolvedValue(false);
  mocks.inspect.mockResolvedValue({
    recipientEmail: "owner@example.com",
    agencyWorkspace: { id: "11111111-1111-4111-8111-111111111111", name: "Agency", kind: "agency" },
    work: sourceWork,
    status: "pending",
    expiresAt: "2026-09-12",
    destinations,
  });
});

describe("handoff destination API seam", () => {
  it("durably binds new and existing destination requests and locks membership checks", () => {
    expect(migration).toContain("accepted_destination_kind text");
    expect(migration).toContain("accepted_destination_name text");
    expect(migration).toContain("p_customer_workspace_id uuid");
    expect(migration).toContain("p_customer_workspace_name text");
    expect(migration).toContain("handoff_destination_changed");
    expect(migration).toContain("and m.user_id = p_user_id\n      for update");
    expect(migration).toContain("raise exception 'handoff_destination_required'");
  });

  it("returns current business choices from handoff inspection", async () => {
    const response = await POST(request({ action: "inspect_handoff", token: "opaque-token" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ destinations });
  });

  it("requires and forwards an existing business destination", async () => {
    mocks.accept.mockResolvedValue({ customerWorkspaceId: secondDestination.id, customerWorkId: sourceWork.id });
    const response = await POST(request({
      action: "accept_handoff",
      token: "opaque-token",
      destination: { kind: "existing", workspaceId: secondDestination.id },
      allowAgencyAccess: false,
    }));
    expect(response.status).toBe(200);
    expect(mocks.accept).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "actor", verifiedEmail: "owner@example.com" }),
      "opaque-token",
      { kind: "existing", workspaceId: secondDestination.id },
      false,
    );
  });

  it("forwards a named new business destination", async () => {
    mocks.accept.mockResolvedValue({ customerWorkspaceId: "33333333-3333-4333-8333-333333333333", customerWorkId: sourceWork.id });
    const response = await POST(request({
      action: "accept_handoff",
      token: "opaque-token",
      destination: { kind: "new", name: "New customer business" },
      allowAgencyAccess: false,
    }));
    expect(response.status).toBe(200);
    expect(mocks.accept).toHaveBeenCalledWith(
      expect.any(Object),
      "opaque-token",
      { kind: "new", name: "New customer business" },
      false,
    );
  });

  it("rejects the old implicit destination request", async () => {
    const response = await POST(request({ action: "accept_handoff", token: "opaque-token", allowAgencyAccess: false }));
    expect(response.status).toBe(400);
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("returns destination access failures without accepting the handoff", async () => {
    mocks.accept.mockRejectedValue(new WorkspaceAccessError("destination membership required"));
    const response = await POST(request({
      action: "accept_handoff",
      token: "opaque-token",
      destination: { kind: "existing", workspaceId: firstDestination.id },
      allowAgencyAccess: false,
    }));
    expect(response.status).toBe(403);
  });
});
