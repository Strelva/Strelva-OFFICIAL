import { NextResponse } from "next/server";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { legacyApiFixture, legacyState } from "@/experience/workspace/preview/legacy-dashboard-api";

/**
 * Fixture API for the legacy dashboard preview. Every dashboardHref("/api/…")
 * from the real components lands here. Reads return fictional data; writes
 * answer like the real routes but change nothing. The page's ?state= rides in
 * on the Referer so empty and error states reach the client fetches too.
 */
async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!strelvaUiPreviewEnabled()) return new NextResponse(null, { status: 404 });
  const { path } = await params;
  const referer = request.headers.get("referer");
  const state = legacyState(referer ? new URL(referer).searchParams.get("state") ?? undefined : undefined);
  const url = new URL(request.url);
  const { status, body } = await legacyApiFixture(request.method, path.join("/"), url.searchParams, state, request);
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
