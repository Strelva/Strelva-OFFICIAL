import { getTenantConfig } from "@/lib/tenants";
import { PostgresOfferingStore } from "@/platform/offerings/store";
import { listWorkspaces } from "@/platform/workspaces/repository";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { readInquiryWorkspace, projectPublishedInquiry } from "@/products/inquiries/server";
import { listPublicWebsiteBookingGrants, readWorkspaceSchedule, scheduleSchema } from "@/products/scheduling/server";
import {
  websiteCapabilityOptionsSchema,
  websiteCapabilitySelectionSchema,
  websitePublishedCapabilitiesSchema,
  type WebsiteCapabilityOptions,
  type WebsiteCapabilitySelection,
  type WebsitePublishedCapabilities,
} from "./contracts";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown): number | null {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function configuredBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.CONTROL_PLANE_API_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function scheduleRange(payload: unknown): { from: string; to: string } | null {
  const schedule = scheduleSchema.safeParse(payload);
  if (!schedule.success || schedule.data.availability.length === 0) return null;
  const sorted = [...schedule.data.availability].sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first && last ? { from: first.start, to: last.end } : null;
}

function grantRows(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.map(record).filter((item): item is RecordValue => item !== null);
  const single = record(value);
  return single ? [single] : [];
}

function activeWebsiteBindings(value: Awaited<ReturnType<PostgresOfferingStore["inspect"]>>) {
  return value.websiteBindings.filter((candidate) => (
    candidate.status === "active" && candidate.tenantActive && candidate.actorHasTenantAccess
  ));
}

/**
 * List current native connections that this workspace member may pin to one
 * saved website. No connection is selected by this read and no brief/model
 * field participates in the result.
 */
export async function listPublishedWebsiteCapabilityOptions(
  actor: WorkspaceActor,
  workspaceId: string,
  _websiteWorkId: string,
): Promise<WebsiteCapabilityOptions> {
  const workspace = (await listWorkspaces(actor)).find(candidate => candidate.id === workspaceId);
  if (!workspace) return { tenants: [] };
  // Native offering bindings belong to customer workspaces. Personal and
  // agency work can still own a website draft, but cannot expose customer
  // inquiry or booking connections through this selector.
  if (workspace.kind !== "customer" || workspace.access === "delegated_read") return { tenants: [] };
  const inspection = await new PostgresOfferingStore().inspect(actor, workspaceId);
  const bindings = activeWebsiteBindings(inspection);
  if (bindings.length === 0) return { tenants: [] };

  const grants = grantRows(await listPublicWebsiteBookingGrants(actor, workspaceId));
  const scheduleCache = new Map<string, { from: string; to: string } | null>();
  const tenants: WebsiteCapabilityOptions["tenants"] = [];

  for (const binding of bindings) {
    const tenant = await getTenantConfig(binding.tenantId);
    const tenantStableId = tenant?.stableId;
    const inquiryWorkspace = await readInquiryWorkspace({ tenantId: binding.tenantId, businessId: workspaceId });
    const inquiry = (inquiryWorkspace.snapshot?.state.capabilities ?? [])
      .map((candidate) => projectPublishedInquiry(candidate))
      .filter((candidate): candidate is NonNullable<ReturnType<typeof projectPublishedInquiry>> => candidate !== null)
      .map((candidate) => ({ capabilityId: candidate.capabilityId, version: candidate.version, name: candidate.name }));

    const booking: WebsiteCapabilityOptions["tenants"][number]["booking"] = [];
    if (tenantStableId) {
      for (const grant of grants.filter((candidate) => (
        text(candidate.status) === "published" && text(candidate.tenant_stable_id) === tenantStableId
      ))) {
        const grantId = text(grant.id);
        const capabilityId = text(grant.capability_id);
        const version = positiveInteger(grant.capability_version);
        const workId = text(grant.work_id);
        const provider = text(grant.provider);
        const displayName = text(grant.display_name);
        if (!grantId || !capabilityId || !version || !workId || !displayName || (provider !== "outlook" && provider !== "google")) continue;
        if (!scheduleCache.has(workId)) scheduleCache.set(workId, scheduleRange((await readWorkspaceSchedule(actor, workId)).payload));
        const range = scheduleCache.get(workId);
        if (!range) continue;
        const parsed = { grantId, capabilityId, version, name: displayName, provider, range };
        const valid = websiteCapabilityOptionsSchema.shape.tenants.element.shape.booking.element.safeParse(parsed);
        if (valid.success) booking.push(valid.data);
      }
    }

    const parsed = websiteCapabilityOptionsSchema.shape.tenants.element.safeParse({
      tenantId: binding.tenantId,
      siteName: binding.siteName,
      inquiry,
      booking,
    });
    if (parsed.success && (parsed.data.inquiry.length > 0 || parsed.data.booking.length > 0)) tenants.push(parsed.data);
  }

  return websiteCapabilityOptionsSchema.parse({ tenants });
}

/**
 * Resolve one previously selected connection into the public projection used
 * by the generated client. A stale selection fails closed instead of silently
 * falling back to a different tenant, inquiry, or schedule.
 */
export async function resolvePublishedWebsiteCapabilities(
  actor: WorkspaceActor,
  workspaceId: string,
  websiteWorkId: string,
  selection?: WebsiteCapabilitySelection,
): Promise<WebsitePublishedCapabilities | undefined> {
  if (!selection) return undefined;
  const parsedSelection = websiteCapabilitySelectionSchema.parse(selection);
  const options = await listPublishedWebsiteCapabilityOptions(actor, workspaceId, websiteWorkId);
  const tenant = options.tenants.find((candidate) => candidate.tenantId === parsedSelection.tenantId);
  if (!tenant) return undefined;
  const inquiry = parsedSelection.inquiryCapabilityId
    ? tenant.inquiry.find((candidate) => candidate.capabilityId === parsedSelection.inquiryCapabilityId)
    : undefined;
  const booking = parsedSelection.bookingGrantId
    ? tenant.booking.find((candidate) => candidate.grantId === parsedSelection.bookingGrantId)
    : undefined;
  if ((parsedSelection.inquiryCapabilityId && !inquiry) || (parsedSelection.bookingGrantId && !booking)) return undefined;
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) return undefined;
  const result = websitePublishedCapabilitiesSchema.safeParse({
    baseUrl,
    tenant: tenant.tenantId,
    ...(inquiry ? { inquiry: { capabilityId: inquiry.capabilityId, version: inquiry.version } } : {}),
    ...(booking ? { booking: { capabilityId: booking.capabilityId, version: booking.version, range: booking.range } } : {}),
  });
  return result.success ? result.data : undefined;
}
