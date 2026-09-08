import { NextResponse } from "next/server";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

/** Isolated fixture reads only. No production API or provider is imported. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!strelvaUiPreviewEnabled()) return new NextResponse(null, { status: 404 });
  const { path } = await params;
  const key = path.join("/");
  const options = { headers: { "Cache-Control": "no-store" } };
  if (key === "publish") return NextResponse.json({ contentDrafts: {}, pageConfigDraft: false }, options);
  if (key === "my-properties") return NextResponse.json({ properties: [{ id: "preview-business", name: "Elmwood Studio", href: "/preview/strelva/website/dashboard/site" }] }, options);
  if (key === "threads") return NextResponse.json([{ id: "preview-conversation", title: "Studio hours", preview: "Let’s review the new opening hours.", updatedAt: "2026-09-07T12:00:00.000Z" }], options);
  if (key === "threads/preview-conversation") return NextResponse.json({ id: "preview-conversation", messages: [{ id: "preview-message", role: "assistant", content: "This is a fictional saved conversation. In the actual website, you can ask Strelva to prepare a change and review its details before approval.", timestamp: "2026-09-07T12:00:00.000Z" }] }, options);
  return NextResponse.json({ error: "This fixture does not provide that data." }, { status: 404 });
}

function rejectMutation() {
  return NextResponse.json({ error: "Local preview is read-only." }, { status: strelvaUiPreviewEnabled() ? 405 : 404 });
}
export const POST = rejectMutation;
export const PUT = rejectMutation;
export const PATCH = rejectMutation;
export const DELETE = rejectMutation;
