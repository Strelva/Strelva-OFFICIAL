import type { SavedWork } from "@/platform/workspaces/types";
import { documentSchema } from "@/products/documents/engine";
import { workPlanSchema } from "@/products/work-plans/contracts";
import { parseTrackerWorkPayload } from "@/products/tracker/presentation";
import type { ProductWorkPresentation } from "@/platform/products/contracts";
import {
  aiVisibilityWorkPresentation,
  type AiVisibilityResult,
} from "@/products/ai-visibility/client";
import { parseTrackerExperimentComparison } from "@/products/tracker/comparison";
import { presentAssessmentWork, type AssessmentAccess } from "@/products/assessment";
import type { WorkspaceExperiment, WorkspaceExperimentComparison, WorkspaceHandoffPreview, WorkspaceLegacyExperiment, WorkspaceSnapshot, WorkspaceWork } from "./contracts";

/**
 * Browser-safe, explicit product renderer registry.
 *
 * The list is intentionally static. A persisted product/resource identifier
 * selects one known parser; it cannot name a module, function, or executable
 * expression. Products add a descriptor here when their work contract is
 * ready for the shared workspace.
 */
export const WORK_PRESENTATION_REGISTRY: readonly ProductWorkPresentation<AiVisibilityResult>[] = Object.freeze([
  aiVisibilityWorkPresentation,
]);

export function getWorkspaceWorkPresentation(
  productId: string,
  resourceKind: string,
): ProductWorkPresentation<AiVisibilityResult> | null {
  return WORK_PRESENTATION_REGISTRY.find((presentation) =>
    presentation.productId === productId && presentation.resourceKinds.includes(resourceKind),
  ) ?? null;
}

function readFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Research work is retained in the same workspace table as product work, but
 * its browser projection is deliberately narrower than the stored payload.
 */
function parseLegacyWorkspaceExperiment(value: unknown): WorkspaceLegacyExperiment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const version = source.version;
  const targetWorkId = source.targetWorkId;
  const targetRevision = readFinite(source.targetRevision);
  const recordedBy = source.recordedBy;
  const recordedAt = source.recordedAt;
  const hypothesis = source.hypothesis;
  const workload = source.workload;
  const baselineMinutes = readFinite(source.baselineMinutes);
  const setupMinutes = readFinite(source.setupMinutes);
  const reviewMinutes = readFinite(source.reviewMinutes);
  const correctionMinutes = readFinite(source.correctionMinutes);
  const providerCostUsd = source.providerCostUsd === null ? null : readFinite(source.providerCostUsd);
  const result = source.result;
  const evidence = source.evidence;
  const observedMinutes = readFinite(source.observedMinutes);
  const differenceMinutes = readFinite(source.differenceMinutes);
  if (version !== 1 || typeof targetWorkId !== "string" || !targetWorkId || targetRevision === null ||
    typeof recordedBy !== "string" || !recordedBy || typeof recordedAt !== "string" || !recordedAt ||
    typeof hypothesis !== "string" || !hypothesis || typeof workload !== "string" || !workload ||
    baselineMinutes === null || setupMinutes === null || reviewMinutes === null || correctionMinutes === null ||
    (source.providerCostUsd !== null && providerCostUsd === null) ||
    (result !== "passed" && result !== "failed" && result !== "inconclusive") ||
    typeof evidence !== "string" || !evidence || observedMinutes === null || differenceMinutes === null ||
    source.evidenceKind !== "operator_reported" || source.promoted !== false) return null;
  return {
    version: 1, targetWorkId, targetRevision, recordedBy, recordedAt, hypothesis, workload,
    baselineMinutes, setupMinutes, reviewMinutes, correctionMinutes, providerCostUsd,
    result, evidence, observedMinutes, differenceMinutes, evidenceKind: "operator_reported", promoted: false,
  };
}

/**
 * Preserve the v1 experiment projection while accepting the bounded v2
 * comparison payload added by the R&D expansion. The server remains the
 * authority for target work and revision; this parser only shapes persisted
 * data for the browser.
 */
export function parseWorkspaceExperiment(value: unknown): WorkspaceExperiment | null {
  const comparison = parseTrackerExperimentComparison(value);
  if (comparison && comparison.targetWorkId && comparison.targetRevision !== undefined && comparison.recordedBy && comparison.recordedAt) {
    return comparison as WorkspaceExperimentComparison;
  }
  return parseLegacyWorkspaceExperiment(value);
}

