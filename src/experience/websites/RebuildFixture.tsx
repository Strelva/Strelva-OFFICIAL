"use client";
import { tenantSiteOrigin } from "@/platform/infra/brand";
import { useMemo } from "react";
import { RebuildExperience } from "./RebuildExperience";
import { fixtureRebuild } from "./rebuild-fixture";
import type { RebuildTransport, RebuildView } from "./rebuild-transport";
export function RebuildFixture({ scenario }: { scenario: string }) {
  const initial = useMemo(() => fixtureRebuild(scenario), [scenario]);
  const transport = useMemo<RebuildTransport>(() => ({
    async read() { if (scenario === "loading") return new Promise<RebuildView>(() => {}); return initial; },
    async start() { if (scenario === "error") throw new Error("The source could not be opened. Use a description or try again."); return initial; },
    async mutate(record, action, extra) {
      if (scenario === "error" || (scenario === "contacts-error" && action === "remove")) throw new Error("The change could not be saved. Your current review is preserved.");
      const next = structuredClone(record);
      next.revision += 1;
      if (action === "confirm" && extra?.factId && next.candidate?.facts[extra.factId]) next.candidate.facts[extra.factId]!.origin = "owner_confirmed";
      if (action === "edit" && extra?.factId && next.candidate?.facts[extra.factId]) { next.candidate.facts[extra.factId]!.text = extra.text ?? ""; next.candidate.facts[extra.factId]!.origin = "owner_confirmed"; }
      if (action === "remove" && extra?.factId && next.candidate) delete next.candidate.facts[extra.factId];
      if (["confirm", "edit", "remove", "undo"].includes(action) && next.candidate) { next.candidate.revision++; next.candidate.contentHash = String(next.revision).padStart(64, "0"); next.approved = false; next.status = "review"; }
      if (action === "approve") { next.approved = true; next.status = "approved"; }
      if (action === "launch") { next.status = "published"; next.publishedUrl = tenantSiteOrigin("fixture-domain"); next.readBack = "failed"; }
      if (action === "retry") { next.status = "review"; next.error = null; next.stages = next.stages.map(item => ({ ...item, status: "completed" })); }
      return next as RebuildView;
    },
  }), [initial, scenario]);
  return <><div className="flex flex-wrap gap-4 border-b border-gray-border px-6 py-4 text-sm text-gray-muted"><strong className="text-warm-black">Local interface fixture · no live changes</strong>{["mooney", "operator", "empty", "review", "contacts", "contacts-error", "contacts-read-only", "building", "loading", "failed", "error", "read-only", "managed", "published", "domain-pending", "domain-verified", "domain-error"].map(value => <a key={value} href={`?scenario=${value}`} className="underline focus-visible:outline-2 focus-visible:outline-accent">{value}</a>)}</div><RebuildExperience key={scenario} workspaceId={initial.workspaceId} workId={scenario === "loading" ? initial.workId : undefined} initialRecord={scenario === "empty" || scenario === "loading" ? undefined : initial} readOnly={scenario === "read-only" || scenario === "mooney" || scenario === "contacts-read-only"} operator={scenario === "operator"} managed={scenario === "managed"} transport={transport} /></>;
}
