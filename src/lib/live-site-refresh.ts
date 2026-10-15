import { revalidateClientSite } from "@/lib/revalidate-client";

export type LiveSiteRefresh =
  | { status: "revalidated" }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

/**
 * Tell the client's live site to refresh through the signed v1 revalidate
 * contract and report honestly what happened. Never throws.
 */
export async function refreshLiveSite(
  tenant: string,
  target: string[] | "all",
  options?: { tags?: string[] },
): Promise<LiveSiteRefresh> {
  try {
    const result = await (options ? revalidateClientSite(tenant, target, options) : revalidateClientSite(tenant, target));
    if (result.skipped) return { status: "not_configured" };
    if (result.success) return { status: "revalidated" };
    return { status: "failed", error: result.error || "Unknown revalidation failure" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown revalidation failure";
    console.error("[live-site] Failed to revalidate client site:", err);
    return { status: "failed", error };
  }
}
