import { reconcileLegacyReviewImports } from "./review-import-provenance";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabase } from "@/platform/infra/db/client";
import { getRedis } from "@/platform/infra/redis";
import { projectGoogleReview, projectGoogleReviewEvent } from "@/platform/google-review-content";
import { updateEvent } from "./events";
import type { ReviewItem, UnifiedEvent } from "./types";

/** Runs independent of polling/drafting/listing flags. No provider calls.
 * A 29-day cache leaves a one-day schedule margin; missed jobs are failures,
 * while every read still redacts immediately after its original expiry. */
export async function purgeGoogleReviewContent(): Promise<{ reviews: number; events: number; devFiles: number; archiveParts: number }> {
  const db = getSupabase();
  if (!db) throw new Error("Review retention database unavailable.");
  const { data, error } = await db.rpc("purge_google_review_content");
  if (error) throw new Error("Review retention database purge failed.");
  const counts = data as { reviews?: number; events?: number; archiveParts?: number } | null;
  let events = counts?.events ?? 0, devFiles = 0;
  const redis = getRedis();
  if (!redis) throw new Error("Review retention Redis unavailable.");
  // Reconcile file provenance before purging its original API event evidence.
  for (const file of await fs.readdir(process.cwd())) {
    if (!/^dev-reviews-[A-Za-z0-9_-]+\.json$/.test(file)) continue;
    const target = path.join(process.cwd(), file);
    const rows = JSON.parse(await fs.readFile(target, "utf8")) as ReviewItem[];
    const reconciled = await reconcileLegacyReviewImports(file.slice("dev-reviews-".length, -".json".length), rows);
    const projected = reconciled.map(row => projectGoogleReview(row));
    if (JSON.stringify(rows) !== JSON.stringify(projected)) { await fs.writeFile(target, JSON.stringify(projected, null, 2)); devFiles++; }
  }
  // Full scan, bounded by route deadline. Failure cannot record successful purge.
  for (const pattern of ["event:*", "events:*"]) {
    let cursor = 0;
    do {
      const [next, keys] = await redis.scan(cursor, { match: pattern, count: 250 });
      cursor = Number(next);
      for (const key of keys) {
        if (pattern === "event:*") {
          const event = await redis.get<UnifiedEvent>(key);
          if (event && JSON.stringify(projectGoogleReviewEvent(event)) !== JSON.stringify(event)) {
            const result = await updateEvent(event.id, current => projectGoogleReviewEvent(current));
            if (!result.changed) throw new Error("Review retention event is busy; retry required.");
            events++;
          }
        } else {
          const members = await redis.zrange<string[]>(key, 0, -1);
          for (const member of members) {
            if (typeof member !== "string" || !member.startsWith("{")) continue;
            let event: UnifiedEvent;
            try { event = JSON.parse(member) as UnifiedEvent; } catch { continue; }
            const projected = projectGoogleReviewEvent(event);
            if (JSON.stringify(projected) === JSON.stringify(event)) continue;
            // Preserve the historical index entry without retaining its old JSON.
            await redis.zadd(key, { score: Date.parse(event.createdAt) || 0, member: JSON.stringify(projected) });
            await redis.zrem(key, member);
            events++;
          }
        }
      }
    } while (cursor !== 0);
  }
  return { reviews: counts?.reviews ?? 0, events, devFiles, archiveParts: counts?.archiveParts ?? 0 };
}
