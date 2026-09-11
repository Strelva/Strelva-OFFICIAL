import { NextResponse } from "next/server";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { heroSchema } from "@/lib/schemas";
import type { HeroContent } from "@/lib/types";

/**
 * Isolated fixture data only. No production API, tenant, storage, upload, or
 * provider is imported. Draft state lives in this development process and is
 * deliberately never promoted to a live section.
 */
const FIXTURE_HERO: HeroContent = {
  headline: "A fictional headline",
  subheadline: "Synthetic studio",
  tagline: "Content stays inside this local fixture.",
  ctaText: "See the work",
  ctaLink: "#products",
  backgroundImageUrl: "/images/product-bag.jpg",
};

let fixtureHeroDraft: HeroContent | null = null;

const fixtureOptions = { headers: { "Cache-Control": "no-store" } };

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!strelvaUiPreviewEnabled()) return new NextResponse(null, { status: 404 });
  const { path } = await params;
  const key = path.join("/");
  if (key === "publish") return NextResponse.json({ contentDrafts: fixtureHeroDraft ? { hero: true } : {}, pageConfigDraft: false }, fixtureOptions);
  if (key === "page-config") return NextResponse.json(null, fixtureOptions);
  if (key === "content/hero") {
    const draft = new URL(_request.url).searchParams.get("draft") === "true";
    return NextResponse.json(draft && fixtureHeroDraft ? fixtureHeroDraft : FIXTURE_HERO, fixtureOptions);
  }
  if (key === "my-properties") return NextResponse.json({ properties: [{ id: "preview-business", name: "Elmwood Studio", href: "/preview/strelva/website/dashboard/site" }] }, fixtureOptions);
  if (key === "threads") return NextResponse.json([{ id: "preview-conversation", title: "Studio hours", preview: "Let’s review the new opening hours.", updatedAt: "2026-09-07T12:00:00.000Z" }], fixtureOptions);
  if (key === "threads/preview-conversation") return NextResponse.json({ id: "preview-conversation", messages: [{ id: "preview-message", role: "assistant", content: "This is a fictional saved conversation. In the actual website, you can ask Strelva to prepare a change and review its details before approval.", timestamp: "2026-09-07T12:00:00.000Z" }] }, fixtureOptions);
  return NextResponse.json({ error: "This fixture does not provide that data." }, { status: 404 });
}

async function handlePut(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!strelvaUiPreviewEnabled()) return new NextResponse(null, { status: 404 });
  const { path } = await params;
  if (path.join("/") !== "content/hero" || new URL(request.url).searchParams.get("draft") !== "true") {
    return rejectMutation();
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid fixture content." }, { status: 400 });
  }
  const parsed = heroSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid fixture content." }, { status: 422 });
  fixtureHeroDraft = parsed.data;
  return NextResponse.json({ success: true, draft: true }, fixtureOptions);
}

async function handleDelete(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!strelvaUiPreviewEnabled()) return new NextResponse(null, { status: 404 });
  const { path } = await params;
  const key = path.join("/");
  if (key === "publish") {
    fixtureHeroDraft = null;
    return NextResponse.json({ success: true, discardedSections: [], discardedPageConfig: false }, fixtureOptions);
  }
  if (key === "content/hero" && new URL(request.url).searchParams.get("draft") === "true") {
    fixtureHeroDraft = null;
    return NextResponse.json({ success: true, draft: false }, fixtureOptions);
  }
  return rejectMutation();
}

function rejectMutation() {
  return NextResponse.json({ error: "Local preview is read-only." }, { status: strelvaUiPreviewEnabled() ? 405 : 404 });
}
export const POST = rejectMutation;
export const PUT = handlePut;
export const PATCH = rejectMutation;
export const DELETE = handleDelete;
