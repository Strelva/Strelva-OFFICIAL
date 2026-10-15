/**
 * What changed: Releases recorded from connected-site changes, as the Handled
 * list reads them. Server only. Names the agency that made the edit (as
 * recorded then, never today's brand) and says whether Strelva saw it live.
 */
import type { HandledReceipt } from "@/platform/needs-you/contracts";
import { actorSentence, recordedActor } from "@/platform/presentation/actor";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { connectedSiteChangesStore, type ConnectedSiteChangesStore } from "./changes-store";
import type { SitePlatform } from "./contracts";
import { editGuide } from "./edit-guides";
import { keepYourSiteMayBeOn } from "./keep-your-site-release";

export async function readConnectedSiteChangeHandled(
  actor: WorkspaceActor, workspaceId: string, sinceIso: string, store: ConnectedSiteChangesStore = connectedSiteChangesStore(),
): Promise<HandledReceipt[]> {
  if (!keepYourSiteMayBeOn()) return [];
  try {
    const rows = await store.releases(actor, workspaceId, sinceIso);
    return rows.map(row => {
      const label = editGuide(row.platform as SitePlatform).label;
      const who = recordedActor(row.actor) ?? undefined;
      return {
        id: `connected-site-change:${row.id}`,
        store: "connected_site_changes",
        systemId: row.systemId,
        ...(who ? { actor: who } : {}),
        sentence: actorSentence(who, `changed ${row.siteHost} in ${label}: ${row.title}`),
        at: row.at,
        changed: `Release ${row.releaseNumber}`,
        evidence: { providerAccepted: true, readBack: row.readBack === "confirmed" ? "verified" as const : "not_verified" as const },
        undo: { state: "not_undoable" as const, reason: `Changes on ${row.siteHost} are made in ${label}. Ask your agency to change it back.` },
      };
    });
  } catch {
    console.warn("[connected-sites] change history could not be read");
    return [];
  }
}
