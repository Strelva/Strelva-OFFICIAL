import { NextResponse } from "next/server";
import {
  getAiVisibilityResult,
  recordAiVisibilityResultView,
} from "@/lib/ai-visibility/results";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stored = await getAiVisibilityResult(id);
  if (!stored) return NextResponse.json({ error: "Scorecard not found." }, { status: 404 });
  await recordAiVisibilityResultView(id).catch(() => {});
  return NextResponse.json(stored);
}
