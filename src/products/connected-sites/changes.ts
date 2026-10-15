/**
 * Changes on a connected site, server side. Server only.
 *
 * Strelva never edits the site. An owner (or Ask) files a Request to the
 * business's agency; the agency plans the exact edit for the builder's own
 * editor; when the plan needs the owner it waits in Needs you; the agency
 * makes the edit and marks it done; Strelva reads the live page and, when it
 * sees the change, records a numbered Release. Nobody claims a check by hand.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { readSiteChangeProvider } from "@/platform/service-requests/provider-options";
import { PostgresServiceRequestStore, ServiceRequestService } from "@/platform/service-requests";
import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { reconcileWebsiteSystemReleases } from "@/products/websites/index";
import { connectedSiteChangeRequestCommand, planInputSchema, type ConnectedSiteChangesView, type PlanInput } from "./change-model";
import type { ConnectedSite } from "./contracts";
import { editStepsFor } from "./edit-guides";
import { pageShowsChange } from "./page-text";
import { connectedSiteChangesStore, type ConnectedSiteChangeOutcome, type ConnectedSiteChangesStore, type ConnectedSiteCheckResult } from "./changes-store";
import { fetchLiveSitePage } from "./site-checks";
import { connectedSitesStore, type ConnectedSitesStore } from "./store";
import { connectedSiteSystemId } from "./system-id";

export interface ChangeDeps {
  changes?: ConnectedSiteChangesStore;
  sites?: ConnectedSitesStore;
  provider?: typeof readSiteChangeProvider;
  file?: (actor: WorkspaceActor, command: ReturnType<typeof connectedSiteChangeRequestCommand>) => Promise<{ id: string }>;
  fetchPage?: (url: string) => Promise<string | null>;
  reconcile?: typeof reconcileWebsiteSystemReleases;
  needsYou?: () => boolean;
}

const idempotencyKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const askInput = z.object({
  workspaceId: z.string().uuid(), systemId: z.string().uuid(), words: z.string().trim().min(1).max(3_000), page: z.string().trim().min(1).max(500).optional(),
  origin: z.enum(["owner", "ask_strelva"]), outcome: z.string().trim().min(1).max(3_000).optional(), idempotencyKey,
}).strict();

const effectivePlatform = (site: ConnectedSite) => site.platform !== "unknown" ? site.platform : (site.detectedPlatform ?? "unknown");

async function activeSite(actor: WorkspaceActor, workspaceId: string, systemId: string, sites: ConnectedSitesStore): Promise<ConnectedSite> {
  const site = (await sites.list(actor, workspaceId)).find(item => item.status === "active" && item.verifiedAt && connectedSiteSystemId(item) === systemId);
  if (!site) throw new WorkspaceConflictError("This website isn't connected to this business.");
  return site;
}

/** File the Request to the business's agency. Nothing on the site changes. */
export async function askConnectedSiteChange(actor: WorkspaceActor, raw: z.input<typeof askInput>, deps: ChangeDeps = {}): Promise<{ requestId: string }> {
  const input = askInput.parse(raw);
  const site = await activeSite(actor, input.workspaceId, input.systemId, deps.sites ?? connectedSitesStore());
  const provider = await (deps.provider ?? readSiteChangeProvider)(actor, input.workspaceId);
  const command = connectedSiteChangeRequestCommand({
    provider, workspaceId: input.workspaceId, systemId: input.systemId, connectedSiteId: site.id, siteHost: site.siteHost,
    platform: effectivePlatform(site), words: input.words, page: input.page, origin: input.origin, outcome: input.outcome, idempotencyKey: input.idempotencyKey,
  });
  const filed = await (deps.file ?? (async (who, cmd) => new ServiceRequestService(PostgresServiceRequestStore).execute(who, cmd)))(actor, command);
  return { requestId: filed.id };
}

