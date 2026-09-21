import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import {
  getWork,
  listWork,
  saveWork,
} from "@/platform/workspaces/repository";
import type { SavedWork, WorkspaceActor } from "@/platform/workspaces";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  WORKSPACE_EXIT_STOPPED_MESSAGE,
} from "@/platform/workspaces/types";
import { createDocument, documentSchema } from "@/products/documents/contracts";
import { parseTrackerCsv } from "@/products/tracker/server";
import {
  createOnboardingCaseInputSchema,
  onboardingCaseSchema,
  onboardingDocumentReferenceSchema,
  onboardingExtractionSchema,
  onboardingFileProvenanceSchema,
  onboardingReviewValuesSchema,
  ONBOARDING_PRODUCT_ID,
  ONBOARDING_RESOURCE_KIND,
  type OnboardingCase,
  type OnboardingCaseRecord,
  type OnboardingAttachableDocument,
  type OnboardingDocumentRecord,
  type OnboardingExtraction,
  type OnboardingRequirement,
} from "./contracts";
import {
  acceptRequirement,
  assignCase,
  createOnboardingCase as buildOnboardingCase,
  OnboardingConflictError,
  OnboardingUnavailableError,
  requestCorrection,
  reviewRequirement,
  supplyRequirement,
} from "./engine";

export { OnboardingConflictError, OnboardingUnavailableError } from "./engine";

const MAX_FILE_BYTES = 2_000_000;
const MAX_EXTRACTED_TEXT = 50_000;

type DbFailure = { message?: string; code?: string } | null;
type DbClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<Record<string, unknown>> | null; error: DbFailure }> };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapRecord(work: SavedWork): OnboardingCaseRecord {
  if (work.productId !== ONBOARDING_PRODUCT_ID || work.resourceKind !== ONBOARDING_RESOURCE_KIND) throw new WorkspaceAccessError();
  const parsed = onboardingCaseSchema.safeParse(work.payload);
  if (!parsed.success) throw new WorkspaceStoreError("This onboarding case could not be read.");
  return { workId: work.id, workspaceId: work.workspaceId, case: parsed.data, createdAt: work.createdAt, updatedAt: work.updatedAt };
}

async function readWorkRecord(actor: WorkspaceActor, workId: string): Promise<{ work: SavedWork; record: OnboardingCaseRecord }> {
  const id = z.string().uuid().parse(workId);
  const work = await getWork(actor, id);
  if (!work) throw new OnboardingUnavailableError();
  return { work, record: mapRecord(work) };
}

