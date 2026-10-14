import { z } from "zod";

/** A read model over kept records, never a second notification store. */
export const systemArrivalsSchema = z.object({
  workspaceId: z.string().uuid(),
  readAt: z.iso.datetime({ offset: true }),
  sources: z.array(z.enum(["inquiries", "bookings"])),
  unavailable: z.array(z.enum(["inquiries", "bookings"])),
  items: z.array(z.object({
    id: z.string(), kind: z.enum(["inquiry", "booking"]), title: z.string(), detail: z.string(),
    href: z.string().regex(/^\/workspace(?:\/|\?)/),
  })).max(12),
});
export type SystemArrivals = z.infer<typeof systemArrivalsSchema>;
