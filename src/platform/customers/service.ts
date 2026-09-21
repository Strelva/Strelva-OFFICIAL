import { decodeCustomerCursor, encodeCustomerCursor } from "./cursor";
import {
  CustomerAccessError,
  CustomerInputError,
  CustomerScopeChangedError,
  CustomerSourceError,
  CustomerUnavailableError,
} from "./errors";
import type {
  CustomerInstallationResponse,
  CustomerInstallationView,
} from "./installation";
import type { CustomerMappingStore } from "./store";
import type {
  HomeFinderDeliveryDetail,
  HomeFinderDeliveryPage,
  HomeFinderInstallationSummary,
  HomeFinderReadiness,
  HomeFinderManagementOperation,
  HomeFinderManagementReader,
} from "./home-finder-port";
import {
  CUSTOMER_READ_OPERATIONS,
  type CustomerActor,
  type CustomerAssignmentRecord,
  type CustomerCollection,
  type CustomerDetail,
  type CustomerListOptions,
  type CustomerMappingStatus,
  type CustomerProvenanceView,
  type CustomerRelationshipRecord,
  type CustomerResourceAvailability,
  type CustomerResourceHrefTrust,
  type CustomerResourceReaders,
  type CustomerResourceRecord,
  type CustomerResourceView,
  type CustomerSummary,
} from "./types";

const MAX_QUERY_LENGTH = 80;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const MAX_AUTHORIZED_ASSIGNMENTS = 2000;
const MAX_INSTALLATION_PAGE_SIZE = 50;
const MAX_INSTALLATION_CURSOR_LENGTH = 2_048;
const MAX_RECEIPT_REFERENCE_LENGTH = 2_048;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function cleanQuery(value: string | undefined): string {
  if (value === undefined) return "";
  const query = value.trim();
  if (query.length > MAX_QUERY_LENGTH) throw new CustomerInputError();
  return query;
}

function pageSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new CustomerInputError();
  }
  return value;
}

function installationPageSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_INSTALLATION_PAGE_SIZE) {
    throw new CustomerInputError();
  }
  return value;
}

function boundedOpaque(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (!value || value.length > maxLength || /[\u0000-\u0020\u007f]/.test(value)) {
    throw new CustomerInputError();
  }
  return value;
}

function actorValue(input: CustomerActor): CustomerActor {
  const userId = input.userId.trim();
  const verifiedEmail = input.verifiedEmail.trim().toLowerCase();
  if (!userId || userId.length > 128 || !EMAIL_PATTERN.test(verifiedEmail) || verifiedEmail.length > 254) {
    throw new CustomerAccessError();
  }
  return { userId, verifiedEmail };
}

function hasOperation(
  assignment: CustomerAssignmentRecord,
  operation: (typeof CUSTOMER_READ_OPERATIONS)[number],
): boolean {
  return assignment.allowedOperations.includes(operation);
}

function validStatus(value: unknown): value is CustomerMappingStatus {
  return value === "active" || value === "revoked";
}

function observedAt(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function relationshipSummary(relationship: CustomerRelationshipRecord): CustomerSummary {
  const provenance: CustomerProvenanceView = {
    source: relationship.provenance,
    observedAt: relationship.updatedAt,
  };
  return {
    id: relationship.id,
    displayName: relationship.displayName,
    kind: relationship.kind,
    ...(relationship.domain ? { domain: relationship.domain } : {}),
    observedAt: relationship.updatedAt,
    provenance,
  };
}

function comparableName(summary: CustomerSummary): string {
  return summary.displayName.toLocaleLowerCase("en-US");
}

function compareStable(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function compareSummary(a: CustomerSummary, b: CustomerSummary): number {
  const name = compareStable(comparableName(a), comparableName(b));
  return name || compareStable(a.id, b.id);
}

function hasCursorAfter(summary: CustomerSummary, cursor: { lastName: string; lastId: string }): boolean {
  const name = comparableName(summary);
  const nameOrder = compareStable(name, cursor.lastName);
  return nameOrder > 0 || (nameOrder === 0 && compareStable(summary.id, cursor.lastId) > 0);
}

function trustedApplicationHosts(): Set<string> {
  const hosts = new Set(["app.strelva.com"]);
  for (const candidate of [process.env.NEXT_PUBLIC_APP_URL, process.env.CONTROL_PLANE_API_URL]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const local = process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol === "https:" || local) hosts.add(url.hostname.toLowerCase());
    } catch {
      // A malformed optional URL must not widen the link authority.
    }
  }
  return hosts;
}

