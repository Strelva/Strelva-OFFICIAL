/** Owner-selected inquiry replies; discovery reads the same service and slot authority. */
import { readLegacyBookingInquiry as getLeadById } from "@/server/bookings/legacy-ports";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { assertWorkspaceCalendarManager } from "@/products/scheduling/server";
import { bookingReadSource } from "@/platform/bookings/flags";
import { bookingInquiryOffersEnabled } from "@/platform/bookings/inquiry-offers";
import { nativeServices, nativeSlots } from "@/platform/bookings/native";
import { readBookingContext } from "@/platform/bookings/store";
import { PublicBookingError } from "@/platform/bookings/errors";

import { proposalOptionsSchema, type InquiryProposalOptions } from "./inquiry-proposal-contracts";

/** No I/O at all when the proposal switch is off. Member-only accounts cannot send replies. */
export async function ownerCanProposeBookingTimes(actor: WorkspaceActor, workspaceId: string): Promise<boolean> {
  if (!bookingInquiryOffersEnabled() || await bookingReadSource() !== "postgres") return false;
  try { await assertWorkspaceCalendarManager(actor, workspaceId); return true; } catch { return false; }
}

export async function readInquiryProposalOptions(actor: WorkspaceActor, input: { workspaceId: string; tenantId: string; inquiryId: string; serviceId?: string }, dependencies: {
  manage?: typeof assertWorkspaceCalendarManager; context?: typeof readBookingContext; inquiry?: typeof getLeadById;
  services?: typeof nativeServices; slots?: typeof nativeSlots; now?: Date;
} = {}): Promise<InquiryProposalOptions> {
  await (dependencies.manage ?? assertWorkspaceCalendarManager)(actor, input.workspaceId);
  const ctx = await (dependencies.context ?? readBookingContext)(input.tenantId);
  if (ctx?.workspaceId !== input.workspaceId) throw new PublicBookingError("not_found", "This inquiry is unavailable.");
  const inquiry = await (dependencies.inquiry ?? getLeadById)(input.tenantId, input.inquiryId);
  if (!inquiry?.email) throw new PublicBookingError("not_found", "This inquiry has no customer email.");
  const catalog = await (dependencies.services ?? nativeServices)(input.tenantId);
  const services = catalog.services.filter((service) => service.mode === "request").map(({ id, name, durationMinutes }) => ({ id, name, durationMinutes }));
  const serviceId = input.serviceId ?? services[0]?.id ?? null;
  if (serviceId && !services.some((service) => service.id === serviceId)) throw new PublicBookingError("not_found", "This request-mode service is unavailable.");
  const customer = { name: inquiry.name, email: inquiry.email };
  if (!serviceId || catalog.paused) return { services, customer, serviceId, timeZone: catalog.timeZone, paused: catalog.paused, slots: [] };
  const now = dependencies.now ?? new Date();
  const offered = await (dependencies.slots ?? nativeSlots)(input.tenantId, serviceId, now.toISOString(), new Date(now.getTime() + 60 * 86400000).toISOString());
  return proposalOptionsSchema.parse({ services, customer, serviceId, timeZone: offered.timeZone, paused: offered.paused, slots: offered.slots.map(({ start, end }) => ({ start, end })) });
}
