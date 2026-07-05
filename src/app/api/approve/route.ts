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
 */
import { NextResponse } from "next/server";
import { verifyApproveToken, type ApproveLinkClaims } from "@/lib/approve-link";
import { resolveEventAction } from "@/lib/event-actions";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";

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
}): NextResponse {
  const secondary = params.dashboardUrl
    ? `<div style="margin-top:14px;"><a href="${escapeHtml(params.dashboardUrl)}" style="font-size:13px;color:${MUTED};text-decoration:underline;">Open your dashboard instead</a></div>`
    : "";
  const form = `<form method="POST" action="/api/approve" style="margin:22px 0 0;">
          <input type="hidden" name="token" value="${escapeHtml(params.token)}">
          <button type="submit" style="display:inline-block;padding:12px 26px;border:0;border-radius:999px;background:${ACCENT};color:#fff;font-weight:600;font-size:15px;cursor:pointer;">${escapeHtml(params.confirmLabel)}</button>
        </form>${secondary}`;
  return shell(200, headingBody(params.heading, params.body) + form);
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

/** GET only shows the confirm step — it must never mutate (scanners auto-fetch it). */
export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return noticePage({ status: 400, ...INVALID.missing });

  const claims = verifyApproveToken(token);
  if (!claims) return noticePage({ status: 400, ...INVALID.bad });

  const tenant = await getTenantConfig(claims.tenantId).catch(() => null);
  const businessName = tenant?.siteName || "your site";
  const dashboardUrl = tenant ? getTenantDashboardUrl(tenant, "/dashboard") : undefined;
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
export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  const rawToken = form?.get("token");
  const token = typeof rawToken === "string" ? rawToken : null;
  if (!token) return noticePage({ status: 400, ...INVALID.missing });

  const claims: ApproveLinkClaims | null = verifyApproveToken(token);
  if (!claims) return noticePage({ status: 400, ...INVALID.bad });

  const tenant = await getTenantConfig(claims.tenantId).catch(() => null);
  const businessName = tenant?.siteName || "your site";
  const dashboardUrl = tenant ? getTenantDashboardUrl(tenant, "/dashboard") : undefined;
  const workflowAction = claims.action === "approve" ? "approved" : "dismissed";

  let result: { changed: boolean; reason?: string };
  try {
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
