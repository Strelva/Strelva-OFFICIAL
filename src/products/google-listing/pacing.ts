import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import type { GoogleListingClient, GoogleResult } from "./client";

export interface GooglePacing {
  limited(key: string): Promise<boolean>;
  wait(ms: number): Promise<void>;
}
const defaults: GooglePacing = {
  limited: key => isRateLimitedWindowedAsync(key, 10, 60_000),
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

/** Pace one profile across instances. Only an explicit provider rate-limit
 * rejection may retry; acceptance, network uncertainty and quota-zero setup
 * never retry. Exhaustion returns to the existing approval queue. */
export function paceGoogleWrites(client: GoogleListingClient, workspaceId: string, locationId: string, pacing: GooglePacing = defaults, authorize?: () => Promise<void>): GoogleListingClient {
  async function write<T>(run: () => Promise<GoogleResult<T>>): Promise<GoogleResult<T>> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (await pacing.limited(`google-listing:${workspaceId}:${locationId}`)) {
        // Another instance may have consumed this profile's edit budget.
        if (attempt === 3) return { ok: false, kind: "rate_limited", status: 429, detail: "This profile's edit window is full. The draft stays queued." };
      } else {
        // Limiter and backoff can outlive a grant or owner instruction.
        // Every retry follows a definitive 429; no effect has been accepted.
        if (authorize) {
          try { await authorize(); }
          catch { return { ok: false, kind: "auth", status: 403, detail: "Authority ended before dispatch. Nothing was sent." }; }
        }
        const result = await run();
        if (result.ok || result.kind !== "rate_limited" || attempt === 3) return result;
      }
      await pacing.wait(1000 * 2 ** attempt);
    }
    throw new Error("Google pacing exhausted.");
  }
  return {
    ...client,
    withWriteAuthority: check => paceGoogleWrites(client, workspaceId, locationId, pacing, async () => {
      if (authorize) await authorize();
      await check();
    }),
    updateReply: (...args) => write(() => client.updateReply(...args)),
    deleteReply: (...args) => write(() => client.deleteReply(...args)),
    patchLocation: (...args) => write(() => client.patchLocation(...args)),
    createPost: (...args) => write(() => client.createPost(...args)),
    deletePost: (...args) => write(() => client.deletePost(...args)),
  };
}
