import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });

/** A retained external link, never a server-side fetch or publication authority. */
export const deliveryReviewUrlSchema = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash
      && !url.search && !url.port && url.hostname.includes(".")
      && !/^(?:localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname)
      && !/\.(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)
      && !url.hostname.includes(":");
  } catch { return false; }
}, "Use a public HTTPS review URL without credentials, tokens, or query parameters.");

export const deliveryResultInputSchema = z.object({
  websiteBindingId: uuid,
  repository: text(201).regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/),
  reviewUrl: deliveryReviewUrlSchema,
  desktopChecked: z.literal(true),
  mobileChecked: z.literal(true),
  primaryActionChecked: z.literal(true),
}).strict();

export const deliveryCommitmentSchema = z.object({
  version: z.literal(1),
  status: z.enum(["proposed", "running", "submitted", "changes_requested", "accepted", "cancelled"]),
  operatorId: uuid,
  termsReference: text(500),
  deliveryDefinition: text(1000),
  scope: z.array(text(120)).min(1).max(16),
  proposedAt: instant,
  startedAt: instant.nullable(),
  dueAt: instant.nullable(),
  customerAcceptedBy: uuid.nullable(),
  customerAcceptedAt: instant.nullable(),
  blocker: z.object({ note: text(1000), actorId: uuid, at: instant }).strict().nullable(),
  result: deliveryResultInputSchema.extend({ submittedAt: instant, submittedBy: uuid }).strict().nullable(),
  decision: z.object({ kind: z.enum(["accepted", "changes_requested", "cancelled"]), note: text(1000), actorId: uuid, at: instant }).strict().nullable(),
}).strict();
export type DeliveryCommitment = z.infer<typeof deliveryCommitmentSchema>;

export const deliveryCommitmentChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("propose"), termsReference: text(500), deliveryDefinition: text(1000), inputsReady: z.literal(true) }).strict(),
  z.object({ kind: z.literal("agree") }).strict(),
  z.object({ kind: z.literal("submit"), result: deliveryResultInputSchema }).strict(),
  z.object({ kind: z.literal("blocker"), note: text(1000).nullable() }).strict(),
  z.object({ kind: z.enum(["accept_result", "request_changes", "cancel"]), note: text(1000) }).strict(),
]);
export const deliveryCommitmentCommandSchema = z.object({
  action: z.literal("delivery_commitment"),
  requestId: uuid,
  expectedRevision: z.number().int().positive(),
  idempotencyKey: text(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
  change: deliveryCommitmentChangeSchema,
}).strict();
export type DeliveryCommitmentCommand = z.infer<typeof deliveryCommitmentCommandSchema>;

export function deliveryCommitmentStatus(commitment: DeliveryCommitment, now = Date.now()): string {
  if (commitment.status === "proposed") return "Scope and terms need your acceptance";
  if (commitment.status === "accepted") return "Customer accepted this delivery";
  if (commitment.status === "cancelled") return "Delivery cancelled; records retained";
  if (commitment.status === "submitted") return "Ready for customer review";
  const late = commitment.dueAt !== null && Date.parse(commitment.dueAt) <= now;
  if (commitment.status === "changes_requested") return late ? "Changes requested; original deadline passed" : "Customer requested changes";
  if (commitment.blocker) return late ? "Blocked; deadline passed" : "Blocked; deadline unchanged";
  return late ? "Delivery overdue" : "Delivery in progress";
}
