import { stepCountIs } from "ai";
import { isSuperAdmin } from "@/platform/infra/auth";
import { isRateLimitedAsync } from "@/platform/infra/rate-limit";
import { inquiryReleaseEnabledForWorkspace } from "@/products/inquiries";
import { releaseViewerFor } from "@/platform/release-flags/viewer";
import { systemsReleasedFor } from "@/platform/systems-release";
import {
  AskConversationNotFoundError,
  askReleaseMayBeOn,
  createNeedsYouAskAdapter,
  createServiceRequestAdapter,
  createSupabaseAskHistory,
  createTenantEventNeedsYouAdapter,
  type NeedsYouPort,
  startAskTurn,
  type AskTurnDeps,
} from "@/platform/ask";
import { loadTenantAskTools, tenantGoogleWriteGranted } from "@/platform/ask/tenant-tools-adapter";
import { createAskWorkspaceDraftPort } from "./workspace-drafts-server";
import { streamModelText } from "@/platform/infra/model-calls";
import { createAskPossibilityPort } from "./possibilities-server";
import { PostgresServiceRequestStore, ServiceRequestService } from "@/platform/service-requests";
import { readExistingSystemsSnapshot } from "@/platform/systems/from-existing";
import { readWorkspaceExit } from "@/platform/workspace-exit";
import { listWorkspaces } from "@/platform/workspaces";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { getEventRaw, updateEvent } from "@/lib/events";
import { classifyTenantEvent } from "@/platform/needs-you/tenant-classify";
import { evaluateRoute } from "@/platform/needs-you/evaluator";
import { needsYouReleaseEnabled, needsYouService, needsYouStore } from "@/experience/workspace/needs-you-server";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

/**
 * With STRELVA_NEEDS_YOU_RELEASE on, Ask hands every draft to the real Needs
 * you service: the item opens through the tenant-event adapter and the owner
 * decides it on Home or from the email. Off, today's tenant queue.
 */
function askNeedsYou(actor: WorkspaceActor): { port: NeedsYouPort; path: string } {
  const fallback = createTenantEventNeedsYouAdapter();
  if (!needsYouReleaseEnabled()) return { port: fallback, path: "/dashboard/review" };
  const service = needsYouService();
  return {
    path: "/workspace",
    port: createNeedsYouAskAdapter({
      fallback,
      linkedTenants: async (workspaceId) => (await needsYouStore.linkedTenants(workspaceId)).map((link) => link.tenantId),
      async prepare(draft) {
        const policies = await needsYouStore.policies(actor, draft.workspaceId);
        for (const eventId of draft.eventIds) {
          const updated = await updateEvent(eventId, (event) => {
            if (event.tenantId !== draft.tenantId || event.status !== "pending") return event;
            const classification = classifyTenantEvent(event);
            if (!classification) return event;
            const origin = draft.askedOnBehalf ? "owner_interpreted" : draft.origin;
            const policy = evaluateRoute({ ...classification, origin, systemId: draft.systemId, policies });
            // Ask only proposes. A policy that could handle routine work still
            // goes to Strelva's review here; chat never becomes its own publisher.
            const route = policy.route === "owner_decides" ? "owner_decides" : "strelva_reviews";
            return { ...event, metadata: { ...event.metadata, reviewAudience: route === "owner_decides" ? "owner" : "operator",
              askStrelva: { workspaceId: draft.workspaceId, systemId: draft.systemId, toolId: draft.toolId,
                origin, askedOnBehalf: draft.askedOnBehalf, evaluatedRoute: policy.route, policyRule: policy.rule } } };
          });
          if (!updated.changed || updated.event?.tenantId !== draft.tenantId) throw new Error("The draft's decision could not be registered. It stays in the review queue.");
        }
      },
      sync: (workspaceId) => service.sync({ workspaceId, actor }),
      openItems: (workspaceId) => needsYouStore.list(actor, workspaceId, false),
      readEvent: getEventRaw,
      decideAt: (workspaceId) => `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`,
    }),
  };
}

