import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  WorkPlanInvalidOutputError,
  WorkPlanNotFoundError,
  WorkPlanFundingRequiredError,
  WorkPlanGenerationReplayError,
  WorkPlanUnavailableError,
  WorkPlanUnsupportedOperationError,
  createWorkPlan,
  createWorkPlanRequestSchema,
  listWorkPlanOutputs,
  presentWorkPlan,
  readWorkPlan,
} from "@/products/work-plans";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces";

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

/** Keep the planning request bounded even when the client streams its body. */
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
      if (bytes > 24_000) {
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
  if (error instanceof WorkPlanFundingRequiredError) return json({ error: error.message, code: "planning_funding_required" }, 428);
  if (error instanceof WorkPlanGenerationReplayError) return json({ error: error.message, code: "planning_receipt_requires_reconciliation" }, 409);
  if (error instanceof WorkspaceConflictError) return json({ error: "This workspace cannot save another plan right now." }, 409);
  if (error instanceof WorkPlanUnsupportedOperationError) {
    return json({ error: "The request includes work Strelva cannot perform in this workspace yet.", code: "unsupported_operation" }, 422);
  }
  if (error instanceof WorkPlanInvalidOutputError) {
    return json({ error: "The planning provider did not return a usable plan. Nothing was saved.", code: "invalid_plan" }, 503);
  }
  if (error instanceof WorkPlanUnavailableError) {
    return json({ error: "Planning is unavailable right now. Nothing was saved.", code: "planning_unavailable" }, 503);
  }
  if (error instanceof z.ZodError) return json({ error: "Check the planning request and try again." }, 400);
  if (error instanceof WorkspaceStoreError) return json({ error: "Saved work is unavailable right now. Nothing was saved." }, 503);
  return json({ error: "We couldn't prepare this plan. Nothing was saved." }, 503);
}

const readQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  workId: z.string().uuid(),
}).strict();

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "The workspace release is not enabled." }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in with a confirmed email to open your plan." }, 401);
    const query = new URL(request.url).searchParams;
    const { workspaceId, workId } = readQuerySchema.parse({
      workspaceId: query.get("workspaceId"),
      workId: query.get("workId"),
    });
    const record = await readWorkPlan({ actor: current, workspaceId, workId });
    const executions = await listWorkPlanOutputs({ actor: current, workspaceId, planWorkId: workId });
    return json(presentWorkPlan(record, executions));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "The workspace release is not enabled." }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Open Strelva directly to prepare a plan." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Send a JSON planning request." }, 415);
  }
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in with a confirmed email to prepare a plan." }, 401);
    const input = createWorkPlanRequestSchema.parse(await readBody(request));
    if (await isRateLimitedWindowedAsync(`workspace:planning:${current.userId}`, 5, 60_000)) {
      return json({ error: "Please wait before preparing another plan." }, 429);
    }
    const result = await createWorkPlan({ actor: current, ...input });
    return json(presentWorkPlan(result), 201);
  } catch (error) {
    return failure(error);
  }
}
