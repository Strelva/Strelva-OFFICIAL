import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { BusinessRecordConflictError, BusinessRecordValidationError } from "./repository";
import { patchBusinessRecord, readBusinessRecord } from "./service";
import { businessDetailsPatch, detailsWriteSource, EDITABLE_DETAILS, type EditableDetail } from "./details";

/** What the Business details form says back, as a query value on the same page. */
export type DetailsSaveOutcome = "saved" | "unchanged" | "conflict" | "invalid" | "denied" | "failed";

export interface DetailsSaveDependencies {
  read: typeof readBusinessRecord;
  patch: typeof patchBusinessRecord;
  operator: () => Promise<boolean>;
}

/**
 * Save Business details for the signed-in person. The revision is the one the
 * form was rendered from, so a change made elsewhere in between is a
 * conflict, never overwritten.
 */
export async function saveBusinessDetails(
  actor: WorkspaceActor, workspaceId: string, expectedRevision: number, form: FormData | Map<string, string>,
  dependencies: DetailsSaveDependencies,
): Promise<{ outcome: DetailsSaveOutcome; field?: EditableDetail }> {
  try {
    const record = await dependencies.read(actor, workspaceId);
    const source = detailsWriteSource(record.access, await dependencies.operator().catch(() => false));
    if (!source) return { outcome: "denied" };
    if (record.revision !== expectedRevision) return { outcome: "conflict" };
    const values: Partial<Record<EditableDetail, string>> = {};
    for (const key of EDITABLE_DETAILS) {
      const value = form.get(key);
      if (typeof value === "string") values[key] = value;
    }
    const patch = businessDetailsPatch(record, values);
    if (patch.kind === "unchanged") return { outcome: "unchanged" };
    if (patch.kind === "invalid") return { outcome: "invalid", field: patch.field };
    await dependencies.patch(actor, workspaceId, expectedRevision, { facts: patch.facts }, { source });
    return { outcome: "saved" };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return { outcome: "denied" };
    if (error instanceof BusinessRecordConflictError) return { outcome: "conflict" };
    if (error instanceof BusinessRecordValidationError) return { outcome: "invalid" };
    console.error("[business-details] save failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
    return { outcome: "failed" };
  }
}
