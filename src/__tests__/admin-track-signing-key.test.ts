vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: vi.fn(async () => undefined), authorizeTenantOperatorRead: vi.fn(async () => undefined) }));
import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsSuperAdmin = vi.fn(() => Promise.resolve(true));
const mockGetTenantConfig = vi.fn(() => Promise.resolve({ id: "gldf", siteName: "GLDF" }));
const mockUpdateTenant = vi.fn();
const mockSetTrackPublicKey = vi.fn((_tenant: string, _key: string | null) => Promise.resolve());
const mockLogAuditEvent = vi.fn((_event: unknown) => Promise.resolve());

vi.mock("@/platform/infra/auth", () => ({
  isSuperAdmin: () => mockIsSuperAdmin(),
  getActorContext: () => Promise.resolve({ kind: "operator" }),
}));

vi.mock("@/lib/storage", () => ({ logAuditEvent: (event: unknown) => mockLogAuditEvent(event) }));

vi.mock("@/lib/tenants", () => ({
  getAllTenants: vi.fn(),
  createTenant: vi.fn(),
  updateTenant: (...args: unknown[]) => mockUpdateTenant(...args),
  isActiveTenant: vi.fn(),
  getTenantConfig: () => mockGetTenantConfig(),
}));

vi.mock("@/lib/features/registry", () => ({
  applyFeatureChange: vi.fn(),
  cleanTenantFeatureIds: vi.fn((features: unknown) => features),
  FeatureGuardError: class FeatureGuardError extends Error {},
}));

vi.mock("@/lib/tracking-signing-keys", () => ({
  setTenantTrackPublicKey: (tenant: string, key: string | null) => mockSetTrackPublicKey(tenant, key),
}));

import { PATCH } from "@/app/api/admin/tenants/route";

function patch(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/tenants", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin tracking signing key setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuperAdmin.mockResolvedValue(true);
    mockGetTenantConfig.mockResolvedValue({ id: "gldf", siteName: "GLDF" });
    mockSetTrackPublicKey.mockResolvedValue();
  });

  it("stores a valid public key without returning the key value", async () => {
    const pair = generateKeyPairSync("ed25519");
    const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();

    const response = await PATCH(patch({ id: "gldf", trackingPublicKey: publicKey }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.trackingPublicKeyConfigured).toBe(true);
    expect(JSON.stringify(body)).not.toContain("BEGIN PUBLIC KEY");
    expect(mockSetTrackPublicKey).toHaveBeenCalledWith("gldf", publicKey);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
    expect(JSON.stringify(mockLogAuditEvent.mock.calls)).not.toContain("BEGIN PUBLIC KEY");
  });

  it("rejects invalid keys and supports clearing a configured key", async () => {
    const invalid = await PATCH(patch({ id: "gldf", trackingPublicKey: "not-a-public-key" }));
    expect(invalid.status).toBe(400);
    expect(mockSetTrackPublicKey).not.toHaveBeenCalled();

    const cleared = await PATCH(patch({ id: "gldf", trackingPublicKey: "" }));
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).trackingPublicKeyConfigured).toBe(false);
    expect(mockSetTrackPublicKey).toHaveBeenCalledWith("gldf", null);
  });

  it("requires a super admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const response = await PATCH(patch({ id: "gldf", trackingPublicKey: "" }));
    expect(response.status).toBe(403);
    expect(mockSetTrackPublicKey).not.toHaveBeenCalled();
  });
});
