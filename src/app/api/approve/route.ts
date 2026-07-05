/**
 * One-click approve-from-email.
 *
 * The owner clicks "Approve" or "Not yet" in an approval-needed email. Each link
 * carries an HMAC-signed token binding {eventId, tenantId, action} + an expiry
 * (see `src/lib/approve-link.ts`). This route verifies the token and resolves the
 * pending event through the SAME governance spine the dashboard uses
 * (`resolveEventAction`): approve → "approved" (which performs the external write,
 * e.g. posting a review reply), not-yet → "dismissed".
 *
 * Security:
 *  - The token is the ONLY authorization — the route is public (no session) so it
 *    works from an email client. Tampering the eventId/tenantId/action breaks the
 *    HMAC; an expired token is rejected. The action is bound into the signature,
 *    so an "approve" link can't be edited into a different event or tenant.
 *  - Tenant scope is enforced twice: the token binds the tenantId, and
 *    resolveEventAction independently rejects a mismatch (`wrong_tenant`).
 *  - Idempotent: a re-clicked or replayed (unexpired) link hits an already-resolved
 *    event and renders a friendly "already handled" page, never a double action.
 */
import { NextResponse } from "next/server";
import { verifyApproveToken } from "@/lib/approve-link";
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Small on-brand confirmation page (light card, single sage accent). */
function page(params: {
  status: number;
  heading: string;
  body: string;
  dashboardUrl?: string;
  buttonLabel?: string;
}): NextResponse {
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const button =
    params.dashboardUrl && params.buttonLabel
      ? `<a href="${escapeHtml(params.dashboardUrl)}" style="display:inline-block;margin-top:22px;padding:12px 26px;border-radius:999px;background:${ACCENT};color:#fff;font-weight:600;font-size:15px;text-decoration:none;">${escapeHtml(params.buttonLabel)}</a>`
      : "";
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strelva</title></head>
<body style="margin:0;background:${PAGE_BG};font-family:${font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${CARD};border:1px solid ${HAIRLINE};border-radius:14px;">
      <tr><td style="padding:40px 36px;text-align:center;">
        <h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:${INK};font-weight:700;">${escapeHtml(params.heading)}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(params.body)}</p>
        ${button}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return new NextResponse(html, {
    status: params.status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return page({
      status: 400,
      heading: "This link is missing something",
      body: "This approval link looks incomplete. Open your dashboard to review it there.",
    });
  }

  const claims = verifyApproveToken(token);
  if (!claims) {
    return page({
      status: 400,
      heading: "This link is invalid or expired",
      body: "For your security, one-click approval links expire. Open your dashboard to review this in the approval queue.",
    });
  }

  // Best-effort tenant lookup for the business name + a dashboard link on the
  // confirmation page. Never blocks resolution.
  const tenant = await getTenantConfig(claims.tenantId).catch(() => null);
  const businessName = tenant?.siteName || "your site";
  const dashboardUrl = tenant ? getTenantDashboardUrl(tenant, "/dashboard") : undefined;
  const workflowAction = claims.action === "approve" ? "approved" : "dismissed";

  let result: { changed: boolean; reason?: string };
  try {
    result = await resolveEventAction(claims.tenantId, claims.eventId, workflowAction);
  } catch (err) {
    console.error(`[api/approve] resolveEventAction threw for ${claims.tenantId}/${claims.eventId}:`, err);
    return page({
      status: 200,
      heading: "We hit a snag",
      body: "We couldn't complete that just now. Open your dashboard to finish it there.",
      dashboardUrl,
      buttonLabel: "Open your dashboard",
    });
  }

  if (result.changed) {
    return claims.action === "approve"
      ? page({
          status: 200,
          heading: "Approved",
          body: `Done — your reply is being posted for ${businessName}. You can see it in your dashboard.`,
          dashboardUrl,
          buttonLabel: "Open your dashboard",
        })
      : page({
          status: 200,
          heading: "Skipped",
          body: `No problem — we won't post that reply for ${businessName}. You can always reply yourself in your dashboard.`,
          dashboardUrl,
          buttonLabel: "Open your dashboard",
        });
  }

  // Not changed. `already_resolved` / `not_found` (the event may have TTL'd out
  // after being handled) are the idempotent, expected outcomes — render a
  // friendly "already handled" page, not an error.
  if (result.reason === "already_resolved" || result.reason === "not_found") {
    return page({
      status: 200,
      heading: "Already handled",
      body: `This was already taken care of for ${businessName} — nothing more to do. Open your dashboard to see the latest.`,
      dashboardUrl,
      buttonLabel: "Open your dashboard",
    });
  }

  if (result.reason === "wrong_tenant") {
    return page({
      status: 403,
      heading: "This link isn't for this account",
      body: "This approval link doesn't match your account. Open your dashboard to review it there.",
      dashboardUrl,
      buttonLabel: "Open your dashboard",
    });
  }

  // Any other reason (e.g. the external publish failed) — keep it honest: the
  // item is still pending, point them to the dashboard.
  return page({
    status: 200,
    heading: "We couldn't finish that",
    body: `We couldn't complete this for ${businessName} automatically. Open your dashboard to finish it there.`,
    dashboardUrl,
    buttonLabel: "Open your dashboard",
  });
}
