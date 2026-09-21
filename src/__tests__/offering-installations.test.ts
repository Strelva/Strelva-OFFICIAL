import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  OfferingAccessError,
  OfferingConflictError,
  OfferingNotFoundError,
  OfferingService,
  type OfferingAccess,
  type OfferingActor,
  type OfferingInstallWrite,
  type OfferingInspection,
  type OfferingInstallationRecord,
  type OfferingStore,
  type OfferingWebsiteBindingRecord,
} from "@/platform/offerings";

const BUSINESS_A = "96000000-0000-4000-8000-000000000010";
const BUSINESS_B = "96000000-0000-4000-8000-000000000011";
const APP_A = "96000000-0000-4000-8000-000000000020";
const APP_B = "96000000-0000-4000-8000-000000000021";
const INQUIRY_A = "96000000-0000-4000-8000-000000000030";
const INQUIRY_B = "96000000-0000-4000-8000-000000000031";
const owner: OfferingActor = { userId: "owner-a", verifiedEmail: "owner@example.com" };
const member: OfferingActor = { userId: "member-a", verifiedEmail: "member@example.com" };
const outsider: OfferingActor = { userId: "owner-b", verifiedEmail: "outside@example.com" };

class MemoryOfferingStore implements OfferingStore {
  private readonly rows = new Map<string, OfferingInstallationRecord>();
  private readonly websiteBindings = new Map<string, OfferingWebsiteBindingRecord>();
  private readonly idempotency = new Map<string, { digest: string; installationId: string }>();
  private readonly bindingIdempotency = new Map<string, { digest: string; bindingId: string }>();
  readonly accessByActor = new Map<string, Record<string, OfferingAccess>>([
    [owner.userId, { [BUSINESS_A]: { role: "owner", canManage: true } }],
    [member.userId, { [BUSINESS_A]: { role: "member", canManage: false } }],
    [outsider.userId, { [BUSINESS_B]: { role: "owner", canManage: true } }],
  ]);
  readonly applicationBusiness = new Map([[APP_A, BUSINESS_A], [APP_B, BUSINESS_B]]);
  readonly inquiryBusiness = new Map([[INQUIRY_A, BUSINESS_A], [INQUIRY_B, BUSINESS_B]]);
  readonly releasedApplications = new Set([APP_A, APP_B]);

  private async access(actor: OfferingActor, businessId: string): Promise<OfferingAccess> {
    const access = this.accessByActor.get(actor.userId)?.[businessId];
    if (!access) throw new OfferingAccessError();
    return structuredClone(access);
  }

  async inspect(actor: OfferingActor, businessId: string, installationId?: string): Promise<OfferingInspection> {
    const access = await this.access(actor, businessId);
    const rows = [...this.rows.values()].filter((row) => row.businessId === businessId && (!installationId || row.id === installationId));
    if (installationId && rows.length === 0) throw new OfferingNotFoundError();
    return {
      access,
      installations: rows.map((row) => structuredClone(row)),
      websiteBindings: [...this.websiteBindings.values()]
        .filter((binding) => binding.businessId === businessId)
        .map((binding) => ({ ...structuredClone(binding), actorHasTenantAccess: actor.userId === owner.userId })),
    };
  }

