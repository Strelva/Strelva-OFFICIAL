/** One platform MCP for every business, dual-era (2026-07-28 and 2025-xx).
 * Same native API, confirmation gate and durable tenant cap as the
 * per-business alias. https://modelcontextprotocol.io/specification/2026-07-28 */
import { methodNotAllowed, serveMcp } from "@/platform/agent-channel/protocol";
import { platformMcpServer } from "@/platform/agent-channel/public-tools";
import { withProtectedTools } from "@/platform/agent-channel/protected-tools";
import { createAgentWebsiteAdapter } from "@/products/websites/server";
import { oauthRpc, oauthOrigin } from "@/platform/agent-channel/oauth";
import { tenantDirectory } from "../_directory";

export const dynamic = "force-dynamic";
const server = platformMcpServer(tenantDirectory);

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
export async function POST(request: Request) {
  return serveMcp(request, withProtectedTools(server, tenantDirectory, createAgentWebsiteAdapter(oauthRpc, oauthOrigin())));
}