/** The agency saves the exact edit. The owner's yes (when asked for) is theirs to give in Needs you. */
export async function planConnectedSiteChange(
  actor: WorkspaceActor, workspaceId: string,
  input: { systemId: string; siteId: string; changeId?: string | null; requestId?: string | null; title?: string | null; input: PlanInput },
  deps: ChangeDeps = {},
) {
  const plan = planInputSchema.parse(input.input);
  if (plan.ownerFacing && !(deps.needsYou ?? needsYouReleaseEnabled)()) {
    throw new WorkspaceConflictError("Owner approvals use Needs you, which isn't on for this business yet. Nothing was saved.");
  }
  const site = await activeSite(actor, workspaceId, input.systemId, deps.sites ?? connectedSitesStore());
  if (site.id !== input.siteId) throw new WorkspaceConflictError("This website isn't connected to this business.");
  const url = new URL(plan.pageUrl);
  const pageUrl = `${url.origin}${url.pathname}`;
  // The "before" read, taken as the change is handed to the agency, so a later sighting can be told from text that was always there.
  let baseline: "visible" | "not_visible" | "unreachable" = "unreachable";
  try {
    const before = await (deps.fetchPage ?? fetchLiveSitePage)(pageUrl);
    if (before !== null) baseline = pageShowsChange(before, { expectText: plan.expectText, removeText: plan.removeText }).result;
  } catch { baseline = "unreachable"; }
  const editSteps = editStepsFor(effectivePlatform(site), { pagePath: url.pathname, whatToChange: plan.whatToChange });
  return (deps.changes ?? connectedSiteChangesStore()).plan(actor, workspaceId, {
    siteId: site.id, changeId: input.changeId ?? null, requestId: input.requestId ?? null, title: input.title ?? null,
    plan: { pageUrl, editSteps, baseline, expectText: plan.expectText, ...(plan.removeText ? { removeText: plan.removeText } : {}), ownerFacing: plan.ownerFacing, ...(plan.note ? { note: plan.note } : {}) },
  });
}

/** Strelva's reading of the live page. A visible change becomes a Release inside the same SQL call. */
export async function checkConnectedSiteChange(actor: WorkspaceActor, workspaceId: string, changeId: string, systemId: string, deps: ChangeDeps = {}): Promise<ConnectedSiteChangeOutcome> {
  const store = deps.changes ?? connectedSiteChangesStore();
  const view = await store.list(actor, workspaceId, systemId);
  const change = view.changes.find(item => item.id === changeId);
  if (!change) throw new WorkspaceConflictError("This change is no longer here. Reload and try again.");
  const planned = [...change.steps].reverse().find(step => step.kind === "planned");
  if (!planned?.pageUrl || !planned.expectText) throw new WorkspaceConflictError("That step doesn't follow from where this change is. Reload it.");
  let html: string | null = null;
  try { html = await (deps.fetchPage ?? fetchLiveSitePage)(planned.pageUrl); } catch { html = null; }
  let result: ConnectedSiteCheckResult = "unreachable";
  let pageHash: string | null = null;
  let matched: string | null = null;
  if (html !== null) {
    const shown = pageShowsChange(html, { expectText: planned.expectText, removeText: planned.removeText });
    result = shown.result;
    // Only a change that was not on the page before counts. No baseline (older rows) or one that already showed it needs a look.
    if (result === "visible" && planned.baseline !== "not_visible") result = "unchanged";
    matched = shown.matched;
    pageHash = createHash("sha256").update(shown.text).digest("hex");
  }
  // The System row must exist before a Release can land on it. Best effort: SQL refuses if it still does not.
  await (deps.reconcile ?? reconcileWebsiteSystemReleases)(actor, workspaceId, { systemId, origin: { kind: "connected_site", ref: view.site.id } }).catch(() => 0);
  return store.recordCheck(actor, workspaceId, changeId, { result, pageHash, matched });
}

/** The agency says the edit is published; Strelva reads the page straight away. */
export async function markConnectedSiteChangeDone(actor: WorkspaceActor, workspaceId: string, changeId: string, systemId: string, note: string | undefined, deps: ChangeDeps = {}) {
  await (deps.changes ?? connectedSiteChangesStore()).markDone(actor, workspaceId, changeId, note);
  return checkConnectedSiteChange(actor, workspaceId, changeId, systemId, deps);
}

export function connectedSiteChangeView(actor: WorkspaceActor, workspaceId: string, systemId: string, deps: ChangeDeps = {}): Promise<ConnectedSiteChangesView> {
  return (deps.changes ?? connectedSiteChangesStore()).list(actor, workspaceId, systemId);
}
