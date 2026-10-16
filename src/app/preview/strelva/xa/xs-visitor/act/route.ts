import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";

const P = "/preview/strelva/xa/xs-visitor";
const q = encodeURIComponent;
/**
 * Where each preview form lands, carrying what the visitor picked so the next
 * page says back the same time: the handoff's slot index, the offer's start,
 * the manage page's new slot.
 */
const NEXT: Record<string, (form: URLSearchParams) => string> = {
  manage: form => form.get("action") === "cancel" ? `${P}/manage?state=cancelled`
    : form.get("action") === "confirm" ? `${P}/manage?state=confirmed`
    : form.get("slotId") === "s0" ? `${P}/manage?state=confirmed`
    : form.get("slotId") ? `${P}/manage?state=rescheduled&slot=${q(form.get("slotId")!)}` : `${P}/manage?state=error-notice`,
  confirm: () => `${P}/confirm?state=requested`,
  offer: form => form.get("start") ? `${P}/offer?state=held&start=${q(form.get("start")!)}` : `${P}/offer?state=choose&error=pick`,
  handoff: form => form.get("slot") ? `${P}/handoff?state=held&slot=${q(form.get("slot")!)}` : `${P}/handoff?state=choose&error=pick`,
  // XA · E4 on its own preview route comes back to that route.
  e4: form => form.get("slot") ? `/preview/strelva/xa/xa7-outside/booking?state=held&slot=${q(form.get("slot")!)}` : "/preview/strelva/xa/xa7-outside/booking?state=choose&error=pick",
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
  const target = new URL(step(form), url);
  for (const key of ["brand", "mode"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return Response.redirect(target, 303);
}
