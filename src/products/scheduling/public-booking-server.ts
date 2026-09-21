import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { getTenantConfig } from "@/lib/tenants";
import { captureLead } from "@/lib/leads";
import { PostgresOfferingStore } from "@/platform/offerings/store";
import {
  getInquiryRepository,
  projectPublishedInquiry,
  recordInquiryEvidence,
  resolveInquiryWorkspace,
  validateInquiryFields,
} from "@/products/inquiries/server";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import {
  calendarSchedulingService,
  changeWorkspaceSchedule,
  readWorkspaceProviderAvailability,
  readWorkspaceExitCompleted,
  readWorkspaceSchedule,
} from "./server";
import { scheduleSchema } from "./contracts";
import {
  createPublicBookingService,
  PublicBookingError,
  publicBookingVisitorSchema,
  type PublicBookingBinding,
  type PublicBookingCalendar,
  type PublicBookingInquiryCapture,
  type PublicBookingRange,
} from "./public-booking";
import { postgresPublicBookingTokenStore } from "./public-booking-store";

type DbRow = Record<string, unknown>;
type DbResult = { data: unknown; error: { code?: unknown; message?: unknown } | null };
interface DbQuery extends PromiseLike<DbResult> {
  select(columns?: string, options?: unknown): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  maybeSingle(): Promise<DbResult>;
}
type BookingDb = { from(table: string): DbQuery };

function db(): BookingDb {
  const client = getSupabase();
  if (!client) throw new Error("Public booking storage is not configured.");
  return client as unknown as BookingDb;
}

function text(row: DbRow, key: string): string {
  return typeof row[key] === "string" ? row[key] as string : "";
}

function requiredText(row: DbRow, key: string): string {
  const value = text(row, key);
  if (!value) throw new Error(`Public booking record is missing ${key}.`);
  return value;
}

