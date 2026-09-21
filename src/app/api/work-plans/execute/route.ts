import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces";
import {
  executeWorkPlanOutput,
  executeWorkPlanOutputRequestSchema,
  WorkPlanExecutionConflictError,
  WorkPlanExecutionUnsupportedError,
  WorkPlanInvalidOutputError,
  WorkPlanNotFoundError,
} from "@/products/work-plans";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function actor(): Promise<WorkspaceActor | null> {
  const user = await getSessionUser();
  if (!user?.email || !user.email_confirmed_at) return null;
  return { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new z.ZodError([]);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 128_000) {
        await reader.cancel();
        throw new z.ZodError([]);
      }
      raw += decoder.decode(next.value, { stream: true });
    }
    raw += decoder.decode();
    try {
      return JSON.parse(raw);
    } catch {
      throw new z.ZodError([]);
    }
  } finally {
    reader.releaseLock();
  }
}

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "This workspace is unavailable to your account." }, 403);
  if (error instanceof WorkPlanNotFoundError) return json({ error: "This saved plan is unavailable." }, 404);
  if (error instanceof WorkPlanExecutionConflictError || error instanceof WorkspaceConflictError) {
    return json({ error: "This plan or one of its sources changed. Prepare it again before saving an output.", code: "plan_changed" }, 409);
  }
  if (error instanceof WorkPlanExecutionUnsupportedError) {
    return json({ error: "This plan output is not available in the current workspace.", code: "unsupported_operation" }, 422);
  }
  if (error instanceof WorkPlanInvalidOutputError) {
    return json({ error: "Review the proposed output before saving it.", code: "invalid_output" }, 422);
  }
  if (error instanceof z.ZodError) return json({ error: "Check the output acceptance request." }, 400);
  if (error instanceof WorkspaceStoreError) return json({ error: "The result could not be confirmed. Retry the same request to check it." }, 503);
  return json({ error: "The result could not be confirmed. Retry the same request to check it." }, 503);
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "The workspace release is not enabled." }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Open Strelva directly to accept a plan output." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Send a JSON output acceptance request." }, 415);
  }
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in with a confirmed email to accept a plan output." }, 401);
    const input = executeWorkPlanOutputRequestSchema.parse(await readBody(request));
    if (await isRateLimitedWindowedAsync(`workspace:plan-output:${current.userId}`, 20, 60_000)) {
      return json({ error: "Please wait before accepting another plan output." }, 429);
    }
    const execution = await executeWorkPlanOutput({ actor: current, ...input });
    // The execution itself is the response contract so the workspace can
    // retain and render the receipt without an extra envelope.
    return json(execution, execution.status === "already_completed" ? 200 : 201);
  } catch (error) {
    return failure(error);
  }
}
