import { createHash } from "node:crypto";
import { z } from "zod";
import { investigationSchema, investigationInputSchema, investigationSourceSchema } from "./contracts";
export { investigationSchema } from "./contracts";
import { documentSchema } from "@/products/documents/contracts";
import { parseTrackerWorkPayload } from "@/products/tracker/client";
import { WorkspaceConflictError, type WorkspaceActor, type SavedWork } from "@/platform/workspaces/types";
import { applicationSchema } from "@/products/applications/contracts";
import { advance, boundedStore, initial, readBounded, type BoundedStore } from "@/platform/bounded-work/repository";
import { createPublicWebsiteSourceAdapter, type PublicWebsiteSourceRead, type PublicWebsiteSourceStatus, type PublicWebsiteContentVisibility } from "./public-website-source";

type InvestigationUnavailableReason = "missing_source" | "inaccessible_source" | "source_changed" | "limited_evidence";
type InvestigationSource = z.infer<typeof investigationSourceSchema>;
type InvestigationReference = {
  workId: string;
  kind?: "saved_work" | "public_website";
  sourceUrl?: string;
  observedAt?: string;
  freshness?: "fresh" | "unavailable";
  status?: "available" | "unknown" | "missing" | "inaccessible" | "changed" | "unavailable" | "rate_limited" | "access_denied";
  contentFingerprint?: string;
  auditFingerprint?: string;
  contentLength?: number;
  contentExcerpt?: string;
  contentVisibility?: PublicWebsiteContentVisibility;
  fetchedUrl?: string;
  revision: number;
  updatedAt: string;
};

class InvestigationSourceError extends WorkspaceConflictError {
  constructor(
    readonly reason: InvestigationUnavailableReason,
    message: string,
    readonly workId?: string,
    readonly references?: readonly InvestigationReference[],
    readonly sourceStatus?: PublicWebsiteSourceStatus,
    readonly sourceUrl?: string,
  ) {
    super(message);
    this.name = "InvestigationSourceError";
  }
}

function sourceIdentity(source: InvestigationSource): string {
  return "kind" in source ? `${source.kind}:${source.url}` : `work:${source.workId}`;
}

function sourceReference(source: InvestigationSource, reference: { revision: number; updatedAt: string }): InvestigationReference {
  if ("kind" in source) {
    return { workId: sourceIdentity(source), kind: "public_website", sourceUrl: source.url, ...reference };
  }
  return { workId: source.workId, kind: "saved_work", ...reference };
}

function sourceStateIdentity(source: InvestigationSource): { workId: string; kind: "saved_work" | "public_website"; sourceUrl?: string } {
  return "kind" in source
    ? { workId: sourceIdentity(source), kind: "public_website", sourceUrl: source.url }
    : { workId: source.workId, kind: "saved_work" };
}

function snapshot(work: SavedWork, source: Extract<InvestigationSource, { workId: string }>) {
  let revision: number;
  let entries: Array<[string, string]>;
  if (work.productId === "documents") {
    const document = documentSchema.parse(work.payload); revision = document.revision; entries = [["document", document.text]];
  } else if (work.productId === "tracker") {
    const tracker = parseTrackerWorkPayload(work.payload);
    if (!tracker) throw new WorkspaceConflictError("The tracker source cannot be read.");
    const key = tracker.columns.find(column => column.fieldKey === source.keyField);
    const value = tracker.columns.find(column => column.fieldKey === source.valueField);
    if (!key || !value) throw new WorkspaceConflictError("Choose existing source fields to compare.");
    revision = tracker.revision;
    entries = tracker.rows.filter(row => row.state === "active").map(row => [row.cells[key.id]?.value ?? "", row.cells[value.id]?.value ?? ""]);
  } else if (work.productId === "applications") {
    const application = applicationSchema.parse(work.payload); revision = application.revision;
    if (!source.keyField || !source.valueField || !application.spec.fields.some(field => field.id === source.keyField) || !application.spec.fields.some(field => field.id === source.valueField)) throw new WorkspaceConflictError("Choose existing application fields to compare.");
    entries = application.records.map(record => [String(record.values[source.keyField!] ?? ""), String(record.values[source.valueField!] ?? "")]);
  } else throw new WorkspaceConflictError("This source does not expose comparable records.");
  if (entries.length > 1000 || entries.some(([key]) => !key) || new Set(entries.map(([key]) => key)).size !== entries.length) throw new WorkspaceConflictError("Comparison needs at most 1,000 records with unique nonempty keys.");
  return { reference: { workId: work.id, revision, updatedAt: work.updatedAt }, entries: entries.sort(([a], [b]) => a.localeCompare(b)) };
}
function publicWebsiteEntries(read: PublicWebsiteSourceRead, identity: string): Array<[string, string]> {
  if (!read.contentFingerprint || !read.fingerprint) throw new InvestigationSourceError("inaccessible_source", "The public page did not return a complete check snapshot.", identity, undefined, read.status, read.sourceUrl);
  if (read.contentVisibility === "no_server_visible_text") throw new InvestigationSourceError("limited_evidence", "The public page returned no server-visible text; client-rendered content cannot be checked.", identity, undefined, read.status, read.sourceUrl);
  const excerpt = read.contentExcerpt || "No server-visible text was returned; client-rendered page content may be absent.";
  return [
    ["public_page_text", excerpt],
    ["public_page_fingerprint", JSON.stringify({ contentFingerprint: read.contentFingerprint, auditFingerprint: read.fingerprint, contentLength: read.contentLength ?? 0, contentVisibility: read.contentVisibility ?? "no_server_visible_text", fetchedUrl: read.fetchedUrl ?? read.sourceUrl })],
  ];
}

