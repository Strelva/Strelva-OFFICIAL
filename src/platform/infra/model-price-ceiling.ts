/**
 * A billing ceiling derived from our own list-price table (ADR 0015 allows it
 * only for capped business-paid work, behind STRELVA_AI_LIST_PRICE_CEILING).
 *
 * It is an upper bound on one provider request: the request's own bytes as
 * input, plus the output limit and the model's largest thinking allowance as
 * output. A request it cannot bound (media, provider tools, no output limit,
 * provider options) has no ceiling and stays paused for capped work.
 */
import { MODEL_MAX_THINKING_TOKENS, MODEL_PRICES, type ModelPrice } from "./model-prices";

export const LIST_PRICE_CEILING_QUALIFICATION =
  "list-price ceiling: UTF-8 bytes of prompt+tools+responseFormat (+1024) as input tokens, maxOutputTokens + max thinking tokens as output tokens, priced from MODEL_PRICES";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const parts = (content: unknown): Record<string, unknown>[] | null =>
  Array.isArray(content) && content.every(record) ? (content as Record<string, unknown>[]) : null;

function boundedMessage(message: unknown): boolean {
  if (!record(message)) return false;
  const { role, content } = message;
  if (role === "system") return typeof content === "string";
  const list = parts(content);
  if (!list) return false;
  if (role === "user") return list.every(part => part.type === "text" && typeof part.text === "string");
  if (role === "assistant") return list.every(part => ["text", "reasoning", "tool-call", "tool-result"].includes(String(part.type)) && (part.type !== "tool-result" || boundedToolOutput(part.output)));
  if (role === "tool") return list.every(part => (part.type === "tool-result" && boundedToolOutput(part.output)) || part.type === "tool-approval-response");
  return false;
}

/** A tool result that carries media is not bounded by its bytes. */
function boundedToolOutput(output: unknown): boolean {
  return !record(output) || output.type !== "content";
}

/** The shape a ceiling can bound: text prompts, optional function tools, an output limit, no provider options. */
export function boundedProviderRequest(request: unknown, options: { allowTools: boolean }): request is Record<string, unknown> {
  if (!record(request)) return false;
  if (!Number.isSafeInteger(request.maxOutputTokens) || Number(request.maxOutputTokens) <= 0) return false;
  if (request.providerOptions !== undefined && !(record(request.providerOptions) && Object.keys(request.providerOptions).length === 0)) return false;
  const tools = request.tools;
  if (tools !== undefined && !(Array.isArray(tools) && tools.length === 0)) {
    if (!options.allowTools || !Array.isArray(tools) || !tools.every(tool => record(tool) && tool.type === "function")) return false;
  }
  if (!Array.isArray(request.prompt)) return false;
  return request.prompt.every(boundedMessage);
}

export function listPriceCeiling(
  label: string,
  table: Readonly<Record<string, ModelPrice>> = MODEL_PRICES,
  thinking: Readonly<Record<string, number>> = MODEL_MAX_THINKING_TOKENS,
): (request: unknown, operation: "generate" | "stream") => string | null {
  return (request) => {
    const price = Object.prototype.hasOwnProperty.call(table, label) ? table[label] : undefined;
    if (!price || !boundedProviderRequest(request, { allowTools: true })) return null;
    const inputTokens = new TextEncoder().encode(JSON.stringify({ p: request.prompt, t: request.tools ?? null, r: request.responseFormat ?? null, c: request.toolChoice ?? null })).length + 1024;
    const outputTokens = Number(request.maxOutputTokens) + (Object.prototype.hasOwnProperty.call(thinking, label) ? thinking[label]! : 0);
    const usd = (inputTokens * price.inputUsdPerMillion + outputTokens * price.outputUsdPerMillion) / 1_000_000;
    return (Math.ceil(usd * 1e8) / 1e8).toFixed(8);
  };
}
