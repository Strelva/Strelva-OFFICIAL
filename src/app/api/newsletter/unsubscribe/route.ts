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
import { getTenantConfig } from "@/lib/tenants";
import { verifyUnsubscribeToken } from "@/lib/newsletter-unsubscribe";
import { unsubscribeSubscriber } from "@/lib/storage/newsletter-store";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { unsubscribePage as page } from "@/platform/infra/email/unsubscribe-page";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claims = verifyUnsubscribeToken(token);
  if (!claims) return page(400, "This link doesn't work", "The unsubscribe link is incomplete or was changed. Use the link in your most recent newsletter.", { tone: "problem" });
  const form = `<form method="post" action="/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`;
  const business = (await getTenantConfig(claims.tenantId).catch(() => undefined))?.siteName;
  return page(200, business ? `Stop getting the ${business} newsletter?` : "Stop getting this newsletter?", "You won't get further issues. Opening this page changed nothing; the button below does.", { form, business });
}

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claims = verifyUnsubscribeToken(token);
  if (!claims) return page(400, "This link doesn't work", "The unsubscribe link is incomplete or was changed. Use the link in your most recent newsletter.", { tone: "problem" });
  if (await isRateLimitedAsync(rateLimitKey(req, "newsletter-unsubscribe"), 30).catch(() => false)) {
    return page(429, "Try again in a minute", "Too many tries from here. You are still subscribed.", { tone: "problem" });
  }
  try {
    await unsubscribeSubscriber(claims.email, claims.tenantId);
  } catch {
    return page(503, "That didn't go through", "You are still subscribed. Try the link again in a few minutes.", { tone: "problem" });
  }
  const business = (await getTenantConfig(claims.tenantId).catch(() => undefined))?.siteName;
  return page(200, "You're off the list", business ? `You won't get further issues of the ${business} newsletter. Nothing else with ${business} changes.` : "You won't get further issues of this newsletter.", { business, tone: "done" });
}
