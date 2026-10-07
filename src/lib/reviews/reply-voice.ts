/**
 * Per-client "reply voice" — how a client wants Strelva to answer their reviews,
 * so replies read like the owner wrote them, not a bot. Three parts:
 *
 *   • mode      — off / approve (draft, owner OKs) / auto (draft + post itself)
 *   • guidance  — one plain paragraph: "how we sound"
 *   • templates — an example reply per review type, the AI mirrors the voice of
 *
 * Stored as one JSON blob in Redis (`reb:reply-voice:{tenant}`, same pattern as
 * the operator CRM / leads — internal per-tenant metadata, no DB migration).
 * Degrades to a safe default (mode "approve", no templates) without Redis.
 */

import { mirrorRecord, readSetting } from "../client-records";
import { getRedis } from "@/platform/infra/redis";
// The policy bridge (src/platform/needs-you/tenant-settings.ts) through the
// port src/lib declares (Strelva Reborn section 7).
import { workspacePorts, type TenantPolicyLayer, type TenantPolicyOptions as BridgeOptions } from "../workspace-ports";

export type ReplyMode = "off" | "approve" | "auto";

/** The review situations a client tends to answer differently. */
export const REPLY_TEMPLATE_KINDS = [
  { key: "praise", label: "Happy review", hint: "4–5 stars, someone's thrilled" },
  { key: "critical", label: "Unhappy review", hint: "1–2 stars, something went wrong" },
  { key: "question", label: "Question or mixed", hint: "3 stars, or they asked something" },
] as const;

export type ReplyTemplateKey = (typeof REPLY_TEMPLATE_KINDS)[number]["key"];

export interface ReplyTemplate {
  key: ReplyTemplateKey;
  /** An example reply in the owner's voice — the AI mirrors its tone, not its words. */
  example: string;
}

export interface ReplyVoice {
  mode: ReplyMode;
  guidance: string;
  templates: ReplyTemplate[];
  updatedAt: string | null;
}

/** The safe default: draft-and-approve, nothing auto-posts, no voice set yet. */
export function defaultReplyVoice(): ReplyVoice {
  return { mode: "approve", guidance: "", templates: [], updatedAt: null };
}

function key(tenantId: string): string {
  return `reb:reply-voice:${tenantId}`;
}

/**
 * The voice, with its mode from `decision_policies` (`review.reply`) when the
 * tenant is linked to a business, the release is on and the setting has
 * moved there (src/platform/needs-you/tenant-settings.ts). "off" (draft
 * nothing) is not a route and stays with the Redis blob, as do the guidance
 * and templates.
 */
export async function getReplyVoice(tenantId: string, options: BridgeOptions = {}): Promise<ReplyVoice> {
  const voice = await readSetting(tenantId, "reply_voice", () => readRedisVoice(tenantId), defaultReplyVoice());
  if (voice.mode === "off") return voice;
  const policy = await workspacePorts().tenantPolicy();
  const route = await policy.readTenantPolicyRoute(tenantId, "review.reply", options);
  return route ? { ...voice, mode: policy.replyModeFromRoute(route) } : voice;
}

async function readRedisVoice(tenantId: string): Promise<ReplyVoice> {
  const redis = getRedis();
  if (!redis) return defaultReplyVoice();
  try {
    const stored = await redis.get<ReplyVoice>(key(tenantId));
    if (!stored) return defaultReplyVoice();
    // Merge onto the default so a partial/legacy blob can never miss a field.
    return {
      mode: stored.mode ?? "approve",
      guidance: typeof stored.guidance === "string" ? stored.guidance : "",
      templates: Array.isArray(stored.templates) ? stored.templates : [],
      updatedAt: stored.updatedAt ?? null,
    };
  } catch {
    return defaultReplyVoice();
  }
}

const MAX_GUIDANCE = 600;
const MAX_EXAMPLE = 500;
const VALID_KINDS = new Set<ReplyTemplateKey>(REPLY_TEMPLATE_KINDS.map((k) => k.key));

