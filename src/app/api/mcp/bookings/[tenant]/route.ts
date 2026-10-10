/** Alias of /api/mcp/public with the business fixed by the URL, for clients
 * already configured per business. Same protocol, tools and limits. */
import { isTenantId } from "@/lib/scaffold-contracts";
import { MCP_ERRORS, methodNotAllowed, serveMcp } from "@/platform/agent-channel/protocol";
import { businessMcpServer } from "@/platform/agent-channel/public-tools";

export const dynamic = "force-dynamic";
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenantId(tenant)) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: MCP_ERRORS.invalidRequest, message: "Invalid tenant." } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return serveMcp(request, businessMcpServer(tenant));
}
