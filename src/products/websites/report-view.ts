import { z } from "zod";

/** Only the read identity and fields this browser report renders; not the server report schema. */
const count = z.number().int().nonnegative();
const date = z.string().refine(value => Number.isFinite(Date.parse(value)), "A recorded date is required.");
const websiteReportViewSchema = z.object({
  workId: z.string().min(1), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  inquiries: z.discriminatedUnion("status", [
    z.object({ status: z.literal("available"), count, limitedToRecentRecords: z.boolean() }),
    z.object({ status: z.literal("unavailable"), count: z.null(), limitedToRecentRecords: z.boolean() }),
  ]),
  bookings: z.discriminatedUnion("status", [
    z.object({ status: z.literal("available"), scheduledInPeriod: count, providerVerified: count }),
    z.object({ status: z.literal("unavailable"), scheduledInPeriod: z.null(), providerVerified: z.null() }),
  ]),
  visibility: z.discriminatedUnion("status", [
    z.object({ status: z.literal("available"), checkedAt: date, mentioned: z.boolean(), recommended: z.boolean(), note: z.string() }),
    z.object({ status: z.literal("unavailable"), note: z.string() }),
  ]),
  readiness: z.discriminatedUnion("status", [
    z.object({ status: z.literal("available"), passedChecks: count, totalChecks: count }).refine(value => value.passedChecks <= value.totalChecks),
    z.object({ status: z.literal("unavailable"), passedChecks: z.null(), totalChecks: z.null() }),
  ]),
  changes: z.array(z.object({ revision: z.number().int().positive(), contentHash: z.string().regex(/^[a-f\d]{64}$/i), createdAt: date, published: z.boolean() })),
});
export type WebsiteReportView = z.infer<typeof websiteReportViewSchema>;
export function parseWebsiteReportView(value: unknown, workId: string, month: string): WebsiteReportView {
  const parsed = websiteReportViewSchema.safeParse(value);
  if (!parsed.success || parsed.data.workId !== workId || parsed.data.month !== month) throw new Error("The monthly report could not be confirmed for this website and month. Try loading it again.");
  return parsed.data;
}
