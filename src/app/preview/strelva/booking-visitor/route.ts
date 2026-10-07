import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { visitorBookingFixtureHtml, visitorBookingFixtureState, visitorBookingFixtureTransport } from "./fixture";

export const dynamic = "force-dynamic";

/** Synthetic data only; this fixture has no server mutation handler. */
export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const state = visitorBookingFixtureState(url.searchParams.get("state"));
  const mode = url.searchParams.get("mode") === "on" ? "on" : "off";
  const headers = {
    "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; frame-ancestors 'self'",
  };
  if (url.searchParams.get("asset") === "runtime") {
    const runtime = readFileSync(join(process.cwd(), "custom-repo-starter", "website-generation", "capability-runtime.mjs"), "utf8");
    return new Response(visitorBookingFixtureTransport(state, mode) + runtime, { headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8" } });
  }
  return new Response(visitorBookingFixtureHtml(url.origin, state, mode), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
