import { at, workId, workspaceId } from "./website-routing-browser-fixture";

export function reportBrowserOrigin(baseURL: string | undefined) {
  if (!baseURL) throw new Error("An explicit loopback baseURL is required.");
  const url = new URL(baseURL);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("A credential-free HTTP loopback origin is required.");
  return url.origin;
}

/** Fictional selected-period evidence, never a provider measurement. */
export function reportBrowserFixture(month: string) {
  return { workId, workspaceId, tenantId: null, siteName: "Fictional bakery", month, generatedAt: at,
    inquiries: { status: "available", count: 17, limitedToRecentRecords: true },
    bookings: { status: "unavailable", scheduledInPeriod: null, providerAccepted: null, providerVerified: null },
    visibility: { status: "unavailable", note: "Fictional report response; no provider measurements." },
    readiness: { status: "unavailable", passedChecks: null, totalChecks: null }, changes: [] };
}
