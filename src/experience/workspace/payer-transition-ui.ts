import { verifiedPayerReceipt } from "@/platform/work-economics/payer-receipts";
import type { PayerCommandResult, PayerTransition, PayerTransitionSnapshot } from "@/platform/work-economics/payer-transitions";

export function successorLabel(item: PayerTransition): string {
  if (item.successorKind === "agency") return `${item.successorWorkspaceName ?? "The addressed agency"} (agency)`;
  if (item.successorKind === "business") return item.workspaceName ?? "This business";
  return item.successorEmail;
}

export function responseAuthority(item: PayerTransition): string {
  if (item.successorKind === "agency") return "A current owner or admin accepts on behalf of this agency.";
  if (item.successorKind === "business") return "A current business owner accepts on behalf of the business.";
  return "Only the addressed verified person can accept.";
}

export function payerSnapshot(value: unknown, workspaceId: string | null): PayerTransitionSnapshot {
  const body = value as PayerTransitionSnapshot | null;
  if (!body || body.workspaceId !== workspaceId || !Array.isArray(body.transitions)
    || typeof body.currentActorId !== "string" || (body.jobs !== undefined && !Array.isArray(body.jobs))) {
    throw new Error("Payer history could not be verified for this view.");
  }
  const rows = [...body.transitions, ...(body.current ? [body.current] : []), ...(body.pending ? [body.pending] : [])];
  if (rows.some(row => !row || typeof row.id !== "string" || typeof row.workspaceId !== "string"
    || (workspaceId !== null && row.workspaceId !== workspaceId)
    || !["user", "agency", "business"].includes(row.successorKind)
    || typeof row.isCurrent !== "boolean" || typeof row.canRespond !== "boolean" || typeof row.canRevoke !== "boolean")) {
    throw new Error("Payer history could not be verified for this view.");
  }
  return body;
}

export function payerReceipt(value: unknown, command: Record<string, unknown>, workspaceId: string | null): PayerCommandResult["receipt"] {
  const receipt = verifiedPayerReceipt((value as PayerCommandResult | null)?.receipt);
  const expectedId = command.transitionId ?? command.jobId;
  if (!receipt || receipt.action !== command.action || typeof receipt.id !== "string"
    || typeof receipt.workspaceId !== "string" || (workspaceId !== null && receipt.workspaceId !== workspaceId)
    || (expectedId !== undefined && receipt.id !== expectedId)) {
    throw new Error("The saved result could not be verified.");
  }
  return receipt;
}

export function payerNotice(receipt: PayerCommandResult["receipt"]): string {
  if (receipt.kind === "payer_job") return receipt.status === "accepted" ? "The job limit was accepted." : "This job limit is already accepted.";
  if (receipt.status === "stale") return "This proposal became stale because its proposer is no longer a business owner. The payer was not changed.";
  if (receipt.action === "propose") return "Payer change proposed. The addressed person or an authorized representative must accept it.";
  if (receipt.action === "reject") return "The payer change was declined.";
  if (receipt.action === "revoke") return "The pending payer change was revoked.";
  if (receipt.successorKind === "agency") return "Payer acceptance is recorded on behalf of the agency. Each job limit still requires separate acceptance.";
  if (receipt.successorKind === "business") return "Payer acceptance is recorded on behalf of the business. Each job limit still requires separate acceptance.";
  return "Payer acceptance is recorded. Each job limit still requires separate acceptance.";
}
