import { describe, expect, it, vi } from "vitest";
import { ModelBudgetPausedError } from "@/platform/infra/business-ai-budget";
import { ASSISTANT_POLICIES } from "@/platform/infra/assistant-policy";
import { assistantFailure, consumeAssistantParts, type AssistantHandlers, type AssistantPart } from "@/platform/assistant/core";

async function* parts(...items: AssistantPart[]): AsyncIterable<AssistantPart> {
  for (const item of items) yield item;
}

function handlers(overrides: Partial<AssistantHandlers> = {}) {
  const lines: string[] = [];
  const text: string[] = [];
  const value: AssistantHandlers = {
    toolCall: () => "Working",
    toolResult: () => null,
    text: (chunk) => { text.push(chunk); },
    line: (line) => { lines.push(line); },
    ...overrides,
  };
  return { value, lines, text };
}

describe("consumeAssistantParts", () => {
  it("marks text deltas as emitted and hands them to text()", async () => {
    const h = handlers();
    const state = { emitted: false };
    await consumeAssistantParts(parts({ type: "text-delta", text: "Hello" }, { type: "text-delta", text: "" }), ASSISTANT_POLICIES.workspace_ask, h.value, state);
    expect(state.emitted).toBe(true);
    expect(h.text).toEqual(["Hello"]);
  });

  it("counts a tool call as output only when the policy says so", async () => {
    for (const [policy, expected] of [[ASSISTANT_POLICIES.tenant_chat, true], [ASSISTANT_POLICIES.operator, false]] as const) {
      const state = { emitted: false };
      const h = handlers();
      await consumeAssistantParts(parts({ type: "tool-call", toolName: "read", input: {} }), policy, h.value, state);
      expect(state.emitted).toBe(expected);
      expect(h.lines).toEqual(["__TOOL__Working\n"]);
    }
  });

  it("reads both args and input, and both result and output", async () => {
    const toolCall = vi.fn(() => null);
    const toolResult = vi.fn(() => null);
    await consumeAssistantParts(
      parts(
        { type: "tool-call", toolName: "a", args: { x: 1 } },
        { type: "tool-call", toolName: "b", input: { y: 2 } },
        { type: "tool-result", toolName: "a", result: "r" },
        { type: "tool-result", toolName: "b", output: "o" },
      ),
      ASSISTANT_POLICIES.tenant_chat,
      handlers({ toolCall, toolResult }).value,
      { emitted: false },
    );
    expect(toolCall).toHaveBeenNthCalledWith(1, { toolName: "a", input: { x: 1 } });
    expect(toolCall).toHaveBeenNthCalledWith(2, { toolName: "b", input: { y: 2 } });
    expect(toolResult).toHaveBeenNthCalledWith(1, { toolName: "a", output: "r" });
    expect(toolResult).toHaveBeenNthCalledWith(2, { toolName: "b", output: "o" });
  });

  it("throws an error part", async () => {
    const boom = new Error("boom");
    await expect(consumeAssistantParts(parts({ type: "error", error: boom }), ASSISTANT_POLICIES.operator, handlers().value, { emitted: false })).rejects.toBe(boom);
  });

  it("emits a card line only for a non-null card", async () => {
    const h = handlers({ toolResult: ({ toolName }) => (toolName === "show" ? { a: 1 } : null) });
    await consumeAssistantParts(
      parts({ type: "tool-result", toolName: "other", output: 1 }, { type: "tool-result", toolName: "show", output: 2 }),
      ASSISTANT_POLICIES.tenant_chat, h.value, { emitted: false },
    );
    expect(h.lines).toEqual(['__CARD__{"a":1}\n']);
  });
});

describe("assistantFailure", () => {
  const policy = ASSISTANT_POLICIES.tenant_chat;
  it("explains a budget refusal even after output", () => {
    const error = new ModelBudgetPausedError(0, 0, {});
    expect(assistantFailure(error, true, policy)).toEqual({ kind: "budget", message: error.message });
  });
  it("says it cannot answer only when nothing was shown", () => {
    expect(assistantFailure(new Error("x"), false, policy)).toEqual({ kind: "no_answer", message: policy.noAnswer });
    expect(assistantFailure(new Error("x"), true, policy)).toEqual({ kind: "partial" });
  });
});
