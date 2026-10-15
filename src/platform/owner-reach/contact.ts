import { z } from "zod";

/** Mailbox providers: a shared domain says nothing about who owns the address.
 * Keep identical to owner_reach_public_mail_domains() in 20261027100000_owner_reach.sql. */
export const PUBLIC_MAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com",
  "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "fastmail.com", "zoho.com", "comcast.net",
  "verizon.net", "att.net", "roadrunner.com", "rochester.rr.com", "twc.com",
] as const;

export type OwnerContactProblem = "invalid" | "your_domain";

export const OWNER_CONTACT_PROBLEM_COPY: Record<OwnerContactProblem, string> = {
  invalid: "Check the owner's email address.",
  your_domain: "Use the owner's own email address, not one at your agency.",
};

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1);
const isPublicDomain = (domain: string) => (PUBLIC_MAIL_DOMAINS as readonly string[]).includes(domain);

/** A hint before the request is sent. The database (owner_contact_staff_reason) decides. */
export function ownerContactProblem(email: string, actorEmail?: string | null): OwnerContactProblem | null {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return "invalid";
  const actor = actorEmail ? emailSchema.safeParse(actorEmail) : null;
  if (actor?.success) {
    const domain = domainOf(parsed.data);
    if (domain === domainOf(actor.data) && !isPublicDomain(domain)) return "your_domain";
  }
  return null;
}
