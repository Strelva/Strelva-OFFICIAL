/**
 * Connected sites, server side. Server only.
 *
 * A business connects the site it already has (any builder) with one script
 * line. Strelva serves confirmed business-record facts into the page,
 * captures its forms as inquiries into the one lead store, and counts visits
 * and clicks. Strelva never edits the pages. Nothing is accepted from a site
 * until its owner proves control of the host.
 *
 * Off unless STRELVA_CONNECTED_SITES_RELEASE=1 (and the workspace release).
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { scoreLeadSpam } from "@/lib/lead-spam";
import { fetchPinnedPublicText } from "@/lib/pinned-public-text";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  BEACON_EVENT_KINDS, PLATFORMS, SITE_KEY_PATTERN, VERIFICATION_META_NAME, beaconBatchSchema, businessJsonLd, contactFromFields,
  defaultAllowedOrigins, normalizeOrigin, publicFactsFromRecord, publicInquirySchema, referrerHost, safePath, verificationProofs,
  type ConnectedInquiry, type ConnectedSite, type PublicContext, type ResolvedConnectedSite,
} from "./contracts";
import { ConnectedSiteInputError, connectedSitesStore, type ConnectedSitesStore } from "./store";
import { systemOriginId } from "@/platform/systems/invariants";

export { ConnectedSiteInputError, ConnectedSiteRefusedError } from "./store";

export function connectedSitesReleaseEnabled(): boolean {
  return workspaceReleaseEnabled() && process.env.STRELVA_CONNECTED_SITES_RELEASE === "1";
}

/**
 * Per workspace, wherever the workspace is known (release-flag rule): the
 * env release, and Systems on for this business (its `systems` release row
 * under STRELVA_SYSTEMS_RELEASE=workspace). Connected sites have no flag row
 * of their own; a connected site becomes a website System, so it follows
 * Systems. The public `/api/v1/connect/*` gate stays env-only.
 */
export async function connectedSitesReleasedFor(actor: { userId: string }, workspaceId: string): Promise<boolean> {
  if (!connectedSitesReleaseEnabled()) return false;
  const { systemsReleasedFor } = await import("@/platform/systems-release");
  return systemsReleasedFor(actor, workspaceId);
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
function randomSlug(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, byte => ALPHABET[byte % 36]).join("");
}
export const generateSiteKey = () => `sk_pub_${randomSlug(24)}`;
export const generateVerificationToken = () => randomSlug(32);

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.strelva.com").replace(/\/+$/, "");
}

/** The two things a site owner pastes into the page. */
export function installSnippet(site: Pick<ConnectedSite, "publicKey" | "verificationToken">, origin = appOrigin()) {
  return {
    script: `<script src="${origin}/connect.js" data-strelva-site="${site.publicKey}" defer></script>`,
    meta: site.verificationToken ? `<meta name="${VERIFICATION_META_NAME}" content="${site.verificationToken}">` : null,
  };
}

const connectInput = z.object({
  businessId: z.string().uuid(),
  siteUrl: z.string().trim().min(4).max(500),
  label: z.string().trim().min(1).max(120).optional(),
  platform: z.enum(PLATFORMS).optional(),
}).strict();

