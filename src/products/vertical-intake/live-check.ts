import { fetchLiveSitePage } from "@/products/connected-sites/server";
import type { VerticalIntakeAppId } from "./contracts";

export type IntakeLiveCheck = { state: "found" | "not_seen" | "unreachable"; checkedAt: string; url: string; release: number | null };

/** Looks at the office's live page for the form's mount marker and the site key. Never changes anything. */
export async function checkIntakeOnPage(
  input: { url: string; siteKey: string; appId: VerticalIntakeAppId; release: number | null },
  fetchPage: (url: string) => Promise<string | null> = fetchLiveSitePage,
): Promise<IntakeLiveCheck> {
  const base = { checkedAt: new Date().toISOString(), url: input.url, release: input.release };
  const html = await fetchPage(input.url).catch(() => null);
  if (html === null) return { ...base, state: "unreachable" };
  const marker = new RegExp(`data-strelva-app=["']${input.appId}["']`);
  return { ...base, state: marker.test(html) && html.includes(input.siteKey) ? "found" : "not_seen" };
}
