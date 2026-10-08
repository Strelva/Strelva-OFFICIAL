import { CONTROL_PLANE_URL } from "@/platform/infra/brand";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { keepMeFoundInputSchema, responsibilityProofCard, responsibilityVerdict, addNativeResponsibilityEvidence } from "@/platform/work-execution/responsibility-proof";
import { mapStandingPolicyRow, mapStandingRunRow, mapStandingReceiptRow } from "@/platform/work-execution/standing-repository";
import type { OutcomeRpc } from "@/platform/business-outcomes";
import type { ListingReceipt } from "@/products/google-listing/contracts";
import { z } from "zod";

async function call(actor: WorkspaceActor, name: string, args: Record<string, unknown>, override?: OutcomeRpc) {
  const client = getSupabase();
  const rpc = override ?? (client ? (name: string, args: Record<string, unknown>) => (client as unknown as { rpc: OutcomeRpc }).rpc(name, args) : undefined);
  if (!rpc) throw new WorkspaceStoreError("Responsibility storage is unavailable.");
  const result = await rpc(name, { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, ...args });
  if (result.error) {
    if (/denied|membership|unverified/.test(result.error.message ?? "")) throw new WorkspaceAccessError();
    if (/conflict|invalid|mandate|provider|exit/.test(result.error.message ?? "")) throw new WorkspaceConflictError("The exact accepted responsibility mandate or qualified provider is unavailable. Reload before trying again.");
    throw new WorkspaceStoreError("The responsibility result could not be confirmed.");
  }
  return result.data;
}
export async function createKeepMeFoundBundle(actor: WorkspaceActor, raw: unknown, rpc?: OutcomeRpc) {
  const input = keepMeFoundInputSchema.extend({maintenance:z.object({bindingId:z.string().uuid(),locationId:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)}).strict().optional()}).parse(raw);
  if(input.maintenance && process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE!=="1") throw new WorkspaceConflictError("Bundle maintenance is not enabled.");
  return call(actor, input.maintenance ? "create_keep_me_found_maintenance_bundle" : "create_keep_me_found_bundle", { p_business_id: input.businessId, p_service_request_id: input.serviceRequestId,
    p_provider_id: input.providerWorkspaceId, p_idempotency_key: input.idempotencyKey,
    ...(input.maintenance?{p_binding_id:input.maintenance.bindingId,p_location_id:input.maintenance.locationId}:{}),
    p_investigations: input.investigations, p_every_seconds: input.everySeconds, p_next_at: input.nextAt }, rpc);
}
export async function readResponsibilityProof(actor: WorkspaceActor, workspaceId: string, from: string, to: string) {
  z.string().uuid().parse(workspaceId); z.string().datetime().parse(from); z.string().datetime().parse(to);
  const [rows, domain, maintenance] = await Promise.all([
    call(actor, "read_responsibility_proof_rows", { p_business_id: workspaceId, p_from: from, p_to: to }),
    call(actor, "read_responsibility_domain_evidence", { p_business_id: workspaceId, p_from: from, p_to: to }),
    process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE==="1" ? call(actor,"read_bundle_maintenance_receipts",{p_business_id:workspaceId,p_from:from,p_to:to}) : Promise.resolve([]),
  ]);
  const linked=z.array(z.object({responsibilityId:z.string(),receipt:z.unknown()})).parse(maintenance);
  const merged=z.array(z.object({responsibilityId:z.string(),receipts:z.array(z.unknown())}).passthrough()).parse(domain).map(row=>({...row,receipts:[...new Map([...row.receipts,...linked.filter(item=>item.responsibilityId===row.responsibilityId).map(item=>item.receipt)].map(item=>[z.object({id:z.string()}).parse(item).id,item])).values()]}));
  const cards = projectResponsibilityCards(workspaceId, from, to, rows, merged);
  return { workspaceId, from, to, cards, verdict: responsibilityVerdict(cards) };
}
function projectResponsibilityCards(workspaceId: string, from: string, to: string, rows: unknown, domain: unknown) {
  const evidence = domain as Array<{ responsibilityId: string; receipts: ListingReceipt[] }>;
  const records = rows as Array<{ policy: Record<string, unknown>; runs: Array<Record<string, unknown> & { receipts: Record<string,unknown>[] }> }>;
  if (!Array.isArray(records) || !Array.isArray(evidence)) throw new WorkspaceStoreError("Responsibility proof could not be read.");
  return records.map(record => {
    const policy = mapStandingPolicyRow(record.policy);
    if (policy.workspaceId !== workspaceId) throw new WorkspaceAccessError();
    const card = responsibilityProofCard({ policy, jobs: [], runs: record.runs.map(run => ({ ...mapStandingRunRow(run), receipts: run.receipts.map(mapStandingReceiptRow) })) }, from, to, evidence.find(row => row.responsibilityId === policy.id)?.receipts ?? []);
    return addNativeResponsibilityEvidence(card, evidence.find(row => row.responsibilityId === policy.id));
  });
}

