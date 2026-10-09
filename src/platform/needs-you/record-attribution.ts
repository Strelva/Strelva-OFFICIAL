import type { BusinessRecordRevision } from "@/platform/business-record/contracts";

/** Read-only join by immutable revision sequence; never resolve current names. */
export function projectRecordActors(
  rows: readonly Record<string, unknown>[],
  history: readonly (BusinessRecordRevision & { actor?: unknown })[],
  since: string | null,
): Record<string, unknown>[] {
  const revisions = new Map(history.map(revision => [String(revision.sequence), revision]));
  const seen = new Set<string>();
  const result = rows.map(row => {
    if (row.store !== "business_record_revisions") return row;
    seen.add(String(row.id));
    const revision = revisions.get(String(row.id));
    return revision ? {
      ...row, actorKind: revision.actorKind, actorId: revision.actorId,
      // A snapshot already on the receipt wins. Neither read consults branding.
      actor: row.actor ?? revision.actor,
    } : row;
  });
  const latestSequence = Math.max(0, ...history.map(revision => revision.sequence));
  const start = since ? Date.parse(since) : Date.now() - 7 * 24 * 60 * 60 * 1000;
  // The legacy feed's source filter omits ordinary agency writes. Carry those
  // from the same actor-checked History read, without exposing before/after data.
  for (const revision of history) {
    if (revision.actorKind !== "agency" || seen.has(String(revision.sequence)) || Date.parse(revision.createdAt) < start) continue;
    result.push({
      store: "business_record_revisions", id: String(revision.sequence), at: revision.createdAt,
      actorKind: revision.actorKind, actorId: revision.actorId, actor: revision.actor,
      source: revision.source, changes: revision.changes.map(change => `${change.entity}:${change.id}`),
      undo: revision.undoOf !== null ? "not_undoable" : revision.undoneBy !== null ? "undone" : revision.sequence < latestSequence ? "undo_needs_review" : "undo",
    });
  }
  return result;
}
