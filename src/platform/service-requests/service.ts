import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ServiceRequestAccessError,
  ServiceRequestConflictError,
  ServiceRequestNotFoundError,
  ServiceRequestValidationError,
  type ServiceRequest,
  type ServiceRequestActor,
  serviceRequestProviderSchema,
} from "./types";

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(3_000);
const scope = z.array(z.string().trim().min(1).max(120)).min(1).max(16);
const context = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  if (JSON.stringify(value).length > 16_000) ctx.addIssue({ code: "custom", message: "Context is too large." });
});

const providerChoice = serviceRequestProviderSchema;
const saveSchema = z.object({
  action: z.literal("save"),
  businessId: uuid,
  requestId: uuid.optional(),
  expectedRevision: z.number().int().positive().optional(),
  status: z.enum(["draft", "requested"]),
  request: shortText,
  outcome: shortText,
  context,
  scope,
  provider: providerChoice,
  idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
}).strict();
type SaveCommand = z.infer<typeof saveSchema>;
const respondSchema = z.object({
  action: z.literal("respond"),
  requestId: uuid,
  expectedRevision: z.number().int().positive(),
  decision: z.enum(["accepted", "declined"]),
  note: z.string().trim().max(1_000).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
}).strict();
const linkSchema = z.object({
  action: z.literal("link_delivery"),
  businessId: uuid,
  requestId: uuid,
  installationId: uuid,
  deliveryId: uuid,
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
}).strict();
const withdrawSchema = z.object({
  action: z.literal("withdraw"),
  businessId: uuid,
  requestId: uuid,
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
}).strict();
export const serviceRequestCommandSchema = z.discriminatedUnion("action", [saveSchema, respondSchema, linkSchema, withdrawSchema]);
export type ServiceRequestCommand = z.infer<typeof serviceRequestCommandSchema>;

export type ServiceRequestListQuery =
  | { businessId: string }
  | { providerKind: "strelva" }
  | { providerWorkspaceId: string };

export interface ServiceRequestStore {
  list(actor: ServiceRequestActor, query: ServiceRequestListQuery): Promise<ServiceRequest[]>;
  read(actor: ServiceRequestActor, requestId: string): Promise<ServiceRequest>;
  save(actor: ServiceRequestActor, input: {
    businessId: string;
    requestId?: string;
    expectedRevision?: number;
    status: "draft" | "requested";
    request: string;
    outcome: string;
    context: Record<string, unknown>;
    scope: readonly string[];
    provider: SaveCommand["provider"];
    idempotencyKey: string;
    commandDigest: string;
  }): Promise<ServiceRequest>;
  respond(actor: ServiceRequestActor, input: {
    requestId: string;
    expectedRevision: number;
    decision: "accepted" | "declined";
    note?: string;
    idempotencyKey: string;
    commandDigest: string;
  }): Promise<ServiceRequest>;
  linkDelivery(actor: ServiceRequestActor, input: {
    businessId: string;
    requestId: string;
    installationId: string;
    deliveryId: string;
    expectedRevision: number;
    idempotencyKey: string;
    commandDigest: string;
  }): Promise<ServiceRequest>;
  withdraw(actor: ServiceRequestActor, input: {
    businessId: string;
    requestId: string;
    expectedRevision: number;
    idempotencyKey: string;
    commandDigest: string;
  }): Promise<ServiceRequest>;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseUuid(value: string, message: string): string {
  try {
    return uuid.parse(value);
  } catch {
    throw new ServiceRequestValidationError(message);
  }
}

export class ServiceRequestService {
  constructor(private readonly store: ServiceRequestStore) {}

  list(actor: ServiceRequestActor, query: ServiceRequestListQuery): Promise<ServiceRequest[]> {
    if ("businessId" in query) return this.store.list(actor, { businessId: parseUuid(query.businessId, "Choose a valid business workspace.") });
    if ("providerWorkspaceId" in query) return this.store.list(actor, { providerWorkspaceId: parseUuid(query.providerWorkspaceId, "Choose a valid provider workspace.") });
    return this.store.list(actor, { providerKind: "strelva" });
  }

  read(actor: ServiceRequestActor, requestId: string): Promise<ServiceRequest> {
    return this.store.read(actor, parseUuid(requestId, "Choose a valid service request."));
  }

  async execute(actor: ServiceRequestActor, raw: unknown): Promise<ServiceRequest> {
    let command: ServiceRequestCommand;
    try {
      command = serviceRequestCommandSchema.parse(raw);
    } catch {
      throw new ServiceRequestValidationError("Check the request fields and limits.");
    }

    if (command.action === "save") {
      if (command.requestId && command.expectedRevision === undefined) {
        throw new ServiceRequestConflictError("Reload the request before editing it.");
      }
      const payload = {
        action: command.action,
        businessId: command.businessId,
        requestId: command.requestId ?? null,
        expectedRevision: command.expectedRevision ?? null,
        status: command.status,
        request: command.request,
        outcome: command.outcome,
        context: command.context,
        scope: command.scope,
        provider: command.provider,
      };
      return this.store.save(actor, { ...command, commandDigest: digest(payload) });
    }

    if (command.action === "respond") {
      return this.store.respond(actor, {
        ...command,
        commandDigest: digest({ action: command.action, requestId: command.requestId, expectedRevision: command.expectedRevision, decision: command.decision, note: command.note ?? null }),
      });
    }

    if (command.action === "link_delivery") {
      return this.store.linkDelivery(actor, {
        ...command,
        commandDigest: digest({ action: command.action, businessId: command.businessId, requestId: command.requestId, installationId: command.installationId, deliveryId: command.deliveryId, expectedRevision: command.expectedRevision }),
      });
    }

    return this.store.withdraw(actor, {
      ...command,
      commandDigest: digest({ action: command.action, businessId: command.businessId, requestId: command.requestId, expectedRevision: command.expectedRevision }),
    });
  }
}

export {
  ServiceRequestAccessError,
  ServiceRequestConflictError,
  ServiceRequestNotFoundError,
};
