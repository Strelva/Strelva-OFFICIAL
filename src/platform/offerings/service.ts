import { createHash } from "node:crypto";
import { z } from "zod";
import { getOfferingDefinition, listOfferingDefinitions, resolveOfferingSurfaces } from "./definitions";
import type { OfferingStore } from "./store";
import {
  OfferingAccessError,
  OfferingConflictError,
  OfferingNotFoundError,
  OfferingValidationError,
  type OfferingActor,
  type OfferingCollection,
  type OfferingDefinitionView,
  type OfferingInstallation,
  type OfferingInstallationRecord,
  type OfferingResponsibility,
  type OfferingWebsiteBinding,
  type OfferingWebsiteBindingRecord,
} from "./types";

const UUID = z.string().uuid();
const identifier = z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/);
const version = z.string().trim().min(1).max(32).regex(/^\d+\.\d+\.\d+$/);
const configuration = z.record(z.string(), z.unknown()).refine(
  (value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 4_000,
  "Configuration is too large.",
);
const responsibility = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("customer_operated"), providerName: z.string().trim().min(1).max(120) }).strict(),
  z.object({
    kind: z.literal("provider_requested"),
    providerKind: z.enum(["strelva", "agency", "named_third_party"]),
    providerName: z.string().trim().min(1).max(120),
    agencyWorkspaceId: z.string().uuid().optional(),
    requestNote: z.string().trim().min(1).max(500).optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.providerKind === "agency" && !value.agencyWorkspaceId) {
      ctx.addIssue({ code: "custom", path: ["agencyWorkspaceId"], message: "Choose the agency workspace." });
    }
    if (value.providerKind !== "agency" && value.agencyWorkspaceId) {
      ctx.addIssue({ code: "custom", path: ["agencyWorkspaceId"], message: "An agency workspace is only valid for an agency provider." });
    }
  }),
]);
const nativeResource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("application"), id: UUID }).strict(),
  z.object({ kind: z.literal("inquiry_workspace"), id: UUID }).strict(),
  // The resource id is the verified binding UUID, never a tenant slug, domain,
  // browser URL, or direct claim of tenant authority.
  z.object({ kind: z.literal("managed_website"), id: UUID }).strict(),
]);
const installCommand = z.object({
  action: z.literal("install"),
  businessId: UUID,
  definitionId: identifier,
  definitionVersion: version,
  idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
  configuration,
  nativeResources: z.array(nativeResource).max(8).default([]),
  responsibility,
  acceptedScope: z.array(identifier).min(1).max(16),
  surfaceIds: z.array(identifier).min(1).max(16),
}).strict();
const updateCommand = z.object({
  action: z.literal("update_configuration"),
  businessId: UUID,
  installationId: UUID,
  expectedRevision: z.number().int().positive(),
  configuration,
}).strict();
const activateCommand = z.object({
  action: z.literal("activate"),
  businessId: UUID,
  installationId: UUID,
  expectedRevision: z.number().int().positive(),
}).strict();
const retireCommand = z.object({
  action: z.literal("retire"),
  businessId: UUID,
  installationId: UUID,
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
}).strict();
const commandSchema = z.discriminatedUnion("action", [installCommand, activateCommand, updateCommand, retireCommand]);
const websiteBindingCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bind_managed_website"), businessId: UUID,
    tenantId: z.string().trim().min(1).max(63).regex(/^[a-z0-9][a-z0-9-]*$/),
    idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/) }).strict(),
  z.object({ action: z.literal("revoke_managed_website_binding"), businessId: UUID,
    bindingId: UUID, expectedRevision: z.number().int().positive(), reason: z.string().trim().min(1).max(500) }).strict(),
]);

