import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PREVIEW_FACTS, PREVIEW_NOTE } from "@/experience/care-reports/preview-fixture";
import { renderCareReportMail } from "@/platform/care-reports/mail";

/** The Care plan report email as HTML (or ?format=text). Rendering only; nothing is sent. */
export function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const url = new URL(request.url);
  const empty = url.searchParams.get("state") === "empty-month";
  const mail = renderCareReportMail({
    facts: empty ? { ...PREVIEW_FACTS, changes: { total: 0, confirmed: 0, notConfirmed: 0, notChecked: 0, items: [] }, requests: { doneCount: 0, openCount: 0, askedCount: 0, done: [] }, time: { minutes: 0, entries: 0, byCategory: {} } } : PREVIEW_FACTS,
    agencyName: "North Studio", businessName: "Harbor Dental", release: 2, link: "https://app.example.test/workspace/care-reports/fixture", agencyNote: empty ? null : PREVIEW_NOTE,
  });
  if (url.searchParams.get("format") === "text") return new Response(`Subject: ${mail.subject}\n\n${mail.text}`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(mail.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