function allowedHref(
  value: string | undefined,
  trust: CustomerResourceHrefTrust | undefined,
): string | undefined {
  if (!value || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return undefined;
  try {
    const trimmed = value.trim();
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
      if (trust === "native") return undefined;
      const internal = new URL(trimmed, "https://app.strelva.com");
      if (
        internal.username ||
        internal.password ||
        internal.hash ||
        !(internal.pathname === "/workspace" || internal.pathname.startsWith("/api/customers/"))
      ) return undefined;
      return trimmed;
    }
    const url = new URL(trimmed);
    const localHttp = process.env.NODE_ENV !== "production" && url.protocol === "http:" && localHosts.has(url.hostname);
    if ((!localHttp && url.protocol !== "https:") || url.username || url.password || url.hash) return undefined;
    const configured = trustedApplicationHosts();
    if (!localHttp && !configured.has(url.hostname.toLowerCase())) return undefined;
    if (
      !url.pathname.startsWith("/client/") &&
      url.pathname !== "/workspace" &&
      !url.pathname.startsWith("/api/customers/")
    ) return undefined;
    // Native Website links are generated by the existing tenant URL authority
    // and must stay on the control-plane client path.  A provider URL cannot
    // become a browser link merely because a downstream reader returned it.
    if (trust === "native" && !url.pathname.startsWith("/client/")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function assignmentFingerprint(assignments: CustomerAssignmentRecord[]): string {
  return assignments
    .map((assignment) =>
      [
        assignment.id,
        assignment.relationshipId,
        assignment.resourceId || "",
        assignment.status,
        assignment.version,
        [...assignment.allowedOperations].sort().join(","),
      ].join("|"),
    )
    .sort()
    .join(";");
}

function relevantAssignments(
  assignments: CustomerAssignmentRecord[],
  relationshipId: string,
): CustomerAssignmentRecord[] {
  return assignments.filter(
    (assignment) =>
      assignment.relationshipId === relationshipId &&
      assignment.status === "active" &&
      (hasOperation(assignment, "customer:read") || hasOperation(assignment, "resource:read")),
  );
}

function resourceView(
  resource: CustomerResourceRecord,
  result: {
    availability: CustomerResourceAvailability;
    observedAt?: string;
    label?: string;
    href?: string;
    hrefTrust?: CustomerResourceHrefTrust;
  },
): CustomerResourceView {
  const now = new Date().toISOString();
  const label = (result.label || resource.label || "").trim().slice(0, 160);
  const href = allowedHref(result.href, result.hrefTrust);
  return {
    id: resource.id,
    kind: resource.kind,
    ...(label ? { label } : {}),
    availability: result.availability,
    observedAt: observedAt(result.observedAt || "", resource.updatedAt || now),
    ...(href ? { href } : {}),
  };
}

function safeInstallationSummary(value: HomeFinderInstallationSummary): HomeFinderInstallationSummary {
  if (!Array.isArray(value.readiness) || value.readiness.length > 32) throw new CustomerSourceError();
  return {
    schemaVersion: value.schemaVersion,
    id: value.id,
    brokerageName: value.brokerageName,
    mode: value.mode,
    ...(value.approvedOrigin === undefined ? {} : { approvedOrigin: value.approvedOrigin }),
    previewHref: value.previewHref,
    observedAt: value.observedAt,
    readiness: value.readiness.map((item) => ({
      requirement: item.requirement,
      state: item.state,
      source: item.source,
      observedAt: item.observedAt,
      responsibleParty: item.responsibleParty,
    })),
  };
}

function safeInstallationReadiness(value: HomeFinderReadiness): HomeFinderReadiness {
  if (!Array.isArray(value.readiness) || value.readiness.length > 32) throw new CustomerSourceError();
  return {
    schemaVersion: value.schemaVersion,
    installationId: value.installationId,
    observedAt: value.observedAt,
    readiness: value.readiness.map((item) => ({
      requirement: item.requirement,
      state: item.state,
      source: item.source,
      observedAt: item.observedAt,
      responsibleParty: item.responsibleParty,
    })),
  };
}

function safeInstallationPage(value: HomeFinderDeliveryPage): HomeFinderDeliveryPage {
  if (!Array.isArray(value.items) || value.items.length > MAX_INSTALLATION_PAGE_SIZE) {
    throw new CustomerSourceError();
  }
  if (value.nextCursor !== undefined && boundedOpaque(value.nextCursor, MAX_INSTALLATION_CURSOR_LENGTH) === undefined) {
    throw new CustomerSourceError();
  }
  return {
    schemaVersion: value.schemaVersion,
    installationId: value.installationId,
    observedAt: value.observedAt,
    items: value.items.map((item) => ({
      reference: item.reference,
      state: item.state,
      occurredAt: item.occurredAt,
      expiresAt: item.expiresAt,
    })),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor }),
  };
}

function safeInstallationDetail(value: HomeFinderDeliveryDetail): HomeFinderDeliveryDetail {
  return {
    schemaVersion: value.schemaVersion,
    installationId: value.installationId,
    observedAt: value.observedAt,
    reference: value.reference,
    state: value.state,
    occurredAt: value.occurredAt,
    expiresAt: value.expiresAt,
  };
}

const INSTALLATION_OPERATIONS: Record<CustomerInstallationView, HomeFinderManagementOperation> = {
  summary: "readInstallationSummary",
  readiness: "readReadiness",
  receipts: "listDeliveryReceipts",
  receipt: "readDeliveryReceipt",
};

export class CustomerService {
  constructor(
    private readonly store: CustomerMappingStore,
    private readonly readers: CustomerResourceReaders = {},
    private readonly cursorSecret?: string,
    private readonly homeFinderReader?: HomeFinderManagementReader,
  ) {}

  private async authorize(
    actorInput: CustomerActor,
    organizationId: string,
  ): Promise<CustomerActor> {
    const actor = actorValue(actorInput);
    if (!isUuid(organizationId)) throw new CustomerInputError();
    if (!(await this.store.verifyActor(actor))) throw new CustomerAccessError();
    const membership = await this.store.getOrganizationMembership(actor.userId, organizationId);
    // Agency/organization membership is necessary, but the role is not a grant.
    // Customer contexts can be selected by a directly mapped customer or
    // brokerage actor.  The explicit assignment below remains mandatory for
    // both kinds; a workspace role never becomes a blanket grant.
    if (!membership || !["agency", "customer"].includes(membership.workspaceKind)) {
      throw new CustomerAccessError();
    }
    return actor;
  }

  async listCustomers(
    actorInput: CustomerActor,
    organizationId: string,
    options: CustomerListOptions = {},
  ): Promise<CustomerCollection> {
    const actor = await this.authorize(actorInput, organizationId);
    const query = cleanQuery(options.query);
    const limit = pageSize(options.limit);
    const decoded = options.cursor
      ? decodeCustomerCursor(options.cursor, this.cursorSecret)
      : undefined;
    if (
      decoded &&
      (decoded.organizationId !== organizationId || decoded.userId !== actor.userId || decoded.query !== query)
    ) {
      throw new CustomerInputError();
    }

    const assignments = await this.store.listAssignments(actor.userId, organizationId);
    if (assignments.length > MAX_AUTHORIZED_ASSIGNMENTS) throw new CustomerInputError();
    const relationshipIds = Array.from(
      new Set(
        assignments
          .filter(
            (assignment) =>
              assignment.status === "active" && hasOperation(assignment, "customer:read"),
          )
          .map((assignment) => assignment.relationshipId),
      ),
    );
    if (!relationshipIds.length) return { organizationId, customers: [] };

    const authorizedRelationships = (await this.store.listRelationships(organizationId, relationshipIds))
      .filter((relationship) => relationship.organizationId === organizationId && relationship.status === "active")
      .sort((a, b) => compareStable(a.id, b.id));
    const relationships = authorizedRelationships
      .map(relationshipSummary)
      .filter((summary) => {
        if (!query) return true;
        const normalized = query.toLocaleLowerCase("en-US");
        return summary.displayName.toLocaleLowerCase("en-US").includes(normalized) ||
          summary.domain?.toLocaleLowerCase("en-US").includes(normalized) === true;
      })
      .sort(compareSummary);

    // Recheck membership and assignments before returning the authorized list.
    // This closes a revocation race even though list projection itself does not
    // call a slow provider adapter.
    const afterActor = await this.authorize(actor, organizationId);
    const afterAssignments = await this.store.listAssignments(afterActor.userId, organizationId);
    const beforeAssignmentFingerprint = assignmentFingerprint(assignments);
    if (assignmentFingerprint(afterAssignments) !== beforeAssignmentFingerprint) {
      throw new CustomerScopeChangedError();
    }
    const afterRelationships = (await this.store.listRelationships(organizationId, relationshipIds))
      .filter((relationship) => relationship.organizationId === organizationId && relationship.status === "active");
    const afterRelationshipFingerprint = afterRelationships
      .map((relationship) => `${relationship.id}:${relationship.updatedAt}`)
      .sort()
      .join(";");
    const beforeAuthorizedRelationshipFingerprint = authorizedRelationships
      .map((relationship) => `${relationship.id}:${relationship.updatedAt}`)
      .sort()
      .join(";");
    if (beforeAuthorizedRelationshipFingerprint !== afterRelationshipFingerprint) {
      throw new CustomerScopeChangedError();
    }

    const afterCursor = decoded
      ? relationships.filter((summary) => hasCursorAfter(summary, decoded))
      : relationships;
    const page = afterCursor.slice(0, limit);
    const next = afterCursor.length > limit ? page.at(-1) : undefined;
    return {
      organizationId,
      customers: page,
      ...(next
        ? {
            nextCursor: encodeCustomerCursor(
              {
                organizationId,
                userId: actor.userId,
                query,
                lastName: comparableName(next),
                lastId: next.id,
              },
              this.cursorSecret,
            ),
          }
        : {}),
    };
  }

  async readCustomer(
    actorInput: CustomerActor,
    organizationId: string,
    customerId: string,
  ): Promise<CustomerDetail> {
    const actor = await this.authorize(actorInput, organizationId);
    if (!isUuid(customerId)) throw new CustomerInputError();

    const assignments = await this.store.listAssignments(actor.userId, organizationId);
    if (assignments.length > MAX_AUTHORIZED_ASSIGNMENTS) throw new CustomerInputError();
    const customerAssignments = assignments.filter(
      (assignment) =>
        assignment.relationshipId === customerId &&
        assignment.status === "active" &&
        hasOperation(assignment, "customer:read"),
    );
    if (!customerAssignments.length) throw new CustomerUnavailableError();

    const relationship = await this.store.getRelationship(organizationId, customerId);
    if (!relationship || relationship.organizationId !== organizationId || relationship.status !== "active") {
      throw new CustomerUnavailableError();
    }

    const resourceAssignments = assignments.filter(
      (assignment) =>
        assignment.relationshipId === customerId &&
        assignment.status === "active" &&
        Boolean(assignment.resourceId) &&
        hasOperation(assignment, "resource:read"),
    );
  const resourceIds = Array.from(
      new Set(resourceAssignments.flatMap((assignment) =>
        assignment.resourceId ? [assignment.resourceId] : [])),
    );
    const isResourcePermitted = (resource: CustomerResourceRecord): boolean =>
      resource.relationshipId === customerId &&
      validStatus(resource.status) &&
      resourceIds.includes(resource.id) &&
      // Home Finder management is a separate capability.  A generic
      // resource read assignment is insufficient to invoke its adapter.
      (resource.kind !== "home_finder_installation" ||
        resourceAssignments.some(
          (assignment) =>
            assignment.resourceId === resource.id &&
            hasOperation(assignment, "installation:read"),
        ));
    const resources = (await this.store.listResources(organizationId, customerId, resourceIds))
      .filter(
        isResourcePermitted,
      )
      .sort((a, b) => a.id.localeCompare(b.id, "en-US"));

    const beforeAssignmentFingerprint = assignmentFingerprint(relevantAssignments(assignments, customerId));
    const beforeRelationshipVersion = relationship.version;
    const beforeResourceFingerprint = resources
      .map((resource) => `${resource.id}:${resource.status}:${resource.version}`)
      .sort()
      .join(";");

    const projected = await Promise.all(resources.map(async (resource) => {
      if (resource.status === "revoked") {
        return resourceView(resource, { availability: "revoked", observedAt: resource.updatedAt });
      }
      const reader = this.readers[resource.kind];
      if (!reader) {
        return resourceView(resource, { availability: "unavailable", observedAt: resource.updatedAt });
      }
      try {
        const result = await reader({ actor, resource, organizationId, customerId });
        if (
          result.availability !== "available" &&
          result.availability !== "unavailable" &&
          result.availability !== "not_configured"
        ) {
          return resourceView(resource, { availability: "unavailable", observedAt: resource.updatedAt });
        }
        return resourceView(resource, result);
      } catch {
        // A source failure is a per-resource unavailable state, not an empty
        // customer and not a reason to expose provider error details.
        return resourceView(resource, { availability: "unavailable", observedAt: resource.updatedAt });
      }
    }));

    // Authorization is rechecked after each potentially slow product read.  A
    // revoked membership/assignment or changed mapping never permits an old
    // provider response to repaint the current customer context.
    const afterActor = await this.authorize(actor, organizationId);
    const afterAssignments = await this.store.listAssignments(afterActor.userId, organizationId);
    const afterRelationship = await this.store.getRelationship(organizationId, customerId);
    const afterResources = await this.store.listResources(organizationId, customerId, resourceIds);
    const afterResourceFingerprint = afterResources
      .filter(isResourcePermitted)
      .map((resource) => `${resource.id}:${resource.status}:${resource.version}`)
      .sort()
      .join(";");
    if (
      !afterRelationship ||
      afterRelationship.status !== "active" ||
      afterRelationship.version !== beforeRelationshipVersion ||
      assignmentFingerprint(relevantAssignments(afterAssignments, customerId)) !== beforeAssignmentFingerprint ||
      afterResourceFingerprint !== beforeResourceFingerprint
    ) {
      throw new CustomerScopeChangedError();
    }

    return {
      organizationId,
      customer: relationshipSummary(relationship),
      resources: projected,
    };
  }

  /**
   * Read one exact Home Finder management view after resolving the same
   * customer/resource assignment used by the generic detail projection.  The
   * adapter receives no browser-provided installation ID; its response is
   * checked again against the fixed scope before it is returned.
   */
  async readInstallation(
    actorInput: CustomerActor,
    organizationId: string,
    customerId: string,
    resourceId: string,
    view: CustomerInstallationView = "summary",
    options: { cursor?: string; limit?: number; reference?: string } = {},
  ): Promise<CustomerInstallationResponse> {
    const actor = await this.authorize(actorInput, organizationId);
    if (!isUuid(customerId) || !isUuid(resourceId) || !Object.hasOwn(INSTALLATION_OPERATIONS, view)) {
      throw new CustomerInputError();
    }
    const cursor = boundedOpaque(options.cursor, MAX_INSTALLATION_CURSOR_LENGTH);
    const reference = boundedOpaque(options.reference, MAX_RECEIPT_REFERENCE_LENGTH);
    const limit = installationPageSize(options.limit);
    if (view === "receipt" && !reference) throw new CustomerInputError();
    if (view !== "receipts" && (cursor !== undefined || options.limit !== undefined)) {
      throw new CustomerInputError();
    }
    if (view !== "receipt" && reference !== undefined) throw new CustomerInputError();

    const assignments = await this.store.listAssignments(actor.userId, organizationId);
    if (assignments.length > MAX_AUTHORIZED_ASSIGNMENTS) throw new CustomerInputError();
    const relationshipAssignment = assignments.some(
      (assignment) =>
        assignment.relationshipId === customerId &&
        assignment.status === "active" &&
        hasOperation(assignment, "customer:read"),
    );
    const resourceAssignment = assignments.some(
      (assignment) =>
        assignment.relationshipId === customerId &&
        assignment.resourceId === resourceId &&
        assignment.status === "active" &&
        hasOperation(assignment, "resource:read") &&
        hasOperation(assignment, "installation:read"),
    );
    if (!relationshipAssignment || !resourceAssignment) throw new CustomerUnavailableError();

    const relationship = await this.store.getRelationship(organizationId, customerId);
    if (!relationship || relationship.organizationId !== organizationId || relationship.status !== "active") {
      throw new CustomerUnavailableError();
    }
    const resources = await this.store.listResources(organizationId, customerId, [resourceId]);
    const resource = resources.find((candidate) => candidate.id === resourceId);
    if (
      !resource ||
      resource.relationshipId !== customerId ||
      resource.status !== "active" ||
      resource.kind !== "home_finder_installation"
    ) {
      throw new CustomerUnavailableError();
    }

    const beforeAssignmentFingerprint = assignmentFingerprint(
      assignments.filter((assignment) => assignment.relationshipId === customerId),
    );
    const beforeResourceFingerprint = `${resource.id}:${resource.status}:${resource.version}`;
    const adapter = this.homeFinderReader;
    if (!adapter) throw new CustomerSourceError();

    const operation = INSTALLATION_OPERATIONS[view];
    const scope = {
      installationId: resource.resourceReference,
      managementReads: [operation] as readonly [HomeFinderManagementOperation],
    };

    let installation: CustomerInstallationResponse;
    try {
      if (view === "summary") {
        const value = await adapter.readInstallationSummary(scope);
        if (value.id !== resource.resourceReference) throw new CustomerSourceError();
        installation = {
          organizationId,
          customerId,
          resourceId,
          installation: safeInstallationSummary(value),
        };
      } else if (view === "readiness") {
        const value = await adapter.readReadiness(scope);
        if (value.installationId !== resource.resourceReference) throw new CustomerSourceError();
        installation = {
          organizationId,
          customerId,
          resourceId,
          installation: safeInstallationReadiness(value),
        };
      } else if (view === "receipts") {
        const value = await adapter.listDeliveryReceipts(scope, { cursor, limit });
        if (value.installationId !== resource.resourceReference) throw new CustomerSourceError();
        installation = {
          organizationId,
          customerId,
          resourceId,
          installation: safeInstallationPage(value),
        };
      } else {
        const value = await adapter.readDeliveryReceipt(scope, reference!);
        if (value.installationId !== resource.resourceReference || value.reference !== reference) {
          throw new CustomerSourceError();
        }
        installation = {
          organizationId,
          customerId,
          resourceId,
          installation: safeInstallationDetail(value),
        };
      }
    } catch {
      // The route exposes an unavailable source state, never adapter/provider
      // status, response bodies, credentials, or receipt existence details.
      throw new CustomerSourceError();
    }

    const afterActor = await this.authorize(actor, organizationId);
    const afterAssignments = await this.store.listAssignments(afterActor.userId, organizationId);
    const afterRelationship = await this.store.getRelationship(organizationId, customerId);
    const afterResources = await this.store.listResources(organizationId, customerId, [resourceId]);
    const afterResource = afterResources.find((candidate) => candidate.id === resourceId);
    const afterResourceFingerprint = afterResource
      ? `${afterResource.id}:${afterResource.status}:${afterResource.version}`
      : "";
    if (
      !afterRelationship ||
      afterRelationship.id !== customerId ||
      afterRelationship.organizationId !== organizationId ||
      afterRelationship.status !== "active" ||
      afterRelationship.version !== relationship.version ||
      assignmentFingerprint(afterAssignments.filter((assignment) => assignment.relationshipId === customerId)) !== beforeAssignmentFingerprint ||
      afterResourceFingerprint !== beforeResourceFingerprint ||
      afterResource?.relationshipId !== customerId
    ) {
      throw new CustomerScopeChangedError();
    }
    return installation;
  }
}
