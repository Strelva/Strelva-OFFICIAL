import { NextResponse } from "next/server";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XA_NORTH } from "@/experience/workspace/preview/xa-day";

/**
 * The reads the real StrelvaShell makes against `${appBase}/api/…` when a
 * preview passes appBase="/preview/strelva" (October 16 coherence pass). They
 * used to 404, so the agency brand never loaded and the agency's Service
 * requests link never appeared. Fictional answers only; nothing is read or
 * written.
 */
async function handle(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!strelvaUiPreviewEnabled()) return new NextResponse(null, { status: 404 });
  const { path } = await params;
  const url = new URL(_request.url);
  const route = path.join("/");
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (route === "workspace/owner-brand") return json({ brand: { agencyId: "a0000000-0000-4000-8000-0000000000bb", name: XA_NORTH.name, logoUrl: null, accentColor: "#2f5236", replyTo: null, credit: "runs_on_strelva" } });
  if (route === "agency/leads") {
    const agencyWorkspaceId = url.searchParams.get("agencyWorkspaceId");
    return json(url.searchParams.get("availability") === "1" ? { available: true, agencyWorkspaceId } : { leads: [], agencyWorkspaceId });
  }
  return json({ error: "This preview has no data for that." }, 404);
}

export { handle as GET, handle as POST };
