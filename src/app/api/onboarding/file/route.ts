import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { OnboardingConflictError, OnboardingUnavailableError, readOnboardingOriginalFile } from "@/products/onboarding/server";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function actor() {
  const user = await getSessionUser();
  return user?.email && user.email_confirmed_at
    ? { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }
    : null;
}

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "This private file is unavailable to your account." }, 403);
  if (error instanceof OnboardingUnavailableError) return json({ error: error.message }, 404);
  if (error instanceof WorkspaceConflictError || error instanceof OnboardingConflictError) return json({ error: error.message }, 409);
  if (error instanceof z.ZodError) return json({ error: "Choose a valid private file." }, 400);
  if (error instanceof WorkspaceStoreError) return json({ error: error.message }, 503);
  return json({ error: "The private file could not be opened. Nothing was downloaded." }, 503);
}

function safeFilename(value: string): { fallback: string; encoded: string } {
  const clean = value.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(0, 180) || "onboarding-file";
  const fallback = clean.replace(/[^\x20-\x7e]/g, "_") || "onboarding-file";
  return { fallback, encoded: encodeURIComponent(clean) };
}

function safeContentType(value: string): string {
  return /^[\w!#$&^_.+-]+\/[\w!#$&*^_.+-]+$/.test(value) ? value : "application/octet-stream";
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Open Strelva directly to download a private file." }, 403);
  }
  const current = await actor();
  if (!current) return json({ error: "Sign in to download a private onboarding file." }, 401);
  try {
    const workId = new URL(request.url).searchParams.get("workId") ?? "";
    const file = await readOnboardingOriginalFile(current, workId);
    const filename = safeFilename(file.provenance.originalName);
    return new NextResponse(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": safeContentType(file.provenance.contentType),
        "Content-Length": String(file.bytes.length),
        "Content-Disposition": `attachment; filename="${filename.fallback}"; filename*=UTF-8''${filename.encoded}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
