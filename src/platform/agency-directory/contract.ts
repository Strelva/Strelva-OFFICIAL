/** Client-safe names for Bring in an agency (ADR 0015). The server module re-exports these. */
export const AGENCY_SCOPES = ["website", "inquiries", "bookings", "google", "internal_tools"] as const;
export const AGENCY_LEVELS = ["prepare", "full_control"] as const;
export type AgencyScope = typeof AGENCY_SCOPES[number];
export type AgencyLevel = typeof AGENCY_LEVELS[number];

/** Fingerprint of the exact owner, consent and immutable grant rows reviewed. */
export type AgencyProposal = {
  proposalId: string;
  businessWorkspaceId: string;
  businessName: string;
  consent: string;
  proposedAt: string;
  scopes: Array<{ scope: AgencyScope; level: AgencyLevel }>;
};

export const AGENCY_SCOPE_LABELS: Record<AgencyScope, string> = {
  website: "Website",
  inquiries: "Inquiries",
  bookings: "Bookings",
  google: "Google",
  internal_tools: "Internal tools",
};
export const AGENCY_LEVEL_LABELS: Record<AgencyLevel, string> = {
  prepare: "Prepare",
  full_control: "Full control",
};
export const AGENCY_LEVEL_HELP: Record<AgencyLevel, string> = {
  prepare: "They build and stage it. You approve before anything goes live.",
  full_control: "They approve and make it live themselves. You can end their access anytime.",
};

/** The exact words the owner agrees to; stored with the grant. */
export function agencyConsentText(agencyName: string, scopes: Array<{ scope: AgencyScope; level: AgencyLevel }>): string {
  const parts = scopes.map(item => `${AGENCY_SCOPE_LABELS[item.scope]} (${AGENCY_LEVEL_LABELS[item.level].toLowerCase()})`);
  return `I bring in ${agencyName} for ${parts.join(", ")}. I keep payment decisions and my data, and I can end their access anytime.`.slice(0, 2000);
}