  async install(actor: OfferingActor, input: OfferingInstallWrite): Promise<OfferingInstallationRecord> {
    const access = await this.access(actor, input.businessId);
    if (!access.canManage) throw new OfferingAccessError();
    const key = `${input.businessId}:${input.idempotencyKey}`;
    const replay = this.idempotency.get(key);
    if (replay) {
      if (replay.digest !== input.commandDigest) throw new OfferingConflictError("Idempotency conflict.");
      return structuredClone(this.rows.get(replay.installationId)!);
    }
    let resources = input.nativeResources;
    let status: OfferingInstallationRecord["status"] = "active";
    if (resources.length === 0) {
      const applicationId = randomUUID();
      this.applicationBusiness.set(applicationId, input.businessId);
      resources = [{ kind: "application", id: applicationId }];
      status = "draft";
    }
    const resource = resources[0];
    if (resource?.kind === "application") {
      if (this.applicationBusiness.get(resource.id) !== input.businessId || (status === "active" && !this.releasedApplications.has(resource.id))) {
        throw new OfferingConflictError("Native resource is outside this business.");
      }
    } else if (resource?.kind === "managed_website") {
      const binding = this.websiteBindings.get(resource.id);
      if (!binding || binding.businessId !== input.businessId || binding.status !== "active") {
        throw new OfferingConflictError("Website attachment is unavailable to this business.");
      }
    } else if (resource?.kind === "inquiry_workspace") {
      if (this.inquiryBusiness.get(resource.id) !== input.businessId) {
        throw new OfferingConflictError("Native resource is outside this business.");
      }
    } else {
      throw new OfferingConflictError("Native resource is outside this business.");
    }
    if ([...this.rows.values()].some((row) => row.businessId === input.businessId && row.definitionId === input.definitionId && row.status !== "retired")) {
      throw new OfferingConflictError("Offering already installed.");
    }
    const now = new Date().toISOString();
    const row: OfferingInstallationRecord = {
      id: randomUUID(),
      businessId: input.businessId,
      definitionId: input.definitionId,
      definitionVersion: input.definitionVersion,
      status,
      revision: 1,
      configuration: structuredClone(input.configuration),
      nativeResources: structuredClone(resources),
      responsibility: structuredClone(input.responsibility),
      acceptedScope: [...input.acceptedScope],
      surfaceIds: [...input.surfaceIds],
      installedBy: actor.userId,
      installedAt: now,
      updatedBy: actor.userId,
      updatedAt: now,
    };
    this.rows.set(row.id, structuredClone(row));
    this.idempotency.set(key, { digest: input.commandDigest, installationId: row.id });
    return structuredClone(row);
  }

  async activate(actor: OfferingActor, input: { businessId: string; installationId: string; expectedRevision: number }): Promise<OfferingInstallationRecord> {
    const access = await this.access(actor, input.businessId);
    if (!access.canManage) throw new OfferingAccessError();
    const current = this.rows.get(input.installationId);
    const application = current?.nativeResources.find((resource) => resource.kind === "application");
    if (!current || current.businessId !== input.businessId || current.status !== "draft" || current.revision !== input.expectedRevision || !application || !this.releasedApplications.has(application.id)) {
      throw new OfferingConflictError("The native application is not released.");
    }
    const next = { ...current, status: "active" as const, revision: current.revision + 1, updatedBy: actor.userId, updatedAt: new Date().toISOString() };
    this.rows.set(next.id, structuredClone(next));
    return structuredClone(next);
  }

  async updateConfiguration(actor: OfferingActor, input: { businessId: string; installationId: string; expectedRevision: number; configuration: Record<string, unknown> }): Promise<OfferingInstallationRecord> {
    const access = await this.access(actor, input.businessId);
    if (!access.canManage) throw new OfferingAccessError();
    const current = this.rows.get(input.installationId);
    if (!current || current.businessId !== input.businessId) throw new OfferingConflictError();
    if (current.status !== "active" || current.revision !== input.expectedRevision) throw new OfferingConflictError();
    const next = { ...current, configuration: structuredClone(input.configuration), revision: current.revision + 1, updatedBy: actor.userId, updatedAt: new Date().toISOString() };
    this.rows.set(next.id, structuredClone(next));
    return structuredClone(next);
  }

  async retire(actor: OfferingActor, input: { businessId: string; installationId: string; expectedRevision: number; reason: string }): Promise<OfferingInstallationRecord> {
    const access = await this.access(actor, input.businessId);
    if (!access.canManage) throw new OfferingAccessError();
    const current = this.rows.get(input.installationId);
    if (!current || current.businessId !== input.businessId || current.status !== "active" || current.revision !== input.expectedRevision) throw new OfferingConflictError();
    const now = new Date().toISOString();
    const next: OfferingInstallationRecord = {
      ...current,
      status: "retired",
      revision: current.revision + 1,
      updatedBy: actor.userId,
      updatedAt: now,
      retiredBy: actor.userId,
      retiredAt: now,
      retirementReason: input.reason,
    };
    this.rows.set(next.id, structuredClone(next));
    return structuredClone(next);
  }