function publicReferenceEntries(reference: InvestigationReference): Array<[string, string]> | null {
  if (reference.kind !== "public_website" || !reference.contentFingerprint || !reference.auditFingerprint) return null;
  return [
    ["public_page_text", reference.contentExcerpt || ""],
    ["public_page_fingerprint", JSON.stringify({
      contentFingerprint: reference.contentFingerprint,
      auditFingerprint: reference.auditFingerprint,
      contentLength: reference.contentLength ?? 0,
      contentVisibility: reference.contentVisibility ?? "server_visible",
      fetchedUrl: reference.fetchedUrl ?? reference.sourceUrl,
    })],
  ];
}

export interface InvestigationServiceDependencies {
  readPublicWebsite?: (input: { url: string }) => Promise<PublicWebsiteSourceRead>;
}

export function createInvestigationService(store: BoundedStore = boundedStore, dependencies: InvestigationServiceDependencies = {}) {
  const readPublicWebsite = dependencies.readPublicWebsite ?? createPublicWebsiteSourceAdapter().read;
  const read = (actor: WorkspaceActor, id: string) => readBounded(store, actor, id, "investigations", investigationSchema);
  async function sources(actor: WorkspaceActor, workspaceId: string, selectors: readonly InvestigationSource[]) {
    return Promise.all(selectors.map(async source => {
      if ("kind" in source) {
        let result: PublicWebsiteSourceRead;
        try {
          result = await readPublicWebsite({ url: source.url });
        } catch (error) {
          throw new InvestigationSourceError("inaccessible_source", error instanceof Error ? error.message : "The public page could not be read.", sourceIdentity(source), undefined, undefined, source.url);
        }
        if (result.status !== "available") {
          throw new InvestigationSourceError("inaccessible_source", result.reason || "The public page could not be read.", sourceIdentity(source), undefined, result.status, source.url);
        }
        const reference = sourceReference(source, {
          revision: 0,
          updatedAt: result.observedAt,
        });
        return {
          reference: {
            ...reference,
            observedAt: result.observedAt,
            freshness: result.freshness,
            status: result.status,
            contentFingerprint: result.contentFingerprint,
            auditFingerprint: result.fingerprint,
            contentLength: result.contentLength,
            contentExcerpt: result.contentExcerpt,
            contentVisibility: result.contentVisibility,
            fetchedUrl: result.fetchedUrl,
          },
          entries: publicWebsiteEntries(result, sourceIdentity(source)),
        };
      }
      let work: SavedWork | null;
      try {
        work = await store.read(actor, source.workId);
      } catch {
        throw new InvestigationSourceError("inaccessible_source", "The investigation source could not be read.", source.workId);
      }
      if (!work || work.workspaceId !== workspaceId) {
        throw new InvestigationSourceError("missing_source", "The investigation source is unavailable in this workspace.", source.workId);
      }
      try {
        const current = snapshot(work, source);
        return { ...current, reference: sourceReference(source, current.reference) };
      } catch (error) {
        if (error instanceof InvestigationSourceError) throw error;
        throw new InvestigationSourceError("inaccessible_source", error instanceof Error ? error.message : "The investigation source could not be read.", source.workId);
      }
    }));
  }
  function priorReferences(payload: z.infer<typeof investigationSchema>, now: Date) {
    const previous = payload.runs.at(-1)?.sources;
    return previous?.length === payload.sources.length
      ? previous
      : payload.sources.map(source => ({
        ...sourceReference(source, { revision: 0, updatedAt: now.toISOString() }),
        status: "unknown" as const,
      }));
  }
  function sourceStates(
    payload: z.infer<typeof investigationSchema>,
    reason: InvestigationUnavailableReason,
    failedWorkId: string | undefined,
    references: readonly InvestigationReference[],
    failedStatus?: PublicWebsiteSourceStatus,
    failedUrl?: string,
  ) {
    return payload.sources.map(source => {
      const identity = sourceIdentity(source);
      const reference = references.find(item => item.workId === identity || ("workId" in source && item.workId === source.workId));
      const failed = identity === failedWorkId || ("workId" in source && source.workId === failedWorkId);
      return {
        ...sourceStateIdentity(source),
        status: failed ? failedStatus && failedStatus !== "available" ? failedStatus : reason === "source_changed" ? "changed" : reason === "missing_source" ? "missing" : reason === "limited_evidence" ? "unavailable" : "inaccessible" : reference ? "available" : "unknown",
        ...(failed && failedUrl ? { sourceUrl: failedUrl } : {}),
        ...(failed && failedStatus && failedStatus !== "available" ? { freshness: "unavailable" as const } : {}),
        revision: reference?.revision ?? null,
        updatedAt: reference?.updatedAt ?? null,
      } as const;
    });
  }
  async function unavailable(
    actor: WorkspaceActor,
    work: Awaited<ReturnType<typeof read>>,
    command: { expectedRevision: number; requestId: string },
    now: Date,
    error: InvestigationSourceError,
    references?: readonly InvestigationReference[],
  ) {
    await store.member(actor, work.workspaceId);
    const evidence = references ?? error.references ?? priorReferences(work.payload, now);
    const next = advance(work.payload, command.expectedRevision, "investigate_unavailable", actor);
    const fingerprint = createHash("sha256").update(JSON.stringify({ reason: error.reason, sources: evidence })).digest("hex");
    next.runs = [...next.runs, {
      requestId: command.requestId,
      at: now.toISOString(),
      result: "unavailable",
      fingerprint,
      sources: evidence.map(source => ({ ...source })),
      differences: [],
      unavailableReason: error.reason,
      retryable: true,
      sourceStates: sourceStates(work.payload, error.reason, error.workId, evidence, error.sourceStatus, error.sourceUrl),
    }];
    // A failed read is retryable after a short backoff. This gives a standing
    // run a real wake time while keeping the recovery local and bounded.
    next.nextRunAt = new Date(now.getTime() + 60_000).toISOString();
    const saved = await store.update(actor, work, command.expectedRevision, investigationSchema.parse(next));
    return { ...saved, payload: investigationSchema.parse(saved.payload) };
  }
  return {
    read,
    async create(actor: WorkspaceActor, workspaceId: string, raw: unknown) {
      await store.member(actor, workspaceId);
      const input = investigationInputSchema.parse(raw);
      const savedSources = input.sources.filter((source): source is Extract<InvestigationSource, { workId: string }> => "workId" in source);
      // A public URL is configuration, not a proof that its first read will
      // succeed. Save it now and let the due run record access, rate-limit, or
      // fetch failures durably with the retry schedule.
      await sources(actor, workspaceId, savedSources);
      const payload = investigationSchema.parse({ ...initial(input.title, actor), ...input, status: "active", nextRunAt: new Date().toISOString(), runs: [] });
      const saved = await store.create(actor, workspaceId, { productId: "investigations", resourceKind: "investigation", title: input.title, payload });
      return { ...saved, payload: investigationSchema.parse(saved.payload) };
    },
    async command(actor: WorkspaceActor, id: string, raw: unknown) {
      const command = z.object({ kind: z.enum(["pause", "resume"]), expectedRevision: z.number().int().nonnegative() }).strict().parse(raw);
      const work = await read(actor, id); await store.member(actor, work.workspaceId);
      const payload = investigationSchema.parse({ ...advance(work.payload, command.expectedRevision, command.kind, actor), status: command.kind === "pause" ? "paused" : "active" });
      const saved = await store.update(actor, work, command.expectedRevision, payload); return { ...saved, payload: investigationSchema.parse(saved.payload) };
    },
    async run(actor: WorkspaceActor, id: string, raw: unknown, now = new Date()) {
      const command = z.object({ expectedRevision: z.number().int().nonnegative(), requestId: z.string().min(1).max(100) }).strict().parse(raw);
      const work = await read(actor, id); await store.member(actor, work.workspaceId);
      if (work.payload.runs.some(run => run.requestId === command.requestId)) return work;
      if (work.payload.status !== "active") throw new WorkspaceConflictError("This investigation is paused.");
      if (Date.parse(work.payload.nextRunAt) > now.getTime()) throw new WorkspaceConflictError("The next investigation is not due yet.");
      const next = advance(work.payload, command.expectedRevision, "investigate", actor);
      let evidence: Awaited<ReturnType<typeof sources>>;
      try {
        evidence = await sources(actor, work.workspaceId, work.payload.sources);
      } catch (error) {
        if (error instanceof InvestigationSourceError) return unavailable(actor, work, command, now, error);
        throw error;
      }
      const temporal = work.payload.mode === "public_website";
      const currentEntries = new Map(evidence[0]!.entries);
      const previousRun = temporal
        ? [...work.payload.runs].reverse().find(run => run.result !== "unavailable")
        : undefined;
      const previousEntries = previousRun ? publicReferenceEntries(previousRun.sources[0] as InvestigationReference) : null;
      const left = temporal && previousEntries ? new Map(previousEntries) : currentEntries;
      const right = temporal && previousEntries ? currentEntries : new Map(evidence[1]?.entries ?? []);
      const differences = temporal && !previousEntries
        ? []
        : [...new Set([...left.keys(), ...right.keys()])].sort().flatMap(key => left.get(key) === right.get(key) ? [] : [{ key, left: left.get(key) ?? null, right: right.get(key) ?? null }]);
      const fingerprint = createHash("sha256").update(JSON.stringify(evidence.map(source => source.entries))).digest("hex");
      let checked: Awaited<ReturnType<typeof sources>>;
      try {
        checked = await sources(actor, work.workspaceId, work.payload.sources);
      } catch (error) {
        if (error instanceof InvestigationSourceError) return unavailable(actor, work, command, now, error, evidence.map(source => source.reference));
        throw error;
      }
      if (checked.some((source, index) => JSON.stringify(source.entries) !== JSON.stringify(evidence[index]?.entries))) {
        const changed = checked.find((source, index) => JSON.stringify(source.entries) !== JSON.stringify(evidence[index]?.entries))?.reference.workId;
        return unavailable(actor, work, command, now, new InvestigationSourceError(
          "source_changed",
          "A source changed during the investigation. Run it again against current records.",
          changed,
          evidence.map(source => source.reference),
        ), evidence.map(source => source.reference));
      }
      await store.member(actor, work.workspaceId);
      const result = temporal
        ? previousRun ? differences.length ? "changed" as const : "no_change" as const : "baseline" as const
        : next.runs.at(-1)?.fingerprint === fingerprint ? "no_change" as const : differences.length ? "discrepancy" as const : "agreement" as const;
      next.runs = [...next.runs, { requestId: command.requestId, at: now.toISOString(), result, fingerprint, sources: evidence.map(source => source.reference), differences }];
      next.nextRunAt = new Date(now.getTime() + next.intervalMinutes * 60000).toISOString();
      const saved = await store.update(actor, work, command.expectedRevision, investigationSchema.parse(next)); return { ...saved, payload: investigationSchema.parse(saved.payload) };
    },
  };
}
export const { create: createWorkspaceInvestigation, read: readWorkspaceInvestigation, command: changeWorkspaceInvestigation, run: runWorkspaceInvestigation } = createInvestigationService();
