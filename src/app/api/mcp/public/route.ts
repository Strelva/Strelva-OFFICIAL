/** One platform MCP for every business, dual-era (2026-07-28 and 2025-xx).
 * Same native API, confirmation gate and durable tenant cap as the
 * per-business alias. https://modelcontextprotocol.io/specification/2026-07-28 */
import { methodNotAllowed, serveMcp } from "@/platform/agent-channel/protocol";
import { platformMcpServer } from "@/platform/agent-channel/public-tools";
import { withProtectedTools } from "@/platform/agent-channel/protected-tools";
import { createAgentSiteChangeAdapter, createAgentWebsiteAdapter, observeWebsiteSystemRelease, siteChangeOwnerEmailEnabled, sitesByCodeMayBeOn, sitesByCodeReleased } from "@/products/websites/server";
import { verifySiteRelease } from "@/app/api/_site-declaration";
import { oauthRpc, oauthOrigin } from "@/platform/agent-channel/oauth";
import { tenantDirectory } from "../_directory";

export const dynamic = "force-dynamic";
const server = platformMcpServer(tenantDirectory);

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
export async function POST(request: Request) {
  // Coding agents pick up website Requests only where sites_by_code may be on; the adapter asks the business's row per call.
  const siteChanges = sitesByCodeMayBeOn() ? createAgentSiteChangeAdapter({
    rpc: oauthRpc, released: (workspaceId) => sitesByCodeReleased(workspaceId), verifyRelease: verifySiteRelease,
    observe: observeWebsiteSystemRelease, ownerEmail: siteChangeOwnerEmailEnabled, origin: oauthOrigin(),
  }) : undefined;
  return serveMcp(request, withProtectedTools(server, tenantDirectory, createAgentWebsiteAdapter(oauthRpc, oauthOrigin()), siteChanges));
}
