/** The public agent channel: one platform MCP for every business, and the
 * per-business alias that keeps already-configured URLs working.
 *
 * Reads and request_booking are unauthenticated. A request is only a 15-minute
 * hold; the customer's email confirmation is what books it, and the assistant
 * only ever receives a status token. Owner and agency tools are not here (#302).
 */
import { oauthEnabled } from "./oauth";
import { z } from "zod";
import { receiveAgentInquiry, agentInquiryStatus } from "./inquiries";
import { publicBusinessProfile, unknownVerification } from "./profile";
import { PublicBookingError } from "@/platform/bookings/errors";
import { bookingScopeFor } from "@/platform/bookings/booking-scope";
import { agentConfirmationAvailable, agentReceipt, nativeBookingByToken, nativeServices, nativeSlots, requestAgentBooking, requireAgentBookings, statusAccessLive, tokenHash } from "@/platform/bookings/native";
import { servicePolicy } from "@/platform/bookings/service-policy";
import { bookingStoreDb, readBookingContext } from "@/platform/bookings/store";
import { bookingAgentsEnabled, bookingReadSource } from "@/platform/bookings/flags";
import { recordAgentBusinessDiscoveries } from "@/platform/bookings/agent-proof";
import { deliverBookingUpdates } from "@/platform/bookings/updates";
import { agentCallLimited, agentHoldCall, agentIdentityLimitsEnabled, isDisposableEmail, type AgentCall } from "./limits";
import type { McpServer, McpTool, ToolOutcome } from "./protocol";

/** A business as the directory lists it (the app edge supplies these): a
 * website tenant id, or `biz:<handle>` for a business without a website. */
export interface DirectoryEntry { business: string; name: string; industry: string | null; website: string | null }
export interface BusinessDirectory {
  list(): Promise<DirectoryEntry[]>;
  /** The booking scope a handle names, or null when it is not publicly bookable. */
  scope(business: string): Promise<string | null>;
}

const HANDLE = /^(?:biz:)?[a-z0-9-]{1,100}$/;
const string = { type: "string" };
const businessProperty = { type: "string", pattern: HANDLE.source, description: "The business handle from search_business." };
const schema = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// A hold occupies inventory and emails a person, so hosts should confirm it.
const hold = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

const directoryTools: McpTool[] = [
  { name: "search_business", title: "Find a business", annotations: read,
    description: "Find businesses that take booking requests through Strelva, by name, handle or kind of business. Returns handles for the other tools.",
    inputSchema: schema({ query: { type: "string", minLength: 2, maxLength: 80 }, limit: { type: "integer", minimum: 1, maximum: 10 } }, ["query"]) },
  { name: "get_business", title: "Business details", annotations: read,
    description: "Public facts for one business: name, website, address, phone, time zone, whether it is paused and whether it accepts booking requests.",
    inputSchema: schema({ business: businessProperty }, ["business"]) },
];

const bookingTools: McpTool[] = [
  { name: "get_policies", title: "Business policies", annotations: read, description: "Only owner-confirmed published policy facts. Missing policies are unknown.", inputSchema: schema({}, []) },
  { name: "send_inquiry", title: "Send an inquiry", annotations: hold, description: "Record the customer inquiry. No job, price or delivery commitment is accepted.", inputSchema: schema({ requestId: string, agent: schema({ name: string }, ["name"]), customer: schema({ name: string, email: string }, ["name", "email"]), message: string }, ["requestId", "agent", "customer", "message"]) },
  { name: "request_quote", title: "Request an owner quote", annotations: hold, description: "Record scope and service area for an owner-priced quote. The reply-by clock exists only when the owner confirmed a response policy.", inputSchema: schema({ requestId: string, agent: schema({ name: string }, ["name"]), customer: schema({ name: string, email: string }, ["name", "email"]), message: string, serviceId: string, fields: schema({ scope: string, area: string }, ["scope", "area"]) }, ["requestId", "agent", "customer", "message", "serviceId", "fields"]) },
  { name: "get_status", title: "Inquiry or quote status", annotations: read, description: "Read status or the owner-approved quote using the opaque status token. Never returns contact details.", inputSchema: schema({ statusToken: string }, ["statusToken"]) },
  { name: "list_services", title: "List services", annotations: read,
    description: "Services, lengths, modes and time zone. No customer data.", inputSchema: schema({}, []) },
  { name: "find_slots", title: "Find open times", annotations: read,
    description: "Find open slots in a range of at most 60 days.", inputSchema: schema({ serviceId: string, from: string, to: string }, ["serviceId", "from", "to"]) },
  { name: "request_booking", title: "Request a booking", annotations: hold,
    description: "Hold a time for 15 minutes. Only the customer email can confirm it; never report it as booked before confirmation.",
    inputSchema: schema({
      serviceId: string, start: string, requestId: string, agent: schema({ name: string }, ["name"]),
      customer: schema({ name: string, email: string, phone: string }, ["name", "email"]),
      intakeAnswers: { type: "object", maxProperties: 8, additionalProperties: { type: "string", maxLength: 2000 } },
    }, ["serviceId", "start", "requestId", "agent", "customer"]) },
  { name: "get_booking_status", title: "Booking status", annotations: read,
    description: "Status only, authorized by the opaque status token from request_booking.", inputSchema: schema({ statusToken: string }, ["statusToken"]) },
];

