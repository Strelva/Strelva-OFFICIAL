/** Dependency-free, stateless, dual-era MCP over Streamable HTTP.
 *
 * Modern (2026-07-28): no initialize, ping or sessions. Every request carries
 * `_meta` protocolVersion + clientCapabilities and mirrors them in the
 * MCP-Protocol-Version, Mcp-Method and (tools/call) Mcp-Name headers.
 * https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
 * Legacy (2025-03-26, 2025-06-18, 2025-11-25): the initialize handshake,
 * selected by a legacy MCP-Protocol-Version header or none at all.
 * https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
 *
 * The tool list is a constant per server: it never depends on earlier calls,
 * era or client identity (and there is no per-request authorization yet).
 */
export const MODERN_VERSION = "2026-07-28";
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export const SUPPORTED_VERSIONS = [MODERN_VERSION, ...LEGACY_VERSIONS];
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const META_SERVER = "io.modelcontextprotocol/serverInfo";

// Spec-defined codes; app codes sit outside the reserved JSON-RPC range.
export const MCP_ERRORS = {
  invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602,
  headerMismatch: -32020, unsupportedVersion: -32022,
  rateLimited: -31029, unavailable: -31003, legacyServer: -32000,
} as const;

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
}

export type ToolOutcome = { ok: true; value: unknown } | { ok: false; message: string } | { unknownTool: true };

export interface McpServer {
  name: string;
  version: string;
  instructions: string;
  tools: readonly McpTool[];
  /** Feature gates; a throw answers 503 before any limit or operation. */
  ready(): Promise<void>;
  /** True refuses the call with 429. Runs after validation, before work. */
  limited(request: Request, call: { method: string; tool?: string; args: Record<string, unknown> }): Promise<boolean>;
  /** Mixed authorization is evaluated per call; public discovery never requires a token. */
  authorize?(request: Request, call: { method: string; tool?: string; args: Record<string, unknown> }): Promise<Response | null>;
  call(name: string, args: Record<string, unknown>): Promise<ToolOutcome>;
}

type Era = "modern" | "legacy";
type Id = string | number | null;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: HEADERS });
const failure = (id: Id, code: number, message: string, status = 200, data?: unknown) =>
  json({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }, status);
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

async function boundedBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await request.text();
    if (!raw.trim() || raw.length > 30_000) return null;
    return record(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Mcp-Name may carry `=?base64?…?=` for values that are not header-safe.
 * Malformed padding, stray characters or invalid UTF-8 decode to null, so the
 * caller answers with a header mismatch instead of a lenient guess. */
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export function decodeHeaderValue(value: string | null): string | null {
  if (value === null) return null;
  if (!value.startsWith("=?base64?")) return /^[\x20-\x7e\t]*$/.test(value) ? value : null;
  const encoded = /^=\?base64\?([^?]*)\?=$/.exec(value)?.[1];
  if (encoded === undefined || !BASE64.test(encoded)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(encoded, "base64"));
  } catch {
    return null;
  }
}

