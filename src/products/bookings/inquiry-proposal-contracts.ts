import { z } from "zod";

export const proposalOptionsSchema = z.object({
  services: z.array(z.object({ id: z.string(), name: z.string(), durationMinutes: z.number() })),
  customer: z.object({ name: z.string(), email: z.string().email() }),
  serviceId: z.string().nullable(), timeZone: z.string(), paused: z.boolean(),
  slots: z.array(z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) })).max(500),
});
export type InquiryProposalOptions = z.infer<typeof proposalOptionsSchema>;
export type InquiryProposalDelivery = "accepted" | "suppressed" | "unavailable";

