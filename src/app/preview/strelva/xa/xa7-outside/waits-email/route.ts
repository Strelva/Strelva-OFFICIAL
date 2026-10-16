import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { e1Mail } from "@/experience/workspace/preview/xa7-outside-fixture";
import { renderXaMailHtml, renderXaMailText } from "@/platform/infra/email/xa-mail";

export const dynamic = "force-dynamic";

/** XA · E1, the waits-for-you email. Template only: rendered here, never sent. ?state=ready|sign-in|no-undo&format=text */
export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const mail = e1Mail(url.searchParams.get("state") ?? "ready");
  if (url.searchParams.get("format") === "text") return new Response(renderXaMailText(mail), { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
  return new Response(renderXaMailHtml(mail), { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
}
