import type { PaymentRequest } from "@/platform/connect/contracts";

/** Fictional design fixture. No merchant, card, booking, or payment record exists. */
export const depositFixture = {
  business: "Lakeview Yoga",
  title: "Weekend retreat: breath and mobility",
  date: "Sat–Sun, Nov 8–9 · 10 AM – 4 PM · with Ana and Theo · 14 spots",
  description: "Two days of slow practice, breathwork and mobility. Lunch included both days. Beginners welcome.",
  deposit: "[deposit]",
  balance: "[balance]",
  name: "Alex Ruiz",
  email: "alex@example.test",
  card: "•••• •••• •••• 4242",
  expires: "08 / 28",
  cvc: "•••",
  terms: "Card handled by Stripe. Lakeview Yoga never sees the number. Refundable until Nov 1.",
} as const;

export const depositPreviewStates = ["ready", "loading", "empty", "error", "denied", "paid"] as const;
export type DepositPreviewState = typeof depositPreviewStates[number];

/** Fictional shared-token request for local presentation/contract tests only. */
export const businessDepositFixture: PaymentRequest = {
  id: "a2830000-0000-4000-8000-000000000011", workspaceId: "a2830000-0000-4000-8000-000000000010",
  kind: "deposit", lines: [], amountCents: 12000, currency: "usd", expiresAt: "2026-12-01T12:00:00Z", paid: false, status: "unpaid",
};
