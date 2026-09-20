import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import {
  acceptOnboardingRequirement,
  attachExistingOnboardingDocument,
  assignOnboardingCase,
  createOnboardingCase,
  listOnboardingAttachableDocuments,
  listOnboardingCases,
  readOnboardingCase,
  readOnboardingUpload,
  requestOnboardingCorrection,
  reviewOnboardingRequirement,
  OnboardingConflictError,
  OnboardingUnavailableError,
} from "@/products/onboarding/server";

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
  if (error instanceof z.ZodError) return json({ error: "Check the onboarding details and try again." }, 400);
  if (error instanceof WorkspaceStoreError) return json({ error: error.message }, 503);
  return json({ error: "Onboarding storage is unavailable. Your change has not been confirmed." }, 503);
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  const current = await actor();
  if (!current) return json({ error: "Sign in to open onboarding." }, 401);
  try {
    const params = new URL(request.url).searchParams;
    const documentWorkId = params.get("documentWorkId");
    if (documentWorkId) return json(await readOnboardingUpload(current, documentWorkId));
    const workspaceId = z.string().uuid().parse(params.get("workspaceId") ?? "");
    const caseId = params.get("caseId");
    if (caseId) {
      const result = await readOnboardingCase(current, caseId);
      if (result.workspaceId !== workspaceId) throw new WorkspaceAccessError();
      const documents = params.get("includeDocuments") === "1" ? await listOnboardingAttachableDocuments(current, workspaceId) : undefined;
      return json(documents ? { ...result, documents } : result);
    }
    const documents = params.get("includeDocuments") === "1" ? await listOnboardingAttachableDocuments(current, workspaceId) : undefined;
    return json({ workspaceId, cases: await listOnboardingCases(current, workspaceId), ...(documents ? { documents } : {}) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  if (!sameOrigin(request)) return json({ error: "Open Strelva directly to change onboarding." }, 403);
  const current = await actor();
  if (!current) return json({ error: "Sign in to change onboarding." }, 401);
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Send a JSON onboarding request." }, 415);
    const body = z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), input: z.unknown() }).strict(),
      z.object({ action: z.literal("assign"), caseId: z.string().uuid(), email: z.string(), userId: z.string().uuid().optional() }).strict(),
      z.object({ action: z.literal("attach"), workspaceId: z.string().uuid(), caseId: z.string().uuid(), requirementId: z.string().uuid(), documentWorkId: z.string().uuid() }).strict(),
      z.object({ action: z.literal("review"), caseId: z.string().uuid(), requirementId: z.string().uuid(), values: z.unknown() }).strict(),
      z.object({ action: z.literal("correction"), caseId: z.string().uuid(), requirementId: z.string().uuid(), note: z.string().optional() }).strict(),
      z.object({ action: z.literal("accept"), caseId: z.string().uuid(), requirementId: z.string().uuid() }).strict(),
    ]).parse(await request.json());
    if (body.action === "create") return json(await createOnboardingCase(current, body.input), 201);
    if (body.action === "assign") return json(await assignOnboardingCase(current, body.caseId, { email: body.email, userId: body.userId }));
    if (body.action === "attach") return json(await attachExistingOnboardingDocument(current, body));
    if (body.action === "review") return json(await reviewOnboardingRequirement(current, body.caseId, body.requirementId, body.values));
    if (body.action === "correction") return json(await requestOnboardingCorrection(current, body.caseId, body.requirementId, body.note));
    return json(await acceptOnboardingRequirement(current, body.caseId, body.requirementId));
  } catch (error) {
    return failure(error);
  }
}
