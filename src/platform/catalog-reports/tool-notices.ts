import { z } from "zod";
import { callReleaseFlagsRpc, workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
import { releaseViewerFor } from "@/platform/release-flags/viewer";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { HandledReceipt } from "@/platform/needs-you/contracts";
import type { QueueActor } from "@/platform/operator-queue/contracts";
import type { SourceRead } from "@/platform/operator-queue/project";
import type { Observation } from "@/platform/system-health/contracts";

const noticeSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), workId: z.string().uuid(),
  recipient: z.string().email().nullable(), title: z.string().nullable(), recordId: z.string(),
  status: z.enum(["pending", "sent", "suppressed", "failed", "skipped"]), attempts: z.number().int().nonnegative(),
  at: z.string().datetime({ offset: true }),
});
export type ToolNoticeReceipt = z.infer<typeof noticeSchema>;
const mayBeOn = () => releaseFlagMayBeOn("systems") && releaseFlagMayBeOn("internal_tool_notices");

export function handledToolNotice(row: ToolNoticeReceipt): HandledReceipt {
  const tool = row.title ?? "your internal tool";
  const sentence = row.status === "sent" ? `Strelva emailed ${row.recipient} about a new submission to ${tool}.`
    : row.status === "failed" ? `Strelva couldn't email the new submission to ${tool}. ${row.attempts < 3 ? "The failed attempt is recorded." : "It needs operator review."}`
      : row.status === "pending" ? `The submission to ${tool} is saved; its notification is not confirmed.`
        : row.status === "skipped" ? `The submission to ${tool} is saved; no owner or assigned-person email is available.`
          : `The submission to ${tool} is saved; email sending is paused.`;
  return { id: `tool-notice:${row.id}`, store: "internal_tool_notices", systemId: null, sentence, at: row.at, changed: null,
    evidence: row.status === "sent" ? { providerAccepted: true, readBack: "not_checked" } : null,
    undo: { state: "not_undoable", reason: row.status === "sent" ? "A sent email cannot be unsent." : "The saved record is unchanged by notification delivery." } };
}

export async function readToolNoticeHandled(actor: WorkspaceActor, workspaceId: string, since: string): Promise<HandledReceipt[]> {
  return (await readToolNoticeReceipts(actor, workspaceId, since)).map(handledToolNotice);
}

export async function readToolNoticeReceipts(actor: WorkspaceActor, workspaceId: string, since: string): Promise<ToolNoticeReceipt[]> {
  if (!mayBeOn()) return [];
  const viewer = await releaseViewerFor(actor);
  if (!await workspaceReleaseFlagEnabled("systems", workspaceId, viewer)
    || !await workspaceReleaseFlagEnabled("internal_tool_notices", workspaceId, viewer)) return [];
  const rows = await callReleaseFlagsRpc("read_catalog_tool_notices", {
    p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_since: since,
  }, z.array(noticeSchema).max(50), "Submission notification history could not be read.");
  return rows;
}

export function toolNoticeObservations(rows: ToolNoticeReceipt[], systems: Array<{ systemId: string; workId: string | null }>): Observation[] {
  return systems.flatMap(system => {
    const last = rows.filter(row => row.workId === system.workId).sort((a, b) => b.at.localeCompare(a.at))[0];
    return last ? [{ subjectId: system.systemId, signal: "internal_tool.notice", source: "internal-tool" as const,
      outcome: last.status === "sent" ? "pass" as const : last.status === "failed" ? "fail" as const : "unknown" as const,
      impact: "degrading" as const, observedAt: last.at, maxAgeSeconds: 7 * 86400, message: handledToolNotice(last).sentence }] : [];
  });
}

export async function readToolNoticeFailures(actor: QueueActor): Promise<SourceRead[]> {
  if (!mayBeOn()) return [];
  const rows = await callReleaseFlagsRpc("read_audited_platform_operator_source", {
    p_reader_name: "read_catalog_tool_notice_failures",
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
  }, z.array(z.object({ id: z.string().uuid(), workspaceId: z.string().uuid(), workId: z.string().uuid(), at: z.string(), reason: z.string().nullable() })), "Submission notification failures could not be read.");
  const enabled = await Promise.all(rows.map(async row => await workspaceReleaseFlagEnabled("systems", row.workspaceId, { operator: true, tester: false })
    && await workspaceReleaseFlagEnabled("internal_tool_notices", row.workspaceId, { operator: true, tester: false })));
  return [{ kind: "ops_alert", source: "Internal tool notifications", ok: true, rows: rows.filter((_row, index) => enabled[index]).map(row => ({
    kind: "ops_alert", sourceRef: `tool-notice:${row.id}`, workspaceId: row.workspaceId, tenantId: null,
    title: row.reason === "delivery_unconfirmed" ? "A submission email has an unknown outcome; do not resend it" : "A submission email needs operator review",
    openedAt: row.at, facts: { severity: "medium" }, href: `/workspace?${new URLSearchParams({ workspaceId: row.workspaceId, view: "applications", work: row.workId })}`,
  })) }];
}
