import { resolveOwnerBrand, resolveTenantBrand } from "@/platform/agency-brand/server";
import { brandColors, BRAND_CREDIT, STRELVA_BRAND, type OwnerBrand } from "@/platform/infra/agency-brand";
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
 * Security:
 *  - The token is the ONLY authorization — the route is public (no session) so it
 *    works from an email client. Tampering the eventId/tenantId/action breaks the
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
 *  - A tenant link binds no recipient, so it decides only for a site with no
 *    business. Once the site is converted, its owner decides in Strelva, where
 *    links go only to the trusted owner address (#524); an old tenant link,
 *    or one sent to an address an operator edited, does nothing.
 */
import { NextResponse } from "next/server";
import { verifyAnyApproveToken, type ApproveLinkClaims, type WorkspaceApproveLinkClaims } from "@/lib/approve-link";
import { resolveEventAction } from "@/lib/event-actions";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { ownerWebsitePreviewHref, ownerWebsitePreviewMayBeOn } from "@/app/api/owner-website-preview/links";
import { legacyOwnerLinkAllowed } from "@/lib/owner-recipient";

export const dynamic = "force-dynamic";

const PAGE_BG = "#f3f4f5";
const CARD = "#ffffff";
const ACCENT = "#447a4f";
const INK = "#14181c";
const MUTED = "#565d64";
const HAIRLINE = "#e6e7e9";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(status: number, inner: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strelva</title></head>
<body style="margin:0;background:${PAGE_BG};font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${CARD};border:1px solid ${HAIRLINE};border-radius:14px;">
      <tr><td style="padding:40px 36px;text-align:center;">${inner}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function headingBody(heading: string, body: string): string {
  return `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:${INK};font-weight:700;">${escapeHtml(heading)}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(body)}</p>`;
}

function linkButton(dashboardUrl?: string, label?: string): string {
  if (!dashboardUrl || !label) return "";
  return `<a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;margin-top:22px;padding:12px 26px;border-radius:999px;background:${ACCENT};color:#fff;font-weight:600;font-size:15px;text-decoration:none;">${escapeHtml(label)}</a>`;
}

/** A terminal result/notice page (no action to take). */
function noticePage(params: {
  status: number;
  heading: string;
  body: string;
  dashboardUrl?: string;
  buttonLabel?: string;
}): NextResponse {
  return shell(
    params.status,
    headingBody(params.heading, params.body) + linkButton(params.dashboardUrl, params.buttonLabel),
  );
}

/** The confirm step: a real human clicks the button, which POSTs back to resolve.
 *  A scanner/prefetcher that GETs the email link only ever sees this — no action. */
function confirmPage(params: {
  token: string;
  heading: string;
  body: string;
  confirmLabel: string;
  dashboardUrl?: string;
  previewUrl?: string;
  /** Every value the confirm applies, in full (Needs you sources with a review). */
  lines?: readonly string[];
}): NextResponse {
  const review = params.lines?.length
    ? `<ul style="margin:22px 0 0;padding:0 0 0 18px;text-align:left;font-size:14px;line-height:1.55;color:${INK};">${params.lines
      .map(line => `<li style="margin:0 0 8px;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(line)}</li>`).join("")}</ul>`
    : "";
  const secondary = params.dashboardUrl
    ? `<div style="margin-top:14px;"><a href="${escapeHtml(params.dashboardUrl)}" style="font-size:13px;color:${MUTED};text-decoration:underline;">Open your dashboard instead</a></div>`
    : "";
  const form = `<form method="POST" action="/api/approve" style="margin:22px 0 0;">
          <input type="hidden" name="token" value="${escapeHtml(params.token)}">
          <button type="submit" style="display:inline-block;padding:12px 26px;border:0;border-radius:999px;background:${ACCENT};color:#fff;font-weight:600;font-size:15px;cursor:pointer;">${escapeHtml(params.confirmLabel)}</button>
        </form>${secondary}`;
  const preview = params.previewUrl
    ? `<p style="margin-top:22px;"><a href="${escapeHtml(params.previewUrl)}" style="color:${INK};text-decoration:underline;">Review the complete website preview before deciding</a></p>`
    : "";
  return shell(200, headingBody(params.heading, params.body) + preview + review + form);
}

const INVALID = {
  missing: {
    heading: "This link is missing something",
    body: "This approval link looks incomplete. Open your dashboard to review it there.",
  },
  bad: {
    heading: "This link is invalid or expired",
    body: "For your security, one-click approval links expire. Open your dashboard to review this in the approval queue.",
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

const MOVED = { heading: "Decide this in Strelva", body: "This business now decides in Strelva. Nothing was done. Open your dashboard to decide it there." };
const CHANGED = { heading: "This changed since we emailed you", body: "Nothing was done. Open Strelva to see the latest version and decide there." };
const HANDLED = { heading: "Already handled", body: "This was already taken care of. Nothing more to do." };
const EXPIRED = { heading: "This link expired", body: "Nothing was done. Open Strelva to see what's waiting." };

async function workspaceConfirm(token: string, claims: WorkspaceApproveLinkClaims): Promise<NextResponse> {
  const { needsYouAppOrigin, needsYouReleaseEnabled, needsYouStore, needsYouService } = await import("@/experience/workspace/needs-you-server");
  if (!needsYouReleaseEnabled()) return noticePage({ status: 400, ...INVALID.bad });
  const item = await needsYouStore.read(claims.workspaceId, claims.itemId).catch(() => null);
  if (!item) return noticePage({ status: 400, ...INVALID.bad });
  const open = workspaceOpenUrl(needsYouAppOrigin(), claims.workspaceId, item.openHref);
  if (item.state === "superseded" || item.revisionHash !== claims.revision) return noticePage({ status: 200, ...CHANGED, dashboardUrl: open, buttonLabel: "Open" });
  if (item.state !== "open") return noticePage({ status: 200, ...HANDLED, dashboardUrl: open, buttonLabel: "Open" });
  if (Date.parse(item.expiresAt) <= Date.now()) return noticePage({ status: 200, ...EXPIRED, dashboardUrl: open, buttonLabel: "Open" });
  if (item.signInRequired) return noticePage({ status: 200, heading: "Sign in to decide this", body: "Decisions about access, money or leaving Strelva need you signed in. Nothing was done.", dashboardUrl: open, buttonLabel: "Sign in and open" });
  // A source whose detail can't hold every value shows the complete review
  // here, read for this exact revision; without it nothing is offered.
  const lines = await needsYouService().review(item).catch(() => null);
  if (lines === null) return noticePage({ status: 200, ...CHANGED, dashboardUrl: open, buttonLabel: "Open" });
  const isApprove = claims.action === "approve";
  return confirmPage({
    token,
    heading: isApprove ? `Approve: ${item.title}` : `Not yet: ${item.title}`,
    body: `${process.env.STRELVA_INQUIRY_OWNER_NOTICES === "1" && (item.kind === "customer.message" || item.kind === "customer.commitment") && item.detail ? `${item.detail}\n\n` : ""}${isApprove ? item.approveEffect : item.notYetEffect} Nothing happens until you confirm.`,
    confirmLabel: isApprove ? "Confirm — approve" : "Confirm — not yet",
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
  const openItem = workspaceOpenUrl(origin, claims.workspaceId, result.item?.openHref);
  switch (result.status) {
    case "done":
    case "done_unverified":
      return claims.action === "approve"
        ? noticePage({ status: 200, heading: "Approved", body: result.status === "done" ? "Done. Strelva has it from here." : "Done. Strelva is confirming it went through.", dashboardUrl: openItem, buttonLabel: "Open" })
        : noticePage({ status: 200, heading: "Not yet", body: "Nothing was done. It's still in Strelva when you want it.", dashboardUrl: openItem, buttonLabel: "Open" });
    case "already_handled":
      return noticePage({ status: 200, ...HANDLED, dashboardUrl: openItem, buttonLabel: "Open" });
    case "changed":
      return noticePage({ status: 200, ...CHANGED, dashboardUrl: openItem, buttonLabel: "Open" });
    case "expired":
      return noticePage({ status: 200, ...EXPIRED, dashboardUrl: openItem, buttonLabel: "Open" });
    case "sign_in":
      return noticePage({ status: 200, heading: "Sign in to decide this", body: "This one needs you signed in. Nothing was done.", dashboardUrl: openItem, buttonLabel: "Sign in and open" });
    case "not_owner":
    case "forbidden":
      return noticePage({ status: 403, heading: "This link isn't for this account", body: "Nothing was done.", dashboardUrl: open, buttonLabel: "Open" });
    case "not_found":
      return noticePage({ status: 400, ...INVALID.bad });
    default:
      return noticePage({ status: 200, heading: "Strelva couldn't finish this", body: "We're on it. Nothing else is needed from you right now.", dashboardUrl: openItem, buttonLabel: "Open" });
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
  if (!await legacyOwnerLinkAllowed({ id: claims.tenantId, ownerEmail: tenant?.ownerEmail })) {
    return noticePage({ status: 403, ...MOVED, dashboardUrl, buttonLabel: "Open your dashboard" });
  }
  const isApprove = claims.action === "approve";

  return confirmPage({
    token,
    heading: isApprove ? "Approve this reply?" : "Skip this reply?",
    body: isApprove
      ? `We'll post the drafted reply for ${businessName}. Tap confirm to publish it — nothing goes live until you do.`
      : `We won't post the drafted reply for ${businessName}. Tap confirm to skip it.`,
    confirmLabel: isApprove ? "Confirm — approve" : "Confirm — skip",
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
  if (!await legacyOwnerLinkAllowed({ id: claims.tenantId, ownerEmail: tenant?.ownerEmail })) {
    return noticePage({ status: 403, ...MOVED, dashboardUrl, buttonLabel: "Open your dashboard" });
  }

  let result: { changed: boolean; reason?: string };
  try {
    // Tenant links predate recipient-bound workspace decisions. Keep those
    // live emails working; new workspace publishing requires the ws2 link.
    const { getEventRaw } = await import("@/lib/events");
    const event = await getEventRaw(claims.eventId);
    if (event && ["workspace_collection_publish", "workspace_newsletter_issue", "workspace_google_listing_draft"].includes(String(event.metadata?.kind))) {
      return noticePage({ status: 403, heading: "Use the current approval link", body: "Open this item in Needs you, or use the recipient-bound approval link Strelva prepared for it." });
    }
    result = await resolveEventAction(claims.tenantId, claims.eventId, workflowAction);
  } catch (err) {
    console.error(`[api/approve] resolveEventAction threw for ${claims.tenantId}/${claims.eventId}:`, err);
    return noticePage({
      status: 200,
      heading: "We hit a snag",
      body: "We couldn't complete that just now. Open your dashboard to finish it there.",
      dashboardUrl,
      buttonLabel: "Open your dashboard",
    });
  }

  if (result.changed) {
    return claims.action === "approve"
      ? noticePage({
          status: 200,
          heading: "Approved",
          body: `Done — your reply is being posted for ${businessName}. You can see it in your dashboard.`,
          dashboardUrl,
          buttonLabel: "Open your dashboard",
        })
      : noticePage({
          status: 200,
          heading: "Skipped",
          body: `No problem — we won't post that reply for ${businessName}. You can always reply yourself in your dashboard.`,
          dashboardUrl,
          buttonLabel: "Open your dashboard",
        });
  }

  // Not changed. `already_resolved` / `not_found` (the event may have TTL'd out
  // after being handled) are the idempotent, expected outcomes.
  if (result.reason === "already_resolved" || result.reason === "not_found") {
    return noticePage({
      status: 200,
      heading: "Already handled",
      body: `This was already taken care of for ${businessName} — nothing more to do. Open your dashboard to see the latest.`,
      dashboardUrl,
      buttonLabel: "Open your dashboard",
    });
  }

  if (result.reason === "wrong_tenant") {
    return noticePage({
      status: 403,
      heading: "This link isn't for this account",
      body: "This approval link doesn't match your account. Open your dashboard to review it there.",
      dashboardUrl,
      buttonLabel: "Open your dashboard",
    });
  }

  // Any other reason (e.g. the external publish failed) — keep it honest: the
  // item is still pending, point them to the dashboard.
  return noticePage({
    status: 200,
    heading: "We couldn't finish that",
    body: `We couldn't complete this for ${businessName} automatically. Open your dashboard to finish it there.`,
    dashboardUrl,
    buttonLabel: "Open your dashboard",
  });
}

async function brandPage(response: NextResponse, brand: OwnerBrand): Promise<NextResponse> {
  if (!brand.agencyId) return response;
  const colors = brandColors(brand.accentColor);
  const image = brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="" width="132" style="max-height:64px;object-fit:contain;">` : "";
  const identity = `<div style="margin-bottom:24px;">${image}<p style="color:${INK};font-weight:600;overflow-wrap:anywhere;">${escapeHtml(brand.name)}</p><small style="color:${MUTED};">${BRAND_CREDIT}</small>${brand.replyTo ? `<p><a href="mailto:${escapeHtml(brand.replyTo)}" style="color:${MUTED};">Contact ${escapeHtml(brand.name)}</a></p>` : ""}</div>`;
  const html = (await response.text()).replace('padding:40px 36px;text-align:center;">', `padding:40px 36px;text-align:center;">${identity}`).replaceAll(`background:${ACCENT};color:#fff`, `background:${colors.accent};color:${colors.onAccent}`);
  return new NextResponse(html, { status: response.status, headers: response.headers });
}
export async function GET(request: Request): Promise<NextResponse> {
  const response = await getPage(request);
  const token = new URL(request.url).searchParams.get("token");
  const verified = token ? verifyAnyApproveToken(token) : null;
  return verified?.kind === "tenant" ? brandPage(response, await resolveTenantBrand(verified.claims.tenantId).catch(() => STRELVA_BRAND)) : response;
}
export async function POST(request: Request): Promise<NextResponse> {
  const copy = request.clone();
  const response = await postPage(request);
  const token = (await copy.formData().catch(() => null))?.get("token");
  const verified = typeof token === "string" ? verifyAnyApproveToken(token) : null;
  return verified?.kind === "tenant" ? brandPage(response, await resolveTenantBrand(verified.claims.tenantId).catch(() => STRELVA_BRAND)) : response;
}
