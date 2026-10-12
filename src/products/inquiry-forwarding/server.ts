/**
 * Forward your inquiries, server side. Server only.
 *
 * The owner (or an agency holding the inquiries area) gets one unguessable
 * address. Email that reaches it through Resend's signed `email.received`
 * webhook is read once, parsed for the end customer, scored, and recorded as
 * an Inquiry in tenant_leads (source `forwarded_email`). Strelva never replies
 * and sends no notice from here: the owner already has the message in their
 * own inbox. Off unless inquiryForwardingReleaseEnabled().
 */
import { randomBytes } from "node:crypto";
import { scoreLeadSpam } from "@/platform/infra/lead-spam";
import { getReceivedEmailMessage, type ReceivedEmailMessageResult } from "@/platform/infra/email/send";
import type { ReleaseEnvironment } from "@/platform/release-flags/resolve";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { forwardingDomain, forwardingEmail, forwardingLocalPart, type ForwardingView } from "./contracts";
import { forwardedLeadId, forwardedSubmissionHash, parseForwardedMessage, type ReceivedMessage } from "./parse";
import { inquiryForwardingReleaseEnabled, inquiryForwardingReleasedFor } from "./release";
import { ForwardedMessageInvalidError, forwardingStore, type ForwardingStore } from "./store";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `fwd-` plus 24 uniformly random letters and digits (rejection sampled). */
export function generateForwardingLocalPart(random: (size: number) => Uint8Array = randomBytes): string {
  let out = "";
  while (out.length < 24) {
    for (const byte of random(32)) {
      if (byte < 252 && out.length < 24) out += ALPHABET[byte % 36];
    }
  }
  return `fwd-${out}`;
}

function present(state: Awaited<ReturnType<ForwardingStore["read"]>>, environment: ReleaseEnvironment): ForwardingView {
  const domain = forwardingDomain(environment);
  return {
    canManage: state.canManage,
    address: state.address ? { ...state.address, email: forwardingEmail(state.address.localPart, domain) } : null,
    latest: state.latest,
    revoked: state.revoked,
  };
}

export async function readForwarding(actor: WorkspaceActor, workspaceId: string, store: ForwardingStore = forwardingStore(), environment: ReleaseEnvironment = process.env): Promise<ForwardingView> {
  return present(await store.read(actor, workspaceId), environment);
}

/** Issue the business's address (or return the active one); `rotate` replaces it. */
export async function issueForwarding(actor: WorkspaceActor, workspaceId: string, options: { rotate: boolean }, store: ForwardingStore = forwardingStore(), environment: ReleaseEnvironment = process.env): Promise<ForwardingView> {
  await store.issue(actor, workspaceId, generateForwardingLocalPart(), options.rotate);
  return readForwarding(actor, workspaceId, store, environment);
}

export async function revokeForwarding(actor: WorkspaceActor, workspaceId: string, addressId: string, store: ForwardingStore = forwardingStore(), environment: ReleaseEnvironment = process.env): Promise<ForwardingView> {
  await store.revoke(actor, workspaceId, addressId);
  return readForwarding(actor, workspaceId, store, environment);
}

export type ForwardedEventResult =
  | { status: "recorded" | "held" | "duplicate"; workspaceId: string; inquiryId: string }
  | { status: "confirmation"; workspaceId: string }
  | { status: "refused"; reason: "unknown" | "revoked" | "closed" | "released_off" }
  | { status: "ignored"; reason: string }
  | { status: "unavailable"; reason: string };

export interface ForwardedEventDependencies {
  store?: ForwardingStore;
  fetchMessage?: (emailId: string) => Promise<ReceivedEmailMessageResult>;
  released?: (workspaceId: string) => Promise<boolean>;
  environment?: ReleaseEnvironment;
  /**
   * Also look for the address in the message's delivery headers. Used only
   * after every other receiver ignored the event: a BCC or an auto-forward may
   * not list the forwarding address in To or Cc.
   */
  inspectHeaders?: boolean;
}

const DELIVERY_HEADERS = ["delivered-to", "x-original-to", "x-forwarded-to", "envelope-to", "x-envelope-to", "x-rcpt-to"];

function addressList(value: unknown): string[] {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).filter((item): item is string => typeof item === "string").slice(0, 50);
}

function findLocalPart(addresses: string[], domain: string): string | null {
  for (const address of addresses) {
    for (const part of address.split(",")) {
      const local = forwardingLocalPart(part, domain);
      if (local) return local;
    }
  }
  return null;
}

