/**
 * Fictional Make real state for the local preview (`makeReal=partly|live`).
 * The Mooney Firm walk-through from the systems-experience spec, section 1:
 * the booking page landed, Google waits. It goes through the same pure
 * projection the workspace route uses (activationViews, makeRealReceipts,
 * revisionHistory); only the activation and revisions are fixture data.
 */
import type { Activation } from "@/platform/make-real/contracts";
import type { Possibility } from "@/platform/possibilities/contracts";
import { activationViews, makeRealReceipts, revisionHistory } from "@/experience/systems/stored-possibilities";
import type { WorkspaceSystems } from "../contracts";

export type PreviewMakeReal = "off" | "partly" | "live";

export function previewMakeRealMode(value: string | undefined): PreviewMakeReal {
  return value === "partly" || value === "live" ? value : "off";
}

export function withPreviewMakeReal(projection: WorkspaceSystems, mode: PreviewMakeReal, now: number): WorkspaceSystems {
  if (mode === "off" || projection.status !== "ready") return projection;
  const site = projection.systems.find((system) => system.kind === "website");
  if (!site) return projection;
  const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const businessId = site.ref.businessId;
  const possibility = {
    id: "e0000000-0000-4000-8000-0000000000aa", title: "Consult booking", businessId, status: mode === "live" ? "made_real" : "ready",
    changes: [{ baseline: { businessId, systemId: site.ref.systemId, revisionId: "e0000000-0000-4000-8000-0000000000ab", number: 1 }, candidate: { summary: "the site with consult booking", content: {} } }],
    history: [],
  } as unknown as Possibility;
  const step = (id: string, label: string, status: "completed" | "blocked", extra: Partial<Activation["steps"][number]> = {}): Activation["steps"][number] => ({
    id, kind: id.startsWith("effect:") ? "effect" : "activate", target: id, label, dependsOn: [], reversibility: "compensable", idempotencyKey: `preview-${id}`,
    status, effect: status === "completed" && id.startsWith("effect:") ? "accepted" : "none", attempts: 1,
    ...(status === "completed" ? { receipt: { adapterMode: id.startsWith("effect:") ? "live" : "internal", acceptedAt: at(40), providerRef: `preview-${id}` }, readBack: { status: "confirmed", detail: "Read back.", at: at(39) } } : {}),
    ...extra,
  } as Activation["steps"][number]);
  const activation: Activation = {
    version: 1, id: "preview-activation", businessId, possibilityId: possibility.id, candidateRevision: 1, actorId: "preview", revision: 6,
    status: mode === "live" ? "made_real" : "needs_attention", pinned: [], introduced: [], connections: [], approvals: [], checks: [],
    steps: [
      step("effect:booking-page", "Publish the consult booking page on attymooney.com", "completed"),
      step("effect:booking-link", "Add the booking link to the contact page", "completed"),
      mode === "live" ? step("effect:google", "Add the booking link on Google", "completed") : step("effect:google", "Add the booking link on Google", "blocked", { reason: "Waiting: Google hasn't approved Strelva's access yet. Strelva adds it when Google does." }),
      step("activate:site", "Make consult booking live", mode === "live" ? "completed" : "blocked", mode === "live" ? {} : { status: "pending", reason: undefined } as Partial<Activation["steps"][number]>),
    ],
    createdAt: at(45), updatedAt: at(38), history: [],
  };
  const running = mode === "live" ? [] : activationViews([{ possibility, activation }]);
  const history = revisionHistory(site.ref.systemId, [
    { id: "preview-r1", businessId, systemId: site.ref.systemId, number: 1, implementation: { kind: "tenant_content", ref: "preview@initial" }, summary: "Adopted at conversion.", createdAt: at(7 * 24 * 60), createdBy: "preview" },
    { id: "preview-r2", businessId, systemId: site.ref.systemId, number: 2, implementation: { kind: "tenant_content", ref: "preview@v_2" }, summary: "Website content changed.", createdAt: at(2 * 24 * 60), createdBy: "preview" },
  ]);
  return { ...projection, activations: running, history, handled: makeRealReceipts([{ possibility, activation }], now - 7 * 24 * 60 * 60_000) };
}
