import { formatEmailFrom } from "@/platform/infra/email/from";
import { STRELVA_BRAND, type OwnerBrand } from "@/platform/infra/agency-brand";
import { resolveAgencyEmailIdentity, resolveOwnerBrand, resolveTenantBrand } from "@/platform/agency-brand/server";
import {
  customerEmailPaused,
  emailSendingPaused,
  operatorEmailsEnabled,
  prospectEmailsEnabled,
} from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { agencyEmailSendAllowed, senderDomain, type EmailAgency } from "@/platform/infra/email/provider-gate";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/platform/infra/email/layout";

/** The four people Strelva can address. These are relationship roles, not
 * interchangeable synonyms: each has an independent delivery policy. */
export type EmailAudience = "client" | "customer" | "operator" | "prospect";

type RenderedEmail =
  | { options: EmailOptions; html?: never; text?: never }
  | { options?: never; html: string; text: string };

export type SendEmailInput = RenderedEmail & {
  audience: EmailAudience;
  /** The tenant this send belongs to, when known. ONLY the "client" audience is
   * tenant-aware: a per-tenant override can ARM client email for one verified
   * client while the global switch stays paused, or force it off for one client.
   * Absent (or any other audience) ⇒ behavior is unchanged (follow the global
   * switch). */
  tenantId?: string;
  /** Set when an agency sends this for a business (an owner invitation, a
   * client's mail). The send then also needs that agency's seat, its email
   * verification and the business's mandate for the sending domain
   * (provider-gate.ts). Absent ⇒ behavior is unchanged. */
  provider?: EmailAgency;
  /** Business scope for owner presentation; never an authority grant. */
  workspaceId?: string;
  fromName?: string;
  /** Presentation already rendered into raw reports; envelope is revalidated here. */
  brand?: OwnerBrand;
  /** Full from address override, e.g. "report@updates.strelva.com". Defaults to
   * hello@{RESEND_DOMAIN}. For senders that need a distinct local-part or a
   * per-tenant sending domain (weekly/monthly reports). Must be a verified
   * Resend sender; never the root Google-Workspace domain. */
  fromAddress?: string;
  subject: string;
  to: string | string[];
  /** Where replies land. Defaults to the real hello@strelva.com inbox so a
   * client replying to a report/receipt reaches a human, not the send-only
   * updates.strelva.com domain (which has no inbox). Override per-send for
   * e.g. sales replies. */
  replyTo?: string;
  /** Provider correlation metadata. Values must be non-sensitive. */
  tags?: Record<string, string>;
  /** Provider idempotency key for sends that must be safe across retries. */
  idempotencyKey?: string;
  attachments?: Array<{ filename: string; content: string }>;
};

export type SendEmailResult =
  | { status: "accepted"; providerMessageId: string; acceptedAt: string }
  | { status: "suppressed"; reason: string };

export type EmailReadbackResult =
  | { status: "available"; providerMessageId: string; to: string[]; subject: string; lastEvent: string }
  | { status: "unavailable"; reason: string };

export type EmailReceivedReadbackResult =
  | {
      status: "available";
      received: boolean;
      checkedAt: string;
      providerMessageId?: string;
      receivedAt?: string;
    }
  | { status: "unavailable"; reason: string };

function fromAddressFor(input: Pick<SendEmailInput, "fromAddress">): string {
  return input.fromAddress || `hello@${process.env.RESEND_DOMAIN || "updates.strelva.com"}`;
}

async function audienceEnabled(input: SendEmailInput, strictClientGate = false): Promise<boolean> {
  if (!(await audiencePolicyEnabled(input, strictClientGate))) return false;
  // The audience allows it; an agency's send also needs its own effect gate.
  return !input.provider || agencyEmailSendAllowed(input.provider, senderDomain(fromAddressFor(input)));
}

