import type { PayerCommandResult } from "./payer-transitions";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fail closed on mismatched/ambiguous durable outcomes, on both sides of the route. */
export function verifiedPayerReceipt(value: unknown): PayerCommandResult["receipt"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !uuid.test(item.id) || typeof item.workspaceId !== "string" || !uuid.test(item.workspaceId)) return null;
  if (typeof item.status !== "string") return null;
  if (item.kind === "payer_job") {
    if (item.action !== "accept_job" || !["accepted", "reserved", "settled"].includes(item.status)) return null;
  } else if (item.kind === "payer_transition") {
    if (typeof item.successorKind !== "string" || !["user", "agency", "business"].includes(item.successorKind)) return null;
    const statuses: Record<string, string[]> = { propose: ["pending"], accept: ["accepted", "stale"], reject: ["rejected"], revoke: ["revoked"] };
    if (typeof item.action !== "string" || !Object.hasOwn(statuses, item.action) || !statuses[item.action]!.includes(item.status)) return null;
  } else return null;
  return item as PayerCommandResult["receipt"];
}
