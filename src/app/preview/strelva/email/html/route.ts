import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { EMAIL_PREVIEW_TEMPLATES } from "@/experience/workspace/preview/email-fixture";
import { renderEmailHtml } from "@/lib/email/layout";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response(null, { status: 404 });
  const key = new URL(request.url).searchParams.get("template") || "urgent";
  if (!Object.hasOwn(EMAIL_PREVIEW_TEMPLATES, key)) return new Response(null, { status: 404 });
  const paper = EMAIL_PREVIEW_TEMPLATES[key as keyof typeof EMAIL_PREVIEW_TEMPLATES].email;
  return new Response(renderEmailHtml({ heading: paper.subject, paper }), { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  } });
}
