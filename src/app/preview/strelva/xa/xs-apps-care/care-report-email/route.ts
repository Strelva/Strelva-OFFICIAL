import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PREVIEW_FACTS, PREVIEW_NOTE } from "@/experience/care-reports/preview-fixture";
import { renderCareReportMail } from "@/platform/care-reports/mail";

/** The app's CSP blocks Google Fonts on preview routes, so the preview serves the same DM Sans from this origin (as xs-visitor/email does). Real mail loads it from EMAIL_FONT_LINKS. */
const PREVIEW_FONT = `<style>@font-face{font-family:'DM Sans';font-style:normal;font-weight:100 1000;src:url(/xa/fonts/dm-sans-latin.woff2) format('woff2')}</style></head>`;

/** The Care plan report email as HTML (or ?format=text). Rendering only; nothing is sent. */
export function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const url = new URL(request.url);
  const empty = url.searchParams.get("state") === "empty-month";
  const mail = renderCareReportMail({
    facts: empty ? { ...PREVIEW_FACTS, changes: { total: 0, confirmed: 0, notConfirmed: 0, notChecked: 0, items: [] }, requests: { doneCount: 0, openCount: 0, askedCount: 0, done: [] }, time: { minutes: 0, entries: 0, byCategory: {} } } : PREVIEW_FACTS,
    agencyName: "North Studio", businessName: "Harbor Dental", release: 2, link: `${url.origin}/workspace/care-reports/fixture`, agencyNote: empty ? null : PREVIEW_NOTE,
  });
  if (url.searchParams.get("format") === "text") return new Response(`Subject: ${mail.subject}\n\n${mail.text}`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(mail.html.replace("</head>", PREVIEW_FONT), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
