import { ModelBudgetPausedError, ModelBudgetUnavailableError } from "@/platform/infra/business-ai-budget";
import { actorCopy, actorPresentation } from "@/platform/presentation/actor";
import { resolveOwnerBrand, resolveTenantBrand } from "@/platform/agency-brand/server";
import { STRELVA_BRAND, type OwnerBrand } from "@/platform/infra/agency-brand";
import { brandXaPage, identifyXaPage, xaDecisionPageHtml, xaDoneInput, xaKeepWith, xaUndoable, xaYesLabel, type XaIdentity, type XaPageTone, type XaWeek } from "./xa-page";
import { getSupabase } from "@/platform/infra/db/client";
import { ownerNoticeUrl } from "@/lib/owner-notice-url";
/**
 * One-click approve-from-email (with a confirm step).
 *
 * The owner clicks "Approve" or "Not yet" in an approval-needed email. Each link
 * carries an HMAC-signed token binding {eventId, tenantId, action} + an expiry
 * (see `src/lib/approve-link.ts`). The link is a GET that only renders a
 * confirmation page; the actual resolve happens on the POST from its button,
 * through the SAME governance spine the dashboard uses (`resolveEventAction`):
 * approve → "approved" (which performs the external write, e.g. posting a review
 * reply), not-yet → "dismissed".
 *
 * A tenant or review link for a business with a workspace resolves through
 * that business's Needs you item (STRELVA_ONE_APPROVAL_PATH), so the decision
 * is recorded once; `resolveEventAction` is reached directly only for an
 * unconverted tenant, an item on another route, or with the flag off.
 *
 * Security:
 *  - The signed token and current database authority authorize converted reviews.
 *    The route is public (no session) so it works from an email client.
 *    Tampering the eventId/tenantId/action breaks the
 *    HMAC; an expired token is rejected. The action is bound into the signature,
 *    so an "approve" link can't be edited into a different event or tenant.
 *  - **GET never mutates.** Approving posts a review reply to Google (a
 *    non-idempotent external write), and email security scanners (SafeLinks,
 *    Mimecast, Proofpoint) + link prefetchers auto-fetch URLs in emails — so a
 *    scanner opening the link must NOT trigger the action. The GET only shows a
 *    Confirm button; the resolve runs on the POST, which a scanner won't issue.
 *  - Tenant scope is enforced twice: the token binds the tenantId, and
 *    resolveEventAction independently rejects a mismatch (`wrong_tenant`).
 *  - Idempotent: a re-submitted or replayed (unexpired) token hits an already-
 *    resolved event and renders a friendly "already handled" page, never a
 *    double action.
 *  - Old tenant links survive initial conversion only for review drafts whose
 *    original recipient remains trusted and has never accepted or transferred
 *    ownership. New converted review links bind recipient, workspace and a
 *    rotating authority version; workspace publishing keeps its own token.
 */
import { NextResponse } from "next/server";
import { APPROVE_LINK_TTL_MS, signWorkspaceApproveToken, verifyAnyApproveToken, type ApproveLinkClaims, type WorkspaceApproveLinkClaims } from "@/lib/approve-link";
import { resolveEventAction } from "@/lib/event-actions";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { ownerWebsitePreviewHref, ownerWebsitePreviewMayBeOn } from "@/app/api/owner-website-preview/links";
import { newsletterNotSentRefusal } from "@/lib/operator-decisions";
import { legacyOwnerLinkAllowed } from "@/lib/owner-recipient";
import { isManagedReviewApproval, readReviewApprovalAuthority, reviewApprovalTokenAllowed } from "@/lib/review-approval-authority";
import { oneApprovalPathEnabled } from "@/platform/needs-you/release";
import type { DecideResult } from "@/platform/needs-you/service";
import type { OwnerDecision } from "@/platform/needs-you/contracts";

export const dynamic = "force-dynamic";