/** The public address a business connects: https, a real hostname, no credentials. */
export function normalizeSiteUrl(raw: string, production = process.env.NODE_ENV === "production"): { siteUrl: string; siteHost: string } {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try { url = new URL(withScheme); } catch { throw new ConnectedSiteInputError("Enter the address of your website, like www.yourbusiness.com."); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const local = host === "localhost" || host.endsWith(".localhost");
  if (url.username || url.password || (!local && url.protocol !== "https:") || (production && local)
    || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || (!local && !host.includes("."))) {
    throw new ConnectedSiteInputError("Enter the public https address of your website.");
  }
  return { siteUrl: `${url.protocol}//${url.host.toLowerCase()}${url.pathname === "/" ? "/" : url.pathname}`, siteHost: host };
}

export async function connectSite(actor: WorkspaceActor, raw: unknown, store: ConnectedSitesStore = connectedSitesStore()): Promise<ConnectedSite> {
  const input = connectInput.parse(raw);
  const { siteUrl, siteHost } = normalizeSiteUrl(input.siteUrl);
  return store.create(actor, input.businessId, {
    publicKey: generateSiteKey(), verificationToken: generateVerificationToken(), label: input.label ?? siteHost.replace(/^www\./, ""),
    siteUrl, siteHost, allowedOrigins: defaultAllowedOrigins(siteUrl), platform: input.platform ?? "unknown",
  });
}

/**
 * Domain-ownership proof: read the live page at the site's address (pinned,
 * public addresses only) and pass the tokens found there to SQL, which
 * accepts only this site's own verification token or key.
 */
export async function verifySite(actor: WorkspaceActor, businessId: string, siteId: string, deps: { store?: ConnectedSitesStore; fetchPage?: (url: string) => Promise<string | null> } = {}): Promise<ConnectedSite> {
  const store = deps.store ?? connectedSitesStore();
  const site = (await store.list(actor, businessId)).find(item => item.id === siteId && item.status === "active");
  if (!site) throw new WorkspaceConflictError("This connected site is no longer active here. Reload and try again.");
  if (site.verifiedAt) return site;
  let html: string | null = null;
  try { html = await (deps.fetchPage ?? (url => fetchPinnedPublicText(url, { timeoutMs: 8000, maxBytes: 2_000_000 })))(site.siteUrl); } catch { html = null; }
  if (html === null) throw new WorkspaceConflictError(`We couldn't open ${site.siteHost} just now. Check the site is published, then try again.`);
  return store.confirmVerification(actor, businessId, siteId, verificationProofs(html));
}

export async function resolvePublicSite(publicKey: string, store: ConnectedSitesStore = connectedSitesStore()): Promise<ResolvedConnectedSite | null> {
  if (!SITE_KEY_PATTERN.test(publicKey)) return null;
  return store.resolve(publicKey);
}

/** Confirmed business-record facts for the page, and schema.org built from them. */
export async function readPublicContext(publicKey: string, site: ResolvedConnectedSite, store: ConnectedSitesStore = connectedSitesStore()): Promise<PublicContext | null> {
  const raw = await store.context(publicKey);
  if (!raw) return null;
  const facts = publicFactsFromRecord({ facts: raw.facts, services: raw.services });
  return { revision: raw.revision, facts, jsonLd: raw.site.injectSchema ? businessJsonLd(facts, site.siteUrl) : null, site: raw.site };
}

const DAY_MS = 86_400_000;
export async function recordBeacon(publicKey: string, site: ResolvedConnectedSite, origin: string | null, raw: unknown, now = Date.now(), store: ConnectedSitesStore = connectedSitesStore()): Promise<number> {
  const batch = beaconBatchSchema.parse(raw);
  const events = batch.events.filter(event => (BEACON_EVENT_KINDS as readonly string[]).includes(event.kind)).map(event => ({
    kind: event.kind,
    // A browser clock is not evidence; keep it within a day of ours.
    occurredAt: new Date(Math.min(now + DAY_MS, Math.max(now - DAY_MS, event.at ?? now))).toISOString(),
    sessionId: batch.sid ?? null,
    pagePath: safePath(event.path),
    referrerHost: referrerHost(event.ref, site.allowedOrigins),
    target: event.target ? event.target.split(/[?#]/)[0]!.slice(0, 500) : null,
    dedupeKey: `${site.id.slice(0, 8)}:${event.id}`,
  }));
  return store.recordEvents(publicKey, normalizeOrigin(origin ?? "") , events);
}

export type InquiryOutcome = { status: "recorded" | "duplicate"; id: string } | { status: "held_as_spam" } | { status: "ignored" };

/**
 * One inquiry from the page. Honeypot hits are dropped; submissions scored as
 * spam are held in the spam pit for review; everything else goes into the
 * one lead store. Notification is best-effort and never loses the inquiry.
 */
export async function submitPublicInquiry(publicKey: string, site: ResolvedConnectedSite, origin: string | null, raw: unknown, deps: { now?: number; store?: ConnectedSitesStore; notify?: (input: { site: ResolvedConnectedSite; inquiry: Omit<ConnectedInquiry, "siteId" | "siteHost"> }) => Promise<void> } = {}): Promise<InquiryOutcome> {
  const store = deps.store ?? connectedSitesStore();
  const input = publicInquirySchema.parse(raw);
  if (input.capture === "site-form" && !site.captureForms) throw new ConnectedSiteInputError("This site does not send its own forms to Strelva.");
  const trap = input._hp || (input.capture === "strelva-form" ? input.fields.website || input.fields.company : "");
  if (trap) return { status: "ignored" };
  const contact = contactFromFields(input.fields);
  if (!contact.email && !contact.phone && !contact.message) throw new ConnectedSiteInputError("Add an email, phone number or message.");
  const capturedAt = new Date(deps.now ?? Date.now()).toISOString();
  const normalizedOrigin = normalizeOrigin(origin ?? "");
  const verdict = scoreLeadSpam({ businessName: contact.name, description: contact.message, email: contact.email });
  if (verdict.isSpam) {
    const payload = { name: contact.name, email: contact.email, phone: contact.phone, message: contact.message, path: safePath(input.path), capture: input.capture, signals: verdict.signals, score: verdict.score };
    await store.recordSpam(publicKey, normalizedOrigin, { recordId: `inq_${input.id}`, payload, payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), capturedAt });
    return { status: "held_as_spam" };
  }
  const fields: Record<string, string> = { ...input.fields, ...(contact.phone ? { phone: contact.phone } : {}), ...(safePath(input.path) ? { page: safePath(input.path)! } : {}) };
  const name = contact.name ?? contact.email ?? contact.phone ?? "Website visitor";
  const hash = createHash("sha256").update(JSON.stringify([name, contact.email, contact.message, fields]).toLowerCase()).digest("hex").slice(0, 16);
  const lead = { leadId: `lead_${input.id}`, submissionHash: hash, name: name.slice(0, 200), ...(contact.email ? { email: contact.email } : {}), ...(contact.message ? { message: contact.message } : {}), source: `connected-site:${input.capture}`, fields, capturedAt };
  const result = await store.recordInquiry(publicKey, normalizedOrigin, lead);
  if (result.status === "recorded" && deps.notify) {
    try { await deps.notify({ site, inquiry: { id: result.id, leadId: lead.leadId, name: lead.name, email: contact.email, message: contact.message, source: lead.source, capturedAt } }); }
    catch (error) { console.error("[connected-sites] inquiry notice failed", error instanceof Error ? error.message : error); }
  }
  return { status: result.status === "recorded" ? "recorded" : "duplicate", id: result.id };
}

/** The website System a connected site is: connected_site:<id>, the same id the projection derives. */
export function connectedSiteSystemId(site: Pick<ConnectedSite, "id" | "workspaceId">): string {
  return systemOriginId(site.workspaceId, { kind: "connected_site", ref: site.id });
}

/** A site as the workspace sees it: its install lines and the System it is. */
export function presentConnectedSite(site: ConnectedSite) {
  return { ...site, snippet: installSnippet(site), systemId: connectedSiteSystemId(site) };
}

export interface ConnectedSitesOverview {
  sites: Array<ReturnType<typeof presentConnectedSite> & { activity: Record<string, number> }>;
  inquiries: ConnectedInquiry[];
}

export async function readConnectedSites(actor: WorkspaceActor, businessId: string, store: ConnectedSitesStore = connectedSitesStore()): Promise<ConnectedSitesOverview> {
  const [sites, activity, inquiries] = await Promise.all([store.list(actor, businessId), store.activity(actor, businessId, 30), store.inquiries(actor, businessId, 50)]);
  return { sites: sites.map(site => ({ ...presentConnectedSite(site), activity: activity[site.id] ?? {} })), inquiries };
}
