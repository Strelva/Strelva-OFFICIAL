import { NextResponse } from "next/server";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { listAgencyProspects, AgencyProspectingError } from "@/platform/agency-prospecting/server";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.email || !user.email_confirmed_at) return NextResponse.json({ error: "Sign in with a verified account." }, { status: 401 });
  const workspaceId = new URL(request.url).searchParams.get("workspace");
  if (!workspaceId || !/^[a-f0-9-]{36}$/i.test(workspaceId)) return NextResponse.json({ error: "An agency workspace is required." }, { status: 400 });
  try {
    return NextResponse.json({ prospects: await listAgencyProspects(workspaceId, user.id, user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Prospects unavailable." },
      { status: error instanceof AgencyProspectingError ? error.status : 503 });
  }
}
