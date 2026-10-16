/** Money preview screens and their states (server-safe: imported by the preview routes). */
export const XS_MONEY_SCREENS = {
  billing: ["ready", "past-due", "empty", "waiting", "loading", "error"],
  "billing-agency": ["ready", "priced", "empty", "loading", "error"],
  "payment-links": ["ready", "empty", "setup", "off", "loading", "error"],
  invoice: ["ready", "loading"],
  receipt: ["ready", "waiting"],
  payments: ["ready", "setup", "empty", "loading", "error"],
  pay: ["ready", "range", "paid", "expired", "returned", "cancelled"],
  "pay-receipt": ["ready", "waiting"],
  "pay-business": ["ready", "paid", "error"],
  "money-terms": ["ready", "empty", "error"],
  reconciliation: ["waiting", "done", "error"],
  "creator-maintenance": ["ready", "empty", "error"],
  "source-attribution": ["ready", "creator", "error"],
  payer: ["waiting", "done", "empty", "error"],
  "email-declined": ["ready"],
} as const;
export type XsMoneyScreen = keyof typeof XS_MONEY_SCREENS;

