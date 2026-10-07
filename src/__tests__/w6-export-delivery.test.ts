import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({ send: vi.fn(), override: vi.fn(), alert: vi.fn() }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmailWithReceipt: doubles.send }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: doubles.override }));
vi.mock("@/platform/infra/monitoring", () => ({ alert: doubles.alert }));
import { deliverWorkspaceExportLink } from "@/platform/workspace-exports/v3-delivery";
import type { V3Manifest } from "@/platform/workspace-exports/v3";

const input = {
  buildId: "build-1", token: "never-log-this-token", deliverTo: "record-owner@example.test", workspaceId: "workspace-1",
  tenantIds: ["site-a", "site-b"], baseUrl: "https://strelva.example.test",
  manifest: { included: [], unavailable: [] } as unknown as V3Manifest,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_EXPORT_LINK_EMAIL", "1");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
  vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
  doubles.override.mockResolvedValue("inherit");
  doubles.send.mockResolvedValue({ status: "accepted", providerMessageId: "email-1", acceptedAt: "2026-10-07T00:00:00Z" });
});
afterEach(() => vi.unstubAllEnvs());

describe("export link rollout and client gates", () => {
  it.each(["STRELVA_EXPORT_LINK_EMAIL", "EMAIL_SENDING_ENABLED", "CUSTOMER_EMAIL_ENABLED"])("%s off suppresses even an armed tenant", async flag => {
    vi.stubEnv(flag, "");
    doubles.override.mockResolvedValue("on");
    expect(await deliverWorkspaceExportLink(input)).toBe("suppressed");
    expect(doubles.send).not.toHaveBeenCalled();
    expect(JSON.stringify(doubles.alert.mock.calls)).not.toContain(input.token);
  });

  it("checks every linked site and blocks if any site is paused", async () => {
    doubles.override.mockImplementation(async (tenantId: string) => tenantId === "site-b" ? "off" : "on");
    expect(await deliverWorkspaceExportLink(input)).toBe("suppressed");
    expect(doubles.override.mock.calls).toEqual([["site-a"], ["site-b"]]);
    expect(doubles.send).not.toHaveBeenCalled();
  });

  it("fails closed when a tenant gate cannot be read", async () => {
    doubles.override.mockRejectedValue(new Error("database down"));
    expect(await deliverWorkspaceExportLink(input)).toBe("suppressed");
    expect(doubles.send).not.toHaveBeenCalled();
  });

  it("sends once to the database-selected owner through the shared sender", async () => {
    expect(await deliverWorkspaceExportLink(input)).toBe("accepted");
    expect(doubles.send).toHaveBeenCalledOnce();
    expect(doubles.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "client", to: input.deliverTo, idempotencyKey: "workspace-export-build-1" }));
  });
});
