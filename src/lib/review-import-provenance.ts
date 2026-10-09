import { getRedis } from "@/platform/infra/redis";
import type { ReviewItem, UnifiedEvent } from "./types";

/** Legacy file analogue of the native migration's supported-producer criteria.
 * Missing store/evidence does not turn an unknown row into a customer import. */
export async function reconcileLegacyReviewImports(tenant: string, rows: ReviewItem[]): Promise<ReviewItem[]> {
  const candidate = (r: ReviewItem) => r.source === "google" && r.providerContent == null && r.externalId == null && Boolean(r.author) && Boolean(r.text) && r.rating >= 1 && r.rating <= 5 && typeof r.date === "string" && Boolean(r.date);
  if (!rows.some(candidate)) return rows;
  const redis = getRedis();
  if (!redis) return rows;
  try {
    const members = await redis.zrange<unknown[]>(`events:${tenant}`, 0, -1);
    const ids: string[] = [], embedded: UnifiedEvent[] = [];
    for (const member of members) {
      if (typeof member !== "string") continue;
      if (member.startsWith("{")) { try { embedded.push(JSON.parse(member) as UnifiedEvent); } catch { /* No provenance from malformed history. */ } }
      else ids.push(member);
    }
    const stored = ids.length ? await redis.mget<UnifiedEvent[]>(...ids.map(id => `event:${id}`)) : [];
    const events = [...embedded, ...stored].filter(Boolean);
    return rows.map(row => {
      if (!candidate(row)) return row;
      const apiEvidence = events.some(event => event.tenantId === tenant && event.source === "google" && event.type === "review" && event.body === row.text && event.metadata?.author === row.author && typeof event.metadata?.reviewId === "string" && Boolean(event.metadata.reviewId));
      return apiEvidence ? row : { ...row, providerContent: { source: "customer_import", producer: "legacy_reviews_post_no_external_id" } };
    });
  } catch { return rows; }
}