async function audiencePolicyEnabled(input: SendEmailInput, strictClientGate: boolean): Promise<boolean> {
  const { audience } = input;
  if (audience === "operator") return operatorEmailsEnabled();
  if (audience === "prospect") return prospectEmailsEnabled();
  if (audience === "customer") return !customerEmailPaused();

  // client — tenant-aware. A per-tenant override lets the operator arm one
  // verified client ("on") or block one client ("off") independent of the
  // global switch. No tenantId / "inherit" ⇒ follow the global switch (unchanged).
  if (input.tenantId) {
    const override = await (strictClientGate ? getClientEmailOverride(input.tenantId, { failClosed: true }) : getClientEmailOverride(input.tenantId));
    if (override === "on") return true;
    if (override === "off") return false;
  }
  return !emailSendingPaused();
}

/**
 * Single transport boundary for Strelva mail. Audience gates live here so a
 * new sender cannot accidentally use the client pause for operator mail (or
 * bypass the customer-specific opt-in). Returns false for intentional
 * suppression/missing configuration and throws provider failures to the
 * caller's fail-soft logging boundary.
 */
/**
 * Send through the shared provider boundary while retaining the provider's
 * message id. The boolean `sendEmail` helper below remains the compatibility
 * API for existing senders.
 */
export async function sendEmailWithReceipt(input: SendEmailInput): Promise<SendEmailResult> {
  if (!(await audienceEnabled(input))) {
    console.warn(`[email] ${input.audience} email disabled — skipped send`);
    return { status: "suppressed", reason: "email_suppressed_or_unconfigured" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: "suppressed", reason: "email_suppressed_or_unconfigured" };

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
  const suppliedBrand = input.options?.brand ?? input.brand;
  const brand = input.audience === "client"
    ? input.workspaceId ? await resolveOwnerBrand(input.workspaceId) : input.tenantId ? await resolveTenantBrand(input.tenantId) : suppliedBrand
    : suppliedBrand;
  // A cached brand remains a scope signal even when the fresh lookup fails.
  const agencyId = brand?.agencyId ?? suppliedBrand?.agencyId;
  const identity = brand?.agencyId ? await resolveAgencyEmailIdentity(brand.agencyId) : null;
  const options = input.options && brand ? { ...input.options, brand, heading: brand.agencyId ? input.options.heading.replace(/Strelva/g, () => brand.name) : input.options.heading } : input.options;
  const html = options ? renderEmailHtml(options) : input.html!;
  const text = options ? renderEmailText(options) : input.text!;
  const fromName = identity ? `${identity.name} via Strelva` : agencyId ? STRELVA_BRAND.name : input.fromName || STRELVA_BRAND.name;
  const fromAddress = agencyId
    ? input.fromAddress && /@(updates|mail)\.strelva\.com$/.test(input.fromAddress) ? input.fromAddress : "hello@updates.strelva.com"
    : input.fromAddress || `hello@${fromDomain}`;
  const defaultReplyTo = process.env.REPLY_TO_EMAIL || "hello@strelva.com";
  const replyTo = agencyId ? identity?.replyTo || defaultReplyTo : input.replyTo || defaultReplyTo;

  const payload = {
    from: formatEmailFrom(fromName, fromAddress),
    replyTo,
    to: input.to,
    subject: input.subject,
    html,
    text,
    ...(input.attachments ? { attachments: input.attachments } : {}),
    ...(input.tags
      ? {
          tags: Object.entries(input.tags)
            .filter(([name, value]) => name.trim() && value.trim())
            .slice(0, 20)
            .map(([name, value]) => ({ name: name.slice(0, 256), value: value.slice(0, 256) })),
        }
      : {}),
  };
  if (input.provider && !(await agencyEmailSendAllowed(input.provider, senderDomain(fromAddress)))) {
    return { status: "suppressed", reason: "provider_not_cleared" };
  }
  const result = input.idempotencyKey
    ? await resend.emails.send(payload, { idempotencyKey: input.idempotencyKey })
    : await resend.emails.send(payload);
  if (result.error || !result.data?.id) {
    throw new Error(result.error?.message || "Resend did not return an email id.");
  }
  return { status: "accepted", providerMessageId: result.data.id, acceptedAt: new Date().toISOString() };
}

/** The one domain for client-branded mail (AGENTS.md "Email domains"). Never a
 * per-client domain, never the root domain. */
export const CLIENT_MAIL_DOMAIN = "mail.strelva.com";

export interface BatchMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface SendBatchInput {
  /** Client-branded newsletters also obey the tenant-aware client pause. */
  requireClientGate?: boolean;
  audience: EmailAudience;
  tenantId?: string;
  /** As SendEmailInput.provider; checked against fromAddress's domain. */
  provider?: EmailAgency;
  /** Business scope for owner presentation; never an authority grant. */
  workspaceId?: string;
  fromName: string;
  /** Must be on updates.strelva.com or mail.strelva.com. */
  fromAddress: string;
  replyTo?: string;
  /** At most 100 messages, the provider's batch limit. */
  messages: BatchMessage[];
  /** Provider idempotency key. A retry with the same key never re-delivers. */
  idempotencyKey?: string;
}

export type SendBatchResult =
  | { status: "accepted"; count: number; providerMessageIds: string[]; acceptedAt: string }
  | { status: "suppressed"; reason: string };

const ALLOWED_FROM_DOMAINS = ["updates.strelva.com", CLIENT_MAIL_DOMAIN];

/** Check before rendering unsubscribe links; the transport checks again at send. */
export async function batchEmailSuppression(input: Pick<SendBatchInput, "audience" | "tenantId" | "requireClientGate"> & Partial<Pick<SendBatchInput, "provider" | "fromAddress">>): Promise<string | null> {
  const rendered = { subject: "", to: [], html: "", text: "" };
  if (input.requireClientGate && !(await audienceEnabled({ ...rendered, audience: "client", tenantId: input.tenantId }, true))) return "not sent: gated";
  if (!(await audienceEnabled({ ...rendered, audience: input.audience, tenantId: input.tenantId }))) return "not sent: gated";
  if (input.provider && !(await agencyEmailSendAllowed(input.provider, senderDomain(fromAddressFor(input))))) return "not sent: provider not cleared";
  if (!process.env.RESEND_API_KEY) return "not sent: unconfigured";
  return null;
}

/**
 * A batch through the same transport boundary and audience gate as
 * sendEmailWithReceipt. Used for newsletters (audience `customer`). Throws on
 * a provider failure so the caller can record which batch failed.
 */
export async function sendBatchWithReceipt(input: SendBatchInput): Promise<SendBatchResult> {
  if (!input.messages.length) return { status: "accepted", count: 0, providerMessageIds: [], acceptedAt: new Date().toISOString() };
  if (input.messages.length > 100) throw new Error("A batch holds at most 100 messages.");
  const domain = input.fromAddress.split("@")[1]?.toLowerCase();
  if (!domain || !ALLOWED_FROM_DOMAINS.includes(domain)) throw new Error(`Refusing to send from ${domain ?? "an invalid address"}.`);
  const suppression = await batchEmailSuppression(input);
  if (suppression) return { status: "suppressed", reason: suppression };
  const apiKey = process.env.RESEND_API_KEY!;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const replyTo = input.replyTo || process.env.REPLY_TO_EMAIL || "hello@strelva.com";
  const payload = input.messages.map((message) => ({
    from: formatEmailFrom(input.fromName, input.fromAddress),
    replyTo,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.headers ? { headers: message.headers } : {}),
  }));
  if (input.provider && !(await agencyEmailSendAllowed(input.provider, domain))) {
    return { status: "suppressed", reason: "not sent: provider not cleared" };
  }
  const result = input.idempotencyKey
    ? await resend.batch.send(payload, { idempotencyKey: input.idempotencyKey })
    : await resend.batch.send(payload);
  if (result.error) throw new Error(result.error.message || "Resend rejected the batch.");
  const ids = (result.data?.data ?? []).map((item) => item.id).filter((id): id is string => typeof id === "string");
  if (ids.length !== input.messages.length) throw new Error("Batch acceptance is unconfirmed; reconcile before retrying.");
  return { status: "accepted", count: input.messages.length, providerMessageIds: ids, acceptedAt: new Date().toISOString() };
}

