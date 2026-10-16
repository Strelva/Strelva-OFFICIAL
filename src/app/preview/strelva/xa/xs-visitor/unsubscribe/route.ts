import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { unsubscribePage } from "@/platform/infra/email/unsubscribe-page";

export const dynamic = "force-dynamic";

/** The real unsubscribe page builder. The button posts nowhere. ?state=ask|done|bad|rate|failed */
export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const state = new URL(request.url).searchParams.get("state") ?? "ask";
  const business = "Harbor Dental";
  if (state === "done") return unsubscribePage(200, "You're off the list", `You won't get further issues of the ${business} newsletter. Nothing else with ${business} changes.`, { business, tone: "done" });
  if (state === "bad") return unsubscribePage(400, "This link doesn't work", "The unsubscribe link is incomplete or was changed. Use the link in your most recent newsletter.", { tone: "problem" });
  if (state === "rate") return unsubscribePage(429, "Try again in a minute", "Too many tries from here. You are still subscribed.", { tone: "problem" });
  if (state === "failed") return unsubscribePage(503, "That didn't go through", "You are still subscribed. Try the link again in a few minutes.", { tone: "problem" });
  return unsubscribePage(200, `Stop getting the ${business} newsletter?`, "You won't get further issues. Opening this page changed nothing; the button below does.", { business, form: `<form method="get" action="?"><input type="hidden" name="state" value="done"><button type="submit">Unsubscribe</button></form>` });
}
