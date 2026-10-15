/**
 * Changes on a connected site. Pure and browser-safe: the stage machine, the
 * wire shapes and the agent brief, in one place that both TypeScript and SQL
 * (connected_site_change_stage, 20261027160100) follow identically.
 *
 * A change is an append-only list of steps. Strelva never edits the site: the
 * agency makes the edit in the builder's own editor, then Strelva reads the
 * live page and records a Release.
 */
import { z } from "zod";
import { recordedActorSchema } from "@/platform/presentation/actor";
import type { SitePlatform } from "./contracts";

export const CONNECTED_SITE_CHANGE_SOURCE = "connected_site_change";
export const CONNECTED_SITE_CHANGE_SCOPE = "website.connected_site_change";

export const CONNECTED_SITE_CHANGE_STAGES = ["unplanned", "planned_waiting", "ready_to_make", "declined", "checking", "not_seen", "done", "done_unconfirmed", "withdrawn"] as const;
export type ConnectedSiteChangeStage = typeof CONNECTED_SITE_CHANGE_STAGES[number];

export const connectedSiteChangeStepSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["planned", "approved", "declined", "marked_done", "checked", "released", "withdrawn"]),
  pageUrl: z.string().nullable(), editSteps: z.array(z.string()).nullable(), expectText: z.string().nullable(), removeText: z.string().nullable(),
  ownerFacing: z.boolean().nullable(),
  /** What the page showed when the change was handed to the agency. Missing on older rows. */
  baseline: z.enum(["visible", "not_visible", "unreachable"]).nullable().optional().catch(null),
  checkResult: z.enum(["visible", "not_visible", "unreachable", "unchanged"]).nullable(), matched: z.string().nullable(),
  readBack: z.enum(["confirmed", "not_confirmed"]).nullable(), releaseNumber: z.number().int().positive().nullable(),
  note: z.string().nullable(), recordedAt: z.string(),
  actor: recordedActorSchema.nullable().optional().catch(null),
});
export type ConnectedSiteChangeStep = z.infer<typeof connectedSiteChangeStepSchema>;

export const connectedSiteChangeSchema = z.object({
  id: z.string().uuid(), requestId: z.string().uuid().nullable(), origin: z.enum(["request", "agency"]), title: z.string(), createdAt: z.string(),
  stage: z.enum(CONNECTED_SITE_CHANGE_STAGES), steps: z.array(connectedSiteChangeStepSchema),
});
export type ConnectedSiteChange = z.infer<typeof connectedSiteChangeSchema>;

export const pendingConnectedSiteRequestSchema = z.object({
  id: z.string().uuid(), request: z.string(), outcome: z.string(), page: z.string().nullable(),
  accepted: z.enum(["pending", "accepted", "declined"]), revision: z.number().int().positive(), createdAt: z.string(),
});
export type PendingConnectedSiteRequest = z.infer<typeof pendingConnectedSiteRequestSchema>;

export const connectedSiteChangesViewSchema = z.object({
  viewer: z.object({ role: z.string(), isOwner: z.boolean(), actingAgencyId: z.string().uuid().nullable(), agencyName: z.string().nullable(), businessName: z.string().nullable().optional() }),
  site: z.object({ id: z.string().uuid(), siteHost: z.string(), siteUrl: z.string(), platform: z.string(), platformLabel: z.string().optional(), nextReleaseNumber: z.number().int().positive().optional() }),
  requests: z.array(pendingConnectedSiteRequestSchema),
  changes: z.array(connectedSiteChangeSchema),
});
export type ConnectedSiteChangesView = z.infer<typeof connectedSiteChangesViewSchema>;

/** A planned change waiting for the owner in Needs you. */
export const connectedSiteChangeReviewSchema = z.object({
  changeId: z.string().uuid(), systemId: z.string().uuid(), siteHost: z.string(), platform: z.string(), title: z.string(),
  planStepId: z.string().uuid(), pageUrl: z.string(), expectText: z.string(), removeText: z.string().nullable(), editSteps: z.array(z.string()),
  agencyName: z.string().nullable(), recordedAt: z.string(),
});
export type ConnectedSiteChangeReview = z.infer<typeof connectedSiteChangeReviewSchema>;

