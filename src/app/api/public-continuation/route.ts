import { NextResponse } from "next/server";
import { parsePublicContinuation, PUBLIC_CONTINUATION_COOKIE, PUBLIC_CONTINUATION_NEXT, sealPublicContinuation } from "@/lib/public-continuation";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 8_000;

class BodyTooLargeError extends Error {}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new BodyTooLargeError();
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configured = (process.env.PUBLIC_SITE_ORIGIN || "https://strelva.com").replace(/\/$/, "");
  if (origin === configured || origin === "https://www.strelva.com") return origin;
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function cors(response: NextResponse, origin: string): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Vary", "Origin");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function OPTIONS(request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return new NextResponse(null, { status: 403 });
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return cors(response, origin);
}

export async function POST(request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return NextResponse.json({ error: "Open the public Strelva session to continue." }, { status: 403 });
  if (!workspaceReleaseEnabled()) return cors(NextResponse.json({ error: "Account saving is not available in this environment." }, { status: 503 }), origin);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return cors(NextResponse.json({ error: "Send a JSON request." }, { status: 415 }), origin);
  }
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    if (!(error instanceof BodyTooLargeError)) return cors(NextResponse.json({ error: "This brief could not be read. Download it to keep it." }, { status: 400 }), origin);
    return cors(NextResponse.json({ error: "This brief is too large or could not be read. Download it to keep it." }, { status: 413 }), origin);
  }
  const brief = parsePublicContinuation(body);
  const sealed = brief ? sealPublicContinuation(brief) : null;
  if (!brief) return cors(NextResponse.json({ error: "This brief cannot be transferred as prepared. Download it to keep it." }, { status: 422 }), origin);
  if (!sealed) return cors(NextResponse.json({ error: "Secure account continuation is temporarily unavailable. Your local brief is unchanged." }, { status: 503 }), origin);
  const location = `/sign-in?next=${encodeURIComponent(PUBLIC_CONTINUATION_NEXT)}`;
  const response = NextResponse.json({ location });
  response.cookies.set(PUBLIC_CONTINUATION_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return cors(response, origin);
}
