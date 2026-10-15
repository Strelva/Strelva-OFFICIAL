"use client";
import { useState } from "react";
import { AgencyClientUsage } from "@/experience/workspace/agency/AgencyClientUsage";
import { AgencyUsageSummary } from "@/experience/workspace/agency/AgencyUsageSummary";
import { SelectInput } from "@/components/ui/TextInput";
const agencyWorkspaceId = "26100000-0000-4000-8000-000000000020", workspaceId = "26100000-0000-4000-8000-000000000010", otherId = "26100000-0000-4000-8000-000000000011";
const SCENARIOS = ["running-no-limit", "limited-near", "paused-by-agency", "held-replies", "unknown-cost", "read-only-member", "conflict", "off", "error"] as const;
type Scenario = (typeof SCENARIOS)[number];
const budget = (scenario: Scenario, revision: number, over: Record<string, unknown> = {}) => {
 const controls = {
  paused: scenario === "paused-by-agency", monthlyCapCents: scenario === "limited-near" ? 2500 : null, reviewAutoPost: scenario === "held-replies" ? "held" : "client_choice",
  revision, setBy: ["limited-near", "paused-by-agency", "held-replies"].includes(scenario) ? { kind: "agency", agencyName: "North Studio" } : null, changedAt: ["limited-near", "paused-by-agency", "held-replies"].includes(scenario) ? "2026-10-12T15:00:00Z" : null, ...over,
 };
 return { spentUsd: scenario === "limited-near" ? "23.4" : "1.23", reservedUsd: scenario === "limited-near" ? "0.8" : "0", since: "2026-10-01T00:00:00Z", resetsAt: "2026-11-01T00:00:00Z", capCents: null, subscribed: true, unknownCostCalls: scenario === "unknown-cost" ? 2 : 0, controls };
};
export function AgencyClientUsageFixture() {
 const [scenario, setScenario] = useState<Scenario>("running-no-limit");
 const request: typeof fetch = async (_input, init) => {
  if (scenario === "off") return Response.json({ error: "Usage controls are not enabled." }, { status: 503 });
  if (scenario === "error") return Response.json({ error: "Current agency access could not be confirmed. Nothing changed." }, { status: 500 });
  if (init?.method === "POST" && scenario === "conflict") return Response.json({ error: "conflict" }, { status: 409 });
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const next = body ? budget(scenario, (body.expectedRevision ?? 0) + 1, { paused: body.paused, monthlyCapCents: body.monthlyCapCents, reviewAutoPost: body.reviewAutoPost, setBy: { kind: "agency", agencyName: "North Studio" }, changedAt: "2026-10-15T12:00:00Z" }) : budget(scenario, 1);
  return Response.json({
   agencyWorkspaceId, canChange: scenario !== "read-only-member", budgetEnforced: true, freeCapUsd: 0,
   clients: [{ workspaceId, name: "Fictional Buffalo client", budget: next, linkedTenantIds: ["fictional-buffalo"] }, { workspaceId: otherId, name: "Another fictional client", budget: { ...budget("running-no-limit", 0), spentUsd: "4.5" }, linkedTenantIds: [] }],
  });
 };
 return <div className="grid gap-8"><SelectInput label="Fixture state" value={scenario} onChange={event => setScenario(event.target.value as Scenario)} options={SCENARIOS.map(value => ({ value, label: value }))} />
  <AgencyClientUsage key={scenario} agencyWorkspaceId={agencyWorkspaceId} workspaceId={workspaceId} clientName="Fictional Buffalo client" request={request} />
  <AgencyUsageSummary key={`summary-${scenario}`} agencyWorkspaceId={agencyWorkspaceId} request={request} /></div>;
}