  async bindWebsite(actor: OfferingActor, input: { businessId: string; tenantId: string; idempotencyKey: string; commandDigest: string }): Promise<OfferingWebsiteBindingRecord> {
    const access = await this.access(actor, input.businessId);
    if (!access.canManage || actor.userId !== owner.userId || input.tenantId !== "website-a") throw new OfferingAccessError();
    const key = `${input.businessId}:${input.idempotencyKey}`;
    const replay = this.bindingIdempotency.get(key);
    if (replay) {
      if (replay.digest !== input.commandDigest) throw new OfferingConflictError("Idempotency conflict.");
      return structuredClone(this.websiteBindings.get(replay.bindingId)!);
    }
    if ([...this.websiteBindings.values()].some((binding) => binding.tenantId === input.tenantId && binding.status === "active")) {
      throw new OfferingConflictError("Website is already attached.");
    }
    const now = new Date().toISOString();
    const binding: OfferingWebsiteBindingRecord = {
      id: randomUUID(),
      businessId: input.businessId,
      status: "active",
      revision: 1,
      tenantId: input.tenantId,
      siteName: "Website A",
      tenantActive: true,
      actorHasTenantAccess: true,
      createdBy: actor.userId,
      createdAt: now,
      updatedBy: actor.userId,
      updatedAt: now,
    };
    this.websiteBindings.set(binding.id, structuredClone(binding));
    this.bindingIdempotency.set(key, { digest: input.commandDigest, bindingId: binding.id });
    return structuredClone(binding);
  }

  async revokeWebsiteBinding(actor: OfferingActor, input: { businessId: string; bindingId: string; expectedRevision: number; reason: string }): Promise<OfferingWebsiteBindingRecord> {
    const access = await this.access(actor, input.businessId);
    if (!access.canManage) throw new OfferingAccessError();
    const current = this.websiteBindings.get(input.bindingId);
    if (!current || current.businessId !== input.businessId) throw new OfferingNotFoundError();
    if (current.status !== "active" || current.revision !== input.expectedRevision) throw new OfferingConflictError();
    const now = new Date().toISOString();
    const next: OfferingWebsiteBindingRecord = {
      ...current,
      status: "revoked",
      revision: current.revision + 1,
      tenantActive: false,
      actorHasTenantAccess: actor.userId === owner.userId,
      updatedBy: actor.userId,
      updatedAt: now,
      revokedBy: actor.userId,
      revokedAt: now,
      revocationReason: input.reason,
    };
    this.websiteBindings.set(next.id, structuredClone(next));
    return structuredClone(next);
  }
}

function installCommand(overrides: Record<string, unknown> = {}) {
  return {
    action: "install",
    businessId: BUSINESS_A,
    definitionId: "private_staff_requests",
    definitionVersion: "1.0.0",
    idempotencyKey: "staff-requests:first",
    configuration: { displayName: "Staff help" },
    nativeResources: [{ kind: "application", id: APP_A }],
    responsibility: { kind: "customer_operated", providerName: "Example business" },
    acceptedScope: ["submit_requests", "review_requests"],
    surfaceIds: ["staff_app", "business_workspace"],
    ...overrides,
  };
}

