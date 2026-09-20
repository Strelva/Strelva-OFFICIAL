import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import type { WorkspaceDb } from "@/platform/workspaces/schema";
import { getWork, saveWork, assertCanSaveWork, assertWorkspaceMember, listWork } from "@/platform/workspaces/repository";
import { WORKSPACE_EXIT_STOPPED_MESSAGE, WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { previewTrackerImport } from "./import";
import { createTracker, applyTrackerCommand, parseTrackerSnapshot, trackerWorkPayload } from "./engine";
import { trackerImportInputSchema, trackerMappingSelectionSchema, trackerCommandSchema, type TrackerSnapshot, type TrackerHistoryEntry } from "./contracts";
import { summarizeTrackerExperiment, trackerExperimentInputSchema, trackerExperimentSchema } from "./experiment";
import { summarizeTrackerComparison, trackerExperimentComparisonInputSchema } from "./comparison";

export { parseTrackerCsv } from "./csv";

const uuid = z.string().uuid();
const createSchema = z.object({ workspaceId: uuid, input: trackerImportInputSchema, title: z.string().trim().min(1).max(160), mapping: z.array(trackerMappingSelectionSchema).max(50).optional() });

export async function previewTracker(actor: WorkspaceActor, workspaceId: string, input: unknown) {
  await assertCanSaveWork(actor, uuid.parse(workspaceId));
  return previewTrackerImport(trackerImportInputSchema.parse(input));
}

export async function saveNewTracker(actor: WorkspaceActor, raw: unknown) {
  const input = createSchema.parse(raw);
  await assertCanSaveWork(actor, input.workspaceId);
  const preview = previewTrackerImport(input.input);
  const tracker = createTracker(preview, { trackerId: randomUUID(), actorId: actor.userId, title: input.title, mapping: input.mapping });
  const saved = await saveWork(actor, input.workspaceId, { productId: "tracker", resourceKind: "tracker", title: tracker.title, payload: trackerWorkPayload(tracker) });
  const persisted = parseTrackerSnapshot((saved.payload as { tracker?: unknown } | null)?.tracker);
  if (!persisted) throw new WorkspaceStoreError("The saved tracker could not be confirmed.");
  return { workId: saved.id, workspaceId: saved.workspaceId, tracker: persisted };
}

export async function readSavedTracker(actor: WorkspaceActor, workId: string) {
  const saved = await getWork(actor, uuid.parse(workId));
  if (!saved || saved.productId !== "tracker" || saved.resourceKind !== "tracker") throw new WorkspaceAccessError();
  const payload = saved.payload as { tracker?: unknown } | null;
  const tracker = parseTrackerSnapshot(payload?.tracker);
  if (!tracker) throw new WorkspaceStoreError("The saved tracker could not be read.");
  return { workId: saved.id, workspaceId: saved.workspaceId, tracker };
}

async function authorizeCoordination(actor: WorkspaceActor, saved: Awaited<ReturnType<typeof readSavedTracker>>, entry: TrackerHistoryEntry) {
  if (!entry.coordinationChanges?.length) return;
  await assertWorkspaceMember(actor, saved.workspaceId);
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Tracker storage is unavailable.");
  const checkedMembers = new Set<string>();
  const targets = new Map<string, Awaited<ReturnType<typeof readSavedTracker>>>();
  for (const change of entry.coordinationChanges) {
    if (change.after.assigneeId && change.after.assigneeId !== change.before.assigneeId && !checkedMembers.has(change.after.assigneeId)) {
      const { data, error } = await (db as unknown as WorkspaceDb).from("workspace_memberships").select("user_id").eq("workspace_id", saved.workspaceId).eq("user_id", change.after.assigneeId).maybeSingle();
      if (error) throw new WorkspaceStoreError("Workspace membership could not be checked.");
      if (!data) throw new WorkspaceAccessError("Choose a current workspace member.");
      checkedMembers.add(change.after.assigneeId);
    }
    for (const link of change.after.links) {
      if (change.before.links.some(previous => previous.workId === link.workId && previous.rowId === link.rowId && previous.linkedRevision === link.linkedRevision)) continue;
      const target = targets.get(link.workId) ?? await readSavedTracker(actor, link.workId);
      targets.set(link.workId, target);
      if (target.workspaceId !== saved.workspaceId) throw new WorkspaceAccessError("Related records must belong to this workspace.");
      if (target.workId === saved.workId && link.rowId === change.rowId) throw new WorkspaceConflictError("A record cannot link to itself.");
      if (target.tracker.revision !== link.linkedRevision) throw new WorkspaceConflictError("The related tracker changed. Choose its current record.");
      if (!target.tracker.rows.some(row => row.id === link.rowId && row.state === "active")) throw new WorkspaceConflictError("The related record is no longer available.");
    }
  }
}

/** Choices come only from the source workspace's current membership and readable trackers. */
export async function readTrackerCoordinationOptions(actor: WorkspaceActor, workId: string) {
  const saved = await readSavedTracker(actor, workId);
  await assertWorkspaceMember(actor, saved.workspaceId);
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Workspace choices are unavailable.");
  const { data: memberships, error } = await (db as unknown as WorkspaceDb).from("workspace_memberships").select("user_id").eq("workspace_id", saved.workspaceId);
  if (error) throw new WorkspaceStoreError("Workspace members could not be read.");
  const ids = (memberships ?? []).map(row => String(row.user_id));
  const { data: users, error: usersError } = ids.length ? await db.from("users").select("id,email").in("id", ids) : { data: [], error: null };
  if (usersError) throw new WorkspaceStoreError("Workspace member names could not be read.");
  const work = await listWork(actor, saved.workspaceId);
  return { members: (users ?? []).map(user => ({ userId: String(user.id), email: String(user.email) })), trackers: work.flatMap(item => {
    if (item.productId !== "tracker" || item.resourceKind !== "tracker") return [];
    const tracker = parseTrackerSnapshot((item.payload as { tracker?: unknown } | null)?.tracker);
    return tracker ? [{ workId: item.id, title: tracker.title, revision: tracker.revision }] : [];
  }) };
}

export async function editSavedTracker(actor: WorkspaceActor, workId: string, raw: unknown) {
  const saved = await readSavedTracker(actor, workId);
  // Membership is checked again inside the write transaction. Read delegation
  // does not confer edit authority.
  const command = trackerCommandSchema.parse({ ...(raw && typeof raw === "object" ? raw : {}), trackerId: saved.tracker.id, actorId: actor.userId, at: new Date().toISOString() });
  const tracker = applyTrackerCommand(saved.tracker, command);
  await authorizeCoordination(actor, saved, tracker.history.at(-1)!);
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Tracker storage is unavailable.");
  const rpc = db as unknown as { rpc(name: string, input: Record<string, unknown>): Promise<{ data: Array<{ payload: { tracker: TrackerSnapshot } }> | null; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("update_tracker_work", { p_work_id: saved.workId, p_workspace_id: saved.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_expected_revision: command.baseRevision, p_payload: trackerWorkPayload(tracker) });
  if (error?.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (error?.message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (error?.message.includes("tracker_revision_conflict")) throw new WorkspaceConflictError();
  if (error || !data?.[0]) throw new WorkspaceStoreError("The edit could not be confirmed.");
  const persisted = parseTrackerSnapshot(data[0].payload.tracker);
  if (!persisted) throw new WorkspaceStoreError("The saved edit could not be confirmed.");
  return { ...saved, tracker: persisted };
}

export async function recordTrackerExperiment(actor: WorkspaceActor, workId: string, raw: unknown) {
  const target = await readSavedTracker(actor, workId);
  const rawRecord = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const isComparison = Boolean(rawRecord && (Array.isArray(rawRecord.candidates) || rawRecord.version === 2 || rawRecord.kind === "candidate_comparison"));
  if (isComparison) {
    // Read and compare the revision before calculating or writing anything.
    // The tracker read above is the authority; client supplied target metadata
    // is intentionally ignored by the comparison payload.
    const expectedRevision = z.number().int().nonnegative().parse(rawRecord?.expectedRevision);
    if (expectedRevision !== target.tracker.revision) throw new WorkspaceConflictError();
    const comparison = summarizeTrackerComparison(trackerExperimentComparisonInputSchema.parse(raw));
    const recordedAt = new Date().toISOString();
    const saved = await saveWork(actor, target.workspaceId, {
      productId: "research",
      resourceKind: "experiment",
      title: `Experiment: ${target.tracker.title}`,
      sourceWorkId: target.workId,
      payload: {
        ...comparison,
        targetWorkId: target.workId,
        targetRevision: target.tracker.revision,
        recordedBy: actor.userId,
        recordedAt,
      },
    });
    return { experimentWorkId: saved.id, evidence: saved.payload };
  }
  const input = trackerExperimentInputSchema.parse(raw);
  if (input.expectedRevision !== target.tracker.revision) throw new WorkspaceConflictError();
  // The expected revision is a request guard. The persisted evidence uses the
  // server-read target revision below, so it cannot be forged by the client.
  const evidence = summarizeTrackerExperiment(trackerExperimentSchema.parse(input));
  const saved = await saveWork(actor, target.workspaceId, { productId: "research", resourceKind: "experiment", title: `Experiment: ${target.tracker.title}`,
    sourceWorkId: target.workId, payload: { version: 1, targetWorkId: target.workId, targetRevision: target.tracker.revision, recordedBy: actor.userId, recordedAt: new Date().toISOString(), ...evidence } });
  return { experimentWorkId: saved.id, evidence: saved.payload };
}
