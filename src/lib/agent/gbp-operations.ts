import { z } from "zod";
import type { getEvent } from "../events";

/**
 * Operation registry (ontology Phase 3, first increment) — each executable agent
 * operation defined ONCE here, then the AI tools are GENERATED from these
 * definitions (see `buildGbpTools` in `src/lib/agent-shared.ts`) instead of being
 * hand-written. This increment covers the three Google Business Profile write ops,
 * the cleanest already-factored set. It is a pure refactor: the generated tools are
 * behaviour-identical to the previous hand-rolled literals.
 *
 * This file owns the GBP input-schema primitives (`GBP_DAY`, `GBP_PHOTO_CATEGORY`,
 * `optionalUrl`) so the registry is self-contained; `agent-shared.ts` imports the
 * registry, never the reverse (no circular import).
 */

/** The object a GBP operation hands to the queue-a-draft spine. */
export interface OperationDraft {
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  message: string;
}

/** A resolved (non-null) event, exactly as the governance resolver hands it to an operation. */
export type ResolvedEvent = NonNullable<Awaited<ReturnType<typeof getEvent>>>;

/**
 * The outcome of a governed approval-time write. `ok:false` carries the exact failure
 * `reason` the resolver returns to the caller; `ok:true` carries the `activity` the
 * resolver logs to the owner feed AFTER the event resolves (execute never logs it itself).
 */
export type GbpExecuteResult = {
  ok: boolean;
  reason?: string;
  activity?: { type: "gbp-post" | "gbp-hours" | "gbp-photo"; detail: string };
};

/**
 * A single executable agent operation, defined once. `execute` is the governed
 * approval-time write: the resolver runs it ONLY on `action==="approved"`, BEFORE it flips
 * the event to resolved. execute validates metadata + performs the external write and
 * returns the activity to log — it never resolves the event or logs activity itself; the
 * resolver owns both (so a write is gated on `success`, and the feed entry only lands after
 * a real resolve).
 */
export interface AgentOperation<TInput = unknown> {
  /** The tool name, e.g. "create_gbp_post". */
  id: string;
  /** The event metadata.kind, e.g. "gbp_post_draft". */
  kind: string;
  /** LLM-facing tool description. */
  description: string;
  inputSchema: z.ZodType<TInput>;
  toDraft: (args: TInput) => OperationDraft;
  execute?: (ctx: { tenantId: string; event: ResolvedEvent }) => Promise<GbpExecuteResult>;
}

/** Parse "HH:MM" into the GBP TimeOfDay shape, or null if malformed. */
function parseHHMM(v: unknown): { hours: number; minutes: number } | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export const GBP_DAY = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

export const GBP_PHOTO_CATEGORY = z.enum([
  "COVER",
  "PROFILE",
  "LOGO",
  "EXTERIOR",
  "INTERIOR",
  "PRODUCT",
  "AT_WORK",
  "FOOD_AND_DRINK",
  "MENU",
  "ADDITIONAL",
]);

/**
 * An optional URL tool-input that validates a real value as a URL but treats
 * "" / whitespace — a common thing the model emits for "no value" — as absent
 * instead of a validation error that would reject the ENTIRE tool call (and
 * silently queue no draft). Strictly safer than a bare `.url().optional()`.
 */
export const optionalUrl = (description: string) =>
  z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url().optional(),
    )
    .describe(description);

const createGbpPostInput = z.object({
  summary: z.string().max(1500).describe("The post text (up to 1500 characters)"),
  ctaUrl: optionalUrl("Optional call-to-action link"),
  photoUrl: optionalUrl("Optional public photo URL to include"),
});

const updateBusinessHoursInput = z.object({
  hours: z
    .array(
      z.object({
        day: GBP_DAY,
        open: z.string().describe("Opening time, 24h HH:MM, e.g. 09:00"),
        close: z.string().describe("Closing time, 24h HH:MM, e.g. 17:00"),
      }),
    )
    .describe("One entry per open day"),
});

const uploadGbpPhotoInput = z.object({
  photoUrl: z.string().describe("Public URL of the image to add to the Google listing"),
  category: GBP_PHOTO_CATEGORY.optional().describe(
    "Which section of the Google profile the photo belongs in (default ADDITIONAL)",
  ),
});

/**
 * Type-erase a strongly-typed operation into the heterogeneous registry element
 * type. Each `toDraft` is written against its own inferred input at definition
 * (full type-checking there); the registry stores them uniformly as
 * `AgentOperation`, and `buildGbpTools` feeds each `toDraft` exactly the args its
 * own `inputSchema` parsed — so the erasure is safe by construction.
 */
const defineOperation = <T>(op: AgentOperation<T>): AgentOperation =>
  op as unknown as AgentOperation;