function html(status: number, page: string): NextResponse {
  return new NextResponse(page, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Done, quiet or bad, read from the result itself. Bad news keeps Pebble in frame. */
function toneFor(status: number, heading: string): { tone: XaPageTone; statusLabel: string } {
  if (heading === "Approved") return { tone: "done", statusLabel: "Done" };
  if (heading === "Not yet" || heading === "Skipped") return { tone: "quiet", statusLabel: "Nothing changed" };
  if (heading === "Already handled") return { tone: "quiet", statusLabel: "Nothing to do" };
  if (status >= 400 || /could not|couldn|snag|checking|waiting on google|not sent|paused|too many|invalid|missing|isn't for|expired|changed since|sign in/i.test(heading)) return { tone: "bad", statusLabel: "Nothing went live from this link" };
  return { tone: "quiet", statusLabel: "Strelva" };
}

/** A terminal result/notice page (no action to take). */
function noticePage(params: {
  status: number;
  heading: string;
  body: string;
  by?: string;
  dashboardUrl?: string;
  buttonLabel?: string;
}): NextResponse {
  const { tone, statusLabel } = toneFor(params.status, params.heading);
  return html(params.status, xaDecisionPageHtml({
    status: params.status, tone, statusLabel, heading: params.heading, body: params.body, by: params.by,
    ...(params.dashboardUrl && params.buttonLabel ? { primary: { label: params.buttonLabel, url: params.dashboardUrl } } : {}),
  }));
}

/** The confirm step: a real human clicks the button, which POSTs back to resolve.
 *  A scanner/prefetcher that GETs the email link only ever sees this, never an action. */
function confirmPage(params: {
  token: string;
  heading: string;
  body: string;
  confirmLabel: string;
  by?: string;
  dashboardUrl?: string;
  previewUrl?: string;
  /** Every value the confirm applies, in full (Needs you sources with a review). */
  lines?: readonly string[];
  /** The visitor page the yes changes, when the source can draw it. */
  week?: XaWeek | null;
  /** The other answer on the same page, posting its own token ("Not now"). */
  decline?: { label: string; token: string } | null;
  /** A not-yet link: the decision is the text button, never the ink pill. */
  notYet?: boolean;
  foot?: string;
}): NextResponse {
  return html(200, xaDecisionPageHtml({
    status: 200, tone: "waits", statusLabel: "Waits for you", heading: params.heading, body: params.body, by: params.by,
    ...(params.week ? { week: params.week } : params.lines?.length ? { lines: params.lines } : {}),
    ...(params.previewUrl ? { preview: { url: params.previewUrl, label: "Review the complete website preview before deciding" } } : {}),
    ...(params.notYet ? { decline: { label: params.confirmLabel, token: params.token } } : { primary: { label: params.confirmLabel, token: params.token } }),
    ...(!params.notYet && params.decline ? { decline: params.decline } : {}),
    // With "Not now" on the page, the workspace stays one tap away in the email; three answers would crowd one yes.
    ...(params.dashboardUrl && (params.notYet || !params.decline) ? { secondary: { label: "Open your workspace instead", url: params.dashboardUrl } } : {}),
    ...(params.foot ? { foot: params.foot } : {}),
  }));
}

/**
 * The not-yet token for the same item, revision and recipient, expiring with
 * the link it came from, so "Not now" sits on the confirm page. Only ever
 * minted from an approve link: a not-yet link never grants a yes.
 */
function notYetSibling(token: string, claims: WorkspaceApproveLinkClaims): string | null {
  if (claims.action !== "approve") return null;
  try {
    const exp = Number((JSON.parse(Buffer.from(token.slice(0, token.indexOf(".")), "base64url").toString("utf8")) as { exp?: unknown }).exp);
    if (!Number.isFinite(exp) || exp <= Date.now()) return null;
    return signWorkspaceApproveToken({ ...claims, action: "not-yet" }, exp - APPROVE_LINK_TTL_MS);
  } catch { return null; }
}

/** The business a workspace link is for: the owner sees their business, not the platform. */
async function workspaceIdentity(workspaceId: string): Promise<XaIdentity | null> {
  try {
    const db = getSupabase();
    if (!db) return null;
    const { data } = await db.from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
    const name = (data as { name?: unknown } | null)?.name;
    return typeof name === "string" && name.trim() ? { name: name.trim() } : null;
  } catch { return null; }
}

/** Pebble says what changed and who changed it, once. */
function changedPage(item: OwnerDecision | null | undefined, dashboardUrl: string | undefined, buttonLabel = "Open"): NextResponse {
  const { name } = actorPresentation(item?.actor);
  return noticePage({ status: 200, heading: CHANGED.heading, body: `${name ? `${name} changed` : "Someone changed"} ${item?.title ? `\u201c${item.title.replace(/\?$/, "")}\u201d` : "it"} after this email went out. Open Strelva to see the new version.`, dashboardUrl, buttonLabel });
}

/** Who acted, in the owner's words; never a builder phrase when it wasn't recorded. */
function whoActed(actor: unknown): string {
  const { name, credit } = actorPresentation(actor);
  return name ? `${name}${credit ? ` · ${credit}` : ""}` : "Strelva didn't record who made this change.";
}

/** "Prepared by Maya at North Studio", when the source recorded who prepared it. */
function preparedBy(actor: unknown): string | undefined {
  const { name } = actorPresentation(actor);
  return name ? `${name} prepared this.` : undefined;
}

/** Google has not approved Strelva's Business Profile access yet: nothing failed, the reply is saved. */
function googleAccessPendingPage(businessName: string | null, dashboardUrl?: string): NextResponse {
  return noticePage({
    status: 200,
    heading: "Waiting on Google",
    body: `Your reply${businessName ? ` for ${businessName}` : ""} is saved and still waiting in your workspace. Google hasn't approved Strelva's Business Profile access yet, so nothing was posted. Once Google approves, approve it again from your workspace.`,
    dashboardUrl,
    buttonLabel: "Open your workspace",
  });
}

const INVALID = {
  missing: {
    heading: "This link is missing something",
    body: "This approval link looks incomplete. Open your workspace to review it there.",
  },
  bad: {
    heading: "This link is invalid or expired",
    body: "For your security, one-click approval links expire. Open your workspace to review this in the approval queue.",
  },
} as const;

// --- Workspace links (Needs you) -----------------------------------------------
// Same two steps. The token binds workspace, item, action, recipient and
// revision; the POST rechecks the item revision against its source and that
// the recipient is still the owner, then resolves through the source's own
// resolver. Access, money and exit never resolve from a link.

function workspaceOpenUrl(origin: string, workspaceId: string, href?: string | null): string {
  return `${origin.replace(/\/+$/, "")}${href ?? `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}`;
}

const MOVED = { heading: "Decide this in Strelva", body: "This business now decides in Strelva. Open your workspace to decide it there." };
const CHANGED = { heading: "This changed since we emailed you", body: "It changed after this email went out. Open Strelva to see the new version." };
const HANDLED = { heading: "Already handled", body: "This was already taken care of. Nothing more to do." };
const EXPIRED = { heading: "This link expired", body: "Open Strelva to see what's waiting." };

async function workspaceConfirm(token: string, claims: WorkspaceApproveLinkClaims): Promise<NextResponse> {
  const { needsYouAppOrigin, needsYouReleaseEnabled, needsYouStore, needsYouService } = await import("@/experience/workspace/needs-you-server");
  if (!needsYouReleaseEnabled()) return noticePage({ status: 400, ...INVALID.bad });
  const item = await needsYouStore.read(claims.workspaceId, claims.itemId).catch(() => null);
  if (!item) return noticePage({ status: 400, ...INVALID.bad });
  const open = workspaceOpenUrl(needsYouAppOrigin(), claims.workspaceId, item.openHref);
  if (item.state === "superseded" || item.revisionHash !== claims.revision) return changedPage(item, open);
  if (item.state !== "open") return noticePage({ status: 200, ...HANDLED, dashboardUrl: open, buttonLabel: "Open" });
  if (Date.parse(item.expiresAt) <= Date.now()) return noticePage({ status: 200, ...EXPIRED, dashboardUrl: open, buttonLabel: "Open" });
  if (item.signInRequired) return noticePage({ status: 200, heading: "Sign in to decide this", body: "Decisions about access, money or leaving Strelva need you signed in.", dashboardUrl: open, buttonLabel: "Sign in and open" });
  // A source whose detail can't hold every value shows the complete review
  // here, read for this exact revision; without it nothing is offered.
  const service = needsYouService();
  const lines = await service.review(item).catch(() => null);
  if (lines === null) return changedPage(item, open);
  const week = await service.reviewWeek?.(item).catch(() => null) ?? null;
  const isApprove = claims.action === "approve";
  const sibling = isApprove ? notYetSibling(token, claims) : null;
  const preparer = actorPresentation(item.actor).name ?? undefined;
  return confirmPage({
    token,
    heading: item.title,
    by: preparedBy(item.actor),
    body: `${process.env.STRELVA_INQUIRY_OWNER_NOTICES === "1" && (item.kind === "customer.message" || item.kind === "customer.commitment") && item.detail ? `${item.detail}\n\n` : ""}${actorCopy(isApprove ? item.approveEffect : item.notYetEffect, item.actor)}`,
    confirmLabel: isApprove ? xaYesLabel(item.kind, "approve") : xaKeepWith(preparer),
    notYet: !isApprove,
    decline: sibling ? { label: "Not now", token: sibling } : null,
    week,
    ...(isApprove && xaUndoable(item.kind) ? { foot: "Undo any time from Today." } : {}),
    dashboardUrl: open,
    ...(item.sourceLifecycle === "website_document" && ownerWebsitePreviewMayBeOn() ? { previewUrl: ownerWebsitePreviewHref(token) } : {}),
    ...(lines ? { lines } : {}),
  });
}

async function workspaceResolve(claims: WorkspaceApproveLinkClaims): Promise<NextResponse> {
  const { needsYouAppOrigin, needsYouReleaseEnabled, needsYouService, needsYouStore } = await import("@/experience/workspace/needs-you-server");
  if (!needsYouReleaseEnabled()) return noticePage({ status: 400, ...INVALID.bad });
  const origin = needsYouAppOrigin();
  const open = workspaceOpenUrl(origin, claims.workspaceId);
  let result;
  try {
    // Confirmed business facts carry on to native websites (#509).
    const { createConfirmedNativeFactsEffect } = await import("@/app/workspace/business-details/native-website-facts");
    result = await needsYouService(needsYouStore, { businessFactsConfirmed: createConfirmedNativeFactsEffect() }).decide({
      workspaceId: claims.workspaceId,
      itemId: claims.itemId,
      revision: claims.revision,
      decision: claims.action === "approve" ? "approve" : "not_yet",
      by: { kind: "owner_link", recipient: claims.recipient },
    });
  } catch (err) {
    console.error(`[api/approve] Needs you decision failed for ${claims.workspaceId}/${claims.itemId}:`, err);
    return noticePage({ status: 200, heading: "Strelva is checking the outcome", body: "The change may have gone through, but we couldn't record its final result. Strelva needs to check it before anyone tries again.", dashboardUrl: open, buttonLabel: "Open" });
  }
  return decisionPage(result, origin, claims.workspaceId, claims.action === "approve");
}

/** The page for a Needs you decision result, shared by workspace links and legacy tenant links. */
function decisionPage(result: DecideResult, origin: string, workspaceId: string, isApprove: boolean): NextResponse {
  const open = workspaceOpenUrl(origin, workspaceId);
  const openItem = workspaceOpenUrl(origin, workspaceId, result.item?.openHref);
  switch (result.status) {
    case "done":
    case "done_unverified": {
      if (!isApprove) {
        const preparer = actorPresentation(result.item?.actor).name;
        return noticePage({ status: 200, heading: preparer ? `It stays with ${preparer}` : "Not yet", body: "Nothing changed. It waits in Strelva when you want it.", dashboardUrl: openItem, buttonLabel: "Open" });
      }
      const receipt = result.receipt;
      const { name, credit } = actorPresentation(receipt?.actor ?? result.item?.actor);
      const who = receipt?.sentence ?? (name ? `${name} prepared it` : undefined);
      const done = xaDoneInput({
        changed: receipt?.changed ?? null,
        verified: result.status === "done" && receipt?.evidence?.readBack === "verified",
        who: who && credit ? `${who.replace(/\.$/, "")} \u00b7 ${credit}` : who,
        seeUrl: openItem,
        undoUrl: receipt?.undo?.state === "undo" ? openItem : null,
      });
      return html(200, xaDecisionPageHtml(done));
    }
    case "already_handled":
      return noticePage({ status: 200, ...HANDLED, dashboardUrl: openItem, buttonLabel: "Open" });
    case "changed":
      return changedPage(result.item, openItem);
    case "expired":
      return noticePage({ status: 200, ...EXPIRED, dashboardUrl: openItem, buttonLabel: "Open" });
    case "sign_in":
      return noticePage({ status: 200, heading: "Sign in to decide this", body: "This one needs you signed in.", dashboardUrl: openItem, buttonLabel: "Sign in and open" });
    case "not_owner":
    case "forbidden":
      return noticePage({ status: 403, heading: "This link isn't for this account", body: "Open your workspace to see it there.", dashboardUrl: open, buttonLabel: "Open" });
    case "not_found":
      return noticePage({ status: 400, ...INVALID.bad });
    case "failed": {
      if (result.item?.outcomeReason === "google_access_pending") return googleAccessPendingPage(null, openItem);
      const notSent = newsletterNotSentRefusal(result.item?.outcomeReason ?? undefined);
      if (notSent) return noticePage({ status: 200, heading: "Not sent", body: notSent.error, dashboardUrl: openItem, buttonLabel: "Open your workspace" });
      return noticePage({ status: 200, heading: "Could not finish this", body: "Open the item to check its status.", dashboardUrl: openItem, buttonLabel: "Open" });
    }
    default:
      return noticePage({ status: 200, heading: "Could not finish this", body: "Open the item to check its status.", dashboardUrl: openItem, buttonLabel: "Open" });
  }
}

/**
 * The Needs you item a tenant or review link stands for, when this business
 * decides through Needs you (STRELVA_ONE_APPROVAL_PATH). Null keeps the legacy
 * resolver: flag off, a tenant with no business yet, no trusted recipient, or
 * an item on another route (the operator's, for example).
 */
async function linkedNeedsYouItem(claims: ApproveLinkClaims, recipient: string | null): Promise<{ workspaceId: string; item: OwnerDecision; recipient: string } | null> {
  if (!oneApprovalPathEnabled()) return null;
  try {
    const { releaseWorkspaceForTenant } = await import("@/platform/release-flags/store");
    const workspaceId = await releaseWorkspaceForTenant(claims.tenantId);
    if (!workspaceId) return null;
    const owner = recipient ?? (await readReviewApprovalAuthority(claims.tenantId))?.recipient ?? null;
    if (!owner) return null;
    const { needsYouService } = await import("@/experience/workspace/needs-you-server");
    const item = await needsYouService().openForSource(workspaceId, "tenant_event", `${claims.tenantId}:${claims.eventId}`);
    return item && item.state === "open" && item.route === "owner_decides" ? { workspaceId, item, recipient: owner } : null;
  } catch (err) {
    console.error(`[api/approve] Needs you lookup failed for ${claims.tenantId}/${claims.eventId}; using the direct resolver:`, err);
    return null;
  }
}

/** POST for a linked item: the decision is recorded by Needs you, with this link's token kept as the review authorization. */
async function decideLinked(token: string, claims: ApproveLinkClaims, linked: { workspaceId: string; item: OwnerDecision; recipient: string }): Promise<NextResponse> {
  const { needsYouAppOrigin, needsYouService, needsYouStore } = await import("@/experience/workspace/needs-you-server");
  const open = workspaceOpenUrl(needsYouAppOrigin(), linked.workspaceId);
  try {
    const { createConfirmedNativeFactsEffect } = await import("@/app/workspace/business-details/native-website-facts");
    const result = await needsYouService(needsYouStore, { businessFactsConfirmed: createConfirmedNativeFactsEffect() }).decide({
      workspaceId: linked.workspaceId,
      itemId: linked.item.id,
      revision: linked.item.revisionHash,
      decision: claims.action === "approve" ? "approve" : "not_yet",
      by: { kind: "owner_link", recipient: linked.recipient, legacyToken: token },
    });
    return decisionPage(result, needsYouAppOrigin(), linked.workspaceId, claims.action === "approve");
  } catch (err) {
    if (err instanceof ModelBudgetPausedError || err instanceof ModelBudgetUnavailableError) {
      return noticePage({ status: 200, heading: "Building is paused", body: err.message, dashboardUrl: open, buttonLabel: "Open your workspace" });
    }
    console.error(`[api/approve] Needs you decision failed for ${linked.workspaceId}/${linked.item.id}:`, err);
    return noticePage({ status: 200, heading: "Strelva is checking the outcome", body: "The change may have gone through, but we couldn't record its final result. Strelva needs to check it before anyone tries again.", dashboardUrl: open, buttonLabel: "Open" });
  }
}

/** GET only shows the confirm step — it must never mutate (scanners auto-fetch it). */
async function getPage(request: Request): Promise<NextResponse> {
  if (await isRateLimitedAsync(rateLimitKey(request, "approve"), 20)) {
    return noticePage({ status: 429, heading: "Too many requests", body: "Please try again in a moment." });
  }

  const token = new URL(request.url).searchParams.get("token");
  if (!token) return noticePage({ status: 400, ...INVALID.missing });

  const verified = verifyAnyApproveToken(token);
  if (!verified) return noticePage({ status: 400, ...INVALID.bad });
  if (verified.kind === "workspace") return brandPage(await workspaceConfirm(token, verified.claims), await resolveOwnerBrand(verified.claims.workspaceId).catch(() => STRELVA_BRAND));
  const claims = verified.claims;

  const tenant = await getTenantConfig(claims.tenantId).catch(() => null);
  const businessName = tenant?.siteName || "your site";
  const dashboardUrl = tenant ? await ownerNoticeUrl(tenant, "/dashboard", getTenantDashboardUrl(tenant, "/dashboard")) : undefined;
  if (!await reviewApprovalTokenAllowed(token, { id: claims.tenantId, ownerEmail: tenant?.ownerEmail })) {
    return noticePage({ status: 403, ...MOVED, dashboardUrl, buttonLabel: "Open your workspace" });
  }
  const reviewOnly = verified.kind === "review" || !await legacyOwnerLinkAllowed({ id: claims.tenantId, ownerEmail: tenant?.ownerEmail });
  if (reviewOnly) {
    const event = await (await import("@/lib/events")).getEventRaw(claims.eventId).catch(() => null);
    if (!event || !isManagedReviewApproval(event, claims.tenantId)) return noticePage({ status: 403, ...MOVED, dashboardUrl });
  }
  const isApprove = claims.action === "approve";

  const linked = await linkedNeedsYouItem(claims, verified.kind === "review" ? verified.claims.recipient : null);
  if (linked) {
    const { needsYouService } = await import("@/experience/workspace/needs-you-server");
    const { item } = linked;
    const lines = await needsYouService().review(item).catch(() => null);
    if (lines === null) return changedPage(item, dashboardUrl, "Open your workspace");
    return confirmPage({
      token,
      heading: item.title,
      by: preparedBy(item.actor),
      body: actorCopy(isApprove ? item.approveEffect : item.notYetEffect, item.actor),
      confirmLabel: isApprove ? xaYesLabel(item.kind, "approve") : xaKeepWith(actorPresentation(item.actor).name ?? undefined),
      notYet: !isApprove,
      ...(isApprove && xaUndoable(item.kind) ? { foot: "Undo any time from Today." } : {}),
      dashboardUrl,
      ...(lines ? { lines } : {}),
    });
  }

  return confirmPage({
    token,
    heading: isApprove ? "Approve this reply?" : "Skip this reply?",
    body: isApprove
      ? `We'll post the drafted reply for ${businessName}. Nothing goes live until you press Post this reply.`
      : `We won't post the drafted reply for ${businessName}. Nothing is posted.`,
    confirmLabel: isApprove ? "Post this reply" : "Skip this reply",
    dashboardUrl,
  });
}

