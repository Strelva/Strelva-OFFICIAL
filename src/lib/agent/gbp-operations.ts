import { z } from "zod";

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

/**
 * A single executable agent operation, defined once. `execute(event)` — the governed
 * approval-time write — is added in the LATER resolver-convergence increment; today an
 * operation only knows how to describe itself to the LLM and how to draft a pending event.
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
  }),
];
