/** Dependency-free stateless Streamable HTTP, MCP 2025-11-25.
 * Same native API, confirmation gate, durable tenant cap and IP limits.
 * https://modelcontextprotocol.io/specification/2025-11-25/basic/transports */
import { isTenantId } from "@/lib/scaffold-contracts";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { PublicBookingError } from "@/products/scheduling/public-booking";
import { agentReceipt, nativeServices, nativeSlots, requestAgentBooking, requireAgentBookings, nativeBookingByToken, tokenHash } from "@/platform/bookings/native";
import { deliverBookingUpdates } from "@/platform/bookings/updates";
import { bodyObject } from "@/app/api/v1/bookings/_shared";

const PROTOCOL = "2025-11-25";
const SUPPORTED = ["2025-03-26", "2025-06-18", PROTOCOL];
const string = { type: "string" };
const schema = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });
const tools = [
  { name: "list_services", description: "Services, lengths, modes and time zone. No customer data.", inputSchema: schema({}, []) },
  { name: "find_slots", description: "Find open slots in a range of at most 60 days.", inputSchema: schema({ serviceId: string, from: string, to: string }, ["serviceId", "from", "to"]) },
  { name: "request_booking", description: "Hold a time for 15 minutes. Only the customer email can confirm it; never report it as booked before confirmation.", inputSchema: schema({
    serviceId: string, start: string, requestId: string, agent: schema({ name: string }, ["name"]),
    customer: schema({ name: string, email: string, phone: string }, ["name", "email"]),
  }, ["serviceId", "start", "requestId", "agent", "customer"]) },
  { name: "get_booking_status", description: "Status only, authorized by the opaque status token from request_booking.", inputSchema: schema({ statusToken: string }, ["statusToken"]) },
].map(t => ({ ...t, annotations: { readOnlyHint: t.name !== "request_booking", destructiveHint: false, idempotentHint: true, openWorldHint: true } }));
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const rpcError = (id: unknown, code: number, message: string, status = 200) => json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);
export async function GET() { return new Response(null, { status: 405, headers: { Allow: "POST" } }); }
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenantId(tenant)) return rpcError(null, -32600, "Invalid tenant.", 400);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return rpcError(null, -32600, "Origin is not allowed.", 403);
  const protocol = request.headers.get("mcp-protocol-version");
  if (protocol && !SUPPORTED.includes(protocol)) return rpcError(null, -32600, "Unsupported protocol version.", 400);
  if (!request.headers.get("content-type")?.includes("application/json")) return rpcError(null, -32600, "Use application/json.", 415);
  try {
    await requireAgentBookings();
    if (await isRateLimitedAsync(rateLimitKey(request, `mcp-bookings:${tenant}`), 20)) return rpcError(null, -32000, "Too many requests.", 429);
  } catch { return rpcError(null, -32000, "Bookings are unavailable.", 503); }
  const body = await bodyObject(request);
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string"
    || (body.id !== undefined && typeof body.id !== "string" && typeof body.id !== "number")) return rpcError(null, -32600, "Invalid JSON-RPC request.", 400);
  const id = body.id;
  if (id === undefined) {
    if (body.method === "notifications/initialized" || body.method === "notifications/cancelled") return new Response(null, { status: 202 });
    return rpcError(null, -32600, "Requests require an id.", 400);
  }
  const respond = (result: unknown) => json({ jsonrpc: "2.0", id, result });
  const paramsBody = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params as Record<string, unknown> : {};
  if (body.method === "initialize") return respond({ protocolVersion: typeof paramsBody.protocolVersion === "string" && SUPPORTED.includes(paramsBody.protocolVersion) ? paramsBody.protocolVersion : PROTOCOL,
    capabilities: { tools: { listChanged: false } }, serverInfo: { name: "strelva-bookings", version: "1.0.0" }, instructions: "Bookings require customer confirmation. Holds expire in 15 minutes." });
  if (body.method === "ping") return respond({});
  if (body.method === "tools/list") return respond({ tools });
  if (body.method !== "tools/call") return rpcError(id, -32601, "Method not found.");
  const args = paramsBody.arguments && typeof paramsBody.arguments === "object" && !Array.isArray(paramsBody.arguments) ? paramsBody.arguments as Record<string, unknown> : {};
  try {
    let result: unknown;
    if (paramsBody.name === "list_services") result = await nativeServices(tenant);
    else if (paramsBody.name === "find_slots") result = await nativeSlots(tenant, String(args.serviceId ?? ""), String(args.from ?? ""), String(args.to ?? ""));
    else if (paramsBody.name === "request_booking") {
      const held = await requestAgentBooking(tenant, { ...args, origin: "agent" });
      await deliverBookingUpdates(held.booking.id).catch(() => undefined);
      result = agentReceipt(held);
    } else if (paramsBody.name === "get_booking_status") {
      const token = args.statusToken;
      const booking = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? await nativeBookingByToken(tokenHash(token), "status") : null;
      if (!booking || booking.tenantId !== tenant) throw new PublicBookingError("not_found", "Booking not found.");
      result = { reservationId: booking.id, status: booking.status, start: booking.start, end: booking.end };
    } else return rpcError(id, -32602, "Unknown tool.");
    return respond({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
  } catch (error) {
    return respond({ content: [{ type: "text", text: error instanceof PublicBookingError ? error.message : "The booking operation could not complete." }], isError: true });
  }
}