/**
 * Keep the workspace response to the fields the current product accepts. An
 * unsupported product's input is not a browser contract, and persisted rows
 * may contain fields added by a newer server implementation.
 */
function presentWorkInput(
  presentation: ProductWorkPresentation<AiVisibilityResult> | null,
  input: unknown,
): Record<string, unknown> {
  // An input field is part of the product presentation contract too. Do not
  // expose even the small AI input allowlist when the resource kind is
  // unknown, because a future resource may give those keys a different
  // meaning or sensitivity.
  if (!presentation || presentation.productId !== "ai_visibility" || !input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const key of ["business", "url", "category", "location"] as const) {
    if (typeof source[key] === "string") safe[key] = source[key];
  }
  return safe;
}

/** Explicit renderer dispatch. A new product cannot masquerade as an assessment. */
export interface WorkspacePresentationOptions {
  /** Presentation context only; server authorization remains authoritative. */
  access?: AssessmentAccess;
}

export function presentWorkspaceWork(work: SavedWork, options: WorkspacePresentationOptions = {}): WorkspaceWork {
  if (work.productId === "tracker" && work.resourceKind === "tracker") {
    const tracker = parseTrackerWorkPayload(work.payload);
    return { id: work.id, workspaceId: work.workspaceId, productId: work.productId, resourceKind: work.resourceKind,
      title: work.title?.trim() || tracker?.title || "Tracker", payload: null, input: {}, createdAt: work.createdAt,
      ...(work.sourceWorkId ? { sourceWorkId: work.sourceWorkId } : {}),
      ...(!tracker ? { unavailableReason: "This tracker could not be read. Its saved content has not changed." } : {}),
    };
  }
  if (work.productId === "work_plans" && work.resourceKind === "plan") {
    const parsed = workPlanSchema.safeParse(work.payload);
    return { id: work.id, workspaceId: work.workspaceId, productId: work.productId, resourceKind: work.resourceKind,
      title: work.title?.trim() || "Work plan", payload: null, input: {}, createdAt: work.createdAt,
      ...(parsed.success ? { workPlan: { summary: parsed.data.summary, status: parsed.data.status } } : { unavailableReason: "This plan could not be read. Its saved content has not changed." }),
    };
  }
  if (work.productId === "documents" && work.resourceKind === "document") {
    const parsed = documentSchema.safeParse(work.payload);
    return { id: work.id, workspaceId: work.workspaceId, productId: work.productId, resourceKind: work.resourceKind,
      title: work.title?.trim() || "Document", payload: null, input: {}, createdAt: work.createdAt,
      ...(work.sourceWorkId ? { sourceWorkId: work.sourceWorkId } : {}),
      ...(parsed.success ? { document: { title: parsed.data.title, revision: parsed.data.revision } } : { unavailableReason: "This document could not be read. Its saved content has not changed." }),
    };
  }
  if (work.productId === "research" && work.resourceKind === "experiment") {
    const experiment = parseWorkspaceExperiment(work.payload);
    return {
      id: work.id, workspaceId: work.workspaceId, productId: work.productId, resourceKind: work.resourceKind,
      title: work.title?.trim() || "Tracker experiment", payload: null, input: {}, createdAt: work.createdAt,
      ...(work.sourceWorkId ? { sourceWorkId: work.sourceWorkId } : {}),
      ...(experiment ? { experiment } : { unavailableReason: "This experiment could not be displayed. Its stored record has not been changed." }),
    };
  }
  const assessment = presentAssessmentWork({
    id: work.id,
    workspaceId: work.workspaceId,
    productId: work.productId,
    resourceKind: work.resourceKind,
    title: work.title,
    payload: work.payload,
    createdAt: work.createdAt,
    ...(options.access ? { access: options.access } : {}),
  });

  if (assessment?.kind === "website_audit") {
    return { id: work.id, workspaceId: work.workspaceId, productId: work.productId, resourceKind: work.resourceKind,
      title: assessment.subject.name, payload: null, auditPayload: assessment.payload,
      assessment, input: {}, createdAt: work.createdAt,
      ...(assessment.unavailableReason ? { unavailableReason: assessment.unavailableReason } : {}),
    };
  }
  const presentation = getWorkspaceWorkPresentation(work.productId, work.resourceKind);
  let parsed: AiVisibilityResult | null = null;
  if (presentation) {
    try {
      parsed = presentation.parsePayload(work.payload);
    } catch {
      // A malformed persisted payload must make one item unavailable, not
      // break the whole workspace response. Product parsers are a trust
      // boundary even when their current implementation uses safeParse.
      parsed = null;
    }
  }
  // The current registry only returns the AI Visibility contract, which is the
  // one payload currently supported by WorkspaceWork.
  const payload = assessment?.kind === "ai_visibility" ? assessment.payload : parsed;
  // Keep the saved label as the workspace identity. The assessment subject
  // is still available in `assessment` for search and product rendering, but
  // copies may intentionally carry a customer-facing title of their own.
  let title = work.title?.trim() || assessment?.subject.name || "";
  if (!title && presentation?.titleForPayload) {
    try {
      title = presentation.titleForPayload(parsed)?.trim() || "";
    } catch {
      title = "";
    }
  }
  title ||= "Saved work";
  return {
    id: work.id, workspaceId: work.workspaceId,
    title, productId: work.productId,
    resourceKind: work.resourceKind, payload,
    ...(assessment ? { assessment } : {}),
    ...(!payload ? { unavailableReason: presentation
      ? "This saved assessment could not be displayed. Its stored data has not been changed."
      : "This product's interactive view is not available in this release. Your saved work is unchanged." } : {}),
    input: presentWorkInput(presentation, work.input),
    createdAt: work.createdAt,
  };
}