/** Compatibility wrapper used by existing transactional senders. */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const result = await sendEmailWithReceipt(input);
  return result.status === "accepted";
}

/** Read provider state for a previously accepted message without sending. */
export async function getEmailReadback(providerMessageId: string): Promise<EmailReadbackResult> {
  const id = providerMessageId.trim();
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !id) return { status: "unavailable", reason: "email_provider_readback_unavailable" };
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const result = await resend.emails.get(id);
    if (result.error || !result.data || result.data.id !== id) {
      return { status: "unavailable", reason: "email_provider_readback_unavailable" };
    }
    return {
      status: "available",
      providerMessageId: result.data.id,
      to: result.data.to,
      subject: result.data.subject,
      lastEvent: result.data.last_event,
    };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 240) : "email_provider_readback_unavailable" };
  }
}

/**
 * Read the bounded receiving mailbox window for one generated reply address.
 * A negative result is trustworthy only after the provider has returned every
 * page down to the inquiry's received time. This remains a read-only provider
 * operation and deliberately stores no inbound message body.
 */
export async function getReceivedEmailReadback(input: {
  replyTo: string;
  after: string;
  sender?: string;
}): Promise<EmailReceivedReadbackResult> {
  const replyTo = input.replyTo.trim().toLowerCase();
  const afterMs = Date.parse(input.after);
  const expectedSender = input.sender ? input.sender.trim().toLowerCase() : null;
  const checkedAt = new Date().toISOString();
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo) || !Number.isFinite(afterMs) || (input.sender && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(expectedSender || ""))) {
    return { status: "unavailable", reason: "email_provider_receiving_readback_unavailable" };
  }

  const normalizeAddress = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const raw = value.trim().toLowerCase();
    const bracketed = raw.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1];
    const normalized = bracketed || raw;
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : null;
  };

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    let cursor: string | undefined;
    const maxPages = 3;
    const seenIds = new Set<string>();
    let previousCreatedMs = Number.POSITIVE_INFINITY;
    for (let page = 0; page < maxPages; page += 1) {
      const response = await resend.emails.receiving.list(cursor ? { limit: 100, after: cursor } : { limit: 100 });
      if (response.error || !response.data || !Array.isArray(response.data.data) || response.data.data.length > 100 || typeof response.data.has_more !== "boolean") {
        return { status: "unavailable", reason: "email_provider_receiving_readback_unavailable" };
      }
      const rows = response.data.data;
      let oldestMs = Number.POSITIVE_INFINITY;
      for (const row of rows) {
        const createdMs = Date.parse(row.created_at);
        if (!Number.isFinite(createdMs) || createdMs > previousCreatedMs || typeof row.id !== "string" || !row.id || seenIds.has(row.id) || !Array.isArray(row.to) || row.to.length === 0 || !row.to.every((address) => normalizeAddress(address)) || !normalizeAddress(row.from)) {
          return { status: "unavailable", reason: "email_provider_receiving_readback_incomplete" };
        }
        previousCreatedMs = createdMs;
        seenIds.add(row.id);
        oldestMs = Math.min(oldestMs, createdMs);
        if (
          createdMs >= afterMs &&
          row.to.some((address) => normalizeAddress(address) === replyTo) &&
          (!expectedSender || normalizeAddress(row.from) === expectedSender)
        ) {
          return {
            status: "available",
            received: true,
            checkedAt,
            providerMessageId: row.id,
            receivedAt: row.created_at,
          };
        }
      }
      if (!response.data.has_more) {
        return { status: "available", received: false, checkedAt };
      }
      // Resend documents forward pagination as newer to older items:
      // https://resend.com/docs/api-reference/pagination#forward-pagination Once the oldest record on this
      // page predates the inquiry, no later page can contain a relevant reply.
      if (oldestMs < afterMs) {
        return { status: "available", received: false, checkedAt };
      }
      const nextCursor = rows.at(-1)?.id;
      if (!nextCursor || nextCursor === cursor) {
        return { status: "unavailable", reason: "email_provider_receiving_readback_incomplete" };
      }
      cursor = nextCursor;
    }
    return { status: "unavailable", reason: "email_provider_receiving_readback_incomplete" };
  } catch {
    return { status: "unavailable", reason: "email_provider_receiving_readback_unavailable" };
  }
}
