import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reviewedRebuild, type localSql } from "../../tests/support/journeys";
import { noLoginMakeRealDiscovery, safeDiscoveryRead } from "../../tests/support/no-login-discovery";

const workspaceId = "dddddddd-1000-4000-8000-000000000001";
const userId = "dddddddd-1000-4000-8000-000000000002";
const workId = "dddddddd-1000-4000-8000-000000000003";
const tenantStableId = "dddddddd-1000-4000-8000-000000000004";
const input = { workspaceId, workId, tenantStableId, tenantId: "harbor", chaseStartedAt: "2026-10-09T04:00:00Z" };

function database() {
  const work = { id: workId, product_id: "websites", resource_kind: "website", title: "Harbor rebuild", payload: reviewedRebuild(workId, input.tenantId, userId) };
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: work, error: null })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const from = vi.fn(() => query);
  const rpc = vi.fn(async (name: string) => ({ data: name === "read_business_systems"
    ? { businessId: workspaceId, systems: [], connections: [] }
    : { businessId: workspaceId, scope: "business", savedWork: [], managedWebsites: [{ link: "tenant_link", tenantStableId,
      tenantId: input.tenantId, siteName: "Harbor", tenantActive: true, linkedAt: input.chaseStartedAt }],
      inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [] }, error: null }));
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc };
}

describe("pre-cleanup no-login discovery evidence", () => {
  it("checks the original reviewed rebuild and bound website without minting a session or exposing its identity", async () => {
    const db = database();
    const readSql: typeof localSql = <T>(sql: string) => {
      expect(sql).toContain("begin read only;"); expect(sql).toContain("rollback;");
      return { sessions: [{ userId, providerId: workspaceId, email: "private-staff@example.test", verified: true, holds: true }], tenantLinkCount: 1, decisionStates: [] } as T;
    };
    const result = await noLoginMakeRealDiscovery(db.client, input, readSql);
    expect(result.rebuild).toMatchObject({ valid: true, status: "review_ready", readyCandidate: true, candidateTargetsTenant: true });
    expect(result.projection).toMatchObject({ status: "read", websiteCount: 1, boundWebsiteCount: 1 });
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls.map(call => call[0])).toEqual(["read_business_systems", "read_existing_business_systems"]);
    expect(JSON.stringify(result)).not.toContain("private-staff");
    expect(JSON.stringify(result)).not.toContain(userId);
  });

  it("leaves an unadmitted projection unknown rather than reading as an invented owner", async () => {
    const db = database();
    const readSql: typeof localSql = <T>() => ({ sessions: [], tenantLinkCount: 1, decisionStates: [] }) as T;
    const result = await noLoginMakeRealDiscovery(db.client, input, readSql);
    expect(result.projection.status).toBe("not_read_no_admitted_session");
    expect(result.serviceSessions.count).toBe(0);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(safeDiscoveryRead({ code: "secret-token@example.test" })).toEqual({ status: "unavailable", code: "unknown" });
  });

  it("does not reuse a historical service identity after its current authority is withdrawn", async () => {
    const db = database();
    const readSql: typeof localSql = <T>() => ({ sessions: [{ userId, providerId: workspaceId, email: "private-staff@example.test",
      verified: true, holds: false }], tenantLinkCount: 1, decisionStates: [] }) as T;
    const result = await noLoginMakeRealDiscovery(db.client, input, readSql);
    expect(result.projection.status).toBe("not_read_session_no_longer_authorized");
    expect(result.serviceSessions.currentAuthorityHolds).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private-staff");
  });
});
