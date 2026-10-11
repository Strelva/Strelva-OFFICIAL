import { isSafeFetchUrl } from "@/platform/infra/safe-fetch";

/** Deterministic intake policy only; DNS and pinned fetching stay server-owned. */
export function normalizeWebsiteRebuildUrl(raw: string): string {
  const input = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input) && !/^https?:\/\//i.test(input)) throw new Error("Enter a public HTTP or HTTPS website address.");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); }
  catch { throw new Error("Enter a valid public website address."); }
  if (!isSafeFetchUrl(url.href) || url.username || url.password || url.port && !["80", "443"].includes(url.port)) throw new Error("Enter a public HTTP or HTTPS website address without credentials or a custom port.");
  url.hash = "";
  return url.href;
}
