/** Identity-aware limits for agent calls (#310).
 *
 * Hosted assistants call from shared provider egress, so a source IP is not a
 * customer. With STRELVA_AGENT_IDENTITY_LIMITS=1 a call is counted against
 * every bucket that names it: the business, the customer email, the hold's
 * request id or status token, the declared agent name, the address or the
 * provider's published egress, and one platform-wide safety cap. Any full
 * bucket refuses the call. A missing address adds no IP bucket at all, so
 * unattributed calls never share one "unknown" quota.
 *
 * Declared agent names and provider addresses are forgeable or shared: they
 * only ever add a cap, never lift one. Underneath, hold_agent_booking admits
 * at most 10 live agent holds per business, inside the business budget and
 * one-mailbox rule every anonymous booking request shares.
 *
 * Off (default): 20 a minute per caller address, under `legacyPrefix`
 * (`mcp-public` for the platform MCP, `mcp-bookings:<business>` for the
 * per-business alias, whose business comes from its URL).
 * Limits are starting values, not validated against real demand.
 */
import { createHash } from "node:crypto";
import { isRateLimitedAsync, isRateLimitedWindowedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { clientIp, egressProvider } from "./provider-egress";

type Env = Partial<Record<string, string | undefined>>;
export function agentIdentityLimitsEnabled(env: Env = process.env): boolean {
  return env.STRELVA_AGENT_IDENTITY_LIMITS?.trim() === "1";
}

export type AgentCall =
  | { kind: "read"; business?: string }
  | { kind: "status"; business?: string; statusToken?: string }
  | { kind: "hold"; business: string; email?: string; agentName?: string; requestId?: string };

const field = (value: unknown, key: string): string | undefined => {
  const inner = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  return typeof inner === "string" ? inner : undefined;
};
/** The hold identity of an agent booking body, before it is validated. */
export function agentHoldCall(business: string, body: Record<string, unknown> | null): AgentCall {
  return { kind: "hold", business, email: field(body?.customer, "email"), agentName: field(body?.agent, "name"), requestId: field(body, "requestId") };
}

export interface LimitBucket { key: string; max: number; windowMs: number }

const MINUTE = 60_000, HOUR = 3_600_000;
export const AGENT_LIMITS = {
  global: { max: 6000, windowMs: MINUTE },
  globalHolds: { max: 300, windowMs: MINUTE },
  businessReads: { max: 600, windowMs: MINUTE },
  businessStatus: { max: 300, windowMs: MINUTE },
  businessHolds: { max: 30, windowMs: 10 * MINUTE },
  emailHolds: { max: 5, windowMs: HOUR },
  emailBusinessHolds: { max: 3, windowMs: HOUR },
  requestRetries: { max: 10, windowMs: 10 * MINUTE },
  statusToken: { max: 30, windowMs: MINUTE },
  agentHolds: { max: 120, windowMs: MINUTE },
  egress: { max: 3000, windowMs: MINUTE },
  egressHolds: { max: 200, windowMs: MINUTE },
  ip: { max: 120, windowMs: MINUTE },
  ipHolds: { max: 10, windowMs: 10 * MINUTE },
} satisfies Record<string, Omit<LimitBucket, "key">>;

/** Keys never carry an email, token or free-text name, only a digest. */
const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);
const normalEmail = (email: string) => email.trim().toLowerCase();
const GMAIL = new Set(["gmail.com", "googlemail.com"]);
/** The mailbox an address reaches, for counting caps only: never stored or
 * sent to. Plus tags are dropped everywhere (over-merging only tightens a cap);
 * Gmail also ignores dots and answers on googlemail.com. Matches SQL
 * public.booking_email_identity. */
export function emailCapIdentity(email: string): string {
  const normal = normalEmail(email);
  const at = normal.lastIndexOf("@");
  if (at <= 0) return normal;
  let local = normal.slice(0, at).replace(/\+.*$/, "");
  let domain = normal.slice(at + 1);
  if (GMAIL.has(domain)) { local = local.replaceAll(".", ""); domain = "gmail.com"; }
  return `${local}@${domain}`;
}
const normalAgent = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);

export function agentLimitBuckets(call: AgentCall, source: { ip: string | null }): LimitBucket[] {
  const b = (key: string, limit: Omit<LimitBucket, "key">): LimitBucket => ({ key: `agent:v2:${key}`, ...limit });
  const buckets = [b("all", AGENT_LIMITS.global)];
  const provider = egressProvider(source.ip);
  const hold = call.kind === "hold";
  if (provider) buckets.push(b(`egress:${provider}`, AGENT_LIMITS.egress), ...(hold ? [b(`egress:${provider}:hold`, AGENT_LIMITS.egressHolds)] : []));
  else if (source.ip) buckets.push(b(`ip:${digest(source.ip)}`, AGENT_LIMITS.ip), ...(hold ? [b(`ip:${digest(source.ip)}:hold`, AGENT_LIMITS.ipHolds)] : []));
  if (call.kind === "read" && call.business) buckets.push(b(`biz:${call.business}:read`, AGENT_LIMITS.businessReads));
  if (call.kind === "status") {
    if (call.business) buckets.push(b(`biz:${call.business}:status`, AGENT_LIMITS.businessStatus));
    if (call.statusToken) buckets.push(b(`status:${digest(call.statusToken)}`, AGENT_LIMITS.statusToken));
  }
  if (call.kind === "hold") {
    buckets.push(b("hold", AGENT_LIMITS.globalHolds), b(`biz:${call.business}:hold`, AGENT_LIMITS.businessHolds));
    if (call.email) {
      const email = digest(emailCapIdentity(call.email));
      buckets.push(b(`email:${email}`, AGENT_LIMITS.emailHolds), b(`email:${email}:biz:${call.business}`, AGENT_LIMITS.emailBusinessHolds));
    }
    if (call.requestId) buckets.push(b(`request:${call.business}:${digest(call.requestId)}`, AGENT_LIMITS.requestRetries));
    if (call.agentName?.trim()) buckets.push(b(`agent:${digest(normalAgent(call.agentName))}:hold`, AGENT_LIMITS.agentHolds));
  }
  return buckets;
}

export type LimitCheck = (key: string, max: number, windowMs: number) => Promise<boolean>;

/** Counts the call against every bucket. `legacyPrefix` keys the flag-off
 * per-address limit. */
export async function agentCallLimited(request: Request, call: AgentCall, options: { legacyPrefix: string; env?: Env; check?: LimitCheck }): Promise<boolean> {
  if (!agentIdentityLimitsEnabled(options.env)) return await isRateLimitedAsync(rateLimitKey(request, options.legacyPrefix), 20);
  const check = options.check ?? isRateLimitedWindowedAsync;
  const results = await Promise.all(agentLimitBuckets(call, { ip: clientIp(request) }).map(bucket => check(bucket.key, bucket.max, bucket.windowMs)));
  return results.some(Boolean);
}

/** Throwaway inboxes cannot be a customer's confirmation address. A short,
 * high-volume list on purpose: the email confirmation is the real gate. */
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "temp-mail.org",
  "tempmail.com", "yopmail.com", "trashmail.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com",
  "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com", "tempmailo.com", "burnermail.io", "moakt.com",
]);
export function isDisposableEmail(email: string): boolean {
  const domain = normalEmail(email).split("@").pop() ?? "";
  return DISPOSABLE.has(domain) || [...DISPOSABLE].some(d => domain.endsWith(`.${d}`));
}