export const GBP_OPERATIONS: AgentOperation[] = [
  defineOperation({
    id: "create_gbp_post",
    kind: "gbp_post_draft",
    description:
      "Draft a Google Business post (a 'What's new' update on the Google listing) for an offer, " +
      "update, or announcement. Creates a draft the owner must APPROVE before it publishes to " +
      "Google — never posts directly. Keep the summary under 1500 characters.",
    inputSchema: createGbpPostInput,
    toDraft: ({ summary, ctaUrl, photoUrl }) => ({
      title: "Google post draft",
      body: summary,
      metadata: { kind: "gbp_post_draft", summary, ctaUrl, photoUrl },
      message: "Google post drafted. It will publish to your listing once approved.",
    }),
    execute: async ({ tenantId, event }) => {
      const summary = typeof event.metadata?.summary === "string" ? event.metadata.summary : "";
      if (!summary) return { ok: false, reason: "gbp_post_invalid" };
      const { createGbpPost } = await import("../gbp-management");
      const result = await createGbpPost(tenantId, {
        summary,
        ctaUrl: typeof event.metadata?.ctaUrl === "string" ? event.metadata.ctaUrl : undefined,
        photoUrl: typeof event.metadata?.photoUrl === "string" ? event.metadata.photoUrl : undefined,
      });
      if (!result.success) return { ok: false, reason: "gbp_post_failed" };
      return { ok: true, activity: { type: "gbp-post", detail: summary } };
    },
  }),

  defineOperation({
    id: "update_business_hours",
    kind: "gbp_hours_draft",
    description:
      "Draft an update to the business hours on the Google listing. Creates a draft the owner must " +
      "APPROVE before it publishes to Google — never updates directly. Give each open day's " +
      "open/close in 24-hour HH:MM. Confirm the correct hours with the owner before calling this.",
    inputSchema: updateBusinessHoursInput,
    toDraft: ({ hours }) => ({
      title: "Google hours update",
      body: hours.map((h) => `${h.day}: ${h.open}-${h.close}`).join("\n"),
      metadata: { kind: "gbp_hours_draft", hours },
      message: "Hours update drafted. It will publish to Google once approved.",
    }),
    execute: async ({ tenantId, event }) => {
      const raw = Array.isArray(event.metadata?.hours) ? event.metadata.hours : [];
      const periods = raw.flatMap((p: unknown) => {
        const row = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
        const day = typeof row.day === "string" ? row.day.toUpperCase() : null;
        const open = parseHHMM(row.open);
        const close = parseHHMM(row.close);
        if (!day || !open || !close) return [];
        return [{ openDay: day, openTime: open, closeDay: day, closeTime: close }];
      });
      if (!periods.length) return { ok: false, reason: "gbp_hours_invalid" };
      const { updateBusinessHours } = await import("../gbp-management");
      const result = await updateBusinessHours(tenantId, {
        regularHours: { periods } as Parameters<typeof updateBusinessHours>[1]["regularHours"],
      });
      if (!result.success) return { ok: false, reason: "gbp_hours_failed" };
      return { ok: true, activity: { type: "gbp-hours", detail: "" } };
    },
  }),

  defineOperation({
    id: "upload_gbp_photo",
    kind: "gbp_photo_draft",
    description:
      "Draft a photo to add to the Google Business listing (exterior, interior, product, cover, " +
      "etc.). Creates a draft the owner must APPROVE before it publishes to Google — never uploads " +
      "directly. Provide a hosted image URL (use upload_image first if the owner shared a file).",
    inputSchema: uploadGbpPhotoInput,
    toDraft: ({ photoUrl, category }) => {
      const chosenCategory = category ?? "ADDITIONAL";
      return {
        title: "Google photo upload",
        body: `Add photo to Google listing (${chosenCategory}): ${photoUrl}`,
        metadata: { kind: "gbp_photo_draft", photoUrl, category: chosenCategory },
        message: "Photo drafted. It will be added to your Google listing once approved.",
      };
    },
    execute: async ({ tenantId, event }) => {
      const photoUrl = typeof event.metadata?.photoUrl === "string" ? event.metadata.photoUrl : "";
      if (!photoUrl) return { ok: false, reason: "gbp_photo_invalid" };
      const category =
        typeof event.metadata?.category === "string" ? event.metadata.category : "ADDITIONAL";
      const { uploadGbpPhoto } = await import("../gbp-management");
      const result = await uploadGbpPhoto(
        tenantId,
        photoUrl,
        category as Parameters<typeof uploadGbpPhoto>[2],
      );
      if (!result.success) return { ok: false, reason: "gbp_photo_failed" };
      return { ok: true, activity: { type: "gbp-photo", detail: "" } };
    },
  }),
];
