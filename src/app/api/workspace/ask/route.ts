import { stepCountIs } from "ai";
import { isSuperAdmin } from "@/lib/auth";
import { isRateLimitedAsync } from "@/lib/rate-limit";
import { inquiryReleaseEnabled } from "@/products/inquiries";
import {
  askReleaseEnabled,
  createPossibilityAdapter,
  createServiceRequestAdapter,
  createTenantEventNeedsYouAdapter,
  startAskTurn,
  type AskTurnDeps,
} from "@/platform/ask";
import { loadTenantAskTools, tenantGoogleWriteGranted } from "@/platform/ask/tenant-tools-adapter";
import { streamModelText } from "@/platform/infra/model-calls";
import { createInMemoryPossibilityRepository } from "@/platform/possibilities";
import { PostgresServiceRequestStore, ServiceRequestService } from "@/platform/service-requests";
import { readExistingSystemsSnapshot } from "@/platform/systems/from-existing";
import { readWorkspaceExit } from "@/platform/workspace-exit";
import { listWorkspaces } from "@/platform/workspaces";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

/**
 * Possibilities have only an in-memory repository today
 * (docs/product/specs/ask-strelva.md section 5, "New"). One opened here lasts
 * until the server restarts; the receipt marks it `durable: false`.
 */
const possibilityRepository = createInMemoryPossibilityRepository();

/**
 * POST /api/workspace/ask: Ask Strelva in a business workspace.
 *
 * Off unless STRELVA_WORKSPACE_RELEASE, STRELVA_SYSTEMS_RELEASE and
 * STRELVA_ASK_RELEASE are all "1", checked before any session or body read.
 * Streams the same line protocol as /api/agent (`__TOOL__`, `__CARD__`,
 * `__RESULT__`), so one chat component renders both.
 */
export async function POST(request: Request) {
  if (!askReleaseEnabled()) return workspaceJson({ error: "Ask Strelva is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    if (await isRateLimitedAsync(`ask:${actor.userId}`, 30)) return workspaceJson({ error: "Too many requests. Try again in a minute." }, 429);
    const body = await readWorkspaceBody(request, 150_000);
    const requests = createServiceRequestAdapter(new ServiceRequestService(PostgresServiceRequestStore));
    const deps: AskTurnDeps = {
      isOperator: await isSuperAdmin(),
      async readMembership(current, workspaceId) {
        const workspace = (await listWorkspaces(current)).find((item) => item.id === workspaceId);
        return workspace ? { role: workspace.role ?? null, access: workspace.access, kind: workspace.kind } : null;
      },
      async readExited(current, workspaceId) {
        const exit = await readWorkspaceExit(current, workspaceId);
        return exit.state?.status === "completed";
      },
      readSystems: (current, workspaceId) => readExistingSystemsSnapshot(current, workspaceId),
      loadTenantTools: loadTenantAskTools,
      googleWriteGranted: tenantGoogleWriteGranted,
      inquiriesEnabled: () => inquiryReleaseEnabled(),
      needsYou: createTenantEventNeedsYouAdapter(),
      requests,
      possibilities: createPossibilityAdapter(possibilityRepository, { durable: false }),
      async stream(input, consume, emitted) {
        await streamModelText(
          { purpose: "ask", ...input.context },
          { system: input.system, messages: input.messages, tools: input.tools, stopWhen: stepCountIs(8) },
          (result) => consume(result.fullStream as AsyncIterable<{ type: string } & Record<string, unknown>>),
          { emitted },
        );
      },
      newTurnId: () => crypto.randomUUID(),
      needsYouPath: "/dashboard/review",
    };
    const start = await startAskTurn(deps, actor, body);
    if (start.kind === "refused") return workspaceJson({ error: start.error }, start.status);
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        await start.run((chunk) => controller.enqueue(encoder.encode(chunk)));
        try { controller.close(); } catch { /* client gone */ }
      },
    });
    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