/** A Release recorded from a connected-site change, as What changed reads it. */
export const connectedSiteChangeReleaseRowSchema = z.object({
  id: z.string().uuid(), at: z.string(), systemId: z.string().uuid(), title: z.string(), siteHost: z.string(), platform: z.string(),
  readBack: z.enum(["confirmed", "not_confirmed"]), releaseNumber: z.number().int().positive(),
  actor: recordedActorSchema.nullable().optional().catch(null),
});
export type ConnectedSiteChangeReleaseRow = z.infer<typeof connectedSiteChangeReleaseRowSchema>;

/** Walk the steps in order. Mirrors SQL connected_site_change_stage exactly. */
export function connectedSiteChangeStage(steps: Array<{ kind: string; ownerFacing: boolean | null; checkResult: string | null; readBack: string | null }>): ConnectedSiteChangeStage {
  let stage: ConnectedSiteChangeStage = "unplanned";
  for (const step of steps) {
    switch (step.kind) {
      case "planned": stage = step.ownerFacing ? "planned_waiting" : "ready_to_make"; break;
      case "approved": stage = "ready_to_make"; break;
      case "declined": stage = "declined"; break;
      case "marked_done": stage = "checking"; break;
      case "checked": stage = step.checkResult === "visible" ? "checking" : "not_seen"; break;
      case "released": stage = step.readBack === "confirmed" ? "done" : "done_unconfirmed"; break;
      case "withdrawn": stage = "withdrawn"; break;
    }
  }
  return stage;
}

export const planInputSchema = z.object({
  pageUrl: z.string().trim().url().max(500),
  whatToChange: z.string().trim().min(1).max(500),
  expectText: z.string().trim().min(1).max(300),
  removeText: z.string().trim().min(1).max(300).optional(),
  ownerFacing: z.boolean(),
  note: z.string().trim().min(1).max(1000).optional(),
}).strict();
export type PlanInput = z.infer<typeof planInputSchema>;

/** The Request an owner (or Ask) files to the business's agency. Nothing on the site changes. */
export function connectedSiteChangeRequestCommand(input: {
  provider: { kind: "agency"; agencyWorkspaceId: string }; workspaceId: string; systemId: string; connectedSiteId: string; siteHost: string;
  platform: SitePlatform; words: string; page?: string; origin: "owner" | "ask_strelva"; outcome?: string; idempotencyKey: string;
}) {
  return {
    action: "save" as const,
    businessId: input.workspaceId,
    status: "requested" as const,
    request: input.words.trim().slice(0, 3_000),
    outcome: (input.outcome ?? input.words).trim().slice(0, 3_000),
    context: {
      source: CONNECTED_SITE_CHANGE_SOURCE,
      systemId: input.systemId,
      connectedSiteId: input.connectedSiteId,
      siteHost: input.siteHost,
      platform: input.platform,
      origin: input.origin,
      ...(input.page ? { page: input.page.slice(0, 500) } : {}),
    },
    scope: [CONNECTED_SITE_CHANGE_SCOPE],
    provider: input.provider,
    idempotencyKey: input.idempotencyKey,
  };
}

/** Plain text an agency's own agent can follow. It never carries keys, tokens or emails. */
export function connectedSiteChangeBrief(input: { change: ConnectedSiteChange; siteHost: string; platformLabel: string; taskUrl: string }): string {
  const planned = [...input.change.steps].reverse().find(step => step.kind === "planned");
  const lines = [
    `Task: change ${input.siteHost} in ${input.platformLabel}`,
    `What to change: ${input.change.title}`,
    ...(planned?.pageUrl ? [`Page: ${planned.pageUrl}`] : []),
    "",
    ...(planned?.editSteps?.length ? ["Steps:", ...planned.editSteps.map((step, index) => `${index + 1}. ${step}`), ""] : []),
    ...(planned?.expectText ? [`When it's published the page should say: “${planned.expectText}”`] : []),
    ...(planned?.removeText ? [`…and no longer say: “${planned.removeText}”`] : []),
    "",
    "Rules:",
    `- Change only this, only in ${input.platformLabel}'s own editor.`,
    "- Don't remove the Strelva lines from the site's header code.",
    "- Don't put passwords, customer details or other businesses' information in notes.",
    `- Strelva doesn't make the edit and can't log in to ${input.platformLabel}.`,
    "",
    `When it's live, a person at the agency chooses Mark done here: ${input.taskUrl}`,
  ];
  return lines.join("\n");
}
