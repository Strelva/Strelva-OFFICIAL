import { z } from "zod";

/** Browser-safe shape of GET /api/workspace/site-summary (Home's "From your site"). */
export const siteSummarySchema = z.object({
  tenantId: z.string(),
  siteName: z.string(),
  visits: z.object({ total: z.number(), thisWeek: z.number() }).nullable(),
  actions: z.object({ total: z.number(), thisWeek: z.number() }).nullable(),
  leads: z.object({
    count: z.number(),
    recent: z.array(z.object({ id: z.string(), name: z.string(), message: z.string().nullable(), createdAt: z.string() })),
  }).nullable(),
  activity: z.array(z.object({ id: z.string(), label: z.string(), detail: z.string().nullable(), time: z.string() })).nullable(),
});
export type SiteSummary = z.infer<typeof siteSummarySchema>;

export const siteSummariesSchema = z.object({
  sites: z.array(siteSummarySchema),
  deniedSites: z.array(z.string()),
});
export type SiteSummaries = z.infer<typeof siteSummariesSchema>;
