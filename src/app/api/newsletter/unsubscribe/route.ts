/**
 * Newsletter unsubscribe, RFC 8058 one-click.
 *
 * - POST with a valid token unsubscribes. Mail clients send
 *   `List-Unsubscribe=One-Click` as the body; the token in the URL is the only
 *   authorization (signed over tenant and email, src/lib/newsletter-unsubscribe.ts).
 * - GET never changes anything (link scanners prefetch). It shows a page with
 *   one button that POSTs.
 * The answer never says whether an address was on the list.
 */
import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/newsletter-unsubscribe";
import { unsubscribeSubscriber } from "@/lib/storage/newsletter-store";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function page(status: number, title: string, body: string, form?: string): NextResponse {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f3f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14181c;">
<main style="max-width:440px;margin:64px auto;padding:36px 28px;background:#fff;border:1px solid #e6e7e9;border-radius:14px;text-align:center;">
<h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(title)}</h1><p style="color:#565d64;line-height:1.5;margin:0 0 20px;">${escapeHtml(body)}</p>${form ?? ""}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!verifyUnsubscribeToken(token)) return page(400, "This link doesn't work", "The unsubscribe link is incomplete or was changed.");
  const form = `<form method="post" action="/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}"><button type="submit" style="font:inherit;padding:10px 18px;border-radius:10px;border:0;background:#447a4f;color:#fff;cursor:pointer;">Unsubscribe</button></form>`;
  return page(200, "Unsubscribe from this newsletter?", "You won't get further issues.", form);
}

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claims = verifyUnsubscribeToken(token);
  if (!claims) return page(400, "This link doesn't work", "The unsubscribe link is incomplete or was changed.");
  if (await isRateLimitedAsync(rateLimitKey(req, "newsletter-unsubscribe"), 30).catch(() => false)) {
    return page(429, "Try again in a minute", "Too many requests from here.");
  }
  try {
    await unsubscribeSubscriber(claims.email, claims.tenantId);
  } catch {
    return page(503, "That didn't go through", "Please try the link again in a few minutes.");
  }
  return page(200, "You're unsubscribed", "You won't get further issues of this newsletter.");
}
