import type { ConnectionSource } from "@/platform/connections/contracts";
import { registerConnectionSource } from "@/platform/connections/sources";

/** Google and Outlook calendars share one product module; load it once for both. A failed load is retried. */
let scheduling: Promise<typeof import("@/products/scheduling/server")> | undefined;
const loadScheduling = () => scheduling ??= import("@/products/scheduling/server").catch(error => { scheduling = undefined; throw error; });

/** The app edge owns product composition. Lazy sources keep startup free of
 * product imports, credentials reads and provider calls. Each wrapper has stable
 * identity, so repeated initialization cannot duplicate an account row. */
const productSources: readonly ConnectionSource[] = [
  { provider: "google_business_profile", list: async input => (await import("@/products/google-listing/server")).googleBusinessProfileConnectionSource().list(input) },
  { provider: "google_calendar", list: async input => (await loadScheduling()).googleCalendarConnectionSource().list(input) },
  { provider: "outlook_calendar", list: async input => (await loadScheduling()).outlookCalendarConnectionSource().list(input) },
  { provider: "calendly", list: async input => (await import("@/app/api/oauth/calendly/connection-source")).calendlyConnectionSource.list(input) },
  { provider: "highlevel", list: async input => (await import("@/products/agency-clients/server")).ghlConnectionSource.list(input) },
  { provider: "connected_site", list: async input => (await import("@/products/connected-sites/server")).connectedSiteConnectionSource.list(input) },
  { provider: "stripe", list: async input => (await import("@/platform/connect/connection-source")).stripeConnectionSource.list(input) },
  { provider: "resend", list: async input => (await import("@/platform/infra/email/connection-source")).emailConnectionSource.list(input) },
  { provider: "instagram", list: async input => (await import("@/app/api/oauth/instagram/connection-source")).instagramConnectionSource.list(input) },
];

/** Called by Next instrumentation before any request, including live commands. */
export function registerProductConnectionSources(): void {
  for (const source of productSources) registerConnectionSource(source);
}
