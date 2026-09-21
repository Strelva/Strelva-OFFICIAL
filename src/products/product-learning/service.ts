import { createHash } from "node:crypto";
import { z } from "zod";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";
import { changeLearning, createLearning, learningCommandSchema, learningSchema, learningSummary, type Learning, type LearningObservation } from "./engine";
import { summarizeTrackerComparison, trackerExperimentComparisonInputSchema, trackerSnapshotSchema } from "@/products/tracker/client";

function supportedSource(work: SavedWork) {
  return (work.productId === "documents" && work.resourceKind === "document") || (work.productId === "tracker" && work.resourceKind === "tracker") || (work.productId === "research" && work.resourceKind === "experiment");
}

/** Database/auth boundary. Production supplies the existing workspace authority. */
export interface LearningStore {
  authorizeInternalMember(actor: WorkspaceActor, workspaceId: string): Promise<void>;
  get(actor: WorkspaceActor, workId: string): Promise<SavedWork | null>;
  create(actor: WorkspaceActor, workspaceId: string, learning: Learning): Promise<SavedWork>;
  replace(actor: WorkspaceActor, work: SavedWork, expectedRevision: number, learning: Learning): Promise<SavedWork>;
}

export function createLearningService(store: LearningStore, clock = () => new Date().toISOString()) {
  const read = async (actor: WorkspaceActor, workId: string) => {
    const work = await store.get(actor, z.string().uuid().parse(workId));
    if (!work || work.productId !== "product-learning" || work.resourceKind !== "learning") throw new WorkspaceAccessError();
    await store.authorizeInternalMember(actor, work.workspaceId);
    const parsed = learningSchema.safeParse(work.payload);
    if (!parsed.success) throw new WorkspaceStoreError("Learning evidence could not be read.");
    return { work, learning: parsed.data };
  };
  const result = (work: SavedWork) => {
    const learning = learningSchema.parse(work.payload);
    return { workId: work.id, workspaceId: work.workspaceId, learning, summary: learningSummary(learning, clock()) };
  };
  return {
    async create(actor: WorkspaceActor, workspaceId: string, input: unknown) {
      z.string().uuid().parse(workspaceId);
      await store.authorizeInternalMember(actor, workspaceId);
      const learning = createLearning(input, actor.userId, clock());
      for (const source of learning.sources) {
        const work = await store.get(actor, source.workId);
        if (!work || work.workspaceId !== workspaceId || work.productId === "product-learning") throw new WorkspaceAccessError("Research sources must be readable work in this internal workspace.");
        if (!supportedSource(work)) throw new WorkspaceAccessError("Choose a supported research source: a document, tracker, or recorded experiment.");
      }
      return result(await store.create(actor, workspaceId, learning));
    },
    async read(actor: WorkspaceActor, workId: string) { return result((await read(actor, workId)).work); },
    async change(actor: WorkspaceActor, workId: string, raw: unknown) {
      const saved = await read(actor, workId);
      const command = learningCommandSchema.parse(raw);
      if (command.kind === "collect") throw new WorkspaceAccessError("Source collection must use the authorized collector.");
      const learning = changeLearning(saved.learning, command, actor.userId, clock());
      return result(await store.replace(actor, saved.work, command.expectedRevision, learning));
    },
    async collect(actor: WorkspaceActor, workId: string, expectedRevision: number) {
      z.number().int().nonnegative().parse(expectedRevision);
      const saved = await read(actor, workId);
      const at = clock();
      if (saved.learning.revision !== expectedRevision) throw new WorkspaceConflictError("Learning work has a newer revision.");
      if (saved.learning.status !== "active") throw new WorkspaceConflictError("This collection is paused.");
      if (Date.parse(at) < Date.parse(saved.learning.nextRunAt)) throw new WorkspaceConflictError("This collection is not due yet.");
      const observations: LearningObservation[] = [];
      // This adapter performs bounded, local reads. It cannot promote imported
      // text into measured behavior, customer interviews, or provider telemetry.
      for (const source of saved.learning.sources) {
        try {
          const work = await store.get(actor, source.workId);
          if (!work) { observations.push({ sourceId: source.id, status: "withdrawn" }); continue; }
          if (work.workspaceId !== saved.work.workspaceId || !supportedSource(work)) throw new WorkspaceAccessError();
          const content = JSON.stringify(work.payload);
          if (!content || content.length > 1_000_000) throw new WorkspaceStoreError("Source exceeds collection bounds.");
          let excerpt = content.slice(0, 4000);
          let evidenceKind: "operator_report" | "simulated" = "operator_report";
          if (work.productId === "documents") {
            const document = z.object({ title: z.string().min(1).max(160), text: z.string().max(50000) }).parse(work.payload);
            excerpt = `${document.title}\n${document.text}`.slice(0, 4000);
          } else if (work.productId === "tracker") {
            const tracker = trackerSnapshotSchema.parse((work.payload as { tracker?: unknown } | null)?.tracker);
            const rows = tracker.rows.filter(row => row.state === "active").slice(0, 20);
            excerpt = `${tracker.title}\n${rows.map(row => tracker.columns.map(column => `${column.label}: ${String(row.cells[column.id]?.value ?? "")}`).join("; ")).join("\n")}`.slice(0, 4000);
          } else if (work.productId === "research" && work.resourceKind === "experiment") {
            const payload = work.payload as { version?: number; evidenceKind?: string; hypothesis?: string; evidence?: string };
            if (payload.version === 2) {
              const comparison = summarizeTrackerComparison(trackerExperimentComparisonInputSchema.parse(work.payload));
              const options = [comparison.baseline, ...comparison.candidates];
              if (comparison.evidenceKind === "simulated" || options.some(option => option.evidenceKind === "simulated")) evidenceKind = "simulated";
              excerpt = `${comparison.hypothesis}\nWorkload: ${comparison.workload}\n${options.map(option => `${option.label}: ${option.totalHumanMinutes} human minutes; ${option.providerCostUsd === null ? "cost unknown" : `$${option.providerCostUsd}`}; ${option.result}`).join("\n")}\n${comparison.evidence}\nDecision: ${comparison.decision}`.slice(0, 4000);
            } else {
              const experiment = z.object({ hypothesis: z.string(), workload: z.string(), evidence: z.string(), result: z.string() }).parse(work.payload);
              if (payload.evidenceKind === "simulated") evidenceKind = "simulated";
              excerpt = `${experiment.hypothesis}\nWorkload: ${experiment.workload}\n${experiment.evidence}\nResult: ${experiment.result}`.slice(0, 4000);
            }
          }
          observations.push({ sourceId: source.id, status: "available", fingerprint: createHash("sha256").update(content).digest("hex"), reference: `strelva-work:${work.id}`, excerpt, eventAt: new Date(work.updatedAt).toISOString(), evidenceKind });
        } catch {
          // Lost access is an outage, never evidence that a private source vanished.
          observations.push({ sourceId: source.id, status: "outage", reason: "The authorized source could not be read." });
        }
      }
      const learning = changeLearning(saved.learning, { kind: "collect", expectedRevision, observations, costCents: 0 }, actor.userId, at);
      return result(await store.replace(actor, saved.work, expectedRevision, learning));
    },
  };
}