/** POST is the real resolve — only reachable from the confirm button, so an email
 *  scanner (which GETs, never POSTs) can't trigger the external write. */
async function postPage(request: Request): Promise<NextResponse> {
  if (await isRateLimitedAsync(rateLimitKey(request, "approve"), 20)) {
    return noticePage({ status: 429, heading: "Too many requests", body: "Please try again in a moment." });
  }

  const form = await request.formData().catch(() => null);
  const rawToken = form?.get("token");
  const token = typeof rawToken === "string" ? rawToken : null;
  if (!token) return noticePage({ status: 400, ...INVALID.missing });

  const verified = verifyAnyApproveToken(token);
  if (!verified) return noticePage({ status: 400, ...INVALID.bad });
  if (verified.kind === "workspace") return brandPage(await workspaceResolve(verified.claims), await resolveOwnerBrand(verified.claims.workspaceId).catch(() => STRELVA_BRAND));
  const claims: ApproveLinkClaims = verified.claims;

  const tenant = await getTenantConfig(claims.tenantId).catch(() => null);
  const businessName = tenant?.siteName || "your site";
  const dashboardUrl = tenant ? await ownerNoticeUrl(tenant, "/dashboard", getTenantDashboardUrl(tenant, "/dashboard")) : undefined;
  const workflowAction = claims.action === "approve" ? "approved" : "dismissed";
  if (!await reviewApprovalTokenAllowed(token, { id: claims.tenantId, ownerEmail: tenant?.ownerEmail })) {
    return noticePage({ status: 403, ...MOVED, dashboardUrl, buttonLabel: "Open your workspace" });
  }

  let result: { changed: boolean; reason?: string };
  let receiptEvent: Awaited<ReturnType<typeof import("@/lib/events").getEventRaw>> = null;
  try {
    // Tenant links predate recipient-bound workspace decisions. Keep those
    // live emails working; new workspace publishing requires the ws2 link.
    const { getEventRaw } = await import("@/lib/events");
    const event = await getEventRaw(claims.eventId);
    const reviewOnly = verified.kind === "review" || !await legacyOwnerLinkAllowed({ id: claims.tenantId, ownerEmail: tenant?.ownerEmail });
    if (reviewOnly && (!event || !isManagedReviewApproval(event, claims.tenantId))) {
      return noticePage({ status: 403, ...MOVED, dashboardUrl });
    }
    if (event && ["workspace_collection_publish", "workspace_newsletter_issue", "workspace_google_listing_draft"].includes(String(event.metadata?.kind))) {
      return noticePage({ status: 403, heading: "Use the current approval link", body: "Open this item in Needs you, or use the recipient-bound approval link Strelva prepared for it." });
    }
    const linked = await linkedNeedsYouItem(claims, verified.kind === "review" ? verified.claims.recipient : null);
    if (linked) return decideLinked(token, claims, linked);
    // Every review carries authorization, even if the route observed an
    // unconverted tenant: conversion may commit before the provider call.
    result = reviewOnly || (event && isManagedReviewApproval(event, claims.tenantId))
      ? await resolveEventAction(claims.tenantId, claims.eventId, workflowAction, "user", { reviewApprovalToken: token })
      : await resolveEventAction(claims.tenantId, claims.eventId, workflowAction);
    // An accepted action is never replayed if its presentation read fails.
    if (result.changed && claims.action === "approve") receiptEvent = await getEventRaw(claims.eventId).catch(() => null);
  } catch (err) {
    if (err instanceof ModelBudgetPausedError || err instanceof ModelBudgetUnavailableError) {
      return noticePage({ status: 200, heading: "Building is paused", body: err.message, dashboardUrl, buttonLabel: "Open your workspace" });
    }
    console.error(`[api/approve] resolveEventAction threw for ${claims.tenantId}/${claims.eventId}:`, err);
    return noticePage({
      status: 200,
      heading: "We hit a snag",
      body: "We couldn't complete that just now. Open your workspace to finish it there.",
      dashboardUrl,
      buttonLabel: "Open your workspace",
    });
  }

  if (result.changed) {
    return claims.action === "approve"
      ? noticePage({
          status: 200,
          heading: "Approved",
          by: whoActed(receiptEvent?.tenantId === claims.tenantId ? receiptEvent.metadata?.actor : null),
          body: receiptEvent?.tenantId === claims.tenantId
            ? `${actorCopy(receiptEvent.title, receiptEvent.metadata?.actor)}\nFor ${businessName}. ${result.reason === "accepted_unverified" ? "Accepted. Confirmation is still pending." : "Completion recorded. Live confirmation is not recorded here."}`
            : `Decision recorded for ${businessName}. The change receipt is unavailable here.`,
          dashboardUrl,
          buttonLabel: "Open your workspace",
        })
      : noticePage({
          status: 200,
          heading: "Skipped",
          body: `We won't post that reply for ${businessName}. You can always reply yourself in your workspace.`,
          dashboardUrl,
          buttonLabel: "Open your workspace",
        });
  }

  // Not changed. `already_resolved` / `not_found` (the event may have TTL'd out
  // after being handled) are the idempotent, expected outcomes.
  if (result.reason === "already_resolved" || result.reason === "not_found") {
    return noticePage({
      status: 200,
      heading: "Already handled",
      body: `This was already taken care of for ${businessName}. Nothing more to do. Open your workspace to see the latest.`,
      dashboardUrl,
      buttonLabel: "Open your workspace",
    });
  }

  if (result.reason === "wrong_tenant") {
    return noticePage({
      status: 403,
      heading: "This link isn't for this account",
      body: "This approval link doesn't match your account. Open your workspace to review it there.",
      dashboardUrl,
      buttonLabel: "Open your workspace",
    });
  }

  if (result.reason === "google_access_pending") return googleAccessPendingPage(businessName, dashboardUrl);

  // A newsletter that was approved but not sent stays pending: say so plainly.
  const notSent = newsletterNotSentRefusal(result.reason);
  if (notSent) {
    return noticePage({
      status: 200,
      heading: "Not sent",
      body: `${notSent.error} (${businessName})`,
      dashboardUrl,
      buttonLabel: "Open your workspace",
    });
  }

  // Any other reason (e.g. the external publish failed) — keep it honest: the
  // item is still pending, point them to the dashboard.
  return noticePage({
    status: 200,
    heading: "We couldn't finish that",
    body: `We couldn't complete this for ${businessName} automatically. Open your workspace to finish it there.`,
    dashboardUrl,
    buttonLabel: "Open your workspace",
  });
}