/**
 * One authenticated Resend event. Returns `ignored` for anything that is not
 * mail to a forwarding address, so the webhook's other receivers run as
 * before. A refused address (unknown, revoked, business closed or release
 * off) is final: nothing is stored and the provider is not asked to retry.
 */
export async function receiveForwardedInquiryEvent(input: { event: unknown; eventId: string }, deps: ForwardedEventDependencies = {}): Promise<ForwardedEventResult> {
  const environment = deps.environment ?? process.env;
  if (!inquiryForwardingReleaseEnabled(environment)) return { status: "ignored", reason: "forwarding_off" };
  const domain = forwardingDomain(environment)!;
  const payload = input.event && typeof input.event === "object" ? input.event as { type?: unknown; data?: Record<string, unknown> } : null;
  if (payload?.type !== "email.received" || !payload.data || typeof payload.data !== "object") return { status: "ignored", reason: "not_received_mail" };
  const emailId = typeof payload.data.email_id === "string" ? payload.data.email_id : "";
  if (!emailId) return { status: "ignored", reason: "provider_event_invalid" };
  const fetchMessage = deps.fetchMessage ?? getReceivedEmailMessage;
  let localPart = findLocalPart([...addressList(payload.data.to), ...addressList(payload.data.cc), ...addressList(payload.data.bcc)], domain);
  let message: ReceivedMessage | null = null;
  if (!localPart) {
    if (!deps.inspectHeaders) return { status: "ignored", reason: "not_forwarding_address" };
    const fetched = await fetchMessage(emailId);
    if (fetched.status !== "available") return { status: "ignored", reason: "not_forwarding_address" };
    message = fetched.message;
    const headers = Object.fromEntries(Object.entries(message.headers).map(([key, value]) => [key.toLowerCase(), value]));
    localPart = findLocalPart([...message.to, ...message.cc, ...message.bcc, ...DELIVERY_HEADERS.map((name) => headers[name]).filter((value): value is string => typeof value === "string")], domain);
    if (!localPart) return { status: "ignored", reason: "not_forwarding_address" };
  }
  const store = deps.store ?? forwardingStore();
  let resolved;
  try {
    resolved = await store.resolve(localPart);
  } catch {
    return { status: "unavailable", reason: "forwarding_store_unavailable" };
  }
  if (resolved.status !== "active") return { status: "refused", reason: resolved.status };
  const released = deps.released ?? ((workspaceId: string) => inquiryForwardingReleasedFor(workspaceId, { operator: true, tester: false }, environment));
  if (!(await released(resolved.workspaceId).catch(() => false))) return { status: "refused", reason: "released_off" };
  if (!message) {
    const fetched = await fetchMessage(emailId);
    if (fetched.status !== "available") return { status: "unavailable", reason: fetched.reason };
    message = fetched.message;
  }
  const parsed = parseForwardedMessage(message, { inboundDomain: domain });
  if (parsed.kind === "ignored") return { status: "ignored", reason: `forwarded_${parsed.reason}` };
  try {
    if (parsed.kind === "provider_confirmation") {
      const result = await store.receive(localPart, parsed);
      if (result.status === "refused") return { status: "refused", reason: result.reason };
      return { status: "confirmation", workspaceId: result.workspaceId };
    }
    const verdict = scoreLeadSpam({ businessName: parsed.name, description: parsed.message, email: parsed.email });
    const fields: Record<string, string> = { format: parsed.format };
    if (parsed.subject) fields.subject = parsed.subject;
    if (parsed.phone) fields.phone = parsed.phone;
    if (parsed.forwardedBy) fields.forwardedBy = parsed.forwardedBy;
    if (parsed.originalDate) fields.originalDate = parsed.originalDate;
    const result = await store.receive(localPart, {
      kind: "inquiry",
      leadId: forwardedLeadId(parsed.messageKey),
      submissionHash: forwardedSubmissionHash(parsed.email, parsed.message),
      name: parsed.name,
      email: parsed.email,
      message: parsed.message,
      fields,
      spamReason: parsed.holdReason ?? (verdict.isSpam ? "spam_score" : null),
    });
    if (result.status === "refused") return { status: "refused", reason: result.reason };
    if (result.status === "confirmation") return { status: "confirmation", workspaceId: result.workspaceId };
    return { status: result.status, workspaceId: result.workspaceId, inquiryId: result.id };
  } catch (error) {
    if (error instanceof ForwardedMessageInvalidError) return { status: "ignored", reason: "forwarded_invalid" };
    return { status: "unavailable", reason: "forwarding_store_unavailable" };
  }
}

export { inquiryForwardingReleaseEnabled, inquiryForwardingReleasedFor } from "./release";
