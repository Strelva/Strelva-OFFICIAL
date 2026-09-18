import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockListTenantDomainClaims = vi.hoisted(() => vi.fn());
const mockGetConnections = vi.hoisted(() => vi.fn());
const mockGetEventsRaw = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenants", () => ({ getTenantConfig: mockGetTenantConfig }));
vi.mock("@/lib/domains", () => ({ listTenantDomainClaims: mockListTenantDomainClaims }));
vi.mock("@/lib/connections", () => ({ getConnections: mockGetConnections }));
vi.mock("@/lib/events", () => ({ getEventsRaw: mockGetEventsRaw }));

import { getOffboardingSnapshot } from "@/lib/offboarding";

describe("offboarding status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetTenantConfig.mockResolvedValue({ id: "acme", subscriptionStatus: "active" });
    mockListTenantDomainClaims.mockResolvedValue([{ domain: "acme.test", status: "verified", dnsStatus: "configured", sslStatus: "issued" }]);
    mockGetConnections.mockResolvedValue([{ provider: "google", status: "connected" }, { provider: "yelp", status: "disconnected" }]);
    mockGetEventsRaw.mockResolvedValue([]);
  });

  it("assembles owner-visible checkpoints from existing authorities", async () => {
    const snapshot = await getOffboardingSnapshot("acme");
    expect(snapshot.connectedProviders).toEqual(["google"]);
    expect(snapshot.checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "exports", state: "ready" }),
      expect.objectContaining({ id: "domains", state: "attention" }),
      expect.objectContaining({ id: "billing", state: "pending" }),
      expect.objectContaining({ id: "connections", state: "manual" }),
      expect.objectContaining({ id: "workspace", state: "manual" }),
    ]));
  });

  it("shows a requested site-file handoff as in progress without making destructive changes", async () => {
    mockGetEventsRaw.mockResolvedValue([{ metadata: { kind: "offboarding_handoff_request", requestedAt: "2026-09-18T12:00:00.000Z" }, status: "pending" }]);
    const snapshot = await getOffboardingSnapshot("acme");
    expect(snapshot.requestedAt).toBe("2026-09-18T12:00:00.000Z");
    expect(snapshot.checkpoints.find((item) => item.id === "site_files")).toMatchObject({ state: "pending" });
    expect(mockGetTenantConfig).toHaveBeenCalledWith("acme");
    expect(mockListTenantDomainClaims).toHaveBeenCalledWith("acme");
    expect(mockGetConnections).toHaveBeenCalledWith("acme");
  });

  it("does not claim an active billing or revocation step when nothing is connected", async () => {
    mockGetTenantConfig.mockResolvedValue({ id: "acme", subscriptionStatus: "none" });
    mockListTenantDomainClaims.mockResolvedValue([]);
    mockGetConnections.mockResolvedValue([]);
    const snapshot = await getOffboardingSnapshot("acme");
    expect(snapshot.checkpoints.find((item) => item.id === "billing")).toMatchObject({ state: "ready" });
    expect(snapshot.checkpoints.find((item) => item.id === "connections")).toMatchObject({ state: "ready" });
  });
});
