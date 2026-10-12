import type { OutsideWriteKind, OutsideWriteUndo } from "./contracts";

/**
 * Undo where it exists, plain labels where it doesn't (spec §3.7). Every
 * receipt carries one of these, and the queue shows the label verbatim.
 */
export interface UndoRule { undo: OutsideWriteUndo; label: string }

export const UNDO_RULES: Record<OutsideWriteKind, UndoRule> = {
  content_publish: {
    undo: "available",
    label: "Undo restores the prior version of this section.",
  },
  gbp_hours: {
    undo: "put_back_draft",
    label: "No undo in Google. Put back drafts a new hours change from the saved before-hours, and it goes through approval.",
  },
  gbp_post: {
    undo: "not_available",
    label: "Google posts can't be undone from Strelva. Change it in Google.",
  },
  gbp_photo: {
    undo: "not_available",
    label: "Google photos can't be undone from Strelva. Change it in Google.",
  },
  review_reply: {
    undo: "not_available",
    label: "Google review replies can't be undone from Strelva. You can edit or delete the reply in Google.",
  },
  domain_add: {
    undo: "claim_only",
    label: "Undo removes Strelva's claim only. The domain stays in Vercel; Strelva never removes a Vercel domain.",
  },
  domain_claim_removal: {
    undo: "not_available",
    label: "No undo. Add the domain again to reconnect it.",
  },
};

/** Labels for writes whose receipts live in their own stores (read in place). */
export const UNDO_LABELS_ELSEWHERE = {
  hostedWebsitePublish: "Undo republishes the prior revision. (To verify: hosted publish undo is an inference in the spec.)",
  inquiryPublish: "Undo uses the inquiry capability's own undo.",
  calendarEvent: "Undo follows the calendar event's receipt.",
  emailSent: "Email can't be unsent.",
  stripe: "No Stripe change is made from the queue.",
} as const;

export function undoRuleFor(kind: OutsideWriteKind): UndoRule {
  return UNDO_RULES[kind];
}
