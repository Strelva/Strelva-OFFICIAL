import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { renderEmailHtml } from "@/platform/infra/email/layout";
import { domainConnectedPaperEmail } from "@/products/websites/client";
import { domainMonitorPaperEmail } from "@/products/domain-monitor";

export const dynamic = "force-dynamic";
const BOARD = "https://app.strelva.com/admin/uptime";
const EMAILS = {
  "domain-connected": () => domainConnectedPaperEmail({ hostname: "harbordental.com", checkedAt: "2026-10-15T12:11:00Z" }),
  "monitor-down": () => domainMonitorPaperEmail({ boardUrl: BOARD, expiring: [], down: [{ siteName: "Harbor Dental", host: "harbordental.com", problem: "Parked page at the registrar since 6:40" }] }),
  "monitor-several": () => domainMonitorPaperEmail({ boardUrl: BOARD, down: [{ siteName: "Harbor Dental", host: "harbordental.com", problem: "Returns 503" }, { siteName: "Fieldwork Studio", host: "fieldworkstudio.co", problem: "Unreachable" }], expiring: [{ siteName: "Lakeview Mediation", host: "lakeviewmediation.com", problem: "Registration ends Nov 2" }] }),
  "monitor-recovered": () => domainMonitorPaperEmail({ boardUrl: BOARD, down: [], expiring: [] }),
} as const;

/** Fictional email bodies rendered by the real layout. Nothing is sent. ?which=domain-connected|monitor-down|monitor-several|monitor-recovered */
export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response(null, { status: 404 });
  const which = new URL(request.url).searchParams.get("which") ?? "domain-connected";
  if (!Object.hasOwn(EMAILS, which)) return new Response(null, { status: 404 });
  const paper = EMAILS[which as keyof typeof EMAILS]();
  return new Response(renderEmailHtml({ heading: paper.subject, paper }), { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  } });
}
