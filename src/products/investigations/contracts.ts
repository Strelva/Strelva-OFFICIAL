import { z } from "zod";
import { baseSchema } from "@/platform/bounded-work/contracts";
export const investigationSourceSchema = z.object({ workId: z.string().uuid(), keyField: z.string().max(100).optional(), valueField: z.string().max(100).optional() }).strict();
export const investigationInputSchema = z.object({ title: z.string().trim().min(1).max(160), intervalMinutes: z.number().int().min(15).max(43200), sources: z.tuple([investigationSourceSchema, investigationSourceSchema]) }).strict().refine(value => value.sources[0].workId !== value.sources[1].workId, "Select two different sources");
const differenceSchema = z.object({ key: z.string(), left: z.string().nullable(), right: z.string().nullable() });
export const investigationSchema = baseSchema.extend({
  sources: z.tuple([investigationSourceSchema, investigationSourceSchema]), intervalMinutes: z.number().int().min(15).max(43200), status: z.enum(["active", "paused"]), nextRunAt: z.string().datetime(),
  runs: z.array(z.object({ requestId: z.string(), at: z.string().datetime(), result: z.enum(["agreement", "discrepancy", "no_change"]), fingerprint: z.string(), sources: z.array(z.object({ workId: z.string(), revision: z.number(), updatedAt: z.string() })).length(2), differences: z.array(differenceSchema).max(1000) })).max(200),
});
