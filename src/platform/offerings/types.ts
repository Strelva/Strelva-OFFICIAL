export const OFFERING_NATIVE_RESOURCE_KINDS = [
  "application",
  "inquiry_workspace",
  "managed_website",
] as const;

export type OfferingNativeResourceKind = (typeof OFFERING_NATIVE_RESOURCE_KINDS)[number];
export type OfferingAvailability = "local" | "release_gated" | "existing_clients";
export type OfferingInstallability = "available" | "provider_only" | "not_enabled";
export type OfferingStatus = "draft" | "active" | "retired";
export type OfferingWorkspaceRole = "owner" | "admin" | "member";

export interface OfferingActor {
  userId: string;
  verifiedEmail: string;
}

export interface OfferingNativeResource {
  kind: OfferingNativeResourceKind;
  id: string;
}

export type OfferingResponsibility =
  | {
      kind: "customer_operated";
      providerName: string;
    }
  | {
      kind: "provider_requested";
      providerKind: "strelva" | "named_third_party";
      providerName: string;
      requestNote?: string;
    };

export interface OfferingScopeDefinition {
  id: string;
  label: string;
  description: string;
  required: boolean;
}

export interface OfferingResourceRequirement {
  kind: OfferingNativeResourceKind;
  minimum: number;
  maximum: number;
  description: string;
}

export interface OfferingSurfaceDefinition {
  id: string;
  label: string;
  description: string;
  href: null;
  required: boolean;
}

export interface OfferingConfigurationField {
  id: string;
  label: string;
  kind: "short_text" | "long_text" | "boolean";
  required: boolean;
  maximumLength?: number;
}

export interface OfferingDefinitionView {
  id: string;
  version: string;
  name: string;
  description: string;
  availability: OfferingAvailability;
  installability: OfferingInstallability;
  installationNote: string;
  requiredResources: readonly OfferingResourceRequirement[];
  scopes: readonly OfferingScopeDefinition[];
  surfaces: readonly OfferingSurfaceDefinition[];
  configurationFields: readonly OfferingConfigurationField[];
}

export interface OfferingSurface {
  id: string;
  label: string;
  description: string;
  href: string | null;
}

export interface OfferingInstallationRecord {
  id: string;
  businessId: string;
  definitionId: string;
  definitionVersion: string;
  status: OfferingStatus;
  revision: number;
  configuration: Record<string, unknown>;
  nativeResources: readonly OfferingNativeResource[];
  responsibility: OfferingResponsibility;
  acceptedScope: readonly string[];
  surfaceIds: readonly string[];
  installedBy: string;
  installedAt: string;
  updatedBy: string;
  updatedAt: string;
  retiredBy?: string;
  retiredAt?: string;
  retirementReason?: string;
}

export interface OfferingInstallation extends Omit<OfferingInstallationRecord, "surfaceIds"> {
  surfaces: readonly OfferingSurface[];
}

export interface OfferingWebsiteBindingRecord {
  id: string;
  businessId: string;
  status: "active" | "revoked";
  revision: number;
  tenantId: string;
  siteName: string;
  tenantActive: boolean;
  actorHasTenantAccess: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  revokedBy?: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface OfferingWebsiteBinding extends Omit<OfferingWebsiteBindingRecord, "actorHasTenantAccess"> {
  canOpen: boolean;
  surface: OfferingSurface;
}

export interface OfferingPermissions {
  canRead: true;
  canManage: boolean;
  role: OfferingWorkspaceRole;
}

export interface OfferingCollection {
  businessId: string;
  permissions: OfferingPermissions;
  definitions: readonly OfferingDefinitionView[];
  installations: readonly OfferingInstallation[];
  websiteBindings: readonly OfferingWebsiteBinding[];
}

export type OfferingWebsiteBindingCommand =
  | { action: "bind_managed_website"; businessId: string; tenantId: string; idempotencyKey: string }
  | { action: "revoke_managed_website_binding"; businessId: string; bindingId: string; expectedRevision: number; reason: string };

export type OfferingCommand =
  | {
      action: "install";
      businessId: string;
      definitionId: string;
      definitionVersion: string;
      idempotencyKey: string;
      configuration: Record<string, unknown>;
      nativeResources?: readonly OfferingNativeResource[];
      responsibility: OfferingResponsibility;
      acceptedScope: readonly string[];
      surfaceIds: readonly string[];
    }
  | {
      action: "activate";
      businessId: string;
      installationId: string;
      expectedRevision: number;
    }
  | {
      action: "update_configuration";
      businessId: string;
      installationId: string;
      expectedRevision: number;
      configuration: Record<string, unknown>;
    }
  | {
      action: "retire";
      businessId: string;
      installationId: string;
      expectedRevision: number;
      reason: string;
    };

export class OfferingValidationError extends Error {
  constructor(message = "The offering command is invalid.") {
    super(message);
    this.name = "OfferingValidationError";
  }
}

export class OfferingAccessError extends Error {
  constructor(message = "This business is unavailable to your account.") {
    super(message);
    this.name = "OfferingAccessError";
  }
}

export class OfferingNotFoundError extends Error {
  constructor(message = "The offering installation was not found.") {
    super(message);
    this.name = "OfferingNotFoundError";
  }
}

export class OfferingConflictError extends Error {
  constructor(message = "The offering installation changed. Reload it before trying again.") {
    super(message);
    this.name = "OfferingConflictError";
  }
}

export class OfferingStoreError extends Error {
  constructor(message = "Offering storage is unavailable.") {
    super(message);
    this.name = "OfferingStoreError";
  }
}
