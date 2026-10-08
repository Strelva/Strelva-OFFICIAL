import { z } from "zod";
import { readBookingContext } from "@/platform/bookings/store";
import { resourceUrl, validateAgentToken, oauthRpc, hash } from "./oauth";
import type { BusinessDirectory } from "./public-tools";
import type { McpServer, McpTool } from "./protocol";

const descriptions = {
  read_business_context: ["Business context", "Read private business facts for your authorized business.", "business:read"],
  read_customer_inquiries: ["Customer inquiries", "Read recent customer inquiries. Only the business owner may grant this scope.", "inquiries:read"],
  approve_quote: ["Approve a quote", "Record the owner price and terms as an immutable receipt. This sends no email and charges no money.", "quotes:approve"],
} as const;
const tools: McpTool[] = Object.entries(descriptions).map(([name, [title, description]]) => ({
  name, title, description,
  annotations: { readOnlyHint: name !== "approve_quote", destructiveHint: name === "approve_quote", idempotentHint: true, openWorldHint: false },
  inputSchema: {
    type: "object",
    properties: {
      business: { type: "string" },
      workspaceId: { type: "string", format: "uuid", description: "The business_workspace_id from the OAuth token response, including unpublished businesses." },
      ...(name === "approve_quote" ? {
        inquiryId: { type: "string", format: "uuid" }, requestId: { type: "string", format: "uuid" },
        amountCents: { type: "integer", minimum: 0, maximum: 999999999 },
        currency: { type: "string", pattern: "^[A-Z]{3}$" }, terms: { type: "string", minLength: 1, maxLength: 5000 },
      } : {}),
    },
    required: name === "approve_quote" ? ["inquiryId", "requestId", "amountCents", "currency", "terms"] : [],
    oneOf: [{ required: ["business"] }, { required: ["workspaceId"] }],
    additionalProperties: false,
  },
}));
const priceApproval = z.object({
  business: z.string().optional(), workspaceId: z.uuid().optional(), inquiryId: z.uuid(), requestId: z.uuid(),
  amountCents: z.number().int().min(0).max(999999999), currency: z.string().regex(/^[A-Z]{3}$/), terms: z.string().trim().min(1).max(5000),
}).strict();

/** Request-local closure; tokens or actor identity are never saved on a shared server. */
export function withProtectedTools(base: McpServer, directory: BusinessDirectory): McpServer {
  let tokenHash: string | null = null;
  let principal: Awaited<ReturnType<typeof validateAgentToken>> = null;
  const challenge = (scope: string) => new Response(null, { status: 401, headers: {
    "Cache-Control": "no-store",
    "WWW-Authenticate": `Bearer resource_metadata="${new URL(resourceUrl()).origin}/.well-known/oauth-protected-resource/api/mcp/public", scope="${scope}"`,
  } });
  return {
    ...base, tools: [...base.tools, ...tools],
    async authorize(request, call) {
      if (!call.tool || !Object.hasOwn(descriptions, call.tool)) return null;
      const scope = descriptions[call.tool as keyof typeof descriptions][2];
      if ((call.args.workspaceId !== undefined) === (call.args.business !== undefined)) return challenge(scope);
      const direct = z.uuid().safeParse(call.args.workspaceId);
      const business = typeof call.args.business === "string" ? call.args.business : "";
      const native = direct.success ? null : await directory.scope(business);
      const ctx = native ? await readBookingContext(native) : null;
      const workspaceId = direct.success ? direct.data : ctx?.workspaceId;
      if (!workspaceId) return challenge(scope);
      principal = await validateAgentToken(request, scope, workspaceId);
      const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "")?.[1];
      tokenHash = bearer ? hash(bearer) : null;
      return principal ? null : challenge(scope);
    },
    async call(name, args) {
      if (!Object.hasOwn(descriptions, name)) return base.call(name, args);
      if (!principal) return { ok: false, message: "Authorization is required." };
      const allowed = new Set(Object.keys(tools.find(t => t.name === name)!.inputSchema.properties as object));
      if (Object.keys(args).some(k => !allowed.has(k))) return { ok: false, message: "Check the tool arguments." };
      try {
        if (name === "approve_quote") priceApproval.parse(args);
        return { ok: true, value: await oauthRpc("call_agent_protected_tool", {
          p_token_hash: tokenHash, p_resource: resourceUrl(), p_tool: name, p_workspace_id: principal.workspaceId, p_args: args,
        }) };
      } catch {
        return { ok: false, message: "This operation could not be authorized or confirmed." };
      }
    },
  };
}