function withBusiness(tool: McpTool): McpTool {
  const input = tool.inputSchema as { properties: Record<string, unknown>; required: string[] };
  return { ...tool, inputSchema: { ...input, properties: { business: businessProperty, ...input.properties }, required: ["business", ...input.required] } };
}

/** Constant lists: the same order and content on every request and era. */
export const PLATFORM_TOOLS: readonly McpTool[] = Object.freeze([...directoryTools, ...bookingTools.map(withBusiness)]);
export const BUSINESS_TOOLS: readonly McpTool[] = Object.freeze(bookingTools);

const text = (value: unknown) => typeof value === "string" ? value : undefined;
const sub = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function agentCall(tool: string | undefined, args: Record<string, unknown>, business: string | undefined): AgentCall {
  if (["request_booking", "send_inquiry", "request_quote"].includes(tool ?? "") && business) return agentHoldCall(business, args);
  if (tool === "get_booking_status" || tool === "get_status") return { kind: "status", business, statusToken: text(args.statusToken) };
  return { kind: "read", business };
}

/** Listed only when an assistant's request could actually be confirmed. */
async function acceptsRequests(directory: BusinessDirectory, business: string): Promise<boolean> {
  try {
    const scope = await directory.scope(business);
    if (!scope) return false;
    const ctx = await readBookingContext(scope);
    if (!ctx?.workspaceId) return false;
    if (process.env.STRELVA_AGENT_INQUIRIES === "1") return true;
    if (ctx.paused) return false;
    if (!ctx.services.some(s => s.active && servicePolicy(ctx, s.id).bookable)) return false;
    return await agentConfirmationAvailable(scope);
  } catch {
    return false;
  }
}

export type AgentBookingAvailability = { status: "yes" | "no" | "unknown"; detail: string };