/** Validate + persist a voice. Trims and caps free text; drops unknown template
 *  kinds and empty examples so the store can't be poisoned by request input. */
export interface ReplyVoiceWriter {
  actor: { userId: string; verifiedEmail: string };
  /** "owner" for the client's own choice; "strelva" for an operator. */
  layer: TenantPolicyLayer;
}

/**
 * With a writer, an "approve" or "auto" mode is written to decision_policies
 * first when the tenant is linked (a refusal throws and nothing is saved).
 * The Redis blob is always written. The returned mode is the one in force.
 */
export async function saveReplyVoice(
  tenantId: string,
  input: { mode?: ReplyMode; guidance?: string; templates?: { key?: string; example?: string }[] },
  writer: ReplyVoiceWriter | null = null,
  options: BridgeOptions = {},
): Promise<ReplyVoice> {
  const requested: ReplyMode =
    input.mode === "off" || input.mode === "auto" || input.mode === "approve" ? input.mode : "approve";
  let inForce: ReplyMode = requested;
  if (writer && requested !== "off") {
    const policy = await workspacePorts().tenantPolicy();
    const result = await policy.writeTenantPolicySetting({
      tenantId, actor: writer.actor, layer: writer.layer, kind: "review.reply",
      todayValue: (await readRedisVoice(tenantId)).mode, via: writer.layer === "owner" ? "owner_save" : "operator_save",
      plan: () => policy.planReplyMode(requested, writer.layer),
    }, options);
    if (result.stored === "decision_policies") inForce = policy.replyModeFromRoute(result.route);
  }
  const saved = await saveRedisVoice(tenantId, { ...input, mode: requested });
  return { ...saved, mode: inForce };
}

async function saveRedisVoice(
  tenantId: string,
  input: { mode?: ReplyMode; guidance?: string; templates?: { key?: string; example?: string }[] },
): Promise<ReplyVoice> {
  const redis = getRedis();
  const mode: ReplyMode =
    input.mode === "off" || input.mode === "auto" || input.mode === "approve" ? input.mode : "approve";
  const guidance = (input.guidance ?? "").trim().slice(0, MAX_GUIDANCE);
  const templates: ReplyTemplate[] = [];
  const seen = new Set<string>();
  for (const t of input.templates ?? []) {
    const k = t.key as ReplyTemplateKey;
    const example = (t.example ?? "").trim().slice(0, MAX_EXAMPLE);
    if (!VALID_KINDS.has(k) || seen.has(k) || !example) continue;
    seen.add(k);
    templates.push({ key: k, example });
  }
  const voice: ReplyVoice = { mode, guidance, templates, updatedAt: new Date().toISOString() };
  if (redis) {
    await redis.set(key(tenantId), voice);
    await mirrorRecord("tenant_settings", tenantId, "reply_voice", { value: voice });
  }
  return voice;
}

/** Compact voice instructions for the reply drafter's prompt — empty string when
 *  nothing is set (so the base prompt is unchanged for clients who haven't tuned
 *  their voice). `rating` picks the most relevant example template. */
export function buildVoicePromptSection(voice: ReplyVoice, rating: number): string {
  const parts: string[] = [];
  if (voice.guidance) parts.push(`How this business sounds: ${voice.guidance}`);
  const wantKind: ReplyTemplateKey = rating >= 4 ? "praise" : rating <= 2 ? "critical" : "question";
  const example =
    voice.templates.find((t) => t.key === wantKind)?.example ?? voice.templates[0]?.example;
  if (example) {
    parts.push(
      `Mirror the tone and phrasing style of this example the owner wrote (do NOT copy it — write fresh for THIS review): "${example}"`,
    );
  }
  return parts.length ? "\n\nVOICE — match how this owner actually talks:\n" + parts.join("\n") : "";
}
