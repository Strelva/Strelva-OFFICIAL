import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  onboardingCaseSchema,
  onboardingHistoryEntrySchema,
  type OnboardingAssignee,
  type OnboardingCase,
  type OnboardingRequirement,
} from "./contracts";

export class OnboardingConflictError extends Error {
  constructor(message = "This onboarding case changed. Reload it before continuing.") {
    super(message);
    this.name = "OnboardingConflictError";
  }
}

export class OnboardingUnavailableError extends Error {
  constructor(message = "This onboarding case is unavailable.") {
    super(message);
    this.name = "OnboardingUnavailableError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function requirementSnapshot(requirement: OnboardingRequirement | undefined): unknown {
  if (!requirement) return null;
  return {
    id: requirement.id,
    key: requirement.key,
    status: requirement.status,
    document: requirement.document,
    proposedData: requirement.proposedData,
    reviewedData: requirement.reviewedData,
    acceptedRevision: requirement.acceptedRevision,
  };
}

export function createOnboardingCase(input: {
  title: string;
  subjectType: OnboardingCase["subjectType"];
  subjectLabel: string;
  requirements: Array<{ key: string; label: string; fields: OnboardingRequirement["fields"] }>;
  actorId: string;
  now?: string;
}): OnboardingCase {
  const at = input.now ?? nowIso();
  const requirements = input.requirements.map((item) => ({
    id: randomUUID(),
    key: item.key,
    label: item.label,
    fields: item.fields,
    status: "missing" as const,
    document: null,
    proposedData: {},
    reviewedData: null,
    acceptedRevision: null,
    acceptedAt: null,
  }));
  return onboardingCaseSchema.parse({
    version: 1,
    revision: 1,
    title: input.title,
    subjectType: input.subjectType,
    subjectLabel: input.subjectLabel,
    status: "in_progress",
    assignee: null,
    requirements,
    history: [{
      revision: 1,
      kind: "created",
      actorId: input.actorId,
      at,
      requirementId: null,
      before: null,
      after: { title: input.title, subjectType: input.subjectType, subjectLabel: input.subjectLabel, requirementCount: requirements.length },
      note: null,
    }],
    createdBy: input.actorId,
    createdAt: at,
  });
}

function mutate(
  current: OnboardingCase,
  actorId: string,
  kind: z.infer<typeof onboardingHistoryEntrySchema>["kind"],
  requirementId: string | null,
  before: unknown,
  after: unknown,
  change: (draft: OnboardingCase) => void,
  note: string | null = null,
  at = nowIso(),
): OnboardingCase {
  const draft = structuredClone(current) as OnboardingCase;
  change(draft);
  const revision = current.revision + 1;
  draft.revision = revision;
  draft.history = [...current.history, { revision, kind, actorId, at, requirementId, before, after, note }];
  return onboardingCaseSchema.parse(draft);
}

function requirement(current: OnboardingCase, requirementId: string): OnboardingRequirement {
  const found = current.requirements.find((item) => item.id === requirementId);
  if (!found) throw new OnboardingUnavailableError("That onboarding requirement is unavailable.");
  return found;
}

export function assignCase(current: OnboardingCase, actorId: string, assignee: OnboardingAssignee): OnboardingCase {
  return mutate(current, actorId, "assigned", null, current.assignee, assignee, (draft) => { draft.assignee = assignee; });
}

export function supplyRequirement(
  current: OnboardingCase,
  actorId: string,
  requirementId: string,
  document: OnboardingRequirement["document"],
  proposedData: OnboardingRequirement["proposedData"],
): OnboardingCase {
  if (!document) throw new OnboardingConflictError("A private document is required before this item can be supplied.");
  const prior = requirement(current, requirementId);
  const before = requirementSnapshot(prior);
  return mutate(current, actorId, "supplied", requirementId, before, { document, proposedData }, (draft) => {
    const next = requirement(draft, requirementId);
    next.status = "supplied";
    next.document = document;
    next.proposedData = proposedData;
    // A replacement always needs a fresh human review. An old approval cannot
    // follow a new document version.
    next.reviewedData = null;
    next.acceptedRevision = null;
    next.acceptedAt = null;
    if (draft.status === "complete") draft.status = "in_progress";
  });
}

export function reviewRequirement(
  current: OnboardingCase,
  actorId: string,
  requirementId: string,
  values: OnboardingRequirement["reviewedData"],
): OnboardingCase {
  const prior = requirement(current, requirementId);
  if (prior.status === "missing" || !prior.document) throw new OnboardingConflictError("Supply a document before reviewing extracted information.");
  if (prior.status === "accepted") throw new OnboardingConflictError("An accepted requirement needs a new document before it can be reviewed again.");
  const before = requirementSnapshot(prior);
  return mutate(current, actorId, "reviewed", requirementId, before, values, (draft) => {
    const next = requirement(draft, requirementId);
    next.status = "supplied";
    next.reviewedData = values ?? {};
  });
}

export function requestCorrection(current: OnboardingCase, actorId: string, requirementId: string, note: string | null = null): OnboardingCase {
  const prior = requirement(current, requirementId);
  if (!prior.document) throw new OnboardingConflictError("A supplied document is required before requesting a correction.");
  const before = requirementSnapshot(prior);
  return mutate(current, actorId, "correction_requested", requirementId, before, { note }, (draft) => {
    const next = requirement(draft, requirementId);
    next.status = "correction";
    next.reviewedData = null;
    next.acceptedRevision = null;
    next.acceptedAt = null;
    draft.status = "in_progress";
  }, note);
}

export function acceptRequirement(
  current: OnboardingCase,
  actorId: string,
  requirementId: string,
  documentRevision: number,
  at = nowIso(),
): OnboardingCase {
  const prior = requirement(current, requirementId);
  if (prior.status !== "supplied" && prior.status !== "correction") throw new OnboardingConflictError("Review a supplied item before accepting it.");
  if (!prior.document || prior.document.revision !== documentRevision) throw new OnboardingConflictError("The document version changed. Supply or review the current version before accepting it.");
  if (!prior.reviewedData) throw new OnboardingConflictError("Review the proposed information before accepting this item.");
  const before = requirementSnapshot(prior);
  return mutate(current, actorId, "accepted", requirementId, before, { revision: documentRevision, reviewedData: prior.reviewedData }, (draft) => {
    const next = requirement(draft, requirementId);
    next.status = "accepted";
    next.acceptedRevision = documentRevision;
    next.acceptedAt = at;
    draft.status = draft.requirements.every((item) => item.id === requirementId ? true : item.status === "accepted") ? "complete" : "in_progress";
  }, null, at);
}

export function assertCase(value: unknown): OnboardingCase {
  return onboardingCaseSchema.parse(value);
}