const hostOf = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${host}${path}`;
  }
  catch { return null; }
};

/** Exact name or site match only; discovery order and loose search are not identity proof. */
export async function readAgentBookingAvailability(directory: BusinessDirectory, business: string, website?: string): Promise<AgentBookingAvailability> {
  let entries: DirectoryEntry[];
  try { entries = await directory.list(); }
  catch { return { status: "unknown", detail: "We couldn't check the Strelva business directory." }; }
  const expectedHost = hostOf(website);
  const exactName = normal(business);
  if (website && !expectedHost) return { status: "unknown", detail: "The website could not be matched to a Strelva business profile." };
  const matches = entries.filter(entry => website ? hostOf(entry.website) === expectedHost : normal(entry.name) === exactName);
  if (matches.length === 0) return { status: "unknown", detail: "No matching Strelva business profile was found; booking through another provider was not checked." };
  if (matches.length > 1) return { status: "unknown", detail: "More than one Strelva business matched this name or website." };
  const entry = matches[0]!;
  try {
    if (!bookingAgentsEnabled() || await bookingReadSource() !== "postgres") {
      return { status: "no", detail: "Strelva agent booking is not enabled for this business." };
    }
    const scope = await directory.scope(entry.business);
    if (!scope) return { status: "no", detail: "This business has no active booking connection in Strelva." };
    const ctx = await readBookingContext(scope);
    if (!ctx?.workspaceId || ctx.paused || !ctx.services.some(s => s.active && servicePolicy(ctx, s.id).bookable)) {
      return { status: "no", detail: "This business has no active bookable service in Strelva." };
    }
    if (!await agentConfirmationAvailable(scope)) {
      return { status: "no", detail: "Customer confirmation is not available for this business." };
    }
    return { status: "yes", detail: "A customer can confirm an agent-requested booking through Strelva." };
  } catch {
    return { status: "unknown", detail: "We couldn't confirm the live agent-booking path." };
  }
}

const normal = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

async function searchBusinesses(directory: BusinessDirectory, args: Record<string, unknown>) {
  const query = z.string().trim().min(2).max(80).parse(args.query);
  const limit = z.number().int().min(1).max(10).optional().parse(args.limit) ?? 5;
  const tokens = normal(query).split(" ").filter(Boolean);
  const exact = normal(query);
  const matches = (await directory.list())
    .filter(e => HANDLE.test(e.business))
    .filter(e => { const hay = normal(`${e.business} ${e.name} ${e.industry ?? ""}`); return tokens.every(t => hay.includes(t)); })
    .sort((a, b) => Number(normal(b.name) === exact || b.business === exact) - Number(normal(a.name) === exact || a.business === exact)
      || a.name.localeCompare(b.name) || a.business.localeCompare(b.business))
    .slice(0, 25);
  const open = await Promise.all(matches.map(e => acceptsRequests(directory, e.business)));
  const businesses = matches.filter((_, i) => open[i]).slice(0, limit).map(({ business, name, industry, website }) => ({ business, name, industry, website }));
  if (process.env.STRELVA_BOOKING_AGENT_VISIBILITY?.trim() === "1") {
    const scopes = await Promise.all(businesses.map(entry => Promise.resolve(directory.scope(entry.business)).catch(() => null)));
    const resolved = scopes.filter((scope): scope is string => typeof scope === "string");
    if (resolved.length !== businesses.length || !await recordAgentBusinessDiscoveries(resolved)) {
      throw new PublicBookingError("unavailable", "Discovery results could not be recorded. Try again.");
    }
  }
  return { businesses };
}

async function getBusiness(directory: BusinessDirectory, business: string, scope: string) {
  const entry = (await directory.list()).find(e => e.business === business);
  if (!entry) throw new PublicBookingError("not_found", "This business is unavailable.");
  const services = await nativeServices(scope);
  const details = await bookingStoreDb()?.rpc("read_booking_business_details", { p_tenant_id: scope });
  const facts = (details && !details.error ? details.data : null) as { name?: unknown; address?: unknown } | null;
  const ctx = await readBookingContext(scope);
  return {
    business, name: text(facts?.name) || entry.name, industry: entry.industry, website: entry.website,
    address: text(facts?.address) || null, phone: ctx?.phone ?? null, timeZone: services.timeZone, paused: services.paused,
    acceptsBookingRequests: !services.paused && services.services.length > 0 && await agentConfirmationAvailable(scope),
    serviceCount: services.services.length,
    verification: await publicBusinessProfile(scope).then(p => p.verification).catch(() => unknownVerification),
  };
}

/** `scope` is the resolved booking scope: a tenant id or `workspace:<id>`. */
async function runBookingTool(scope: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "get_policies") return (await publicBusinessProfile(scope)).policies;
  if (name === "send_inquiry" || name === "request_quote") return receiveAgentInquiry(scope, args, name === "request_quote");
  if (name === "get_status") return agentInquiryStatus(scope, args.statusToken);
  if (name === "list_services") return await nativeServices(scope);
  if (name === "find_slots") return await nativeSlots(scope, String(args.serviceId ?? ""), String(args.from ?? ""), String(args.to ?? ""));
  if (name === "request_booking") {
    const email = text(sub(args.customer).email);
    if (agentIdentityLimitsEnabled() && email && isDisposableEmail(email)) {
      throw new PublicBookingError("invalid", "Use the customer's own email address. The confirmation is sent there.");
    }
    // Agent origin is attribution only: hold_agent_booking admits it under the
    // same business budget and one-email rule as website and inquiry requests.
    const held = await requestAgentBooking(scope, { ...args, origin: "agent" });
    await deliverBookingUpdates(held.booking.id).catch(() => undefined);
    return agentReceipt(held);
  }
  const token = args.statusToken;
  const booking = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? await nativeBookingByToken(tokenHash(token), "status") : null;
  if (!booking || bookingScopeFor(booking) !== scope || !statusAccessLive(booking)) throw new PublicBookingError("not_found", "Booking not found.");
  return { reservationId: booking.id, status: booking.status, start: booking.start, end: booking.end };
}

async function outcome(work: () => Promise<unknown>): Promise<ToolOutcome> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof PublicBookingError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, message: "Check the tool arguments: service, time, request id, agent and customer details." };
    return { ok: false, message: "The booking operation could not complete." };
  }
}

const BOOKING_NAMES = new Set(bookingTools.map(t => t.name));
const handleOf = (value: unknown) => typeof value === "string" && HANDLE.test(value) ? value : undefined;
/** Tools that name a business; only these may key a limiter on one. */
const BUSINESS_SCOPED = new Set([...BOOKING_NAMES, "get_business"]);
const ARGUMENTS = (tools: readonly McpTool[]) => new Map(tools.map(t => [t.name, new Set(Object.keys((t.inputSchema as { properties: object }).properties))]));
const PLATFORM_ARGUMENTS = ARGUMENTS(PLATFORM_TOOLS), BUSINESS_ARGUMENTS = ARGUMENTS(BUSINESS_TOOLS);
/** Every schema says additionalProperties: false; enforce it at the top level. */
const unexpected = (allowed: Map<string, Set<string>>, name: string, args: Record<string, unknown>) =>
  Object.keys(args).some(key => !allowed.get(name)?.has(key));
const UNEXPECTED: ToolOutcome = { ok: false, message: "Check the tool arguments: this tool does not take some of them." };

/** /api/mcp/public: every business, chosen by handle on each call. */
export function platformMcpServer(directory: BusinessDirectory): McpServer {
  return {
    name: "strelva", version: "1.0.0", tools: PLATFORM_TOOLS,
    instructions: "Find a business with search_business, then pass its handle to the business tools. Inquiries and quote requests are receipts for owner review. A booking request is a 15-minute hold that only the customer's email confirmation books.",
    ready: async () => {
      if (process.env.STRELVA_WORKSPACE_RELEASE === "1" && (oauthEnabled() || process.env.STRELVA_AGENT_INQUIRIES === "1")) return;
      await requireAgentBookings();
    },
    // Off: one bucket per caller address, never per caller-supplied argument.
    limited: (request, call) => {
      const business = call.tool && BUSINESS_SCOPED.has(call.tool) ? handleOf(call.args.business) : undefined;
      return agentCallLimited(request, agentCall(call.tool, call.args, business), { legacyPrefix: "mcp-public" });
    },
    async call(name, args) {
      if (name !== "search_business" && !BUSINESS_SCOPED.has(name)) return { unknownTool: true };
      if (unexpected(PLATFORM_ARGUMENTS, name, args)) return UNEXPECTED;
      if (name === "search_business") return outcome(() => searchBusinesses(directory, args));
      const business = handleOf(args.business);
      if (!business) return { ok: false, message: "Choose a business handle from search_business." };
      const { business: _business, ...rest } = args;
      return outcome(async () => {
        const scope = await directory.scope(business);
        if (!scope) throw new PublicBookingError("not_found", "This business is unavailable.");
        if (name === "get_business") {
          const details = await getBusiness(directory, business, scope);
          if (process.env.STRELVA_BOOKING_AGENT_VISIBILITY?.trim() === "1" && !await recordAgentBusinessDiscoveries([scope])) {
            throw new PublicBookingError("unavailable", "Discovery results could not be recorded. Try again.");
          }
          return details;
        }
        return await runBookingTool(scope, name, rest);
      });
    },
  };
}

/** /api/mcp/bookings/[business]: the same tools with the business fixed. */
export function businessMcpServer(business: string): McpServer {
  return {
    name: "strelva-bookings", version: "1.0.0", tools: BUSINESS_TOOLS,
    instructions: "Bookings require customer confirmation. Holds expire in 15 minutes.",
    ready: async () => {
      if (process.env.STRELVA_WORKSPACE_RELEASE === "1" && (oauthEnabled() || process.env.STRELVA_AGENT_INQUIRIES === "1")) return;
      await requireAgentBookings();
    },
    limited: (request, call) => agentCallLimited(request, agentCall(call.tool, call.args, business), { legacyPrefix: `mcp-bookings:${business}` }),
    async call(name, args) {
      if (!BOOKING_NAMES.has(name)) return { unknownTool: true };
      if (unexpected(BUSINESS_ARGUMENTS, name, args)) return UNEXPECTED;
      return outcome(() => runBookingTool(business, name, args));
    },
  };
}