describe("offering installation interface", () => {
  it("keeps business reads isolated and does not widen member access into management", async () => {
    const service = new OfferingService(new MemoryOfferingStore());
    const created = await service.execute(owner, installCommand());
    const memberView = await service.list(member, BUSINESS_A);
    expect(memberView.permissions).toEqual({ canRead: true, canManage: false, role: "member" });
    expect(memberView.installations.map((item) => item.id)).toEqual([created.id]);
    await expect(service.list(outsider, BUSINESS_A)).rejects.toBeInstanceOf(OfferingAccessError);
    await expect(service.read(outsider, BUSINESS_B, created.id)).rejects.toThrow(/not found/i);
    await expect(service.execute(member, { action: "retire", businessId: BUSINESS_A, installationId: created.id, expectedRevision: 1, reason: "No longer needed" })).rejects.toBeInstanceOf(OfferingAccessError);
  });

  it("rejects a native application from another business", async () => {
    const service = new OfferingService(new MemoryOfferingStore());
    await expect(service.execute(owner, installCommand({ nativeResources: [{ kind: "application", id: APP_B }] }))).rejects.toThrow(/outside this business/i);
  });

  it("makes install retries idempotent without accepting another command under the same key", async () => {
    const service = new OfferingService(new MemoryOfferingStore());
    const first = await service.execute(owner, installCommand());
    const replay = await service.execute(owner, installCommand({
      acceptedScope: ["review_requests", "submit_requests"],
      surfaceIds: ["business_workspace", "staff_app"],
    }));
    expect(replay.id).toBe(first.id);
    await expect(service.execute(owner, installCommand({ configuration: { displayName: "Another name" } }))).rejects.toThrow(/idempotency/i);
  });

  it("prepares one native draft from the default template and exposes staff use only after explicit release activation", async () => {
    const store = new MemoryOfferingStore();
    const service = new OfferingService(store);
    const draft = await service.execute(owner, installCommand({ nativeResources: undefined, idempotencyKey: "staff-requests:default" }));
    expect(draft.status).toBe("draft");
    expect(draft.nativeResources).toHaveLength(1);
    expect(draft.surfaces.find((surface) => surface.id === "staff_app")?.href).toBeNull();
    expect(draft.surfaces.find((surface) => surface.id === "business_workspace")?.href).toContain(`workspaceId=${BUSINESS_A}`);
    const replay = await service.execute(owner, installCommand({ nativeResources: undefined, idempotencyKey: "staff-requests:default" }));
    expect(replay.id).toBe(draft.id);
    const applicationId = draft.nativeResources[0]!.id;
    store.releasedApplications.add(applicationId);
    const active = await service.execute(owner, { action: "activate", businessId: BUSINESS_A, installationId: draft.id, expectedRevision: 1 });
    expect(active.status).toBe("active");
    expect(active.surfaces.find((surface) => surface.id === "staff_app")?.href).toBe(`/apps/${applicationId}`);
  });

  it("uses revision checks for configuration and returns a business-scoped workspace surface", async () => {
    const service = new OfferingService(new MemoryOfferingStore());
    const created = await service.execute(owner, installCommand());
    const changed = await service.execute(owner, {
      action: "update_configuration",
      businessId: BUSINESS_A,
      installationId: created.id,
      expectedRevision: 1,
      configuration: { displayName: "Repair requests", instructions: "Display-only note" },
    });
    expect(changed.revision).toBe(2);
    expect(changed.surfaces).toContainEqual(expect.objectContaining({
      id: "business_workspace",
      href: `/workspace?workspaceId=${BUSINESS_A}&work=${APP_A}`,
    }));
    await expect(service.execute(owner, {
      action: "update_configuration",
      businessId: BUSINESS_A,
      installationId: created.id,
      expectedRevision: 1,
      configuration: {},
    })).rejects.toBeInstanceOf(OfferingConflictError);
  });

  it("retires the installation while retaining native references, responsibility, scope, and configuration", async () => {
    const store = new MemoryOfferingStore();
    const service = new OfferingService(store);
    const created = await service.execute(owner, installCommand({
      responsibility: { kind: "provider_requested", providerKind: "strelva", providerName: "Strelva", requestNote: "Please review service options." },
    }));
    const retired = await service.execute(owner, {
      action: "retire",
      businessId: BUSINESS_A,
      installationId: created.id,
      expectedRevision: 1,
      reason: "Team changed its process",
    });
    expect(retired).toMatchObject({
      status: "retired",
      revision: 2,
      configuration: created.configuration,
      nativeResources: created.nativeResources,
      responsibility: created.responsibility,
      acceptedScope: created.acceptedScope,
      retirementReason: "Team changed its process",
    });
    expect(retired.responsibility.kind).toBe("provider_requested");
    store.accessByActor.delete(owner.userId);
    await expect(service.read(owner, BUSINESS_A, created.id)).rejects.toBeInstanceOf(OfferingAccessError);
  });

  it("requires an explicit website attachment and makes the existing inquiry workspace installable", async () => {
    const service = new OfferingService(new MemoryOfferingStore());
    const definitions = (await service.list(owner, BUSINESS_A)).definitions;
    expect(definitions.find((item) => item.id === "managed_website_changes")?.installability).toBe("available");
    expect(definitions.find((item) => item.id === "customer_inquiry_intake")?.installability).toBe("available");
    await expect(service.execute(owner, installCommand({
      definitionId: "managed_website_changes",
      nativeResources: [{ kind: "managed_website", id: APP_A }],
      acceptedScope: ["request_changes"],
      surfaceIds: ["managed_website"],
      configuration: {},
    }))).rejects.toThrow(/attachment|business/i);
  });

  it("installs the customer inquiry intake against the business-owned workspace and resolves its destination", async () => {
    const service = new OfferingService(new MemoryOfferingStore());
    const installation = await service.execute(owner, installCommand({
      definitionId: "customer_inquiry_intake",
      idempotencyKey: "inquiry-intake:first",
      configuration: {},
      nativeResources: [{ kind: "inquiry_workspace", id: INQUIRY_A }],
      acceptedScope: ["handle_inquiries"],
      surfaceIds: ["inquiry_workspace"],
    }));
    expect(installation.status).toBe("active");
    expect(installation.surfaces).toEqual([expect.objectContaining({
      id: "inquiry_workspace",
      href: `/workspace?workspaceId=${BUSINESS_A}&view=inquiries&inquiryWorkspaceId=${INQUIRY_A}`,
    })]);
    await expect(service.execute(owner, installCommand({
      definitionId: "customer_inquiry_intake",
      idempotencyKey: "inquiry-intake:other-business",
      configuration: {},
      nativeResources: [{ kind: "inquiry_workspace", id: INQUIRY_B }],
      acceptedScope: ["handle_inquiries"],
      surfaceIds: ["inquiry_workspace"],
    }))).rejects.toThrow(/outside this business/i);
  });

  it("attaches a website only through dual ownership and does not turn business access into tenant access", async () => {
    const store = new MemoryOfferingStore();
    const service = new OfferingService(store);
    const binding = await service.executeWebsiteBinding(owner, {
      action: "bind_managed_website",
      businessId: BUSINESS_A,
      tenantId: "website-a",
      idempotencyKey: "website-a:first",
    });
    expect(binding).toMatchObject({ status: "active", tenantId: "website-a", canOpen: true });
    expect(binding.surface.href).toBe("/client/website-a");

    const memberView = await service.list(member, BUSINESS_A);
    expect(memberView.websiteBindings[0]).toMatchObject({ id: binding.id, canOpen: false });
    expect(memberView.websiteBindings[0]?.surface.href).toBeNull();
    await expect(service.executeWebsiteBinding(member, {
      action: "bind_managed_website",
      businessId: BUSINESS_A,
      tenantId: "website-a",
      idempotencyKey: "member-attempt",
    })).rejects.toBeInstanceOf(OfferingAccessError);
  });

  it("installs against a binding UUID and removes its surface after revocation without losing installation data", async () => {
    const store = new MemoryOfferingStore();
    const service = new OfferingService(store);
    const binding = await service.executeWebsiteBinding(owner, {
      action: "bind_managed_website",
      businessId: BUSINESS_A,
      tenantId: "website-a",
      idempotencyKey: "website-a:install",
    });
    const installation = await service.execute(owner, installCommand({
      definitionId: "managed_website_changes",
      idempotencyKey: "website-offering:first",
      nativeResources: [{ kind: "managed_website", id: binding.id }],
      acceptedScope: ["request_changes"],
      surfaceIds: ["managed_website"],
      configuration: {},
    }));
    expect(installation.surfaces[0]?.href).toBe("/client/website-a");

    const revoked = await service.executeWebsiteBinding(owner, {
      action: "revoke_managed_website_binding",
      businessId: BUSINESS_A,
      bindingId: binding.id,
      expectedRevision: 1,
      reason: "Website left this business",
    });
    expect(revoked).toMatchObject({ status: "revoked", revision: 2, canOpen: false });
    const after = await service.read(owner, BUSINESS_A, installation.id);
    expect(after.nativeResources).toEqual([{ kind: "managed_website", id: binding.id }]);
    expect(after.surfaces[0]?.href).toBeNull();
  });

  it("does not accept a browser-supplied actor or surface URL", async () => {
    const service = new OfferingService(new MemoryOfferingStore());
    await expect(service.execute(owner, {
      ...installCommand(),
      actorId: outsider.userId,
    })).rejects.toThrow(/invalid/i);
    await expect(service.execute(owner, {
      ...installCommand(),
      nativeResources: [{ kind: "managed_website", id: "https://example.com/admin" }],
    })).rejects.toThrow(/invalid/i);
  });
});
