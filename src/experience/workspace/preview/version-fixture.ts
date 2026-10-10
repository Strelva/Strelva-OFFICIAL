/** Fictional Version drafts and decisions for the existing workspace preview.
 * No request handled here reaches a provider or a production store. */
import type { PreviewSystems } from "./systems-projection";
import type { OwnerDecision } from "@/platform/needs-you/contracts";

export const VERSION_PREVIEW_STATES = ["full", "loading", "error", "read-only", "empty", "missing-account"] as const;
export type VersionPreviewState = typeof VERSION_PREVIEW_STATES[number];
export function versionPreviewState(value: string | null, scenario?: string): VersionPreviewState {
  const state = VERSION_PREVIEW_STATES.includes(value as VersionPreviewState) ? value as VersionPreviewState : "full";
  // A display-state query cannot give a fictional read-only viewer authority.
  // Loading/error transports already refuse every operation without writing.
  const readOnly = scenario === "mooney-member" || scenario === "mooney-shared" || scenario === "read-only";
  return readOnly && state !== "loading" && state !== "error" ? "read-only" : state;
}
const json = (body: unknown, status = 200) => Response.json(body, { status });
const calendar = "calendar:f2000000-0000-4000-8000-000000000001";
type Draft = { workspaceId: string; systemId: string; versionId: string; rowRevision: number; currentRelease: number; workingDefinition: Record<string, unknown>; current: Record<string, unknown>;
  overrides: Array<{ path: string }>; bindings: Array<{ kind: string; connectionId: string }>; offersAvailable: boolean; decision: OwnerDecision | null };
const revision = (draft: Draft) => draft.rowRevision.toString(16).padStart(64, "a");
function decision(draft: Draft): OwnerDecision {
  if (draft.decision?.revisionHash === revision(draft)) return draft.decision;
  const now = new Date().toISOString();
  draft.decision = { id: crypto.randomUUID(), workspaceId: draft.workspaceId, systemId: draft.systemId, kind: "system.change_live", route: "owner_decides", title: "Put the updated mediation intake live", detail: "Fictional Version release",
    approveEffect: "The new release goes live in this fictional preview.", notYetEffect: "Nothing changes.", sourceLifecycle: "version_release", sourceId: draft.versionId, revisionHash: revision(draft),
    urgent: false, signInRequired: false, adminMayDecide: false, openHref: null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
    deliveryState: "suppressed", operatorNote: null, openedAt: now, expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(), reminded1At: null, reminded2At: null, deliveries: [] };
  return draft.decision;
}

