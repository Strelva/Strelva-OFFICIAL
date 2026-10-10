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
  // Mail clients POST directly to this HTML endpoint. Keep that transport;
  // the standalone document uses the paper roles without a React runtime.
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>
<style>
:root{color-scheme:light;--st-canvas:#f4f4f1;--st-surface:#ffffff;--st-line:#e4e4df;--st-text:#161715;--st-text-2:#5f615c;--st-accent:#2f5236;--st-on-accent:#ffffff}
*{box-sizing:border-box}body{margin:0;background:var(--st-canvas);font-family:system-ui,-apple-system,sans-serif;color:var(--st-text)}
main{max-width:520px;min-height:100dvh;margin:auto;padding:48px 24px 24px;display:flex;flex-direction:column;gap:16px}
h1{font-size:28px;font-weight:500;line-height:36px;letter-spacing:-.6px;margin:0}p{font-size:15px;line-height:24px;color:var(--st-text-2);margin:0}
footer{margin-top:auto;padding-top:32px}button{font:inherit;font-weight:600;min-height:48px;width:100%;padding:12px 22px;border-radius:999px;border:0;background:var(--st-accent);color:var(--st-on-accent);cursor:pointer}
button:focus-visible{outline:2px solid var(--st-accent);outline-offset:3px}.note{font-size:12px;line-height:20px;text-align:center;margin-top:12px}
</style><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><footer>${form ?? ""}<p class="note">Writing in through the site still works the same.</p></footer></main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!verifyUnsubscribeToken(token)) return page(400, "This link doesn't work", "The unsubscribe link is incomplete or was changed.");
  const form = `<form method="post" action="/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`;
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