function actorValue(input: OfferingActor): OfferingActor {
  const userId = input.userId.trim();
  const verifiedEmail = input.verifiedEmail.trim().toLowerCase();
  if (!userId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifiedEmail)) throw new OfferingAccessError();
  return { userId, verifiedEmail };
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validateConfiguration(definition: OfferingDefinitionView, value: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Map(definition.configurationFields.map((field) => [field.id, field]));
  for (const [key, candidate] of Object.entries(value)) {
    const field = allowed.get(key);
    if (!field) throw new OfferingValidationError(`Configuration field ${key} is not supported by this offering version.`);
    if (field.kind === "boolean") {
      if (typeof candidate !== "boolean") throw new OfferingValidationError(`Configuration field ${key} must be a boolean.`);
      continue;
    }
    if (typeof candidate !== "string" || !candidate.trim() || candidate.length > (field.maximumLength ?? 1_000)) {
      throw new OfferingValidationError(`Configuration field ${key} is invalid.`);
    }
  }
  for (const field of definition.configurationFields) {
    if (field.required && value[field.id] === undefined) throw new OfferingValidationError(`Configuration field ${field.id} is required.`);
  }
  return value;
}

function validateInstall(command: z.infer<typeof installCommand>): z.infer<typeof installCommand> {
  const definition = getOfferingDefinition(command.definitionId, command.definitionVersion);
  if (!definition) throw new OfferingValidationError("This offering definition version is unavailable.");
  if (definition.installability !== "available") {
    throw new OfferingConflictError(definition.installationNote);
  }
  if (!unique(command.acceptedScope) || !unique(command.surfaceIds)) throw new OfferingValidationError("Offering scopes and surfaces cannot be repeated.");
  const allowedScopes = new Set(definition.scopes.map((scope) => scope.id));
  const allowedSurfaces = new Set(definition.surfaces.map((surface) => surface.id));
  if (command.acceptedScope.some((scope) => !allowedScopes.has(scope)) || definition.scopes.some((scope) => scope.required && !command.acceptedScope.includes(scope.id))) {
    throw new OfferingValidationError("The accepted scope does not match this offering version.");
  }
  if (command.surfaceIds.some((surface) => !allowedSurfaces.has(surface)) || definition.surfaces.some((surface) => surface.required && !command.surfaceIds.includes(surface.id))) {
    throw new OfferingValidationError("The selected surfaces do not match this offering version.");
  }
  const preparesDefault = definition.id === "private_staff_requests" && command.nativeResources.length === 0;
  for (const requirement of definition.requiredResources) {
    const count = command.nativeResources.filter((resource) => resource.kind === requirement.kind).length;
    if ((!preparesDefault && count < requirement.minimum) || count > requirement.maximum) throw new OfferingValidationError("The native resources do not match this offering version.");
  }
  const expectedKinds = new Set(definition.requiredResources.map((requirement) => requirement.kind));
  if (command.nativeResources.some((resource) => !expectedKinds.has(resource.kind))) throw new OfferingValidationError("The native resources do not match this offering version.");
  validateConfiguration(definition, command.configuration);
  return command;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestInstall(command: z.infer<typeof installCommand>): string {
  return createHash("sha256").update(canonical({
    businessId: command.businessId,
    definitionId: command.definitionId,
    definitionVersion: command.definitionVersion,
    configuration: command.configuration,
    nativeResources: [...command.nativeResources].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    responsibility: command.responsibility,
    acceptedScope: [...command.acceptedScope].sort(),
    surfaceIds: [...command.surfaceIds].sort(),
  })).digest("hex");
}

function presentWebsiteBinding(record: OfferingWebsiteBindingRecord): OfferingWebsiteBinding {
  const { actorHasTenantAccess, ...binding } = record;
  const canOpen = record.status === "active" && record.tenantActive && actorHasTenantAccess;
  return { ...binding, canOpen, surface: {
    id: "managed_website", label: record.siteName,
    description: "The website's existing authenticated management surface.",
    href: canOpen ? `/client/${encodeURIComponent(record.tenantId)}` : null,
  } };
}

function present(record: OfferingInstallationRecord, bindings: readonly OfferingWebsiteBindingRecord[] = []): OfferingInstallation {
  const { surfaceIds, ...installation } = record;
  const surfaces = resolveOfferingSurfaces(record.definitionId, record.definitionVersion, record.nativeResources, surfaceIds, record.businessId, record.status);
  const websiteBindingId = record.nativeResources.find((resource) => resource.kind === "managed_website")?.id;
  const websiteBinding = websiteBindingId ? bindings.find((binding) => binding.id === websiteBindingId) : undefined;
  return {
    ...installation,
    surfaces: surfaces.map((surface) => surface.id === "managed_website" && websiteBinding ? presentWebsiteBinding(websiteBinding).surface : surface),
  };
}

export class OfferingService {
  constructor(private readonly store: OfferingStore) {}

  async list(actor: OfferingActor, businessId: string, installationId?: string): Promise<OfferingCollection> {
    const current = actorValue(actor);
    const parsedBusinessId = UUID.safeParse(businessId);
    if (!parsedBusinessId.success) throw new OfferingValidationError("A valid business id is required.");
    const parsedInstallationId = installationId === undefined ? undefined : UUID.safeParse(installationId);
    if (parsedInstallationId && !parsedInstallationId.success) throw new OfferingValidationError("A valid installation id is required.");
    const inspection = await this.store.inspect(current, parsedBusinessId.data, parsedInstallationId?.data);
    const records = inspection.installations;
    return {
      businessId: parsedBusinessId.data,
      permissions: { canRead: true, canManage: inspection.access.canManage, role: inspection.access.role },
      definitions: listOfferingDefinitions(),
      installations: records.map((record) => present(record, inspection.websiteBindings)),
      websiteBindings: inspection.websiteBindings.map(presentWebsiteBinding),
    };
  }

  async read(actor: OfferingActor, businessId: string, installationId: string): Promise<OfferingInstallation> {
    const collection = await this.list(actor, businessId, installationId);
    const installation = collection.installations[0];
    if (!installation) throw new OfferingNotFoundError();
    return installation;
  }

  async execute(actor: OfferingActor, rawCommand: unknown): Promise<OfferingInstallation> {
    const current = actorValue(actor);
    const parsed = commandSchema.safeParse(rawCommand);
    if (!parsed.success) throw new OfferingValidationError();
    const command = parsed.data;
    const inspection = await this.store.inspect(current, command.businessId, command.action === "install" ? undefined : command.installationId);
    if (!inspection.access.canManage) throw new OfferingAccessError("Owner or admin access is required to manage an offering.");

    if (command.action === "install") {
      const validated = validateInstall(command);
      return present(await this.store.install(current, {
        ...validated,
        commandDigest: digestInstall(validated),
        responsibility: validated.responsibility as OfferingResponsibility,
      }), inspection.websiteBindings);
    }

    const existing = inspection.installations[0];
    if (!existing) throw new OfferingNotFoundError();
    const definition = getOfferingDefinition(existing.definitionId, existing.definitionVersion);
    if (!definition) throw new OfferingConflictError("The installed offering definition version is unavailable.");
    if (command.action === "activate") {
      return present(await this.store.activate(current, command), inspection.websiteBindings);
    }
    if (command.action === "update_configuration") {
      return present(await this.store.updateConfiguration(current, {
        ...command,
        configuration: validateConfiguration(definition, command.configuration),
      }), inspection.websiteBindings);
    }
    return present(await this.store.retire(current, command), inspection.websiteBindings);
  }

  async executeWebsiteBinding(actor: OfferingActor, rawCommand: unknown): Promise<OfferingWebsiteBinding> {
    const current = actorValue(actor);
    const parsed = websiteBindingCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw new OfferingValidationError();
    const command = parsed.data;
    const inspection = await this.store.inspect(current, command.businessId);
    if (!inspection.access.canManage) throw new OfferingAccessError("Owner or admin access is required to attach a website.");
    if (command.action === "bind_managed_website") {
      const commandDigest = createHash("sha256").update(canonical(command)).digest("hex");
      return presentWebsiteBinding(await this.store.bindWebsite(current, { ...command, commandDigest }));
    }
    return presentWebsiteBinding(await this.store.revokeWebsiteBinding(current, command));
  }
}
