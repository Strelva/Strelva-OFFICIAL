import { z } from "zod";
import type { AuditResult } from "@/lib/audit/types";
const text = z.string().max(20000);
const score = z.number().min(0).max(100);
export const websiteAuditSchema = z.object({
  url: z.string().url().max(2048).refine(value => /^https?:\/\//i.test(value)),
  scannedAt: z.string().datetime(), overallScore: score, grade: z.enum(["A", "B", "C", "D", "F"]),
  categories: z.array(z.object({
    name: text, slug: z.string().max(100), weight: z.number().min(0).max(100), score,
    checks: z.array(z.object({ name: text, status: z.enum(["pass","warn","fail"]), score, message: text,
      details: text.optional(), impact: text.optional(), priority: z.enum(["high","medium","low"]).optional(),
    })).max(200),
    guides: z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/).max(200), title: text })).max(30).optional(),
  })).max(30),
});
export function parseWebsiteAudit(value: unknown): AuditResult | null {
  const parsed = websiteAuditSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
