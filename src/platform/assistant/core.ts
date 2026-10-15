import type { ModelMessage, Tool } from "ai";
import { streamModelText, type ModelCallContext } from "@/platform/infra/model-calls";
import { ModelBudgetPausedError, ModelBudgetUnavailableError } from "@/platform/infra/business-ai-budget";
import { assistantCallOptions, type AssistantPolicy } from "@/platform/infra/assistant-policy";

/**
 * The one place a streamed assistant turn is read. Each surface keeps its own
 * auth, prompt, tools, labels and card shapes and plugs them in as handlers;
 * the part loop, the "has anything reached the person" rule and the way a
 * failure is classified live here so the three assistants cannot drift.
 */
export type AssistantPart = { type: string } & Record<string, unknown>;

export interface AssistantHandlers {
  /** Return the status label for a `__TOOL__` line, or null to emit nothing. */
  toolCall(part: { toolName: string; input: Record<string, unknown> | undefined }): string | null;
  /** Return the JSON-serializable card for a `__CARD__` line, or null. Also the place to record action results. */
  toolResult(part: { toolName: string; output: unknown }): unknown | null;
  /** Writes a text delta. */
  text(chunk: string): void;
  /** Writes a control line (already newline-terminated). */
  line(line: string): void;
}

export async function consumeAssistantParts(
  parts: AsyncIterable<AssistantPart>,
  policy: AssistantPolicy,
  handlers: AssistantHandlers,
  state: { emitted: boolean },
): Promise<void> {
  for await (const part of parts) {
    if (part.type === "error") {
      // Thrown so the model-call helper can decide on fallback.
      throw part.error;
    } else if (part.type === "tool-call") {
      if (policy.toolCallCountsAsOutput) state.emitted = true;
      const input = (part.input ?? part.args) as Record<string, unknown> | undefined;
      const label = handlers.toolCall({ toolName: String(part.toolName), input });
      if (label) handlers.line(`__TOOL__${label}\n`);
    } else if (part.type === "tool-result") {
      const output = "output" in part ? part.output : part.result;
      const card = handlers.toolResult({ toolName: String(part.toolName), output });
      if (card !== null && card !== undefined) handlers.line(`__CARD__${JSON.stringify(card)}\n`);
    } else if (part.type === "text-delta") {
      const text = typeof part.text === "string" ? part.text : "";
      if (text) {
        state.emitted = true;
        handlers.text(text);
      }
    }
  }
}

export async function streamAssistantTurn(input: {
  policy: AssistantPolicy;
  context: Omit<ModelCallContext, "purpose">;
  system: string;
  messages: ModelMessage[];
  tools: Record<string, Tool>;
  handlers: AssistantHandlers;
  state: { emitted: boolean };
}): Promise<{ modelLabel: string; attempt: number }> {
  return streamModelText(
    { ...input.context, purpose: input.policy.purpose },
    assistantCallOptions(input.policy, input),
    (result) => consumeAssistantParts(result.fullStream as AsyncIterable<AssistantPart>, input.policy, input.handlers, input.state),
    { emitted: () => input.state.emitted },
  );
}

export type AssistantFailure =
  | { kind: "budget"; message: string }
  | { kind: "no_answer"; message: string }
  | { kind: "partial" };

/** A budget refusal is always explained; a plain failure only reads as "can't answer" when nothing was shown. */
export function assistantFailure(error: unknown, emitted: boolean, policy: AssistantPolicy): AssistantFailure {
  if (error instanceof ModelBudgetPausedError || error instanceof ModelBudgetUnavailableError) return { kind: "budget", message: error.message };
  if (!emitted) return { kind: "no_answer", message: policy.noAnswer };
  return { kind: "partial" };
}
