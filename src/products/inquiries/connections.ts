import type { Connection } from "@/lib/types";

export type InquiryConnectionView = {
  id: "google" | "email" | "calendar" | "stripe" | "mls";
  label: string;
  status: Connection["status"] | "not_configured" | "unavailable";
  canSee: string[];
  canDo: string[];
  lastCheckedAt: string | null;
  consentRequired: true;
  manageHref: string | null;
};

const DEFINITIONS = [
  { id: "google", label: "Google", provider: "google" },
  { id: "email", label: "Email", provider: null },
  { id: "calendar", label: "Calendar", provider: "calendly" },
  { id: "stripe", label: "Stripe", provider: null },
  { id: "mls", label: "MLS", provider: null },
] as const;

/** Project only recorded tenant grants. Platform mail/billing keys are not consent. */
export function projectInquiryConnections(
  tenantId: string,
  connections: readonly Connection[] | null,
  manageHref: string,
): InquiryConnectionView[] {
  return DEFINITIONS.map(({ id, label, provider }) => {
    const connection = provider
      ? connections?.find((item) => item.tenantId === tenantId && item.provider === provider)
      : undefined;
    const active = connection?.status === "connected";
    const scopes = new Set(active ? connection.scopes ?? [] : []);
    const canSee: string[] = [];
    const canDo: string[] = [];
    if (id === "google") {
      if (scopes.has("https://www.googleapis.com/auth/webmasters.readonly")) canSee.push("Search Console reports");
      if (scopes.has("https://www.googleapis.com/auth/analytics.readonly")) canSee.push("Google Analytics reports");
      if (scopes.has("https://www.googleapis.com/auth/business.manage")) {
        canSee.push("Business Profile and reviews");
        canDo.push("Propose Business Profile changes and review replies for approval");
      }
    }
    return {
      id,
      label,
      status: connections === null ? "unavailable" : connection?.status ?? "not_configured",
      canSee,
      canDo,
      lastCheckedAt: connection?.lastSyncedAt && Number.isFinite(Date.parse(connection.lastSyncedAt))
        ? connection.lastSyncedAt : null,
      consentRequired: true,
      // Consent/disconnection stays in the existing tenant-scoped integration flow.
      manageHref: provider ? manageHref : null,
    };
  });
}
