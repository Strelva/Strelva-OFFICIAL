import { stepCountIs } from "ai";
import type { ModelCallPurpose } from "@/platform/infra/model-calls";

/**
 * One policy per assistant surface. Every chat path reads its step and
 * output limits from here, so a bounded request is what the budget path
 * sees no matter which surface asked. The noAnswer lines are the wording
 * each surface has always used when nothing reached the person.
 */
export const ASSISTANT_SURFACES = ["tenant_chat", "workspace_ask", "operator", "background"] as const;
export type AssistantSurface = (typeof ASSISTANT_SURFACES)[number];

export interface AssistantPolicy {
  surface: AssistantSurface;
  purpose: ModelCallPurpose;
  maxOutputTokens: number;
  maxSteps: number;
  noAnswer: string;
  /** Whether a tool call alone counts as output the person has already seen. */
  toolCallCountsAsOutput: boolean;
}

export const ASSISTANT_POLICIES: Readonly<Record<AssistantSurface, AssistantPolicy>> = Object.freeze({
  tenant_chat: { surface: "tenant_chat", purpose: "ask", maxOutputTokens: 4096, maxSteps: 8, noAnswer: "Strelva can't answer right now. Nothing was changed. Please try again in a moment.", toolCallCountsAsOutput: true },
  workspace_ask: { surface: "workspace_ask", purpose: "ask", maxOutputTokens: 4096, maxSteps: 8, noAnswer: "Strelva can't answer right now. Nothing was changed.", toolCallCountsAsOutput: true },
  operator: { surface: "operator", purpose: "operator", maxOutputTokens: 4096, maxSteps: 8, noAnswer: "Sorry — I couldn't reach the AI just now. Please try that again in a moment.", toolCallCountsAsOutput: false },
  background: { surface: "background", purpose: "ask.background", maxOutputTokens: 4096, maxSteps: 8, noAnswer: "", toolCallCountsAsOutput: false },
});

export function assistantCallOptions<M, T>(policy: AssistantPolicy, input: { system: string; messages: M; tools: T }) {
  return { system: input.system, messages: input.messages, tools: input.tools, stopWhen: stepCountIs(policy.maxSteps), maxOutputTokens: policy.maxOutputTokens };
}

/** Single-shot text purposes (no tools). Per provider request; Gemini 2.5 output includes thinking tokens. */
export const TEXT_PURPOSE_MAX_OUTPUT_TOKENS = { weekly_brief: 2048, suggestion: 2048, report: 2048 } as const;
