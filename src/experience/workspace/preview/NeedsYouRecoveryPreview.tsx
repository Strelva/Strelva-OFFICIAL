"use client";
import { Button } from "@/components/ui/Button";
import { BusinessHome } from "../BusinessHome";
import type { WorkspaceSnapshot } from "../contracts";

export const needsYouRecoveryWorkspace = "a0000000-0000-4000-8000-000000000001";
const snapshot: WorkspaceSnapshot = {
  actor: { email: "owner@fictional.example", localPreview: true },
  workspaces: [{ id: needsYouRecoveryWorkspace, kind: "customer", name: "Fictional Workshop", role: "owner" }],
  workspaceId: needsYouRecoveryWorkspace, work: [], handoffs: [], delegations: [], products: [], releases: { systems: false, needsYou: true },
};
const noop = () => undefined;
/** Deliberately no preview request provider: tests intercept the real default HTTP reader. */
export function NeedsYouRecoveryPreview({ view }: { view: "home" | "needs-you" }) {
  return <div data-dashboard className="min-h-screen bg-surface-base text-warm-black">
    <header className="flex flex-wrap gap-4 border-b border-gray-border bg-surface p-6 text-sm text-warm-black">
      <p>Fictional decision recovery · no Auth, provider delivery or native proof</p>
      <Button type="button" variant="secondary" className="max-w-full whitespace-normal">Outside decision control</Button>
    </header>
    <BusinessHome snapshot={snapshot} sites={[]} unassignedSites={[]} siteAssignmentsKnown
      offerings={{ status: "unavailable", reason: "Fictional fixture; no offering read." }} busy={false}
      onOpen={noop} onStart={noop} onRequest={noop} onNavigate={noop} onWorkspace={noop} onOfferings={noop}
      accountHref="/preview/strelva/needs-you-recovery" view={view} />
  </div>;
}
