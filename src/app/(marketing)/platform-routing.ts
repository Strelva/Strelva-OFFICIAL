import { CONTROL_PLANE_URL } from "@/platform/infra/brand";

/** These destinations belong to the platform, never to a hosted client site. */
export function isPlatformPublicPath(pathname: string): boolean {
  return ["/agencies", "/pricing", "/try"].some(path => pathname === path || pathname.startsWith(`${path}/`));
}

/** Optional public-site origin. No same-host redirect: it would loop when
 * marketing traffic itself reaches the app's fallback entry. */
export function marketingEntryTarget(host: string, search = "", configured = process.env.STRELVA_MARKETING_ORIGIN): string | null {
  if (!configured?.trim()) return null;
  try {
    const url = new URL(configured.trim());
    const local = process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if ([host.toLowerCase(), new URL(CONTROL_PLANE_URL).host].includes(url.host.toLowerCase())) return null;
    url.search = search;
    return url.toString();
  } catch { return null; }
}
