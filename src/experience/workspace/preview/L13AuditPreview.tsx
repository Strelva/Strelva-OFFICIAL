"use client";
/** Fictional checks, scores and business data. Never calls scan or report endpoints. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicFrame } from "@/experience/product/PublicFrame";
import { StNotice, StPage } from "@/components/ui/strelva/Kit";
import { WebsiteAuditPage, WebsiteAuditPending } from "@/products/website-audit";
import type { AuditResult } from "@/platform/infra/audit-contracts";

const result: AuditResult = { url: "https://attymooney.com", scannedAt: "2026-10-09T14:44:00Z", overallScore: 72, grade: "C", categories: [
  { name: "Search", slug: "seo", weight: .25, score: 60, checks: [{ name: "Page descriptions", status: "warn", score: 60, message: "Some pages have no description for search results.", impact: "A clear description tells people what they can find on the page.", priority: "high" }] },
  { name: "Mobile", slug: "mobile", weight: .1, score: 95, checks: [{ name: "Viewport", status: "pass", score: 95, message: "Pages fit a phone screen." }] },
  { name: "Security", slug: "ssl", weight: .1, score: 100, checks: [{ name: "HTTPS", status: "pass", score: 100, message: "The public site uses a secure connection." }] },
  { name: "Readability for assistants", slug: "ai-readability", weight: .25, score: 45, checks: [{ name: "Structured business details", status: "fail", score: 45, message: "No business markup was found.", priority: "medium" }] },
] };
export function L13AuditPreview({ state }: { state: string }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  return <PublicFrame preview><StNotice>Fictional preview · no website scan, export or account changes.</StNotice>{feedback ? <StNotice>{feedback}</StNotice> : null}{state === "loading" ? <StPage><WebsiteAuditPending url={result.url} /></StPage> : <div onSubmitCapture={event => { event.preventDefault(); event.stopPropagation(); router.push("/preview/strelva/l13-audit?state=result"); }} onClickCapture={event => { if (!(event.target instanceof Element)) return;
      const save = event.target.closest("a")?.getAttribute("href")?.startsWith("/workspace?save=");
      if (save || event.target.closest("button")?.textContent === "Save as PDF") { event.preventDefault(); event.stopPropagation(); setFeedback(save ? "Fictional copy retained in this preview. No account changed." : "Fictional export preview. No report endpoint was called."); } }}><WebsiteAuditPage key={state} initialUrl={state === "entry" ? "" : result.url} initialResult={state === "result" ? result : state === "empty" ? { ...result, categories: [] } : undefined} initialReportId={state === "result" ? "audit_00000000000000000000000000000013" : undefined} workspaceEnabled initialError={state === "error" ? "The check couldn’t be completed. Try a reachable public website." : state === "permission" ? "This report is unavailable. Sign in with the account that saved it, or run a public check." : undefined} /></div>}</PublicFrame>;
}
