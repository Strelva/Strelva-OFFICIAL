/** Human-readable confirmed terms shared by the page, fact sheet and JSON-LD.
 * Informational only: these terms never configure booking or charge a deposit. */
import type { PublishedPolicies } from "@/platform/business-record/policies";

export const PAYMENT_LABELS = {
  cash: "Cash", credit_card: "Credit card", debit_card: "Debit card",
  bank_transfer: "Bank transfer", check: "Check", digital_wallet: "Digital wallet", other: "Other",
} as const;

export function publishedPolicyRows(policies: PublishedPolicies = {}): Array<{ key: string; label: string; text: string }> {
  const rows: Array<{ key: string; label: string; text: string }> = [];
  const add = (key: string, label: string, parts: Array<string | undefined>) => rows.push({ key, label, text: parts.filter(Boolean).join(" ") });
  const cancellation = policies.cancellation?.value;
  if (cancellation) add("cancellation", "Cancellation", [cancellation.summary, cancellation.noticeHours === undefined ? undefined : `Notice: ${cancellation.noticeHours} hours.`]);
  const deposit = policies.deposit?.value;
  if (deposit) add("deposit", "Deposit", [deposit.required ? "Deposit required." : "No deposit required.",
    deposit.amountCents === undefined ? undefined : `Amount: ${deposit.currency} ${(deposit.amountCents / 100).toFixed(2)}.`,
    deposit.percent === undefined ? undefined : `Amount: ${deposit.percent}%.`, deposit.summary]);
  const payments = policies.payment_methods?.value;
  if (payments) add("payment_methods", "Payment methods", [payments.map(method => PAYMENT_LABELS[method]).join(", ")]);
  const age = policies.age_waiver?.value;
  if (age) add("age_waiver", "Age and waiver", [age.minimumAge === undefined ? undefined : `Minimum age: ${age.minimumAge}.`,
    age.waiverRequired ? "Waiver required." : "No waiver required.",
    age.guardianRequired === undefined ? undefined : age.guardianRequired ? "Guardian required." : "No guardian required.", age.summary]);
  const booking = policies.booking_rules?.value;
  if (booking) add("booking_rules", "Booking rules", [booking.summary,
    booking.reservationRequired === undefined ? undefined : booking.reservationRequired ? "Reservation required." : "No reservation required.",
    booking.advanceNoticeHours === undefined ? undefined : `Advance notice: ${booking.advanceNoticeHours} hours.`,
    booking.maximumAdvanceDays === undefined ? undefined : `Book up to ${booking.maximumAdvanceDays} days ahead.`]);
  const response = policies.response_time?.value;
  if (response) add("response_time", "Response time", [`Response within ${response.maximumHours} hours.`, response.summary]);
  return rows;
}
