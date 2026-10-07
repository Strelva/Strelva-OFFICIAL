import { BadgeDollarSign, CalendarCheck, FileText, Globe, KeyRound, MessageSquareText, ShieldCheck, Star, type LucideIcon } from "lucide-react";
import type { OwnerDecision } from "@/platform/needs-you/contracts";

/**
 * How one owner decision is shaped on screen (October 6, 2026). Derived only
 * from the decision itself: its kind, where it came from, and its own words.
 * Nothing here adds a fact the decision does not carry.
 */
export type DecisionShape = "price" | "live" | "message" | "plain";

export interface DecisionPresentation {
  /** Where the decision came from, in the owner's words. */
  source: string;
  /** The one primary action. Its effect is still the decision's approveEffect. */
  verb: string;
  icon: LucideIcon;
  shape: DecisionShape;
  /** A dollar amount the decision itself states, for the price card. */
  amount: string | null;
}

const AMOUNT = /\$\d[\d,]*(?:\.\d{2})?/;

function isBooking(item: OwnerDecision): boolean {
  return item.sourceLifecycle.includes("booking");
}

function source(item: OwnerDecision): string {
  if (isBooking(item)) return "Bookings";
  if (item.kind.startsWith("google.") || item.kind.startsWith("review.")) return "Google";
  if (item.kind.startsWith("customer.")) return "Inquiries";
  if (item.kind === "money") return "Billing";
  if (item.kind === "access.grant") return "Access";
  if (item.kind === "exit") return "Account";
  if (item.kind === "request.scope") return "Requests";
  if (item.kind === "running.approve") return "Running";
  if (item.kind.startsWith("fact.")) return "Business record";
  if (item.kind === "health.fix" || item.kind === "verify.failed") return "Health";
  return item.sourceLifecycle.includes("website") ? "Website" : "Your systems";
}

function verb(item: OwnerDecision): string {
  if (item.kind === "system.go_live") return "Make it live";
  if (item.kind === "google.post" || item.kind === "google.photo") return "Post it";
  if (item.kind === "customer.message" || item.kind.startsWith("review.reply")) return "Send";
  if (isBooking(item)) return "Confirm";
  return "Approve";
}

function icon(item: OwnerDecision): LucideIcon {
  if (isBooking(item)) return CalendarCheck;
  if (item.kind.startsWith("google.") || item.kind.startsWith("review.")) return Star;
  if (item.kind.startsWith("customer.")) return MessageSquareText;
  if (item.kind === "money") return BadgeDollarSign;
  if (item.kind === "access.grant" || item.kind === "exit") return KeyRound;
  if (item.kind.startsWith("system.") || item.kind === "structure" || item.kind.startsWith("copy.")) return Globe;
  if (item.kind === "health.fix" || item.kind === "verify.failed") return ShieldCheck;
  return FileText;
}

export function decisionPresentation(item: OwnerDecision): DecisionPresentation {
  const amount = (item.kind.startsWith("customer.") || item.kind === "money") ? (AMOUNT.exec(`${item.title} ${item.detail ?? ""}`)?.[0] ?? null) : null;
  const quoted = Boolean(item.detail && /^["“]/.test(item.detail.trim()));
  const shape: DecisionShape = amount ? "price" : item.kind === "system.go_live" ? "live" : quoted ? "message" : "plain";
  return { source: source(item), verb: verb(item), icon: icon(item), shape, amount };
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/** "Three decisions" up to nine, then digits. */
export function decisionCount(count: number): string {
  const number = count < WORDS.length ? WORDS[count]! : count.toLocaleString("en-US");
  return `${number} ${count === 1 ? "decision" : "decisions"}`;
}