/** Extends the existing report summary. An unavailable read remains explicit;
 * transport gates and durable send receipts still belong to the existing cron. */
export async function responsibilityProofEmailParagraphs(tenantId: string, from: string, to: string, rpc?: OutcomeRpc): Promise<string[]> {
  if (process.env.STRELVA_WORKSPACE_RELEASE !== "1") return [];
  const client = getSupabase();
  const read = rpc ?? (client ? (name: string, args: Record<string, unknown>) => (client as unknown as { rpc: OutcomeRpc }).rpc(name, args) : undefined);
  if (!read) return [];
  try {
    const result = await read("read_responsibility_proof_for_tenant", { p_tenant_id: tenantId, p_from: from, p_to: to });
    if (result.error) return ["Responsibility proof is unavailable. No maintained outcome is claimed."];
    if (!result.data) return [];
    const parsed = z.object({ businessId: z.string().uuid(), status: z.string().optional(), rows: z.unknown().optional(), domain: z.unknown().optional() }).parse(result.data);
    if (parsed.status === "unavailable") return ["Responsibility proof is unavailable. The agency's current access must be checked."];
    const cards = projectResponsibilityCards(parsed.businessId, from, to, parsed.rows, parsed.domain);
    return [responsibilityVerdict(cards), ...cards.map(card => `${card.title}: ${card.did} ${card.verified} Receipts: ${card.receiptRefs.join(", ") || "none recorded"}. ${card.undoHref ? `Review undo: ${CONTROL_PLANE_URL}${card.undoHref}.` : "No reversible write recorded."} Open receipts: ${CONTROL_PLANE_URL}${card.openHref}.`)];
  } catch { return ["Responsibility proof is unavailable. No maintained outcome is claimed."]; }
}

export async function snapshotResponsibilityMeter(actor: WorkspaceActor, businessId: string, month: string, rpc?: OutcomeRpc) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new WorkspaceConflictError("Choose a valid meter month.");
  return call(actor, "snapshot_responsibility_meter", { p_business_id: z.string().uuid().parse(businessId), p_month: `${month}-01` }, rpc);
}
export async function setProviderResponsibilityCadence(actor: WorkspaceActor, businessId: string, cadence: "weekly" | "monthly", rpc?: OutcomeRpc) {
  return call(actor, "set_provider_responsibility_cadence", { p_business_id: z.string().uuid().parse(businessId), p_cadence: z.enum(["weekly", "monthly"]).parse(cadence) }, rpc);
}

export async function readResponsibilityBundleState(actor: WorkspaceActor, businessId: string, rpc?: OutcomeRpc) {
  return call(actor, "read_responsibility_bundle_state", { p_business_id: z.string().uuid().parse(businessId) }, rpc);
}

export async function snapshotDueResponsibilityMeters(limit = 20, rpc?: OutcomeRpc) {
  const client = getSupabase();
  const read = rpc ?? (client ? (name: string, args: Record<string, unknown>) => (client as unknown as { rpc: OutcomeRpc }).rpc(name, args) : undefined);
  if (!read) throw new WorkspaceStoreError("Responsibility metering is unavailable.");
  const result = await read("snapshot_due_responsibility_meters", { p_limit: z.number().int().min(1).max(100).parse(limit) });
  if (result.error) throw new WorkspaceStoreError("Responsibility metering could not be confirmed.");
  return z.object({ processed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), failures: z.array(z.object({ businessId: z.string().uuid(), status: z.literal("unavailable") })), priced: z.literal(false), stripeExportEnabled: z.literal(false) }).parse(result.data);
}
