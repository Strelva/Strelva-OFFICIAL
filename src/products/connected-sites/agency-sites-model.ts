/**
 * The agency's Client websites view: shapes shared by the server read and the
 * screen. Pure and browser-safe. Never carries a site key or verification token.
 */
import { z } from "zod";
import { PLATFORMS } from "./contracts";
import { connectedSiteHealth, type ConnectedSiteHealth } from "./site-health";

const iso = z.string();
export const clientDetectionSchema = z.object({
  siteUrl: z.string(), siteHost: z.string(), platform: z.enum(PLATFORMS), evidence: z.array(z.string()), reachable: z.boolean(), detectedAt: iso,
});
export type ClientDetection = z.infer<typeof clientDetectionSchema>;

export const clientSiteSchema = z.object({
  id: z.string().uuid(), siteHost: z.string(), siteUrl: z.string(), platform: z.enum(PLATFORMS), detectedPlatform: z.enum(PLATFORMS).nullable().optional().transform(value => value ?? null),
  verifiedAt: iso.nullable(), firstEventAt: iso.nullable(), lastEventAt: iso.nullable(), lastCheckedAt: iso.nullable().optional().transform(value => value ?? null),
  lastCheckResult: z.enum(["present", "missing", "unreachable"]).nullable().optional().transform(value => value ?? null),
});
export type ClientSite = z.infer<typeof clientSiteSchema>;

export const agencyClientSiteRowSchema = z.object({
  workspaceId: z.string().uuid(), name: z.string(), website: z.string().nullable(), sourceUrl: z.string().nullable(),
  detection: clientDetectionSchema.nullable(), site: clientSiteSchema.nullable(),
});
export const agencyClientSitesPageSchema = z.object({
  clients: z.array(agencyClientSiteRowSchema), nextCursor: z.object({ name: z.string(), id: z.string().uuid() }).nullable(),
});
export type AgencyClientSitesPage = z.infer<typeof agencyClientSitesPageSchema>;

/** A row as the screen reads it: keep your site may be off for this client, and the install state when there is a site. */
export type AgencyClientSiteRow = z.infer<typeof agencyClientSiteRowSchema> & { enabled: boolean; health: ConnectedSiteHealth | null };
export interface AgencyClientSitesView { clients: AgencyClientSiteRow[]; nextCursor: { name: string; id: string } | null }

export const clientSiteHealth = (site: ClientSite, now = Date.now()): ConnectedSiteHealth =>
  connectedSiteHealth({ status: "active", siteHost: site.siteHost, verifiedAt: site.verifiedAt, lastEventAt: site.lastEventAt, lastCheckedAt: site.lastCheckedAt, lastCheckResult: site.lastCheckResult }, now);

export const CLIENT_BULK_LIMIT = 25;
/** A detection older than this is read again by "Check what they're built with". */
export const DETECTION_STALE_MS = 7 * 24 * 3600 * 1000;

/** What the site is built with: the owner's saved choice wins, then the live page. */
export function clientBuiltWith(row: Pick<AgencyClientSiteRow, "site" | "detection">): { platform: string | null; state: "known" | "not_checked" | "unreachable" | "not_recognized" } {
  const saved = row.site && row.site.platform !== "unknown" ? row.site.platform : null;
  const found = row.site?.detectedPlatform ?? (row.detection?.reachable && row.detection.platform !== "unknown" ? row.detection.platform : null);
  const platform = saved ?? found;
  if (platform) return { platform, state: "known" };
  if (row.detection && !row.detection.reachable) return { platform: null, state: "unreachable" };
  if (row.detection || row.site?.lastCheckedAt) return { platform: null, state: "not_recognized" };
  return { platform: null, state: "not_checked" };
}

/** The address Strelva reads for a client: its connected site, else the website on record, else where the client came from. */
export const clientAddress = (row: Pick<AgencyClientSiteRow, "site" | "website" | "sourceUrl">): string | null => row.site?.siteUrl ?? row.website ?? row.sourceUrl ?? null;
