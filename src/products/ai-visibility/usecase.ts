/**
 * Account-owned AI Visibility assessment use case.
 *
 * The public assessment route and its bearer-result store are intentionally a
 * separate product path. This use case performs the workspace authorization
 * preflight, consumes the account assessment budget, scores the request, and
 * persists only to the private workspace store.
 */

import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import {
  assertCanSaveWork,
  listWork,
  listWorkspaces,
  saveWork,
  WorkspaceAccessError,
  type SavedWork,
  type WorkspaceActor,
} from "@/platform/workspaces";
import {
  AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND,
  AI_VISIBILITY_PRODUCT_ID,
  isAiVisibilityWorkResourceKind,
  parseAiVisibilityAssessmentPayload,
} from "./work";
import { getAiVisibilityResult } from "./results";
import { scoreAiVisibility } from "./score";
import type { ScoreInput } from "./contracts";

export class PrivateAiVisibilityAssessmentRateLimitError extends Error {
  constructor() {
    super("The daily private assessment limit has been reached");
    this.name = "PrivateAiVisibilityAssessmentRateLimitError";
  }
}

export class PublicAiVisibilityImportRateLimitError extends Error {
  constructor() {
    super("The daily public-result import limit has been reached");
    this.name = "PublicAiVisibilityImportRateLimitError";
  }
}

export class PublicAiVisibilityResultUnavailableError extends Error {
  constructor() {
    super("The public AI Visibility result is unavailable");
    this.name = "PublicAiVisibilityResultUnavailableError";
  }
}

export interface RunPrivateAiVisibilityAssessmentInput {
  actor: WorkspaceActor;
  workspaceId: string;
  input: ScoreInput;
}

/**
 * Run and save one private assessment for a directly-owned workspace.
 *
 * Membership and saved-work capacity are checked before the provider scorer
 * runs. The returned row is the private `saved_product_work` record; this
 * function never calls `saveAiVisibilityResult` or publishes a public result.
 */
export async function runPrivateAiVisibilityAssessment({
  actor,
  workspaceId,
  input,
}: RunPrivateAiVisibilityAssessmentInput): Promise<SavedWork> {
  const workspace = (await listWorkspaces(actor)).find(
    (candidate) => candidate.id === workspaceId && candidate.access === "member",
  );
  if (!workspace) throw new WorkspaceAccessError();

  // Bound persistence before incurring provider spend. This also retains the
  // existing workspace store's exact role and capacity enforcement.
  await assertCanSaveWork(actor, workspace.id);

  // The assessment budget is per verified person, not per workspace or agency.
  if (await isRateLimitedWindowedAsync(`workspace:assessment:${actor.userId}`, 10, 86_400_000)) {
    throw new PrivateAiVisibilityAssessmentRateLimitError();
  }

  const result = await scoreAiVisibility(input);
  return saveWork(actor, workspace.id, {
    productId: AI_VISIBILITY_PRODUCT_ID,
    // New account-owned work uses the private resource id. The renderer keeps
    // accepting the older assessment id for rows created before this move.
    resourceKind: AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND,
    title: input.business,
    payload: result,
    input,
  });
}

function sourcePublicResultId(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = (input as Record<string, unknown>).sourcePublicResultId;
  return typeof value === "string" ? value : null;
}

/**
 * Save an explicit, authenticated copy of a retained public scorecard.
 *
 * The public result is an acquisition artifact and its bearer id is not an
 * ownership claim. A direct workspace member must ask for the copy; the
 * payload is parsed through the same browser-safe contract used for saved
 * work; and provenance is kept as an opaque input marker rather than a
 * cross-workspace `sourceWorkId` relationship.
 */
export interface SavePublicAiVisibilityResultInput {
  actor: WorkspaceActor;
  workspaceId: string;
  resultId: string;
}

export interface SavedPublicAiVisibilityResult {
  work: SavedWork;
  created: boolean;
}

export async function savePublicAiVisibilityResult({
  actor,
  workspaceId,
  resultId,
}: SavePublicAiVisibilityResultInput): Promise<SavedPublicAiVisibilityResult> {
  const workspace = (await listWorkspaces(actor)).find(
    (candidate) => candidate.id === workspaceId && candidate.access === "member",
  );
  if (!workspace) throw new WorkspaceAccessError();

  const normalizedResultId = resultId.trim();
  if (!/^scan_[a-z0-9]+$/i.test(normalizedResultId) || normalizedResultId.length > 256) {
    throw new PublicAiVisibilityResultUnavailableError();
  }

  // Read only after direct membership has been established. The Redis value
  // is still untrusted: parse it before any private row is written.
  const stored = await getAiVisibilityResult(normalizedResultId);
  const sourceId = stored && typeof stored === "object" && !Array.isArray(stored)
    && typeof (stored as { id?: unknown }).id === "string"
    ? (stored as { id: string }).id.trim()
    : null;
  const result = stored && typeof stored === "object" && !Array.isArray(stored)
    ? parseAiVisibilityAssessmentPayload((stored as { result?: unknown }).result)
    : null;
  if (!stored || !result || !sourceId || sourceId !== normalizedResultId || !/^scan_[a-z0-9]+$/i.test(sourceId)) {
    throw new PublicAiVisibilityResultUnavailableError();
  }

  // A retry after a lost response must not create another private copy or
  // consume another assessment budget. This marker remains private because
  // presentWorkspaceWork only exposes its bounded business inputs.
  const existing = (await listWork(actor, workspace.id)).find(
    (work) => work.productId === AI_VISIBILITY_PRODUCT_ID
      && isAiVisibilityWorkResourceKind(work.resourceKind)
      && sourcePublicResultId(work.input) === sourceId,
  );
  if (existing) return { work: existing, created: false };

  await assertCanSaveWork(actor, workspace.id);
  if (await isRateLimitedWindowedAsync(`workspace:public-import:${actor.userId}`, 10, 86_400_000)) {
    throw new PublicAiVisibilityImportRateLimitError();
  }

  const input: Record<string, unknown> = {
    business: result.business,
    ...(result.url ? { url: result.url } : {}),
    ...(typeof stored.input?.category === "string" && stored.input.category.trim()
      ? { category: stored.input.category.trim().slice(0, 160) } : {}),
    ...(typeof stored.input?.location === "string" && stored.input.location.trim()
      ? { location: stored.input.location.trim().slice(0, 160) } : {}),
    sourcePublicResultId: sourceId,
  };
  const work = await saveWork(actor, workspace.id, {
    productId: AI_VISIBILITY_PRODUCT_ID,
    resourceKind: AI_VISIBILITY_PRIVATE_WORK_RESOURCE_KIND,
    title: result.business,
    payload: result,
    input,
  });
  return { work, created: true };
}