/**
 * POST /api/workspace/ask: Ask Strelva in a business workspace.
 *
 * Off unless STRELVA_WORKSPACE_RELEASE and STRELVA_ASK_RELEASE are "1" and
 * STRELVA_SYSTEMS_RELEASE is "1" or "workspace", checked before any session
 * or body read. Under "workspace" the turn also needs Systems on for the
 * asked workspace (its release row), checked after membership.
 * Streams the same line protocol as /api/agent (`__TOOL__`, `__CARD__`,
 * `__RESULT__`), so one chat component renders both.
 */
export async function POST(request: Request) {
  if (!askReleaseMayBeOn()) return workspaceJson({ error: "Ask Strelva is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    if (await isRateLimitedAsync(`ask:${actor.userId}`, 30)) return workspaceJson({ error: "Too many requests. Try again in a minute." }, 429);
    const body = await readWorkspaceBody(request, 150_000);
    const requests = createServiceRequestAdapter(new ServiceRequestService(PostgresServiceRequestStore));
    const needsYou = askNeedsYou(actor);
    const deps: AskTurnDeps = {
      isOperator: await isSuperAdmin(),
      async readMembership(current, workspaceId) {
        const workspace = (await listWorkspaces(current)).find((item) => item.id === workspaceId);
        return workspace && workspace.access !== "provider_seat" ? { role: workspace.role ?? null, access: workspace.access, kind: workspace.kind } : null;
      },
      async readExited(current, workspaceId) {
        const exit = await readWorkspaceExit(current, workspaceId);
        return exit.state?.status === "completed";
      },
      readSystems: (current, workspaceId) => readExistingSystemsSnapshot(current, workspaceId),
      loadTenantTools: loadTenantAskTools,
      googleWriteGranted: tenantGoogleWriteGranted,
      inquiriesEnabled: async (workspaceId) => inquiryReleaseEnabledForWorkspace(workspaceId, await releaseViewerFor(actor)),
      released: (current, workspaceId) => systemsReleasedFor(current, workspaceId),
      needsYou: needsYou.port,
      workspaceDrafts: createAskWorkspaceDraftPort({ sync: (current, workspaceId) => needsYouService().sync({ actor: current, workspaceId }), needsYouStore }),
      requests,
      possibilities: createAskPossibilityPort(actor, {
        ...(needsYouReleaseEnabled() ? { sync: (current, workspaceId) => needsYouService().sync({ actor: current, workspaceId }) } : {}),
      }),
      async stream(input, consume, emitted) {
        await streamModelText(
          { purpose: "ask", ...input.context },
          { system: input.system, messages: input.messages, tools: input.tools, stopWhen: stepCountIs(8) },
          (result) => consume(result.fullStream as AsyncIterable<{ type: string } & Record<string, unknown>>),
          { emitted },
        );
      },
      newTurnId: () => crypto.randomUUID(),
      needsYouPath: needsYou.path,
      history: createSupabaseAskHistory(),
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

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * GET /api/workspace/ask?workspaceId=…[&systemId=…][&conversationId=…]
 *
 * Saved conversations for this business (owners and admins see all; a member
 * sees their own), or one conversation's messages with each turn's result.
 * Same release gate as POST; reads only.
 */
export async function GET(request: Request) {
  if (!askReleaseMayBeOn()) return workspaceJson({ error: "Ask Strelva is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const params = new URL(request.url).searchParams;
    const workspaceId = params.get("workspaceId") ?? "";
    const systemId = params.get("systemId");
    const conversationId = params.get("conversationId");
    if (!UUID.test(workspaceId) || (systemId !== null && !UUID.test(systemId)) || (conversationId !== null && !UUID.test(conversationId))) {
      return workspaceJson({ error: "Check the request. Some fields are missing or invalid." }, 400);
    }
    // Per workspace, like POST: Ask is on only where Systems is on for this business.
    if (!(await systemsReleasedFor(actor, workspaceId))) return workspaceJson({ error: "Ask Strelva is not enabled." }, 503);
    const history = createSupabaseAskHistory();
    if (conversationId) return workspaceJson({ conversation: await history.read(actor, { workspaceId, conversationId, limit: 100 }) });
    const conversations = await history.list(actor, { workspaceId, systemId, limit: 20 });
    return workspaceJson({ conversations, canAskOnBehalf: await isSuperAdmin() });
  } catch (error) {
    if (error instanceof AskConversationNotFoundError) return workspaceJson({ error: error.message }, 404);
    return workspaceHttpFailure(error);
  }
}
