import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { openPublicContinuation, publicContinuationText, PUBLIC_CONTINUATION_COOKIE } from "@/lib/public-continuation";
import { importPublicContinuation } from "@/platform/public-continuations/repository";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { createDocument } from "@/products/documents/contracts";

const inputSchema = z.object({ workspaceId: z.string().uuid() }).strict();

function sameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  // A browser can omit Origin on a same-origin fetch. Require its
  // non-scriptable fetch metadata in that case; bare API clients must supply a
  // matching Origin explicitly.
  if (!origin) return fetchSite === "same-origin";
  if (origin === "null") return false;
  try {
    const provided = new URL(origin);
    if (provided.origin === new URL(request.url).origin) return true;
    // A development or reverse proxy may build request.url with its internal
    // hostname. The Host header remains the browser-visible destination.
    const visibleHost = (request.headers.get("host") || request.headers.get("x-forwarded-host") || "")
      .split(",", 1)[0]?.trim().toLowerCase();
    const visibleProtocol = (request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.slice(0, -1))
      .split(",", 1)[0]?.trim().toLowerCase();
    return Boolean(visibleHost && visibleProtocol && provided.host.toLowerCase() === visibleHost && provided.protocol === `${visibleProtocol}:`);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return NextResponse.json({ error: "Account saving is not available in this environment." }, { status: 503 });
  // Auth, SameSite cookies, JSON-only input, and the browser fetch-site signal
  // protect this route even when a no-referrer page omits the optional Origin.
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "Open Strelva directly to save this brief." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Send a JSON request." }, { status: 415 });
  const user = await getSessionUser();
  const email = user?.email?.trim().toLowerCase() || "";
  if (!user?.email_confirmed_at || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Sign in with a confirmed email to continue." }, { status: 401 });
  }
  let input: z.infer<typeof inputSchema>;
  try { input = inputSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Choose an available workspace." }, { status: 400 }); }
  const cookieStore = await cookies();
  const brief = openPublicContinuation(cookieStore.get(PUBLIC_CONTINUATION_COOKIE)?.value);
  if (!brief) return NextResponse.json({ error: "This continuation is missing or unavailable. Return to the public session or use your downloaded brief." }, { status: 410 });
  try {
    const document = createDocument({ title: brief.resultTitle, text: publicContinuationText(brief) }, user.id);
    const saved = await importPublicContinuation(
      { userId: user.id, verifiedEmail: email },
      input.workspaceId,
      {
        continuationId: brief.id,
        title: document.title,
        payload: document,
        input: { source: "public_session", businessName: brief.businessName },
      },
    );
    const response = NextResponse.json({ ...saved, location: `/workspace?workspaceId=${encodeURIComponent(saved.workspaceId)}&work=${encodeURIComponent(saved.workId)}&view=document` }, { status: saved.alreadyImported ? 200 : 201 });
    return response;
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: "This account cannot save into that workspace." }, { status: 403 });
    if (error instanceof WorkspaceConflictError) return NextResponse.json({ error: "This brief was already saved to another workspace or that workspace cannot accept more work." }, { status: 409 });
    return NextResponse.json({ error: "The brief could not be saved. It remains available on this account page." }, { status: 503 });
  }
}
