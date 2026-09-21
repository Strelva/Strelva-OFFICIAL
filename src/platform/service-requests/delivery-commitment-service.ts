import { createHash } from "node:crypto";
import { deliveryCommitmentCommandSchema, type DeliveryCommitmentCommand } from "./delivery-commitment";
import { ServiceRequestValidationError, type ServiceRequest, type ServiceRequestActor } from "./types";

export type DeliveryCommitmentMutation = DeliveryCommitmentCommand & { commandDigest: string };
export type DeliveryCommitmentWriter = (actor: ServiceRequestActor, input: DeliveryCommitmentMutation) => Promise<ServiceRequest>;

/** Database mutation only. Never sends mail, publishes, charges, or grants access. */
export class DeliveryCommitmentService {
  constructor(private readonly write: DeliveryCommitmentWriter) {}

  execute(actor: ServiceRequestActor, raw: unknown): Promise<ServiceRequest> {
    const parsed = deliveryCommitmentCommandSchema.safeParse(raw);
    if (!parsed.success) throw new ServiceRequestValidationError("Check the delivery scope, terms, revision, and evidence.");
    const command = parsed.data;
    const commandDigest = createHash("sha256").update(JSON.stringify({
      actorId: actor.userId,
      action: command.action,
      requestId: command.requestId,
      expectedRevision: command.expectedRevision,
      change: command.change,
    })).digest("hex");
    return this.write(actor, { ...command, commandDigest });
  }
}
