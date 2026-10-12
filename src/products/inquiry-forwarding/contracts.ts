/**
 * Forward your inquiries: shared shapes. Client-safe (no Node imports).
 *
 * A business forwards (or BCCs, or auto-forwards) inquiry email to one
 * unguessable address on Strelva's inbound domain. Each message there becomes
 * an Inquiry in the one lead store (supabase/migrations/20261024500000).
 */
import { z } from "zod";

/** `fwd-` plus 24 lowercase letters and digits: about 124 bits. */
export const FORWARDING_LOCAL_PART = /^fwd-[a-z0-9]{24}$/;

export type ForwardFormat = "gmail" | "outlook" | "apple" | "forward" | "form" | "direct";

export const providerConfirmationSchema = z.object({
  provider: z.literal("gmail"),
  code: z.string(),
  url: z.string().nullable().optional(),
  requestedBy: z.string().nullable().optional(),
  at: z.string(),
});

export const forwardingAddressSchema = z.object({
  id: z.string().uuid(),
  localPart: z.string().nullable(),
  status: z.enum(["active", "revoked"]),
  issuedAs: z.enum(["owner", "admin", "agency"]),
  issuedAt: z.string(),
  revokedAt: z.string().nullable(),
  revokedReason: z.enum(["revoked", "rotated"]).nullable(),
  firstReceivedAt: z.string().nullable(),
  lastReceivedAt: z.string().nullable(),
  receivedCount: z.number().int(),
  providerConfirmation: providerConfirmationSchema.nullable(),
});
export type ForwardingAddressRow = z.infer<typeof forwardingAddressSchema>;

export const forwardingStateSchema = z.object({
  canManage: z.boolean(),
  address: forwardingAddressSchema.nullable(),
  latest: z.object({
    id: z.string().uuid(),
    name: z.string(),
    subject: z.string().nullable(),
    capturedAt: z.string(),
    intakeState: z.enum(["kept", "held_as_spam", "released", "confirmed_spam"]),
    format: z.string().nullable(),
  }).nullable(),
  revoked: z.array(forwardingAddressSchema),
});
export type ForwardingStateRow = z.infer<typeof forwardingStateSchema>;

/** What the owner's page reads: the address as a full email, ready to copy. */
export interface ForwardingView {
  canManage: boolean;
  address: (ForwardingAddressRow & { email: string | null }) | null;
  latest: ForwardingStateRow["latest"];
  revoked: ForwardingAddressRow[];
}

const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * The inbound domain: the one already configured for inquiry reply tracking
 * (INQUIRY_REPLY_TO_DOMAIN). Forwarding addresses share its MX and Resend
 * receiving setup; the `fwd-` prefix keeps them apart from `inquiry+` reply
 * addresses. Null when unset or malformed, which keeps forwarding off.
 */
export function forwardingDomain(environment: Partial<Record<string, string | undefined>> = process.env): string | null {
  const domain = environment.INQUIRY_REPLY_TO_DOMAIN?.trim().toLowerCase();
  return domain && DOMAIN.test(domain) ? domain : null;
}

export function forwardingEmail(localPart: string | null, domain: string | null): string | null {
  return localPart && domain && FORWARDING_LOCAL_PART.test(localPart) ? `${localPart}@${domain}` : null;
}

/** The local part when `address` is a forwarding address on `domain`. */
export function forwardingLocalPart(address: string, domain: string | null): string | null {
  if (!domain) return null;
  const email = (address.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? address).trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || email.slice(at + 1) !== domain) return null;
  const local = email.slice(0, at);
  return FORWARDING_LOCAL_PART.test(local) ? local : null;
}
