import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";

const P = "/preview/strelva/xa/xs-visitor";
const NEXT: Record<string, (form: URLSearchParams) => string> = {
  manage: form => form.get("action") === "cancel" ? "manage?state=cancelled" : form.get("action") === "confirm" ? "manage?state=confirmed" : form.get("slotId") ? "manage?state=rescheduled" : "manage?state=error-notice",
  confirm: () => "confirm?state=requested",
  offer: form => form.get("start") ? "offer?state=held" : "offer?state=choose&error=pick",
  handoff: form => form.get("slot") ? "handoff?state=held" : "handoff?state=choose&error=pick",
};

/**
 * Preview harness only: the visitor pages' forms post here so their buttons
 * visibly move to the next state. It reads the form and redirects; it writes
 * nothing, books nothing and sends nothing.
 */
export async function POST(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const step = NEXT[url.searchParams.get("screen") ?? ""];
  if (!step) return new Response("Unknown screen", { status: 404 });
  const form = new URLSearchParams(await request.text());
  const target = new URL(`${P}/${step(form)}`, url);
  const brand = url.searchParams.get("brand");
  if (brand) target.searchParams.set("brand", brand);
  return Response.redirect(target, 303);
}
