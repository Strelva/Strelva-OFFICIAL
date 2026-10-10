import { CONTROL_PLANE_URL } from "@/platform/infra/brand";
import { businessPageUrl } from "./business-page";

/** Mirrors server appOrigin + businessPageUrl without trusting the request Host. */
export function exactBusinessPageUrl(url: string, handle: string): boolean {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password
      && !parsed.search && !parsed.hash
      && url === businessPageUrl(process.env.NEXT_PUBLIC_APP_URL || CONTROL_PLANE_URL, handle);
  } catch { return false; }
}

/** Browser counterpart of systemOriginId's SHA-256 UUID layout. No server imports. */
export async function expectedConnectedSiteSystemId(workspaceId: string, siteId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`system:${workspaceId}:connected_site:${siteId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
