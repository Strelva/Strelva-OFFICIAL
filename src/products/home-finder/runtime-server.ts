import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import { enterpriseActor, enterpriseCall, enterpriseDb, type EnterpriseDb } from "@/platform/enterprise/server";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { Observation } from "@/platform/system-health/contracts";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { getConfiguredHomeFinderAdapter } from "./server";
import { configuredHomeFinderRuntimeAdapter, type HomeFinderRuntimeAdapter } from "./runtime-adapter";
import { HomeFinderAdapterError } from "./types";
import { HOME_FINDER_MANAGEMENT_OPERATIONS, type HomeFinderManagementReader } from "@/platform/customers/home-finder-port";
import { homeFinderBindingSchema, homeFinderConfigureSchema, homeFinderInstallSchema, homeFinderInquirySchema, homeFinderSearchSchema, type HomeFinderBinding, type HomeFinderConfigure, type HomeFinderInstall, type HomeFinderInquiry, type HomeFinderSearch } from "./runtime-contracts";
const uuid = z.string().uuid();
const REQUIRED = ["participating brokerage", "provider/MLS authorization", "approved attribution, display, filter, and freshness rules", "exact HTTPS embedding origin", "verified brokerage inquiry destination", "verified agency receipt destination", "server credentials/configuration", "persistent store/backup/worker readiness", "consented end-to-end delivery proof"];
export const HOME_FINDER_CATALOG_APP = { id: "home-finder", name: "Home Finder", kind: "home_finder", requirements: REQUIRED, dataOwner: "business", runtime: "licensed-idx", availableToPrepare: true } as const;
export function requireHomeFinderRuntime(): HomeFinderRuntimeAdapter {
  const value = configuredHomeFinderRuntimeAdapter();
  if (!value) throw new HomeFinderAdapterError("source_unavailable", "Configure the licensed Home Finder runtime before continuing.");
  return value;
}
function requireManagement(): HomeFinderManagementReader {
  const value = getConfiguredHomeFinderAdapter();
  if (!value) throw new HomeFinderAdapterError("source_unavailable", "Configure the licensed Home Finder management connection before continuing.");
  return value;
}
const scope = (binding: HomeFinderBinding) => ({ installationId: binding.externalInstallationId, managementReads: HOME_FINDER_MANAGEMENT_OPERATIONS });
async function qualification(binding: HomeFinderBinding, adapter: HomeFinderManagementReader) {
  const summary = await adapter.readInstallationSummary(scope(binding));
  const now = Date.now();
  const current = (value: string) => Date.parse(value) <= now + 30_000 && Date.parse(value) >= now - 300_000;
  return { readiness: summary.readiness, qualified: summary.id === binding.externalInstallationId && summary.mode === "live" && summary.brokerageName === binding.brokerageName && summary.approvedOrigin === binding.approvedOrigin && current(summary.observedAt) && REQUIRED.every(requirement => summary.readiness.some(item => item.requirement === requirement && item.state === "confirmed" && current(item.observedAt))) };
}
export async function readHomeFinderBindings(actor: WorkspaceActor, workspaceId: string, db = enterpriseDb()) {
  const bindings = z.array(homeFinderBindingSchema).parse(await enterpriseCall(db, "read_home_finder_bindings", { p_workspace_id: uuid.parse(workspaceId), ...enterpriseActor(actor) }));
  if (bindings.some(b => b.workspaceId !== workspaceId) || new Set(bindings.map(b => b.id)).size !== bindings.length) throw new WorkspaceStoreError("The installation scope could not be confirmed.");
  return bindings;
}
export async function installHomeFinder(actor: WorkspaceActor, raw: HomeFinderInstall, db = enterpriseDb()) {
  const input = homeFinderInstallSchema.parse(raw);
  const binding = homeFinderBindingSchema.parse(await enterpriseCall(db, "install_home_finder", { ...enterpriseActor(actor), p_input: input, p_digest: sha256(canonicalJson(input)) }));
  if (binding.workspaceId !== input.workspaceId || binding.id !== input.commandId || binding.externalInstallationId !== input.externalInstallationId
    || binding.agencyId !== input.agencyId || binding.brokerageName !== input.brokerageName || binding.approvedOrigin !== input.approvedOrigin
    || binding.sourceName !== input.sourceName || binding.licenseReference !== input.licenseReference || Date.parse(binding.licenseExpiresAt) !== Date.parse(input.licenseExpiresAt)) throw new WorkspaceStoreError("The installation receipt could not be confirmed.");
  return binding;
}
async function owned(actor: WorkspaceActor, workspaceId: string, bindingId: string, db: EnterpriseDb) {
  const binding = (await readHomeFinderBindings(actor, workspaceId, db)).find(b => b.id === uuid.parse(bindingId));
  if (!binding) throw new WorkspaceStoreError("This installation is unavailable.");
  return binding;
}
export async function checkHomeFinder(actor: WorkspaceActor, workspaceId: string, bindingId: string, db = enterpriseDb(), adapter = requireManagement()) {
  const binding = await owned(actor, workspaceId, bindingId, db), observed = await qualification(binding, adapter);
  const result = homeFinderBindingSchema.parse(await enterpriseCall(db, "observe_home_finder", { p_workspace_id: workspaceId, ...enterpriseActor(actor), p_binding_id: binding.id, p_revision: binding.revision, p_readiness: observed.readiness, p_qualified: observed.qualified }));
  if (result.id !== binding.id || result.workspaceId !== workspaceId) throw new WorkspaceStoreError("The qualification scope could not be confirmed.");
  return result;
}
export async function publishHomeFinder(actor: WorkspaceActor, workspaceId: string, bindingId: string, expectedChange: number, db = enterpriseDb()) {
  const binding = await checkHomeFinder(actor, workspaceId, bindingId, db);
  return createSupabaseSystemStore(db).transitionLifecycle(actor, { businessId: workspaceId, systemId: binding.systemId }, expectedChange, "live");
}
export async function revokeHomeFinder(actor: WorkspaceActor, workspaceId: string, bindingId: string, expectedRevision: number, db = enterpriseDb()) {
  const result = homeFinderBindingSchema.parse(await enterpriseCall(db, "revoke_home_finder", { ...enterpriseActor(actor), p_workspace_id: uuid.parse(workspaceId), p_binding_id: uuid.parse(bindingId), p_revision: z.number().int().positive().parse(expectedRevision) }));
  if (result.workspaceId !== workspaceId || result.id !== bindingId || result.status !== "revoked") throw new WorkspaceStoreError("The revocation receipt could not be confirmed.");
  return result;
}
async function admit(bindingId: string, db: EnterpriseDb, management: HomeFinderManagementReader) {
  const binding = homeFinderBindingSchema.parse(await enterpriseCall(db, "read_home_finder_probe", { p_binding_id: uuid.parse(bindingId) }));
  if (binding.id !== bindingId) throw new WorkspaceStoreError("The installation scope could not be confirmed.");
  const observed = await qualification(binding, management);
  await enterpriseCall(db, "refresh_home_finder_probe", { p_binding_id: binding.id, p_revision: binding.revision, p_readiness: observed.readiness, p_qualified: observed.qualified });
  if (!observed.qualified) throw new HomeFinderAdapterError("source_unavailable", "Provider, licensing and delivery qualification is still required.");
  const current = homeFinderBindingSchema.parse(await enterpriseCall(db, "read_home_finder_public", { p_binding_id: binding.id }));
  if (current.id !== binding.id || current.revision !== binding.revision) throw new WorkspaceStoreError("The installation changed during this request.");
  return current;
}
export async function searchHomeFinder(bindingId: string, raw: HomeFinderSearch, db = enterpriseDb(), adapter = requireHomeFinderRuntime(), management = requireManagement()) {
  const query = homeFinderSearchSchema.parse(raw), binding = await admit(bindingId, db, management);
  return adapter.search(binding, query);
}
export async function submitHomeFinder(bindingId: string, raw: HomeFinderInquiry, db = enterpriseDb(), adapter = requireHomeFinderRuntime(), management = requireManagement()) {
  const input = homeFinderInquirySchema.parse(raw), digest = sha256(canonicalJson(input)), binding = await admit(bindingId, db, management);
  const start = z.object({ status: z.enum(["started", "pending", "delivered"]), reference: z.string().nullable() }).strict().parse(await enterpriseCall(db, "begin_home_finder_intake", { p_binding_id: binding.id, p_submission_id: input.submissionId, p_revision: binding.revision, p_digest: digest }));
  const reference = adapter.receiptReference(binding, input.submissionId);
  if (start.status !== "started") return { status: start.status, requestId: input.submissionId, reference: start.reference ?? reference, message: start.status === "delivered" ? "Delivery is confirmed." : "Your inquiry is queued for delivery." };
  try {
    // Recheck admission immediately before crossing the provider boundary.
    const current = homeFinderBindingSchema.parse(await enterpriseCall(db, "read_home_finder_public", { p_binding_id: binding.id }));
    if (current.id !== binding.id || current.revision !== binding.revision) throw new WorkspaceStoreError("The installation changed before dispatch.");
    const result = await adapter.submit(binding, input);
    await enterpriseCall(db, "finish_home_finder_intake", { p_binding_id: binding.id, p_submission_id: input.submissionId, p_digest: digest, p_status: result.status, p_reference: reference });
    return { ...result, reference };
  } catch (error) {
    // Provider acceptance may precede our receipt. Preserve uncertainty and ID.
    await enterpriseCall(db, "finish_home_finder_intake", { p_binding_id: binding.id, p_submission_id: input.submissionId, p_digest: digest, p_status: "unknown", p_reference: reference }).catch(() => undefined);
    throw error;
  }
}
export async function readHomeFinderReceipt(bindingId: string, submissionId: string, reference: string, db = enterpriseDb(), adapter = requireHomeFinderRuntime(), management = requireManagement()) {
  const saved = z.object({ binding: homeFinderBindingSchema, status: z.string(), reference: z.string().nullable() }).strict().parse(await enterpriseCall(db, "read_home_finder_receipt_scope", { p_binding_id: uuid.parse(bindingId), p_submission_id: uuid.parse(submissionId) }));
  if (saved.binding.id !== bindingId) throw new WorkspaceStoreError("The receipt scope could not be confirmed.");
  const expected = Buffer.from(adapter.receiptReference(saved.binding, submissionId)), supplied = Buffer.from(reference);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new HomeFinderAdapterError("forbidden", "This receipt is unavailable.", { status: 403 });
  // Existing obligations remain inspectable after pause, expiry or revocation.
  return management.readDeliveryReceipt(scope(saved.binding), reference);
}
export async function readHomeFinderSystemObservations(actor: WorkspaceActor, workspaceId: string, db = enterpriseDb()): Promise<Observation[]> {
  return (await readHomeFinderBindings(actor, workspaceId, db)).map(b => ({ subjectId: b.systemId, signal: "home-finder.readiness", source: "integration-connection", outcome: b.status === "revoked" || Date.parse(b.licenseExpiresAt) <= Date.now() ? "fail" : b.runtimeAllowed ? "pass" : "unknown", impact: "blocking", observedAt: b.qualifiedAt, maxAgeSeconds: 300, message: b.status === "revoked" ? "The brokerage grant was revoked. Existing receipts remain readable." : b.qualifiedAt ? "Licensed-provider qualification was observed." : "Provider, licensing and delivery qualification is required." }));
}

export async function configureHomeFinder(actor: WorkspaceActor, raw: HomeFinderConfigure, db = enterpriseDb()) {
  const input = homeFinderConfigureSchema.parse(raw);
  const result = homeFinderBindingSchema.parse(await enterpriseCall(db, "configure_home_finder", { ...enterpriseActor(actor), p_input: input, p_digest: sha256(canonicalJson(input)) }));
  if (result.workspaceId !== input.workspaceId || result.id !== input.bindingId || result.revision !== input.expectedRevision + 1 || result.runtimeAllowed || result.qualifiedAt !== null || result.readiness !== null || result.status !== "active" || result.lifecycle === "live"
    || result.brokerageName !== input.brokerageName || result.approvedOrigin !== input.approvedOrigin || result.sourceName !== input.sourceName
    || result.licenseReference !== input.licenseReference || Date.parse(result.licenseExpiresAt) !== Date.parse(input.licenseExpiresAt)) throw new WorkspaceStoreError("The configuration receipt could not be confirmed. Reload current state.");
  return result;
}
