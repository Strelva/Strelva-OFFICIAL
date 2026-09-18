import { createHash } from "node:crypto";
import { z } from "zod";
import { investigationSchema, investigationInputSchema, investigationSourceSchema } from "./contracts";
export { investigationSchema } from "./contracts";
import { documentSchema } from "@/products/documents/contracts";
import { parseTrackerWorkPayload } from "@/products/tracker/client";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor, type SavedWork } from "@/platform/workspaces/types";
import { applicationSchema } from "@/products/applications/contracts";
import { advance, boundedStore, initial, readBounded, type BoundedStore } from "@/platform/bounded-work/repository";
function snapshot(work: SavedWork, source: z.infer<typeof investigationSourceSchema>) {
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
export function createInvestigationService(store: BoundedStore = boundedStore) {
  const read = (actor: WorkspaceActor, id: string) => readBounded(store, actor, id, "investigations", investigationSchema);
  async function sources(actor: WorkspaceActor, workspaceId: string, selectors: z.infer<typeof investigationInputSchema>["sources"]) {
    return Promise.all(selectors.map(async source => { const work = await store.read(actor, source.workId); if (!work || work.workspaceId !== workspaceId) throw new WorkspaceAccessError("The investigation source is unavailable in this workspace."); return snapshot(work, source); }));
  }
  return {
    read,
    async create(actor: WorkspaceActor, workspaceId: string, raw: unknown) {
      await store.member(actor, workspaceId); const input = investigationInputSchema.parse(raw); await sources(actor, workspaceId, input.sources);
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
      const evidence = await sources(actor, work.workspaceId, work.payload.sources);
      const left = new Map(evidence[0]!.entries), right = new Map(evidence[1]!.entries);
      const differences = [...new Set([...left.keys(), ...right.keys()])].sort().flatMap(key => left.get(key) === right.get(key) ? [] : [{ key, left: left.get(key) ?? null, right: right.get(key) ?? null }]);
      const fingerprint = createHash("sha256").update(JSON.stringify(evidence.map(source => source.entries))).digest("hex");
      const checked = await sources(actor, work.workspaceId, work.payload.sources);
      if (JSON.stringify(checked) !== JSON.stringify(evidence)) throw new WorkspaceConflictError("A source changed during the investigation. Run it again against current records.");
      await store.member(actor, work.workspaceId);
      next.runs = [...next.runs, { requestId: command.requestId, at: now.toISOString(), result: next.runs.at(-1)?.fingerprint === fingerprint ? "no_change" : differences.length ? "discrepancy" : "agreement", fingerprint, sources: evidence.map(source => source.reference), differences }];
      next.nextRunAt = new Date(now.getTime() + next.intervalMinutes * 60000).toISOString();
      const saved = await store.update(actor, work, command.expectedRevision, investigationSchema.parse(next)); return { ...saved, payload: investigationSchema.parse(saved.payload) };
    },
  };
}
export const { create: createWorkspaceInvestigation, read: readWorkspaceInvestigation, command: changeWorkspaceInvestigation, run: runWorkspaceInvestigation } = createInvestigationService();
