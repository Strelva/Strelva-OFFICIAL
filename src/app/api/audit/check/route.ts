import { NextRequest, NextResponse } from "next/server";
import { POST as websiteCheck } from "../scan/route";
import { POST as geminiCheck } from "../../ai-visibility/route";
import { withCombinedCheckAdmission } from "@/platform/agency-prospecting/check-admission";

/** Compose the existing public contracts under one durable agency quota admission. */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.url !== "string" || !body.url.trim() || typeof body.business !== "string" || !body.business.trim()) {
    return NextResponse.json({ error: "Website and business name are required." }, { status: 400 });
  }
  if (["category", "city", "source", "agency"].some(key => body[key] !== undefined && typeof body[key] !== "string")) {
    return NextResponse.json({ error: "Check details must be text." }, { status: 400 });
  }
  function child(path: string) {
    const url = new URL(request.url);
    url.pathname = path;
    return new NextRequest(url, { method: "POST", headers: request.headers, body: JSON.stringify(body) });
  }
  async function section(run: () => Promise<Response>) {
    try {
      const response = await run();
      return { status: response.status, data: await response.json() };
    } catch {
      return { status: 503, data: { error: "This part of the check is unavailable. Please try again." } };
    }
  }
  return withCombinedCheckAdmission(async () => {
    const [website, ai] = await Promise.all([
      section(() => websiteCheck(child("/api/audit/scan"))),
      section(() => geminiCheck(child("/api/ai-visibility"))),
    ]);
    return NextResponse.json({ website, ai });
  });
}