export function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function serveMcp(request: Request, server: McpServer): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return failure(null, MCP_ERRORS.invalidRequest, "Origin is not allowed.", 403);
  const header = request.headers.get("mcp-protocol-version");
  if (header !== null && !SUPPORTED_VERSIONS.includes(header)) {
    return failure(null, MCP_ERRORS.unsupportedVersion, "Unsupported protocol version", 400, { supported: SUPPORTED_VERSIONS, requested: header });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) return failure(null, MCP_ERRORS.invalidRequest, "Use application/json.", 415);

  const body = await boundedBody(request);
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string"
    || (body.id !== undefined && typeof body.id !== "string" && typeof body.id !== "number")) {
    return failure(null, MCP_ERRORS.invalidRequest, "Invalid JSON-RPC request.", 400);
  }
  const method = body.method;
  const id: Id = body.id === undefined ? null : body.id as string | number;
  const params = record(body.params) ?? {};
  const meta = record(params._meta);
  const declared = meta?.[META_VERSION];

  // A body version must be mirrored by the header; the header alone picks the era.
  if (declared !== undefined && declared !== header) {
    return failure(id, MCP_ERRORS.headerMismatch, "Header mismatch: MCP-Protocol-Version must match _meta protocolVersion.", 400);
  }
  const era: Era = header === MODERN_VERSION ? "modern" : "legacy";
  const app = (code: number) => era === "legacy" ? MCP_ERRORS.legacyServer : code;

  if (body.id === undefined) {
    const accepted = era === "modern" ? method.startsWith("notifications/") : method === "notifications/initialized" || method === "notifications/cancelled";
    return accepted ? new Response(null, { status: 202 }) : failure(null, MCP_ERRORS.invalidRequest, "Requests require an id.", 400);
  }

  const toolName = typeof params.name === "string" ? params.name : undefined;
  if (era === "modern") {
    if (!meta || typeof declared !== "string") return failure(id, MCP_ERRORS.invalidParams, `Missing required _meta field ${META_VERSION}.`, 400);
    if (!record(meta[META_CAPABILITIES])) return failure(id, MCP_ERRORS.invalidParams, `Missing required _meta field ${META_CAPABILITIES}.`, 400);
    if (request.headers.get("mcp-method") !== method) return failure(id, MCP_ERRORS.headerMismatch, "Header mismatch: Mcp-Method must match the request method.", 400);
    if (method === "tools/call" && (toolName === undefined || decodeHeaderValue(request.headers.get("mcp-name")) !== toolName)) {
      return failure(id, MCP_ERRORS.headerMismatch, "Header mismatch: Mcp-Name must match params.name.", 400);
    }
  }

  const known = era === "modern" ? ["server/discover", "tools/list", "tools/call"] : ["initialize", "ping", "tools/list", "tools/call"];
  if (!known.includes(method)) return failure(id, MCP_ERRORS.methodNotFound, "Method not found.", era === "modern" ? 404 : 200);

  try {
    await server.ready();
  } catch {
    return failure(id, app(MCP_ERRORS.unavailable), "Bookings are unavailable.", 503);
  }
  const args = record(params.arguments) ?? {};
  try {
    if (server.authorize) {
      const refusal = await server.authorize(request, { method, ...(toolName ? { tool: toolName } : {}), args });
      if (refusal) return refusal;
    }
    if (await server.limited(request, { method, ...(toolName ? { tool: toolName } : {}), args })) {
      return failure(id, app(MCP_ERRORS.rateLimited), "Too many requests.", 429);
    }
  } catch {
    return failure(id, app(MCP_ERRORS.unavailable), "Bookings are unavailable.", 503);
  }

  const serverInfo = { name: server.name, version: server.version };
  const respond = (result: Record<string, unknown>) => json({ jsonrpc: "2.0", id,
    result: era === "modern" ? { resultType: "complete", ...result, _meta: { [META_SERVER]: serverInfo } } : result });
  const cacheable = { ttlMs: 3_600_000, cacheScope: "public" };

  if (method === "server/discover") {
    return respond({ supportedVersions: SUPPORTED_VERSIONS, capabilities: { tools: { listChanged: false } }, instructions: server.instructions, ...cacheable });
  }
  if (method === "initialize") {
    const asked = params.protocolVersion;
    const version = typeof asked === "string" && (LEGACY_VERSIONS as readonly string[]).includes(asked) ? asked : LEGACY_VERSIONS[0];
    return respond({ protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo, instructions: server.instructions });
  }
  if (method === "ping") return respond({});
  if (method === "tools/list") return respond({ tools: server.tools, ...(era === "modern" ? cacheable : {}) });

  const outcome = toolName ? await server.call(toolName, args) : { unknownTool: true as const };
  if ("unknownTool" in outcome) return failure(id, MCP_ERRORS.invalidParams, "Unknown tool.");
  if (!outcome.ok) return respond({ content: [{ type: "text", text: outcome.message }], isError: true });
  return respond({ content: [{ type: "text", text: JSON.stringify(outcome.value) }], structuredContent: outcome.value, isError: false });
}