async function updateCase(actor: WorkspaceActor, current: { work: SavedWork; record: OnboardingCaseRecord }, next: OnboardingCase): Promise<OnboardingCaseRecord> {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Onboarding storage is unavailable.");
  const rpc = db as unknown as DbClient;
  const { data, error } = await rpc.rpc("update_onboarding_work", {
    p_work_id: current.work.id,
    p_workspace_id: current.work.workspaceId,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
    p_expected_revision: current.record.case.revision,
    p_payload: next,
  });
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (detail.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (detail.includes("onboarding_revision_conflict")) throw new OnboardingConflictError();
  if (error || !data?.[0]) throw new WorkspaceStoreError("The onboarding change could not be confirmed.");
  return mapRecord({ ...current.work, payload: data[0].payload, title: typeof data[0].title === "string" ? data[0].title : current.work.title, updatedAt: typeof data[0].updated_at === "string" ? data[0].updated_at : current.work.updatedAt });
}

async function mutateCase(
  actor: WorkspaceActor,
  workId: string,
  mutator: (current: OnboardingCase) => OnboardingCase,
): Promise<OnboardingCaseRecord> {
  const current = await readWorkRecord(actor, workId);
  return updateCase(actor, current, mutator(current.record.case));
}

export async function createOnboardingCase(actor: WorkspaceActor, raw: unknown): Promise<OnboardingCaseRecord> {
  const input = createOnboardingCaseInputSchema.parse(raw);
  const onboardingCase = buildOnboardingCase({ ...input, actorId: z.string().uuid().parse(actor.userId) });
  const work = await saveWork(actor, input.workspaceId, {
    productId: ONBOARDING_PRODUCT_ID,
    resourceKind: ONBOARDING_RESOURCE_KIND,
    title: onboardingCase.title,
    payload: onboardingCase,
    input: { version: 1, source: "onboarding" },
  });
  return mapRecord(work);
}

async function presentStaleReferences(actor: WorkspaceActor, record: OnboardingCaseRecord): Promise<OnboardingCaseRecord> {
  const stale = await Promise.all(record.case.requirements.map(async (requirement) => {
    const reference = requirement.document;
    if (!reference || reference.source !== "saved_document") return false;
    const work = await getWork(actor, reference.workId);
    if (!work || work.workspaceId !== record.workspaceId || work.productId !== "documents" || work.resourceKind !== "document") return true;
    const document = documentSchema.safeParse(work.payload);
    return !document.success || document.data.revision !== reference.revision;
  }));
  if (!stale.some(Boolean)) return record;
  const next = structuredClone(record.case) as OnboardingCase;
  next.requirements.forEach((requirement, index) => {
    if (!stale[index]) return;
    requirement.stale = true;
    if (requirement.status === "accepted" || requirement.status === "supplied") requirement.status = "correction";
    requirement.reviewedData = null;
    requirement.acceptedRevision = null;
    requirement.acceptedAt = null;
  });
  return { ...record, case: onboardingCaseSchema.parse(next) };
}

export async function readOnboardingCase(actor: WorkspaceActor, workId: string): Promise<OnboardingCaseRecord> {
  return presentStaleReferences(actor, (await readWorkRecord(actor, workId)).record);
}

export async function listOnboardingCases(actor: WorkspaceActor, workspaceId: string): Promise<OnboardingCaseRecord[]> {
  const id = z.string().uuid().parse(workspaceId);
  const works = await listWork(actor, id);
  const cases = works.filter((work) => work.productId === ONBOARDING_PRODUCT_ID && work.resourceKind === ONBOARDING_RESOURCE_KIND).map(mapRecord);
  return Promise.all(cases.map((item) => presentStaleReferences(actor, item)));
}

export async function listOnboardingAttachableDocuments(actor: WorkspaceActor, workspaceId: string): Promise<OnboardingAttachableDocument[]> {
  const id = z.string().uuid().parse(workspaceId);
  const works = await listWork(actor, id);
  return works.flatMap((work): OnboardingAttachableDocument[] => {
    if (work.productId !== "documents" || work.resourceKind !== "document") return [];
    if (record(work.input).source === "onboarding_upload") return [];
    const document = documentSchema.safeParse(work.payload);
    if (!document.success) return [];
    return [{ workId: work.id, workspaceId: work.workspaceId, title: document.data.title, revision: document.data.revision, updatedAt: work.updatedAt }];
  });
}

export async function assignOnboardingCase(actor: WorkspaceActor, workId: string, input: { email: string; userId?: string }): Promise<OnboardingCaseRecord> {
  const assignee = z.object({ email: z.string().trim().toLowerCase().email().max(254), userId: z.string().uuid().optional() }).strict().parse(input);
  return mutateCase(actor, workId, (current) => assignCase(current, actor.userId, assignee));
}

type SuppliedDocument = {
  work: SavedWork;
  document: z.infer<typeof documentSchema>;
  provenance: z.infer<typeof onboardingFileProvenanceSchema> | null;
  extraction: OnboardingExtraction;
};

async function documentFor(actor: WorkspaceActor, reference: OnboardingRequirement["document"], expectedWorkspaceId?: string): Promise<SuppliedDocument> {
  if (!reference) throw new OnboardingConflictError("This requirement has no supplied document.");
  const work = await getWork(actor, reference.workId);
  if (!work || work.productId !== "documents" || work.resourceKind !== "document") throw new WorkspaceAccessError();
  if (expectedWorkspaceId && work.workspaceId !== expectedWorkspaceId) throw new WorkspaceAccessError();
  const document = documentSchema.safeParse(work.payload);
  if (!document.success) throw new WorkspaceStoreError("The supplied document could not be read.");

  if (reference.source === "saved_document") {
    if (document.data.revision !== reference.revision) {
      throw new OnboardingConflictError("The linked document changed. Attach its current revision before reviewing or accepting it.");
    }
    const extraction = onboardingExtractionSchema.safeParse(reference.extraction);
    if (!extraction.success) throw new WorkspaceStoreError("The linked document review state could not be read.");
    return { work, document: document.data, provenance: null, extraction: extraction.data };
  }

  const input = record(work.input);
  if (input.source !== "onboarding_upload" || document.data.revision !== reference.revision) {
    throw new OnboardingConflictError("The supplied document version changed. Supply the current document before continuing.");
  }
  const provenance = onboardingFileProvenanceSchema.safeParse(input.provenance);
  const extraction = onboardingExtractionSchema.safeParse(input.extraction);
  if (!provenance.success || !extraction.success) throw new WorkspaceStoreError("The supplied file provenance could not be read.");
  return { work, document: document.data, provenance: provenance.data, extraction: extraction.data };
}

export async function reviewOnboardingRequirement(actor: WorkspaceActor, workId: string, requirementId: string, values: unknown): Promise<OnboardingCaseRecord> {
  const id = z.string().uuid().parse(requirementId);
  const reviewed = onboardingReviewValuesSchema.parse(values);
  const current = await readWorkRecord(actor, workId);
  const requirement = current.record.case.requirements.find((item) => item.id === id);
  if (!requirement) throw new OnboardingUnavailableError("That onboarding requirement is unavailable.");
  await documentFor(actor, requirement.document, current.record.workspaceId);
  return updateCase(actor, current, reviewRequirement(current.record.case, actor.userId, id, reviewed));
}

export async function requestOnboardingCorrection(actor: WorkspaceActor, workId: string, requirementId: string, note?: string): Promise<OnboardingCaseRecord> {
  const id = z.string().uuid().parse(requirementId);
  const cleanNote = note?.trim().slice(0, 500) || null;
  return mutateCase(actor, workId, (current) => requestCorrection(current, actor.userId, id, cleanNote));
}

export async function acceptOnboardingRequirement(actor: WorkspaceActor, workId: string, requirementId: string): Promise<OnboardingCaseRecord> {
  const id = z.string().uuid().parse(requirementId);
  const current = await readWorkRecord(actor, workId);
  const requirement = current.record.case.requirements.find((item) => item.id === id);
  if (!requirement) throw new OnboardingUnavailableError("That onboarding requirement is unavailable.");
  const supplied = await documentFor(actor, requirement.document, current.record.workspaceId);
  if (!requirement.document || supplied.document.revision !== requirement.document.revision) {
    throw new OnboardingConflictError("The document version changed. Supply or review the current version before accepting it.");
  }
  return updateCase(actor, current, acceptRequirement(current.record.case, actor.userId, id, supplied.document.revision));
}

function normalizedField(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parsedProposedData(text: string, fields: OnboardingRequirement["fields"], isCsv = false): Record<string, string> {
  const result: Record<string, string> = {};
  const trimmed = text.trim();
  if (isCsv) {
    const parsed = parseTrackerCsv(text, { sourceId: "onboarding-upload" });
    const headers = parsed.records[0]?.values ?? [];
    const values = parsed.records[1]?.values ?? [];
    for (const field of fields) {
      const keys = [field.key, field.label].map(normalizedField).filter(Boolean);
      const index = headers.findIndex((header) => keys.includes(normalizedField(header)));
      const value = index >= 0 ? values[index]?.trim() : undefined;
      if (value) result[field.key] = value;
    }
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const value = JSON.parse(trimmed) as unknown;
      const object = record(value);
      for (const field of fields) {
        const direct = object[field.key] ?? object[field.label];
        if (typeof direct === "string" || typeof direct === "number" || typeof direct === "boolean") result[field.key] = String(direct);
      }
    } catch {
      // Keep extraction available with no proposed values; human review can fill them in.
    }
  }
  const lines = text.split(/\r?\n/);
  for (const field of fields) {
    const keys = [field.key, field.label].map(normalizedField).filter(Boolean);
    const line = lines.find((candidate) => {
      const match = candidate.match(/^\s*([^:=,]+?)\s*[:=]\s*(.*?)\s*$/);
      return Boolean(match && keys.includes(normalizedField(match[1] ?? "")));
    });
    const match = line?.match(/^\s*([^:=,]+?)\s*[:=]\s*(.*?)\s*$/);
    if (match?.[2]) result[field.key] = match[2].trim();
  }
  return result;
}

function extractLocalText(contentType: string, filename: string, bytes: Buffer): { text: string; proposedData: Record<string, string>; extraction: OnboardingExtraction } {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  const supported = contentType.startsWith("text/") || ["application/json", "text/csv"].includes(contentType) || ["txt", "csv", "json"].includes(extension);
  if (!supported) return { text: "", proposedData: {}, extraction: { status: "unavailable", provider: "none", message: process.env.ONBOARDING_EXTRACTION_PROVIDER ? "The configured extraction provider is unavailable in this local build. Enter the information manually." : "No extraction provider is configured for this file type. Enter the information manually.", truncated: false } };
  const full = bytes.toString("utf8").replaceAll("\u0000", "");
  const truncated = full.length > MAX_EXTRACTED_TEXT;
  const text = full.slice(0, MAX_EXTRACTED_TEXT);
  return { text, proposedData: {}, extraction: { status: "available", provider: "local-text", message: truncated ? "Text was parsed locally and shortened for review." : "Text was parsed locally. Review the proposed information before accepting it.", truncated } };
}

export async function uploadOnboardingFile(actor: WorkspaceActor, input: {
  workspaceId: string;
  caseId: string;
  requirementId: string;
  file?: File;
  reopenOnly?: boolean;
}): Promise<OnboardingCaseRecord & { extraction?: OnboardingExtraction; document?: OnboardingDocumentRecord }> {
  const workspaceId = z.string().uuid().parse(input.workspaceId);
  const caseId = z.string().uuid().parse(input.caseId);
  const requirementId = z.string().uuid().parse(input.requirementId);
  const current = await readWorkRecord(actor, caseId);
  if (current.record.workspaceId !== workspaceId) throw new WorkspaceAccessError();
  const requirement = current.record.case.requirements.find((item) => item.id === requirementId);
  if (!requirement) throw new OnboardingUnavailableError("That onboarding requirement is unavailable.");
  if (input.reopenOnly) {
    const supplied = await documentFor(actor, requirement.document, current.record.workspaceId);
    if (!supplied.provenance) throw new WorkspaceConflictError("Existing saved documents do not have an onboarding upload to reopen.");
    return { ...current.record, document: { workId: supplied.work.id, workspaceId: supplied.work.workspaceId, title: supplied.document.title, text: supplied.document.text, provenance: supplied.provenance, extraction: supplied.extraction } };
  }
  if (!input.file) throw new WorkspaceConflictError("Choose a file before supplying this requirement.");
  if (input.file.size > MAX_FILE_BYTES) throw new WorkspaceConflictError("This private file is too large. Files must be 2MB or smaller.");
  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) throw new WorkspaceConflictError("This private file is too large. Files must be 2MB or smaller.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const filename = input.file.name.trim().slice(0, 180) || "uploaded-document";
  const contentType = input.file.type.trim().toLowerCase() || "application/octet-stream";
  const extracted = extractLocalText(contentType, filename, bytes);
  extracted.proposedData = parsedProposedData(extracted.text, requirement.fields, contentType === "text/csv" || filename.toLowerCase().endsWith(".csv"));
  const at = new Date().toISOString();
  const provenance = onboardingFileProvenanceSchema.parse({ source: "upload", storageBoundary: "saved_product_work", storageKey: `onboarding-upload:${sha256}`, originalName: filename, contentType, size: bytes.length, sha256, uploadedAt: at });
  const document = createDocument({ title: filename, text: extracted.text }, actor.userId);
  const documentWork = await saveWork(actor, workspaceId, {
    productId: "documents",
    resourceKind: "document",
    title: document.title,
    payload: document,
    input: {
      version: 1,
      source: "onboarding_upload",
      caseId,
      requirementId,
      provenance,
      extraction: extracted.extraction,
      rawBase64: bytes.toString("base64"),
    },
  });
  const reference = onboardingDocumentReferenceSchema.parse({ workId: documentWork.id, revision: document.revision, title: document.title, source: "upload", provenance, extraction: extracted.extraction });
  const next = await mutateCase(actor, caseId, (latest) => supplyRequirement(latest, actor.userId, requirementId, reference, extracted.proposedData));
  return { ...next, extraction: extracted.extraction };
}

export async function attachExistingOnboardingDocument(actor: WorkspaceActor, input: {
  workspaceId: string;
  caseId: string;
  requirementId: string;
  documentWorkId: string;
}): Promise<OnboardingCaseRecord> {
  const workspaceId = z.string().uuid().parse(input.workspaceId);
  const caseId = z.string().uuid().parse(input.caseId);
  const requirementId = z.string().uuid().parse(input.requirementId);
  const documentWorkId = z.string().uuid().parse(input.documentWorkId);
  const current = await readWorkRecord(actor, caseId);
  if (current.record.workspaceId !== workspaceId) throw new WorkspaceAccessError();
  const requirement = current.record.case.requirements.find((item) => item.id === requirementId);
  if (!requirement) throw new OnboardingUnavailableError("That onboarding requirement is unavailable.");
  const work = await getWork(actor, documentWorkId);
  if (!work || work.workspaceId !== workspaceId || work.productId !== "documents" || work.resourceKind !== "document") throw new WorkspaceAccessError();
  if (record(work.input).source === "onboarding_upload") throw new WorkspaceConflictError("Choose a general saved document. Existing onboarding attachments stay linked to their original requirement.");
  const document = documentSchema.safeParse(work.payload);
  if (!document.success) throw new WorkspaceStoreError("The saved document could not be read.");
  const extraction = onboardingExtractionSchema.parse({
    status: "available",
    provider: "existing-document",
    message: "An existing saved document revision is linked. Review the proposed information before accepting it.",
    truncated: false,
  });
  const reference = onboardingDocumentReferenceSchema.parse({
    workId: work.id,
    revision: document.data.revision,
    title: document.data.title,
    source: "saved_document",
    provenance: null,
    extraction,
  });
  const proposedData = parsedProposedData(document.data.text, requirement.fields);
  return updateCase(actor, current, supplyRequirement(current.record.case, actor.userId, requirementId, reference, proposedData));
}

export async function readOnboardingUpload(actor: WorkspaceActor, workId: string): Promise<OnboardingDocumentRecord> {
  const work = await getWork(actor, z.string().uuid().parse(workId));
  if (!work || work.productId !== "documents" || work.resourceKind !== "document") throw new WorkspaceAccessError();
  const document = documentSchema.safeParse(work.payload);
  const input = record(work.input);
  const provenance = onboardingFileProvenanceSchema.safeParse(input.provenance);
  const extraction = onboardingExtractionSchema.safeParse(input.extraction);
  if (!document.success || !provenance.success || !extraction.success || input.source !== "onboarding_upload") throw new WorkspaceAccessError();
  return { workId: work.id, workspaceId: work.workspaceId, title: document.data.title, text: document.data.text, provenance: provenance.data, extraction: extraction.data };
}

export interface OnboardingOriginalFile {
  workId: string;
  workspaceId: string;
  bytes: Buffer;
  provenance: z.infer<typeof onboardingFileProvenanceSchema>;
}

export async function readOnboardingOriginalFile(actor: WorkspaceActor, workId: string): Promise<OnboardingOriginalFile> {
  const work = await getWork(actor, z.string().uuid().parse(workId));
  if (!work || work.productId !== "documents" || work.resourceKind !== "document") throw new WorkspaceAccessError();
  const document = documentSchema.safeParse(work.payload);
  const input = record(work.input);
  const provenance = onboardingFileProvenanceSchema.safeParse(input.provenance);
  if (!document.success || !provenance.success || input.source !== "onboarding_upload") throw new WorkspaceAccessError();
  if (document.data.revision !== 0) throw new WorkspaceConflictError("This private attachment has an unexpected document revision.");
  const encoded = input.rawBase64;
  if (typeof encoded !== "string" || encoded.length > 4_000_000 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new WorkspaceStoreError("The private file could not be opened.");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== provenance.data.size || createHash("sha256").update(bytes).digest("hex") !== provenance.data.sha256) {
    throw new WorkspaceStoreError("The private file could not be verified.");
  }
  return { workId: work.id, workspaceId: work.workspaceId, bytes, provenance: provenance.data };
}
