import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { readBoundedBody, isWorkspaceBodyTooLarge } from "@/platform/workspaces/http";
import { OnboardingConflictError, OnboardingUnavailableError, uploadOnboardingFile } from "@/products/onboarding/server";
import { MAX_ONBOARDING_UPLOAD_REQUEST_BYTES } from "@/products/onboarding/limits";

export const dynamic = "force-dynamic";

const json = (value: unknown, status = 200) => NextResponse.json(value, {
  status,
  headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
});

async function actor() {
  const user = await getSessionUser();
  return user?.email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } : null;
}

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "This onboarding work is unavailable to your account." }, 403);
  if (error instanceof OnboardingUnavailableError) return json({ error: error.message }, 404);
  if (error instanceof WorkspaceConflictError || error instanceof OnboardingConflictError) return json({ error: error.message }, 409);
  if (isWorkspaceBodyTooLarge(error)) return json({ error: "This private file is too large. Files must be 2MB or smaller." }, 413);
  if (error instanceof z.ZodError) return json({ error: "Choose a valid onboarding requirement and file." }, 400);
  if (error instanceof WorkspaceStoreError) return json({ error: error.message }, 503);
  return json({ error: "Onboarding storage is unavailable. Your upload has not been confirmed." }, 503);
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Open Strelva directly to upload a private onboarding file." }, 403);
  const current = await actor();
  if (!current) return json({ error: "Sign in to upload a private onboarding file." }, 401);
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data")) return json({ error: "Send a multipart file upload." }, 415);
    // Bound the bytes before multipart parsing: reject a declared oversize
    // immediately and stop reading a chunked body once it passes the limit.
    // The service still checks the parsed file against the 2MB file limit.
    const raw = await readBoundedBody(request, MAX_ONBOARDING_UPLOAD_REQUEST_BYTES);
    let form: FormData;
    try { form = await new Response(new Uint8Array(raw), { headers: { "content-type": contentType } }).formData(); }
    catch { throw new z.ZodError([]); }
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Choose a file before supplying this requirement." }, 400);
    const result = await uploadOnboardingFile(current, {
      workspaceId: z.string().uuid().parse(String(form.get("workspaceId") ?? "")),
      caseId: z.string().uuid().parse(String(form.get("caseId") ?? "")),
      requirementId: z.string().uuid().parse(String(form.get("requirementId") ?? "")),
      file,
    });
    return json(result, 201);
  } catch (error) {
    return failure(error);
  }
}
