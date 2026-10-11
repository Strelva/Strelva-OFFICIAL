/** Fictional, component-local Version preparation and approval receipts.
 * Unknown paths fail closed; this transport never falls back to fetch. */
import type { OwnerDecision } from "@/platform/needs-you/contracts";
import type { SystemDetailFixtureState } from "./system-details-fixture";

export const VERSION_COMPARISON_IDS = {
  workspaceId: "e2000000-0000-4000-8000-000000000001",
  downtown: { systemId: "e2000000-0000-4000-8000-000000000011", versionId: "e2000000-0000-4000-8000-000000000021" },
  amherst: { systemId: "e2000000-0000-4000-8000-000000000012", versionId: "e2000000-0000-4000-8000-000000000022" },
} as const;

export function createVersionComparisonRequest(state: SystemDetailFixtureState): typeof fetch {
  const versions = ["downtown", "amherst"].map((name, index) => {
    const ids = VERSION_COMPARISON_IDS[name as "downtown" | "amherst"];
    return { ...ids, name, rowRevision: 3, offered: true, prepared: false, released: false,
      reminderChoice: "keep_local", decisionId: `e2000000-0000-4000-8000-00000000003${index + 1}`, decisionRevision: String(index + 1).repeat(64) };
  });
  const json = (data: unknown, status = 200) => Response.json(data, { status });
  const current = (name: string) => ({ title: "Appointments", reminder: name === "amherst" ? "Bring your insurance card. Park on Main St." : "Standard", textMessage: false });
  const alternative = (name: string) => ({ ...current(name), textMessage: true });
  function item(row: typeof versions[number]): OwnerDecision {
    return {
      id: row.decisionId, workspaceId: VERSION_COMPARISON_IDS.workspaceId, systemId: row.systemId,
      kind: "system.change_live", route: "owner_decides", title: `Make release 13 real for ${row.name === "downtown" ? "Downtown" : "Amherst"}`,
      detail: "Fictional release decision", approveEffect: "Only this fictional Version changes.", notYetEffect: "The current release stays in place.",
      sourceLifecycle: "version_release", sourceId: row.versionId, revisionHash: row.decisionRevision,
      urgent: false, signInRequired: false, adminMayDecide: false, openHref: null,
      state: row.released ? "approved" : "open", outcome: row.released ? "done" : null, outcomeReason: null,
      receiptRef: row.released ? `version_release:${row.versionId}:13` : null, decidedByKind: row.released ? "owner" : null,
      decidedAt: row.released ? "2026-10-09T12:00:00Z" : null, deliveryState: "suppressed", operatorNote: null,
      openedAt: "2026-10-09T12:00:00Z", expiresAt: "2026-10-23T12:00:00Z", reminded1At: null, reminded2At: null, deliveries: [],
    };
  }
  return async (input, init) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(path, "http://fixture.invalid");
    if (state === "loading") return new Promise<Response>(() => undefined);
    if (state === "error") return json({ error: "Version evidence is unavailable. Nothing changed." }, 503);
    if (state === "permission") return json({ error: "This account cannot open or change these Versions." }, 403);
    const body = init?.method === "POST" ? JSON.parse(String(init.body ?? "{}")) as Record<string, unknown> : {};
    const workspaceId = body.workspaceId ?? url.searchParams.get("workspaceId");
    if (workspaceId !== VERSION_COMPARISON_IDS.workspaceId) return json({ error: "Another business cannot use this fixture." }, 403);
    if (url.pathname === "/api/workspace/needs-you") {
      if (init?.method !== "POST") return json({ role: "owner", items: versions.filter(row => row.prepared).map(item) });
      const row = versions.find(row => row.decisionId === body.itemId && row.decisionRevision === body.revision && row.prepared);
      if (!row || body.decision !== "approve") return json({ error: "This exact release decision is not open." }, 409);
      const already = row.released; row.released = true;
      return json({ status: already ? "already_handled" : "done", item: item(row) }, already ? 409 : 200);
    }
    if (url.pathname !== "/api/workspace/versions") return json({ error: "This preview supports only its isolated Version review." }, 404);
    const row = versions.find(row => row.systemId === (body.systemId ?? url.searchParams.get("systemId")));
    if (!row) return json({ error: "This Version does not belong to this fixture." }, 403);
    if (init?.method === "POST") {
      if (body.versionId !== row.versionId || body.rowRevision !== row.rowRevision || !row.offered || body.revision !== 13) return json({ error: "The Version changed. Nothing changed." }, 409);
      if (body.action === "decline" && typeof body.reason === "string" && body.reason.trim()) {
        row.offered = false; row.rowRevision += 1;
        return json({ outcome: "declined", rowRevision: row.rowRevision, receipt: null });
      }
      if (body.action !== "adopt") return json({ error: "Unsupported preview choice." }, 400);
      const resolutions = Array.isArray(body.resolutions) ? body.resolutions as { path: string; choice: string }[] : [];
      if (row.name === "amherst" && !resolutions.some(choice => choice.path === "reminder" && ["keep_local", "take_upstream"].includes(choice.choice))) return json({ error: "Choose which reminder text to keep for this Version." }, 409);
      row.reminderChoice = resolutions.find(choice => choice.path === "reminder")?.choice ?? "keep_local";
      row.offered = false; row.prepared = true; row.rowRevision += 1;
      return json({ outcome: "prepared", rowRevision: row.rowRevision, receipt: { receiptId: `e2000000-0000-4000-8000-00000000004${row.name === "downtown" ? 1 : 2}`, decisionId: row.decisionId, workspaceId, versionId: row.versionId, rowRevision: row.rowRevision } });
    }
    const ref = { businessId: VERSION_COMPARISON_IDS.workspaceId, systemId: row.systemId };
    return json({ workspaceId, systemId: row.systemId, versionId: row.versionId, rowRevision: row.rowRevision, canManage: true, canMakeReal: true,
      possibilities: state !== "empty" && row.offered ? [{ id: `improvement:${row.versionId}`, system: ref, title: "Release 13 · text message reminders", summary: "The improvement is offered to this location. Its reminder text and records stay here.",
        sourceRevision: 13, status: "ready", preview: alternative(row.name), changes: [{ path: "textMessage", before: false, after: true }],
        conflicts: row.name === "amherst" ? [{ path: "reminder", local: current(row.name).reminder, upstream: "Standard" }] : [], missingAccounts: [], makeReal: { kind: "version_release", versionId: row.versionId } }] : [],
      pendingRelease: row.prepared && !row.released ? { id: `release:${row.versionId}`, system: ref, title: "Prepared release 13", status: "ready", rowRevision: row.rowRevision, decisionRevision: row.decisionRevision,
        current: current(row.name), preview: { ...alternative(row.name), reminder: row.reminderChoice === "take_upstream" ? "Standard" : current(row.name).reminder }, changedPaths: ["textMessage"], makeReal: { kind: "version_release", versionId: row.versionId } } : null,
    });
  };
}
