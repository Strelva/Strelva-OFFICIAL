import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { PublicInquiryForm } from "../../../custom-repo-starter/inquiry-client";
import { inquiryCapabilityLifecycle } from "@/platform/systems/invariants";
import { readLinkedSites } from "@/platform/owner-entry/linked-sites";
import { getInquiryRepository } from "./repository";
import { resolveInquiryWorkspace } from "./workspace-exit";
import { projectPublishedInquiry } from "./storefront";
import { applyInquiryBusinessServices, readInquiryBusinessContext } from "./business-context";
import type { InquiryEngineState } from "./contracts";
import { inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { createSupabaseSystemStore, listBusinessSystems } from "@/platform/systems";

export interface InquirySystemDetail {
  site: string;
  lifecycle: "draft" | "live" | "paused";
  health: string;
  forms: PublicInquiryForm[];
  connections: Array<{ kind: "reads" | "appears in" | "acts on" | "shares with"; target: string; sentence: string }>;
  history: Array<{ id: string; sentence: string; at: string }>;
  unavailable?: boolean;
}

/** A projection of accepted forms and recorded changes, never a second builder. */
export function projectInquirySystemDetail(site: string, state: InquiryEngineState | null): InquirySystemDetail {
  const capabilities = state?.capabilities ?? [];
  const lifecycle = capabilities.some(item => inquiryCapabilityLifecycle(item.status) === "live") ? "live"
    : capabilities.some(item => inquiryCapabilityLifecycle(item.status) === "paused") ? "paused" : "draft";
  const uncertain = capabilities.some(item => item.status === "live_unverified" || item.status === "failed");
  return { site, lifecycle, health: uncertain ? "The form's publication has not been confirmed." : "Whether the form delivers on the site has not been checked.",
    forms: capabilities.flatMap(item => projectPublishedInquiry(item) ?? []),
    connections: [{ kind: "appears in", target: site, sentence: "Receives the site's forms. Pausing replies keeps incoming inquiries." },
      { kind: "reads", target: "Business details", sentence: "Uses the current owner, people, hours and services." },
      { kind: "acts on", target: "Email", sentence: "Each reply follows its approval and sending permissions. A sent message is never sent again." }],
    history: (state?.actionReceipts ?? []).filter(receipt => receipt.capabilityId && ["make_live", "verify_live", "undo", "pause", "resume", "publication_accepted", "publication_failed"].includes(receipt.action))
      .map(receipt => ({ id: receipt.id, sentence: receipt.what.replace(/capability/gi, "inquiry form").replace(/rehearsal/gi, "test").replace(/agent/gi, "Strelva"), at: receipt.createdAt }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 10) };
}

/** The linked-site reader establishes current membership before any engine read. */
export async function readInquirySystemDetails(actor: WorkspaceActor, workspaceId: string): Promise<InquirySystemDetail[]> {
  const linked = await readLinkedSites(actor, workspaceId);
  // Only name booking Systems actually visible in this business. A failed
  // Systems read cannot invent a calendar, booking store or connection.
  const bookingSystems = await listBusinessSystems(actor, workspaceId, { store: createSupabaseSystemStore() })
    .then(listing => listing.systems.filter(item => item.system.kind === "booking").map(item => item.system.name))
    .catch(() => []);
  return Promise.all(linked.sites.map(async site => {
    try {
      const resolution = await resolveInquiryWorkspace({ tenantId: site.tenantId, tenantStableId: site.tenantStableId, fallbackBusinessId: site.tenantStableId });
      const snapshot = await getInquiryRepository().getSnapshot(site.tenantId, resolution.businessId);
      const detail = projectInquirySystemDetail(site.siteName, snapshot?.state ?? null);
      detail.connections.push(...bookingSystems.map(target => ({ kind: "shares with" as const, target,
        sentence: "Booking requests use the same business contact. An inquiry stays kept if bookings is unavailable." })));
      const business = await readInquiryBusinessContext(site.tenantId);
      if (business) detail.forms = detail.forms.map(form => ({ ...form, form: applyInquiryBusinessServices(form.form, business) }));
      try {
        const notices = await inquiryRecordsRpc("list_inquiry_owner_notices_not_told", { p_tenant_ids: [site.tenantId] });
        if (Array.isArray(notices) && notices.length) detail.health = notices.some(notice => notice?.status === "bounced")
          ? "The owner email bounced. Strelva needs to fix the recipient."
          : "The owner hasn't been told about an inquiry. Strelva needs to check sending permissions.";
      } catch { /* An unavailable notice monitor cannot prove email health. */ }
      return detail;
    } catch {
      return { ...projectInquirySystemDetail(site.siteName, null), health: "The current form and its history couldn't be read.", unavailable: true };
    }
  }));
}
