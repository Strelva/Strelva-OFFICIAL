/** Fictional business, permission and receipt examples for L10. No live capability or public MCP binding is implied. */
import type { PublicFacts } from "@/products/connected-sites/contracts";
import type { ProfileCapability, ProfileFact } from "@/experience/product/assistants/PublicBusinessProfile";

export const assistantsBusiness = "Fictional Mediation Firm";
export const assistantsFacts: PublicFacts = {
  name: assistantsBusiness,
  description: "Mediation for legal and workplace disputes · Buffalo, NY",
  verification: {
    domain: { verified: true, url: "fictional-mediation.example.test", confirmedAt: "2026-10-03T12:00:00Z" },
    googleBusinessProfile: { linked: false, verified: null, url: null },
    ownerConfirmedFactCount: 4, lastConfirmedAt: "2026-10-09T12:00:00Z", operatingAgencies: [],
  },
};
export const assistantsProfileFacts: ProfileFact[] = [
  { label: "Hours", value: "Mon–Fri 9 AM – 5 PM · closed weekends", source: "Owner said · Oct 8" },
  { label: "Services", value: "Half-day session (4 h) · full-day session (8 h)", source: "Owner said · Oct 2" },
  { label: "Fees", value: "[fees]", source: "Owner said · Oct 9" },
  { label: "Doesn’t do", value: "Family or divorce mediation", source: "Owner said · Oct 9" },
];
export const assistantsProfileCapabilities: ProfileCapability[] = [
  { label: "See open dates", detail: "Answers from the connected calendar, never shows busy times", method: "GET /dates" },
  { label: "Send an inquiry", detail: "Arrives as a form message, marked “sent by an assistant”", method: "POST /inquiry" },
  { label: "Ask for a session date", detail: "The owner confirms each request. Nothing is booked until then.", method: "POST /request" },
];
export const assistantsPermissions = [
  { label: "See open dates", detail: "Answers from the connected work calendar", authority: "Strelva handles it", enabled: true },
  { label: "Send an inquiry", detail: "Arrives in Inquiries, marked", authority: "Same as the form", enabled: true },
  { label: "Ask for a session date", detail: "You confirm each one", authority: "Ask me first", enabled: true },
  { label: "Pay a deposit", detail: `Not offered by ${assistantsBusiness}`, authority: "Not offered", enabled: false },
];
export const assistantsReceipts = [
  { mark: "·", text: "Checked open dates for Oct · gave 3", time: "2:10 PM" },
  { mark: "→", text: "Sent an inquiry for “J. Harbor”", time: "Wed" },
  { mark: "✓", text: "Asked for Fri 16 · you confirmed", time: "Wed" },
  { mark: "×", text: "Asked for a Saturday · refused, closed", time: "Mon" },
];
