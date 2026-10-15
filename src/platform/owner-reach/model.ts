export const OWNER_REACH_STATES = ["owner_in", "claim_waiting", "claim_to_staff", "staff_address", "no_contact", "email_off", "reachable"] as const;
export type OwnerReachState = (typeof OWNER_REACH_STATES)[number];

export interface OwnerReachInput {
  ownerMember: boolean;
  contact: "none" | "trusted" | "trusted_staff";
  contactProposed: boolean;
  invite: null | { kind: string; expiresAt: string; deliveryStatus: string; recipientStaff: boolean };
  clientEmailOn: boolean;
  now: number;
}

const DAY = 86_400_000;
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dateLabel = (iso: string) => {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? shortDate.format(at) : "soon";
};

/** One answer to "can this client's owner be told?", in the order that matters:
 * an owner who is signed in beats everything, a link addressed to staff beats
 * a good-looking address, and trusting an address means nothing while email to
 * owners is off. */
export function ownerReach(input: OwnerReachInput): { state: OwnerReachState; reachable: boolean; reason: string } {
  if (input.ownerMember) return { state: "owner_in", reachable: true, reason: "Owner signed in" };
  const invite = input.invite && Date.parse(input.invite.expiresAt) > input.now ? input.invite : null;
  if (invite?.recipientStaff) return { state: "claim_to_staff", reachable: false, reason: "The owner link is addressed to staff, not the owner" };
  if (invite) {
    const until = `works until ${dateLabel(invite.expiresAt)}`;
    if (invite.deliveryStatus === "accepted") return { state: "claim_waiting", reachable: true, reason: `Claim emailed · ${until}` };
    return {
      state: "claim_waiting",
      reachable: false,
      reason: input.clientEmailOn
        ? `Claim not sent. Share the link yourself · ${until}`
        : `Claim not sent: email to owners is off. Share the link yourself · ${until}`,
    };
  }
  if (input.contact === "trusted_staff") return { state: "staff_address", reachable: false, reason: "Owner email on record is a staff address" };
  if (input.contact === "none") {
    return {
      state: "no_contact",
      reachable: false,
      reason: input.contactProposed ? "No owner email on record · an address was added and waits for the owner to confirm it" : "No owner email on record",
    };
  }
  if (!input.clientEmailOn) return { state: "email_off", reachable: false, reason: "Owner email on record, but email to owners is off" };
  return { state: "reachable", reachable: true, reason: "Owner reachable by email" };
}

/** How long an open owner decision has left before it lapses (14 days after it opens). */
export function lapseLabel(expiresAt: string, now: number): string | null {
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return null;
  const days = Math.ceil((at - now) / DAY);
  if (days <= 0) return "Lapses today";
  if (days === 1) return "Lapses tomorrow";
  return `Lapses in ${days} days`;
}