/**
 * Add the descriptor at the browser boundary for older same-origin callers.
 * The server emits it directly; this compatibility path keeps intercepted or
 * cached v1 responses useful without making view components inspect payloads.
 */
export function normalizeWorkspaceWork(work: WorkspaceWork, options: WorkspacePresentationOptions = {}): WorkspaceWork {
  if (work.productId === "research" && work.resourceKind === "experiment" && !work.experiment) {
    const experiment = parseWorkspaceExperiment(work.payload);
    return experiment ? { ...work, payload: null, input: {}, experiment } : { ...work, payload: null, input: {}, unavailableReason: work.unavailableReason || "This experiment could not be displayed. Its stored record has not been changed." };
  }
  if (work.assessment) return work;
  const assessment = presentAssessmentWork({
    id: work.id,
    workspaceId: work.workspaceId,
    productId: work.productId,
    resourceKind: work.resourceKind,
    title: work.title,
    payload: work.productId === "website_audit" ? work.auditPayload ?? work.payload : work.payload,
    createdAt: work.createdAt,
    ...(options.access ? { access: options.access } : {}),
    ...(work.unavailableReason ? { unavailableReason: work.unavailableReason } : {}),
  });
  if (!assessment) return work;
  if (assessment.kind === "website_audit") {
    return {
      ...work,
      title: assessment.subject.name,
      payload: null,
      auditPayload: assessment.payload,
      assessment,
      ...(assessment.unavailableReason ? { unavailableReason: assessment.unavailableReason } : {}),
    };
  }
  return {
    ...work,
    title: work.title?.trim() || assessment.subject.name,
    payload: assessment.payload,
    assessment,
    ...(assessment.unavailableReason ? { unavailableReason: assessment.unavailableReason } : {}),
  };
}

function assessmentAccessForSnapshot(snapshot: WorkspaceSnapshot): AssessmentAccess {
  const workspace = snapshot.workspaces.find((item) => item.id === snapshot.workspaceId);
  if (workspace?.access === "delegated_read") return "delegated_read";
  return workspace?.kind === "personal" ? "owned" : "member";
}

/** Normalize one snapshot once, keeping compatibility logic outside the UI. */
export function normalizeWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const access = assessmentAccessForSnapshot(snapshot);
  return { ...snapshot, work: snapshot.work.map((work) => normalizeWorkspaceWork(work, { access })) };
}

/** Normalize an inspected handoff before the overlay chooses its renderer. */
export function normalizeWorkspaceHandoffPreview(preview: WorkspaceHandoffPreview): WorkspaceHandoffPreview {
  return { ...preview, work: normalizeWorkspaceWork(preview.work, { access: "addressed" }) };
}