function numberValue(row: DbRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Public booking record is missing ${key}.`);
  return value;
}

function slotId(tenantId: string, capabilityId: string, version: number, start: string, end: string): string {
  return `slot-${createHash("sha256").update(`${tenantId}:${capabilityId}:${version}:${start}:${end}`, "utf8").digest("hex").slice(0, 32)}`;
}

function overlaps(left: { start: string; end: string }, right: { start: string; end: string }): boolean {
  return Date.parse(left.start) < Date.parse(right.end) && Date.parse(left.end) > Date.parse(right.start);
}

function minMax(values: readonly { start: string; end: string }[]): { start: string; end: string } | null {
  if (!values.length) return null;
  return {
    start: values.reduce((value, item) => Date.parse(item.start) < Date.parse(value) ? item.start : value, values[0]!.start),
    end: values.reduce((value, item) => Date.parse(item.end) > Date.parse(value) ? item.end : value, values[0]!.end),
  };
}

async function ownerFor(workspaceId: string, workId: string): Promise<WorkspaceActor> {
  const workResult = await db().from("saved_product_work")
    .select("id,workspace_id,product_id,resource_kind,created_by")
    .eq("id", workId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (workResult.error || !workResult.data || typeof workResult.data !== "object") throw new Error("Public booking schedule is unavailable.");
  const work = workResult.data as DbRow;
  if (text(work, "product_id") !== "scheduling" || text(work, "resource_kind") !== "schedule") throw new Error("Public booking schedule is unavailable.");
  const userId = requiredText(work, "created_by");
  const userResult = await db().from("users").select("id,email,verified_at").eq("id", userId).maybeSingle();
  if (userResult.error || !userResult.data || typeof userResult.data !== "object") throw new Error("Public booking owner is unavailable.");
  const user = userResult.data as DbRow;
  const email = text(user, "email").trim().toLowerCase();
  if (!email || !text(user, "verified_at")) throw new Error("Public booking owner is unavailable.");
  return { userId, verifiedEmail: email };
}

/** Resolve only an explicit published grant and its owned schedule. */
export async function resolvePublishedPublicBooking(input: {
  tenantId: string;
  capabilityId: string;
  range?: PublicBookingRange;
  includeRevoked?: boolean;
}): Promise<PublicBookingBinding | null> {
  const config = await getTenantConfig(input.tenantId);
  if (!config?.active || !config.stableId) return null;
  let grantQuery = db().from("public_website_booking_grants")
    .select("*")
    .eq("tenant_stable_id", config.stableId)
    .eq("capability_id", input.capabilityId);
  if (!input.includeRevoked) grantQuery = grantQuery.eq("status", "published");
  const grantResult = await grantQuery.maybeSingle();
  if (grantResult.error) throw new Error("Public booking grant is unavailable.");
  if (!grantResult.data || typeof grantResult.data !== "object") return null;
  const grant = grantResult.data as DbRow;
  const workspaceId = requiredText(grant, "business_workspace_id");
  const workId = requiredText(grant, "work_id");
  const owner = await ownerFor(workspaceId, workId);
  let inspection: Awaited<ReturnType<PostgresOfferingStore["inspect"]>>;
  try {
    inspection = await new PostgresOfferingStore().inspect(owner, workspaceId);
  } catch {
    throw new Error("Public website binding is unavailable.");
  }
  const matchingBindings = inspection.websiteBindings.filter((candidate) => (
    candidate.businessId === workspaceId
      && candidate.tenantId === input.tenantId
      && candidate.tenantActive
      && candidate.actorHasTenantAccess
  ));
  const websiteBinding = matchingBindings.find((candidate) => candidate.status === "active")
    ?? (input.includeRevoked ? matchingBindings.find((candidate) => candidate.status === "revoked") : undefined);
  const websiteBindingActive = websiteBinding?.status === "active";
  // A revoked website binding closes new reads/reservations. Existing
  // receipts still need a recovery path so cancellation can finish after the
  // customer disconnects the site.
  if (!websiteBinding || (!websiteBindingActive && !input.includeRevoked)) return null;
  if (!input.includeRevoked && await readWorkspaceExitCompleted(workspaceId)) {
    throw new PublicBookingError("conflict", "Booking availability is stopped for this workspace.");
  }
  const work = await readWorkspaceSchedule(owner, workId);
  const schedule = scheduleSchema.parse(work.payload);
  const configuredRange = input.range
    ? { start: input.range.from, end: input.range.to }
    : minMax(schedule.availability);
  const availability = configuredRange
    ? await readWorkspaceProviderAvailability(owner, workspaceId, requiredText(grant, "provider") as "outlook" | "google", {
      start: configuredRange.start,
      end: configuredRange.end,
      timeZone: text(grant, "time_zone") || undefined,
    })
    : { busy: [] as Array<{ start: string; end: string }>, timeZone: text(grant, "time_zone") || "UTC" };
  const providerBusy = Array.isArray(availability.busy) ? availability.busy : [];
  const slots = schedule.availability
    .filter(slot => !input.range || (Date.parse(slot.start) >= Date.parse(input.range.from) && Date.parse(slot.end) <= Date.parse(input.range.to)))
    .filter(slot => !schedule.reservations.some(reservation => reservation.status !== "cancelled" && overlaps(slot, reservation)))
    .filter(slot => !providerBusy.some(busy => overlaps(slot, busy)))
    .slice(0, 500)
    .map(slot => ({
      id: slotId(input.tenantId, input.capabilityId, numberValue(grant, "capability_version"), slot.start, slot.end),
      start: slot.start,
      end: slot.end,
    }));
  return {
    tenantId: input.tenantId,
    tenantStableId: config.stableId,
    grantId: requiredText(grant, "id"),
    status: text(grant, "status") as "published" | "revoked",
    websiteBindingActive,
    capabilityId: input.capabilityId,
    version: numberValue(grant, "capability_version"),
    inquiryCapabilityId: requiredText(grant, "inquiry_capability_id"),
    inquiryVersion: numberValue(grant, "inquiry_version"),
    name: requiredText(grant, "display_name"),
    provider: requiredText(grant, "provider") as "outlook" | "google",
    timeZone: text(grant, "time_zone") || availability.timeZone || "UTC",
    slots,
    owner,
    workspaceId,
    workId,
  };
}

function publicInquiryCapture(): PublicBookingInquiryCapture {
  return {
    async capture(input) {
      const config = await getTenantConfig(input.tenantId);
      if (!config?.active) throw new Error("Inquiry tenant is unavailable.");
      const workspace = await resolveInquiryWorkspace({
        tenantId: input.tenantId,
        tenantStableId: config.stableId,
        fallbackBusinessId: config.stableId ?? input.tenantId,
      });
      if (workspace.exitCompleted) throw new Error("Inquiry intake is stopped for this workspace.");
      const repository = getInquiryRepository();
      const snapshot = await repository.getSnapshot(input.tenantId, workspace.businessId);
      const capability = snapshot?.state.capabilities.find(item => item.id === input.capabilityId && item.businessId === workspace.businessId);
      const published = capability ? projectPublishedInquiry(capability) : null;
      if (!published || published.version !== input.capabilityVersion || !capability?.live) throw new Error("Inquiry form is unavailable.");
      const message = [
        input.visitor.message,
        `Requested time: ${input.start} to ${input.end}`,
      ].filter(Boolean).join("\n");
      const fields: Record<string, string> = {
        name: input.visitor.name,
        email: input.visitor.email,
        ...(message ? { message } : {}),
      };
      const validationErrors = validateInquiryFields(capability.live, fields);
      if (validationErrors.length) throw new Error(validationErrors[0]);
      const captured = await captureLead(input.tenantId, {
        name: input.visitor.name,
        email: input.visitor.email,
        message,
        source: "public-booking",
        fields,
        capabilityId: input.capabilityId,
        capabilityVersion: input.capabilityVersion,
      }, { notifyOwner: false });
      if ((captured.status !== "captured" && captured.status !== "duplicate") || !captured.lead) throw new Error("Inquiry capture is unavailable.");
      const evidence = await recordInquiryEvidence({
        tenantId: input.tenantId,
        businessId: workspace.businessId,
        inquiryId: captured.lead.id,
        capabilityId: input.capabilityId,
        expectedCapabilityVersion: input.capabilityVersion,
        fields,
        receivedAt: captured.lead.createdAt,
        repository,
      });
      if (evidence.status === "unavailable" || evidence.status === "rejected") throw new Error(evidence.reason);
      return { inquiryId: captured.lead.id };
    },
  };
}

function nativeCalendar(): PublicBookingCalendar {
  async function read(binding: PublicBookingBinding) {
    return scheduleSchema.parse((await readWorkspaceSchedule(binding.owner, binding.workId)).payload);
  }
  function confirmation(
    schedule: z.infer<typeof scheduleSchema>,
    requestId: string,
    fallback: { start: string; end: string },
    expectedStatus: "accepted" | "cancelled" = "accepted",
  ) {
    const reservation = schedule.reservations.find(item => item.requestId === requestId);
    if (!reservation) throw new Error("The native reservation could not be read back.");
    return {
      verification: reservation.status === expectedStatus && reservation.verification === "verified" ? "verified" as const : "pending" as const,
      start: reservation.start || fallback.start,
      end: reservation.end || fallback.end,
      expectedRevision: schedule.revision,
    };
  }
  return {
    async reserve(input) {
      const current = await read(input.binding);
      await changeWorkspaceSchedule(input.binding.owner, input.binding.workId, {
        kind: "reserve",
        expectedRevision: current.revision,
        requestId: input.requestId,
        title: input.title,
        start: input.start,
        end: input.end,
      });
      await calendarSchedulingService.create(input.binding.owner, input.binding.workId, input.requestId, input.binding.provider);
      return confirmation(await read(input.binding), input.requestId, input);
    },
    async change(input) {
      await calendarSchedulingService.reschedule(input.binding.owner, input.binding.workId, input.requestId, {
        provider: input.binding.provider,
        expectedRevision: input.expectedRevision,
        start: input.start,
        end: input.end,
      });
      return confirmation(await read(input.binding), input.requestId, input);
    },
    async cancel(input) {
      await calendarSchedulingService.cancel(input.binding.owner, input.binding.workId, input.requestId, {
        provider: input.binding.provider,
        expectedRevision: input.expectedRevision,
      });
      const schedule = await read(input.binding);
      return confirmation(schedule, input.requestId, {
        start: schedule.reservations.find(item => item.requestId === input.requestId)?.start ?? new Date().toISOString(),
        end: schedule.reservations.find(item => item.requestId === input.requestId)?.end ?? new Date(Date.now() + 60_000).toISOString(),
      }, "cancelled");
    },
  };
}

export function createPublicWebsiteBookingService() {
  return createPublicBookingService({
    resolve: resolvePublishedPublicBooking,
    inquiries: publicInquiryCapture(),
    calendar: nativeCalendar(),
    tokens: postgresPublicBookingTokenStore,
    createRequestId: () => `public-${randomUUID()}`,
  });
}

export function validatePublicBookingVisitor(value: unknown) {
  return publicBookingVisitorSchema.safeParse(value);
}
