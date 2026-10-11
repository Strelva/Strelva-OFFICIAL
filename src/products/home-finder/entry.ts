import { z } from "zod";
import { deriveSealKey, openWithKey, sealWithKey } from "@/platform/infra/crypto/secrets";
import { enterpriseCall, enterpriseDb } from "@/platform/enterprise/server";
import { homeFinderBindingSchema } from "./runtime-contracts";
import { HomeFinderAdapterError } from "./types";
const claims = z.object({ bindingId: z.string().uuid(), approvedOrigin: z.string().url(), revision: z.number().int().positive(), issuedAt: z.number(), expiresAt: z.number() }).strict();
function key() { const secret = process.env.HOME_FINDER_MANAGEMENT_SIGNING_KEY; if (!secret || secret.length < 32) throw new HomeFinderAdapterError("invalid_scope", "Home Finder entry is unavailable."); return deriveSealKey("home-finder-native-entry", secret); }
async function bindingForEntry(bindingId: string) { const b = homeFinderBindingSchema.parse(await enterpriseCall(enterpriseDb(), "read_home_finder_probe", { p_binding_id: z.string().uuid().parse(bindingId) })); if (b.id !== bindingId) throw new HomeFinderAdapterError("forbidden", "This entry is unavailable.", { status: 403 }); return b; }
export function sealHomeFinderEntry(input: { bindingId: string; approvedOrigin: string; revision: number }, now = Date.now()) { return sealWithKey(key(), JSON.stringify({ ...input, issuedAt: now, expiresAt: now + 300_000 })); }
export function parseHomeFinderEntry(token: string, bindingId: string, allowRenewal = false, now = Date.now()) {
  const opened = token.length <= 2048 ? openWithKey(key(), token) : null;
  let value: unknown; try { value = opened ? JSON.parse(opened) : null; } catch { value = null; }
  const result = claims.safeParse(value);
  if (!result.success || result.data.bindingId !== bindingId || result.data.issuedAt > now + 30_000 || result.data.expiresAt !== result.data.issuedAt + 300_000 || result.data.expiresAt + (allowRenewal ? 1_800_000 : 0) <= now) throw new HomeFinderAdapterError("forbidden", "Reopen Home Finder on the approved brokerage website.", { status: 403 });
  return result.data;
}
export async function createHomeFinderEntry(bindingId: string, requestHeaders: Headers) {
  const b = await bindingForEntry(bindingId);
  let origin: string | undefined; try { origin = new URL(requestHeaders.get("referer") ?? "").origin; } catch { /* fail closed */ }
  if (requestHeaders.get("sec-fetch-dest") !== "iframe" || origin !== b.approvedOrigin) throw new HomeFinderAdapterError("forbidden", "Open Home Finder on the approved brokerage website.", { status: 403 });
  return { token: sealHomeFinderEntry({ bindingId: b.id, approvedOrigin: b.approvedOrigin, revision: b.revision }), brokerageName: b.brokerageName };
}
export async function requireHomeFinderEntry(token: string, bindingId: string, renew = false) {
  const claim = parseHomeFinderEntry(token, bindingId, renew), b = await bindingForEntry(bindingId);
  if (claim.revision !== b.revision || claim.approvedOrigin !== b.approvedOrigin) throw new HomeFinderAdapterError("forbidden", "This installation changed. Reopen it on the brokerage website.", { status: 403 });
  return renew ? sealHomeFinderEntry({ bindingId: b.id, approvedOrigin: b.approvedOrigin, revision: b.revision }) : token;
}
/** Shared proxy seam: replace frame-ancestors and X-Frame-Options only for the
 * exact native buyer page. An unavailable binding always refuses framing. */
export async function homeFinderFrameAncestors(bindingId: string): Promise<string> {
  try { return `frame-ancestors ${(await bindingForEntry(bindingId)).approvedOrigin}`; } catch { return "frame-ancestors 'none'"; }
}