export function withVersionPreview(base: typeof fetch, systems: PreviewSystems | undefined, state: VersionPreviewState): typeof fetch {
  const drafts = new Map<string, Draft>();
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/workspace/needs-you") {
      const body = method === "POST" ? JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown> : {};
      const workspaceId = String(body.workspaceId ?? url.searchParams.get("workspaceId") ?? "");
      const draftRows = [...drafts.values()].filter(draft => draft.workspaceId === workspaceId);
      if (systems?.released && draftRows.length) {
        if (method === "GET") return json({ role: state === "read-only" ? "member" : "owner", items: draftRows.filter(draft => JSON.stringify(draft.current) !== JSON.stringify(draft.workingDefinition)).map(decision), complete: true, handled: [], handledAvailable: true });
        const draft = draftRows.find(row => row.decision?.id === body.itemId);
        if (draft?.decision) {
          if (state === "read-only") return json({ status: "forbidden", item: null }, 403);
          if (draft.decision.state !== "open") return json({ status: "already_handled", item: draft.decision }, 409);
          if (body.revision !== draft.decision.revisionHash || body.revision !== revision(draft)) return json({ status: "changed", item: draft.decision }, 409);
          const decided: OwnerDecision = { ...draft.decision, state: body.decision === "approve" ? "approved" : "declined", outcome: "done" };
          draft.decision = decided;
          if (body.decision === "approve") {
            draft.currentRelease += 1; draft.current = structuredClone(draft.workingDefinition); draft.rowRevision += 1;
            decided.receiptRef = `version_release:${draft.versionId}:${draft.currentRelease}`;
          }
          return json({ status: "done", item: decided });
        }
      }
      return base(input, init);
    }
    if (url.pathname !== "/api/workspace/versions" && url.pathname !== "/api/workspace/versions/manage") return base(input, init);
    if (!systems?.released) return json({ error: "Versions are not enabled. Nothing changed." }, 503);
    const body = method === "POST" ? JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown> : {};
    const workspaceId = String(body.workspaceId ?? url.searchParams.get("workspaceId") ?? "");
    const systemId = String(body.systemId ?? url.searchParams.get("systemId") ?? "");
    const version = systems.systems[workspaceId]?.versions?.find(item => item.systemId === systemId);
    if (!version) return base(input, init);
    if (state === "loading") return new Promise<Response>(() => undefined);
    if (state === "error") return json({ error: "This Version's draft and improvements could not be read. Nothing changed." }, 503);
    const key = `${workspaceId}:${systemId}`;
    const draft = drafts.get(key) ?? { workspaceId, systemId, versionId: version.id, rowRevision: 3, currentRelease: 2,
      workingDefinition: { kind: "internal_app", title: "Mediation intake", fields: [{ id: "name", label: "Your name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }] },
      current: { kind: "internal_app", title: "Mediation intake", fields: [{ id: "name", label: "Your name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }] }, overrides: [{ path: "title" }], bindings: [], offersAvailable: state !== "empty", decision: null };
    drafts.set(key, draft);
    const canManage = state !== "read-only";
    const conflict = { path: "title", local: "Mediation intake", upstream: "Mediation and arbitration intake", reason: "Both businesses changed the name." };
    const missingAccounts = state === "missing-account" && !draft.bindings.length ? ["booking_calendar"] : [];
    if (method === "GET") return json({ workspaceId, systemId, versionId: version.id, canManage, canMakeReal: canManage, rowRevision: draft.rowRevision, workingDefinition: draft.workingDefinition, overrides: draft.overrides, bindings: draft.bindings,
      source: version.source, baselineRevision: draft.offersAvailable ? 3 : 4, currentRelease: draft.currentRelease,
      releases: [{ number: 1, releasedAt: "2026-09-15T15:00:00Z" }, { number: draft.currentRelease, releasedAt: "2026-10-01T15:00:00Z" }],
      bindingChoices: [{ connectionId: calendar, kind: "booking_calendar", label: "Google: Mediation calendar" }],
      offers: draft.offersAvailable ? [{ versionId: version.id, sourceRevision: 4, summary: "Offer the new intake name while preserving this practice's local fields.", status: "blocked", conflicts: [conflict], missingBindings: missingAccounts }] : [],
      possibilities: draft.offersAvailable ? [{ id: `improvement:${version.id}:4`, system: { businessId: workspaceId, systemId }, title: "Updated name for mediation intake", summary: "Offer the new intake name while preserving this practice's local fields.", sourceRevision: 4, status: "exploring", preview: draft.workingDefinition,
        changes: [{ path: conflict.path, before: "Client intake", after: conflict.upstream }], conflicts: [conflict], missingAccounts, makeReal: { kind: "version_release", versionId: version.id } }] : [],
      pendingRelease: JSON.stringify(draft.current) === JSON.stringify(draft.workingDefinition) ? null : { id: `version-release:${version.id}:${draft.rowRevision}`, system: { businessId: workspaceId, systemId }, title: "Updated mediation intake", status: "ready", rowRevision: draft.rowRevision, decisionRevision: revision(draft), current: draft.current, preview: draft.workingDefinition,
        changedPaths: ["title"], makeReal: { kind: "version_release", versionId: version.id } },
    });
    if (!canManage) return json({ error: "Only an owner or admin can change this Version's draft." }, 403);
    if (body.versionId !== version.id || body.rowRevision !== draft.rowRevision) return json({ error: "This Version changed. Reload its draft." }, 409);
    if (body.action === "bind") {
      if (body.connectionId !== calendar) return json({ error: "Connect an account owned by this business." }, 403);
      draft.bindings = [{ kind: String(body.kind), connectionId: calendar }];
    } else if (body.action === "override") {
      const path = String(body.path);
      if (path !== "title") return json({ error: "This fixture supports changing the title. Production supports validated definition paths." }, 400);
      draft.workingDefinition.title = body.clear ? "Mediation intake" : body.value;
      draft.overrides = body.clear ? [] : [{ path: "title" }];
    } else if (body.action === "restore") {
      draft.workingDefinition = { title: "Original mediation intake" }; draft.overrides = [{ path: "*" }];
    } else if (body.action === "adopt") {
      const resolutions = body.resolutions as Array<{ path: string; choice: string }> | undefined;
      if (missingAccounts.length || !resolutions?.some(row => row.path === conflict.path)) return json({ error: "Choose what to keep and connect missing accounts." }, 409);
      if (resolutions.some(row => row.path === conflict.path && row.choice === "take_upstream")) draft.workingDefinition.title = conflict.upstream;
      draft.offersAvailable = false;
    } else if (body.action === "decline") draft.offersAvailable = false;
    else if (body.action !== "prepare_release") return json({ error: "This command is unavailable in the local fixture." }, 400);
    if (body.action !== "prepare_release") draft.rowRevision += 1;
    const prepared = body.action === "prepare_release" || body.action === "adopt";
    const changed = JSON.stringify(draft.current) !== JSON.stringify(draft.workingDefinition);
    return json({ outcome: prepared ? "prepared" : body.action === "decline" ? "declined" : "saved", rowRevision: draft.rowRevision,
      receipt: prepared && changed ? { receiptId: crypto.randomUUID(), decisionId: decision(draft).id, workspaceId, versionId: version.id, rowRevision: draft.rowRevision } : null,
    });
  };
}
