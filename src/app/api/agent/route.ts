import { stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { streamModelText, type ModelTextStream } from "@/platform/infra/model-calls";
import { logger } from "@/lib/logger";
import { trackError } from "@/lib/monitoring";
import { isSuperAdmin, requireTenantPermission, getAuthUserId } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { getTenantConfig } from "@/lib/tenants";
import { requireActiveSubscription } from "@/lib/subscription";
import { capabilityPromptFragment, sanitizePromptValue } from "@/lib/capabilities";
import { buildAgentSystemPrompt } from "@/lib/agent-prompt-shared";
import { getSiteCapabilityManifest } from "@/lib/site-capabilities";
import { resolveGbpWriteAllowed, resolveEditableSections, buildTenantChatTools, chatToolLabel } from "@/lib/agent-shared";
import { isRateLimitedAsync } from "@/lib/rate-limit";
import { classifySource, recordAgentToolCall } from "@/lib/proof-signals";
import {
  agentResultFromToolOutput,
  buildAgentResultContract,
  type AgentActionResult,
} from "@/lib/agent-results";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { readJsonObject } from "@/lib/request-body";

type IncomingMessagePart = { type?: string; text?: string };

type IncomingMessage = {
  role?: string;
  content?: string | IncomingMessagePart[];
  parts?: IncomingMessagePart[];
};

const nodeContextSchema = z
  .object({
    selectedSection: z.string().trim().min(1).max(64),
    selectedField: z.string().trim().min(1).max(128).optional(),
    currentValue: z.string().max(2_000).optional(),
    sectionData: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function isIncomingMessage(value: unknown): value is IncomingMessage {
  return value !== null && typeof value === "object";
}

function isModelMessageArray(value: unknown): value is ModelMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return false;
  let totalTextLength = 0;
  return value.every((message) => {
    if (!isIncomingMessage(message)) return false;
    // The server owns the system prompt and tool transcript. Browser history may
    // contain only the two visible conversation roles.
    if (message.role !== "user" && message.role !== "assistant") return false;
    const text = textFromMessage(message);
    if (!text || text.length > 20_000) return false;
    totalTextLength += text.length;
    return totalTextLength <= 100_000;
  });
}

function textFromMessage(message: IncomingMessage): string | undefined {
  if (typeof message.content === "string") return message.content;
  const parts = Array.isArray(message.content) ? message.content : message.parts;
  const text = parts
    ?.map((part) => (part?.type === "text" ? part.text || "" : ""))
    .join(" ")
    .trim();
  return text || undefined;
}

async function buildSystemPrompt(tenant: string, capFragment: string): Promise<string> {
  return buildAgentSystemPrompt(tenant, capFragment);
}

export async function POST(req: Request) {
  const tenant = await getTenantFromHeaders();

  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;

  // Rate-limit per user (not per tenant) so one user can't exhaust the quota
  // for all other users sharing the same tenant.
  const rateLimitUserId = (await getAuthUserId()) ?? "anonymous";
  if (await isRateLimitedAsync(`agent:${tenant}:${rateLimitUserId}`, 30)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Try again in a minute." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const tenantConfig = await getTenantConfig(tenant);
  const body = await readJsonObject(req);
  if (!body) {
    return new Response(
      JSON.stringify({ error: "Invalid request body." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const rawMessages = body.messages;
  const activeSection =
    typeof body.activeSection === "string"
      ? sanitizePromptValue(body.activeSection).slice(0, 64)
      : undefined;
  const parsedNodeContext = nodeContextSchema.safeParse(body.nodeContext);
  if (body.nodeContext !== undefined && !parsedNodeContext.success) {
    return new Response(JSON.stringify({ error: "Invalid selected element context." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const nodeContext = parsedNodeContext.success ? parsedNodeContext.data : undefined;
  if (!isModelMessageArray(rawMessages)) {
    return new Response(
      JSON.stringify({ error: "Invalid message payload." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const messages = rawMessages;
  const template = await getTemplateManifestForTenant(tenant);
  const siteManifest = await getSiteCapabilityManifest(tenant);

  // Capture the latest user message for proof-signal logging (Workstream E).
  // Vercel AI SDK messages can have parts or plain string content — handle both.
  const lastUserMessage = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.role !== "user") continue;
      const text = textFromMessage(m as IncomingMessage);
      if (text) return text;
    }
    return undefined;
  })();
  const askerIsOperator = await isSuperAdmin();
  const signalSource = classifySource(askerIsOperator);
  const signalSiteName = tenantConfig?.siteName || tenant;
  const capFragment = capabilityPromptFragment();
  let systemPrompt = await buildSystemPrompt(tenant, capFragment);
  const actionResults: AgentActionResult[] = [];
  const recordActionResult = (result: AgentActionResult) => {
    const key = JSON.stringify(result);
    if (actionResults.some((existing) => JSON.stringify(existing) === key)) return;
    actionResults.push(result);
  };

  if (activeSection) {
    systemPrompt += `\n\nCONTEXT: The user is currently viewing the "${activeSection}" section in their dashboard editor. When they say "this", "it", "add one", "update this", etc., they are referring to ${activeSection}. Proactively reference this section in your responses.`;
  }

  // Enhanced node context from canvas selection
  if (nodeContext) {
    let contextBlock = `\n\nSELECTED ELEMENT CONTEXT:`;
    contextBlock += `\n- Section: ${sanitizePromptValue(nodeContext.selectedSection)}`;
    if (nodeContext.selectedField) {
      contextBlock += `\n- Field: ${sanitizePromptValue(nodeContext.selectedField)}`;
    }
    if (nodeContext.currentValue) {
      const truncated = nodeContext.currentValue.length > 200
        ? nodeContext.currentValue.slice(0, 200) + "..."
        : nodeContext.currentValue;
      const safeValue = sanitizePromptValue(truncated);
      contextBlock += `\n- Current value: "${safeValue}"`;
    }
    if (nodeContext.sectionData && Object.keys(nodeContext.sectionData).length > 0) {
      // Cap the serialized section data to avoid bloating the system prompt.
      const raw = JSON.stringify(nodeContext.sectionData);
      const capped = raw.length > 1_000 ? raw.slice(0, 1_000) + "..." : raw;
      contextBlock += `\n- Section data: ${capped}`;
    }
    contextBlock += `\n\nWhen the user says "this", "it", "make it", "change this", they are referring to the selected element above. Apply changes directly to this specific field.`;
    systemPrompt += contextBlock;
  }

  const { agentEditableSections, sectionEnum } = resolveEditableSections(template, siteManifest);

  systemPrompt += `\n\nSITE CONFIGURABILITY MANIFEST:
- Page config: ${siteManifest.supportsPageConfig ? "supported" : "not supported"}
- Navigation config: ${siteManifest.supportsNavigationConfig ? "supported" : "not supported"}
- Footer config: ${siteManifest.supportsFooterConfig ? "supported" : "not supported"}
- Draft preview: ${siteManifest.supportsDraftPreview ? "supported" : "not supported"}
- Inline editing: ${siteManifest.supportsInlineEditing ? "supported" : "not supported"}
- Supported design tokens: ${siteManifest.designTokens.join(", ") || "(none)"}
- Editable sections: ${agentEditableSections.join(", ") || "(none)"}
- Custom-only features: ${siteManifest.customOnlyFeatures.join(", ") || "(none)"}
- Custom request endpoint: ${siteManifest.customRequestEndpoint || "(none)"}
Only use tools for manifest-supported sections and actions. If the user requests cart, rewards, checkout, product-modal, email-popup, chat, or another custom-only feature, use request_custom_change instead of claiming it can be changed directly.`;

  // sectionEnum is built above via resolveEditableSections (shared with the executor).

  // Google Business write tools (post / hours / photo) are gated: they only
  // appear for a LOCAL (or hybrid) business whose owner has connected a Google
  // account that granted the `business.manage` write scope. Belt-and-suspenders:
  // the lib write functions still re-check scope at act time (on approval).
  const gbpWriteAllowed = await resolveGbpWriteAllowed(tenant, tenantConfig);

  // Every tool is defined once in src/lib/agent-shared.ts (buildTenantChatTools);
  // this route's side effect per tool result is a streamed result card.
  const tools = await buildTenantChatTools({
    tenantId: tenant,
    tenantConfig,
    siteManifest,
    sectionEnum,
    actor: await workspaceHttpActor(),
    gbpWriteAllowed,
    onResult: recordActionResult,
  });

  // Stream text + tool-call status events as SSE-like lines
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // Tracks whether anything visible has been emitted on THIS request, so
      // the fallback only fires when retrying is still safe (no partial output).
      let emittedToClient = false;

      const consume = async (result: ModelTextStream): Promise<void> => {
        for await (const part of result.fullStream) {
          if (part.type === "error") {
            // Surface as a thrown error so the catch below can decide on fallback.
            throw part.error;
          } else if (part.type === "tool-call") {
            emittedToClient = true;
            const toolName = part.toolName;
            const input = ("args" in part ? part.args : "input" in part ? part.input : undefined) as Record<string, unknown> | undefined;
            const section = input?.section as string | undefined;

            // Proof-signal: fire-and-forget Slack + Redis counter (Workstream E).
            // Do NOT await — chat latency must not depend on Slack.
            void recordAgentToolCall({
              tenantId: tenant,
              siteName: signalSiteName,
              userMessage: lastUserMessage,
              toolName,
              source: signalSource,
            });
            const label = chatToolLabel(toolName, section);
            controller.enqueue(encoder.encode(`__TOOL__${label}\n`));
          } else if (part.type === "tool-result") {
            const output = ("result" in part ? part.result : "output" in part ? part.output : undefined) as unknown;
            // Inline display tools (show_report/show_content/show_photos/...) return
            // { __inlineTool, ...cardData }. Stream it as a __CARD__ line so the chat
            // renders the rich card — the data was built here but never sent (H5).
            if (output && typeof output === "object" && "__inlineTool" in output) {
              controller.enqueue(encoder.encode(`__CARD__${JSON.stringify(output)}\n`));
            }
            const actionResult = agentResultFromToolOutput(output);
            if (actionResult) recordActionResult(actionResult);
          } else if (part.type === "text-delta") {
            const text = "text" in part ? part.text : "";
            if (text) emittedToClient = true;
            controller.enqueue(encoder.encode(text));
          }
        }
      };

      try {
        // Primary/fallback model resilience through the one model-call helper:
        // chat survives a Gemini outage by retrying the whole turn on the
        // configured fallback model, but only when the primary fails *before*
        // any content reached the client, so a half-streamed answer is never
        // duplicated. One cost row per provider call.
        await streamModelText(
          { purpose: "ask", tenantId: tenant, actorKind: askerIsOperator ? "operator" : "member" },
          { system: systemPrompt, messages, tools, stopWhen: stepCountIs(8) },
          consume,
          { emitted: () => emittedToClient },
        );
      } catch (err) {
        // Both models failed (or the client disconnected). If nothing was
        // streamed, send a plain-English line so the chat doesn't go silent.
        if (!emittedToClient) {
          logger.error("[agent-chat] Chat turn failed with no fallback recovery", {
            tenant,
            error: err instanceof Error ? err.message : "unknown",
          });
          // Surface to Sentry — a total AI-turn failure (both models down) is
          // otherwise console-only and invisible in production.
          trackError(err, { tenant, op: "agent.chat" });
          try {
            controller.enqueue(
              encoder.encode(
                "Sorry — I'm having trouble reaching the AI right now. Please try that again in a moment."
              )
            );
          } catch {
            // Client already gone.
          }
        }
      } finally {
        try {
          controller.enqueue(encoder.encode(`\n__RESULT__${JSON.stringify(buildAgentResultContract(actionResults))}\n`));
        } catch {
          // Client disconnected before the final result contract could be sent.
        }
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
