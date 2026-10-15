import { load } from "cheerio";
import { z } from "zod";
import { getConnection } from "@/lib/connections";
import { readProviderAccess } from "@/platform/connections/access";
import { readBookingContext, type BookingContext } from "@/platform/bookings/store";
import { hoursOutsideRecord } from "@/platform/bookings/availability";
import { fetchLiveSitePage, platformSchemaFromHtml, type PlatformSchemaReport } from "@/products/connected-sites/server";
import { readListingControl, tenantListingContext } from "@/products/google-listing/server";
import { listingsYelpEnabled } from "./release";

/** Read-only, bounded in time and size. Nothing here can change a place. */

export type GoogleRead =
  | { status: "read"; data: unknown }
  | { status: "waiting_on_google" }
  | { status: "reconnect"; reason: string }
  | { status: "unreadable"; reason: string };

export const GOOGLE_LISTINGS_READ_MASK = ["phoneNumbers", "storefrontAddress", "regularHours", "specialHours", "websiteUri"];

export interface WebsitePageRead { report: PlatformSchemaReport; telHrefs: string[]; hrefs: string[]; text: string }

export async function readWebsitePage(url: string, deps: { fetchPage: (url: string) => Promise<string | null> } = { fetchPage: fetchLiveSitePage }): Promise<WebsitePageRead | null> {
  const html = await deps.fetchPage(url);
  if (html === null) return null;
  const report = platformSchemaFromHtml(html);
  const $ = load(html);
  const telHrefs = $("a[href^='tel:' i]").map((_i, el) => $(el).attr("href") ?? "").get().filter(Boolean).slice(0, 20);
  const hrefs: string[] = [];
  $("a[href]").each((_i, el) => {
    if (hrefs.length >= 500) return;
    try {
      const resolved = new URL($(el).attr("href") ?? "", url);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") hrefs.push(resolved.toString());
    } catch { /* an unparseable link is not a link */ }
  });
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 200_000);
  return { report, telHrefs, hrefs, text };
}

export interface GoogleReadDeps {
  context: typeof tenantListingContext;
  control: typeof readListingControl;
  access: typeof readProviderAccess;
}
const liveGoogleDeps: GoogleReadDeps = { context: tenantListingContext, control: readListingControl, access: readProviderAccess };

export async function readGoogleLocation(target: { tenantId: string; locationId: string }, workspaceId: string, deps: GoogleReadDeps = liveGoogleDeps): Promise<GoogleRead> {
  if (deps.access("google_business_profile").approval === "pending") return { status: "waiting_on_google" };
  let ctx: Awaited<ReturnType<typeof tenantListingContext>>;
  try {
    ctx = await deps.context(target.tenantId, workspaceId, target.locationId, undefined, null);
  } catch (error) {
    return { status: "reconnect", reason: (error instanceof Error ? error.message : "Reconnect Google to continue.").slice(0, 300) };
  }
  try {
    if ((await deps.control(workspaceId, target.locationId) as { accessPending?: boolean } | null)?.accessPending) return { status: "waiting_on_google" };
  } catch { /* the control row is a hint; the read below decides */ }
  const result = await ctx.client.getLocation(ctx.location, GOOGLE_LISTINGS_READ_MASK);
  if (result.ok) return { status: "read", data: result.data };
  if (result.kind === "setup_pending") return { status: "waiting_on_google" };
  if (result.kind === "auth" || result.kind === "not_found") return { status: "reconnect", reason: "Reconnect Google to compare this listing." };
  return { status: "unreadable", reason: "Google didn't answer. Strelva will check again." };
}

export async function readBookingSurface(scope: string, deps: { booking: (scope: string) => Promise<BookingContext | null> } = { booking: readBookingContext }): Promise<{ context: BookingContext; outside: Array<{ day: number; opens: string; closes: string }> } | null> {
  const context = await deps.booking(scope);
  if (!context) return null;
  return { context, outside: hoursOutsideRecord(context) };
}

const yelpBusinessSchema = z.object({
  phone: z.string().optional(),
  location: z.object({ address1: z.string().nullish(), city: z.string().nullish(), state: z.string().nullish(), zip_code: z.string().nullish() }).passthrough().optional(),
  hours: z.array(z.object({ open: z.array(z.object({ day: z.number(), start: z.string(), end: z.string() }).passthrough()).optional() }).passthrough()).optional(),
}).passthrough();

/** Yelp's terms limit caching: the response is used for this check and never stored beyond its readings. */
export async function readYelpBusiness(
  tenantId: string,
  deps: { connection: (tenantId: string) => Promise<{ accessToken?: string; apiKey?: string } | null>; fetch: typeof fetch } = { connection: t => getConnection(t, "yelp"), fetch },
): Promise<unknown | null> {
  if (!listingsYelpEnabled()) return null;
  const connection = await deps.connection(tenantId);
  if (!connection?.accessToken || !connection.apiKey) return null;
  const response = await deps.fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(connection.apiKey)}`, {
    headers: { Authorization: `Bearer ${connection.accessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const parsed = yelpBusinessSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}
