/** Fictional canon examples. Never imported by a live inquiry surface. */
export const INQUIRY_CANON_VIEWS = ["system", "record", "people", "spam"] as const;
export type InquiryCanonView = typeof INQUIRY_CANON_VIEWS[number];
export const INQUIRY_CANON_STATES = ["ready", "loading", "empty", "error", "permission", "disconnected"] as const;
export type InquiryCanonState = typeof INQUIRY_CANON_STATES[number];

export function inquiryCanonView(value?: string): InquiryCanonView {
  return INQUIRY_CANON_VIEWS.includes(value as InquiryCanonView) ? value as InquiryCanonView : "people";
}

export function inquiryCanonState(value?: string): InquiryCanonState {
  return INQUIRY_CANON_STATES.includes(value as InquiryCanonState) ? value as InquiryCanonState : "ready";
}

export const INQUIRY_CANON_PEOPLE = [
  { id: "dana", name: "Dana Reyes", email: "dana@example.invalid", time: "9:10", message: "Two partners at our firm need help working out a client handoff. Do you mediate this kind of thing, and how do we get a date?", status: "Reply drafted · waiting on you", draft: "Hi Dana, yes, Sheri mediates disputes between partners. You can ask for a session date here and Sheri will confirm it: attymooney.com/sessions", waiting: true },
  { id: "priya", name: "Priya Shah", email: "priya@example.invalid", time: "Thu", message: "Our team lead and a senior engineer stopped agreeing on responsibilities. Could mediation help?", status: "Answered by Strelva · standard reply", draft: "Hi Priya, Sheri can help you explore mediation. Please share the best time to talk.", waiting: false },
  { id: "harbor", name: "Harbor & Lane LLP", email: "harbor@example.invalid", time: "Wed", message: "Following up on the session request for our partners.", status: "You replied", draft: "Thanks for following up. Sheri will confirm the date with you.", waiting: false },
  { id: "okafor", name: "M. Okafor", email: "okafor@example.invalid", time: "Mon", message: "Do you take court-referred family cases?", status: "You replied · no fit, referred out", draft: "Thanks for getting in touch. Sheri does not offer that service.", waiting: false },
] as const;

export function inquiryCanonHref(view: InquiryCanonView, mode: "light" | "dark" = "light") {
  return `/preview/strelva/inquiry-canon?view=${view}${mode === "dark" ? "&mode=dark" : ""}`;
}
