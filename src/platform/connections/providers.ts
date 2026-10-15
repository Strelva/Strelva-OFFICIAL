import type { ConnectionArea, ConnectionProvider, CredentialHolderKind } from "./contracts";

export interface ProviderDefinition {
  provider: ConnectionProvider;
  label: string;
  /** The business area an agency needs before it may use this connection for a client; null for none. */
  area: ConnectionArea | null;
  /** Whose login may be connected. */
  accountHolders: readonly CredentialHolderKind[];
  /** Whose provider app/project may carry the calls. */
  accessThrough: readonly Exclude<CredentialHolderKind, "unknown" | "business">[];
  reads: string;
  acts: string | null;
  /** A provider rule that limits who may use an app/project; shown to operators, not a legal finding. */
  policyNote: string | null;
}

const definitions: readonly ProviderDefinition[] = [
  {
    provider: "google_business_profile", label: "Google Business Profile", area: "google",
    accountHolders: ["business", "agency"], accessThrough: ["platform", "agency"],
    reads: "Listing details, reviews and performance", acts: "Hours, posts and review replies",
    policyNote: "Google restricts third-party programmatic access through another provider's project. An agency's approved project serves only that agency's own clients.",
  },
  {
    provider: "google_calendar", label: "Google Calendar", area: "bookings",
    accountHolders: ["business"], accessThrough: ["platform"],
    reads: "Busy times", acts: "Booking events", policyNote: null,
  },
  {
    provider: "calendly", label: "Calendly", area: "bookings",
    accountHolders: ["business"], accessThrough: ["platform"],
    reads: "Event types and scheduled events", acts: null, policyNote: null,
  },
  {
    provider: "highlevel", label: "HighLevel", area: null,
    accountHolders: ["agency"], accessThrough: ["platform", "agency"],
    reads: "Sub-accounts and their users, for Import clients", acts: null,
    policyNote: "An agency-level connection lists only that agency's own sub-accounts.",
  },
  {
    provider: "connected_site", label: "Website script", area: "website",
    accountHolders: ["business", "agency"], accessThrough: ["platform"],
    reads: "Form inquiries and page events on the connected site", acts: "Business facts and structured data shown on the site",
    policyNote: null,
  },
  {
    provider: "stripe", label: "Stripe", area: null,
    accountHolders: ["business", "agency", "platform"], accessThrough: ["platform"],
    reads: "Payments and payouts", acts: "Checkout and payment links", policyNote: null,
  },
  {
    provider: "resend", label: "Email sending", area: null,
    accountHolders: ["platform"], accessThrough: ["platform"],
    reads: "Delivery results", acts: "Sends email from the business's name", policyNote: null,
  },
  {
    provider: "instagram", label: "Instagram", area: "website",
    accountHolders: ["business"], accessThrough: ["platform"],
    reads: "Recent posts", acts: null, policyNote: null,
  },
];

export function listProviderDefinitions(): readonly ProviderDefinition[] {
  return definitions;
}

export function providerDefinition(provider: ConnectionProvider): ProviderDefinition {
  const found = definitions.find(item => item.provider === provider);
  if (!found) throw new Error(`Unknown connection provider: ${provider}`);
  return found;
}