async function brandPage(response: NextResponse, brand: OwnerBrand): Promise<NextResponse> {
  if (!brand.agencyId) return response;
  return new NextResponse(brandXaPage(await response.text(), brand), { status: response.status, headers: response.headers });
}
/** The business heads every page a valid link reaches; a broken link names no one. */
async function identifyPage(response: NextResponse, verified: ReturnType<typeof verifyAnyApproveToken>): Promise<NextResponse> {
  if (!verified) return response;
  const identity = verified.kind === "workspace"
    ? await workspaceIdentity(verified.claims.workspaceId)
    : await getTenantConfig(verified.claims.tenantId).then(t => t?.siteName?.trim() ? { name: t.siteName.trim() } : null).catch(() => null);
  if (!identity) return response;
  return new NextResponse(identifyXaPage(await response.text(), identity), { status: response.status, headers: response.headers });
}
export async function GET(request: Request): Promise<NextResponse> {
  const response = await getPage(request);
  const token = new URL(request.url).searchParams.get("token");
  const verified = token ? verifyAnyApproveToken(token) : null;
  const branded = verified?.kind === "tenant" ? await brandPage(response, await resolveTenantBrand(verified.claims.tenantId).catch(() => STRELVA_BRAND)) : response;
  return identifyPage(branded, verified);
}
export async function POST(request: Request): Promise<NextResponse> {
  const copy = request.clone();
  const response = await postPage(request);
  const token = (await copy.formData().catch(() => null))?.get("token");
  const verified = typeof token === "string" ? verifyAnyApproveToken(token) : null;
  const branded = verified?.kind === "tenant" ? await brandPage(response, await resolveTenantBrand(verified.claims.tenantId).catch(() => STRELVA_BRAND)) : response;
  return identifyPage(branded, verified);
}
