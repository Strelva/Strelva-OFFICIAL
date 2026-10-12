import type { BusinessRequestStage } from "../business-delivery-summary";
/** Fictional canon examples only. No telemetry, client terms or royalty rates. */
export const agencyCanonFrames = ["client", "requests", "approval", "minutes", "attribution"] as const;
export type AgencyCanonFrame = (typeof agencyCanonFrames)[number];
export type AgencyCanonState = "ready" | "loading" | "empty" | "error" | "permission";
export function agencyCanonFrame(value?: string): AgencyCanonFrame {
  return agencyCanonFrames.find(frame => frame === value) ?? "client";
}
export function agencyCanonState(value?: string): AgencyCanonState {
  return value === "loading" || value === "empty" || value === "error" || value === "permission" ? value : "ready";
}
export const FICTIONAL_AGENCY_MINUTES = [
  { client: "North Coast Realty", minutes: 61, reason: "Form outage, 1 request" },
  { client: "Harbor Dental", minutes: 42, reason: "2 requests, 1 review" },
  { client: "The Mooney Firm", minutes: 18, reason: "1 request" },
  { client: "Fieldwork Studio", minutes: 9, reason: "Email fix" },
];
export const FICTIONAL_AGENCY_CREDIT = [
  { source: "Appointments", usage: "3 of your client Versions", credit: "North Studio" },
  { source: "Intake form", usage: "2 of your clients · 5 businesses through other agencies", credit: "North Studio" },
  { source: "Review asks", usage: "1 of your clients", credit: "North Studio, from Strelva’s starter" },
];
export const FICTIONAL_AGENCY_REQUESTS: { title: string; client: string; stage: BusinessRequestStage }[] = [
  { title: "New patient intake", client: "Harbor Dental", stage: "ready_for_review" },
  { title: "Request from North Coast Realty", client: "North Coast Realty", stage: "asked" },
  { title: "Request from Fieldwork Studio", client: "Fieldwork Studio", stage: "asked" },
];
