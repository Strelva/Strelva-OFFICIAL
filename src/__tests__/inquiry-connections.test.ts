import { describe, expect, it } from "vitest";
import type { Connection } from "@/lib/types";
import { projectInquiryConnections } from "@/products/inquiries/connections";

const connection: Connection = {
  tenantId: "example",
  provider: "google",
  accessToken: "fixture-access-secret",
  refreshToken: "fixture-refresh-secret",
  apiKey: "fixture-api-secret",
  status: "connected",
  lastSyncedAt: "2026-09-11T12:00:00.000Z",
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
};

describe("inquiry connection consent projection", () => {
  it("shows only recorded permissions and never serializes credentials", () => {
    const rows = projectInquiryConnections("example", [connection], "/dashboard/integrations");
    expect(rows[0]).toMatchObject({ canSee: ["Search Console reports"], canDo: [], lastCheckedAt: connection.lastSyncedAt });
    expect(JSON.stringify(rows)).not.toContain("secret");
    expect(JSON.stringify(rows)).not.toContain("Token");
    expect(rows.filter((row) => ["email", "stripe", "mls"].includes(row.id)).every((row) => row.status === "not_configured")).toBe(true);
  });

  it("does not grant capabilities from another tenant or a revoked connection", () => {
    expect(projectInquiryConnections("other", [connection], "/dashboard/integrations")[0]?.status).toBe("not_configured");
    expect(projectInquiryConnections("example", [{ ...connection, status: "needs_reauth" }], "/dashboard/integrations")[0]).toMatchObject({ status: "needs_reauth", canSee: [], canDo: [] });
  });

  it("distinguishes a failed read from an absent connection and unknown check time", () => {
    expect(projectInquiryConnections("example", null, "/dashboard/integrations").every((row) => row.status === "unavailable")).toBe(true);
    expect(projectInquiryConnections("example", [{ ...connection, lastSyncedAt: "invalid" }], "/dashboard/integrations")[0]?.lastCheckedAt).toBeNull();
  });
});
