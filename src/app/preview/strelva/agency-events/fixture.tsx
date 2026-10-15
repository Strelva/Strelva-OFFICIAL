"use client";
import { useState } from "react";
import { AgencyClientEvents } from "@/experience/workspace/agency/AgencyClientEvents";
import { SelectInput } from "@/components/ui/TextInput";
const agencyWorkspaceId = "28100000-0000-4000-8000-000000000020", workspaceId = "28100000-0000-4000-8000-000000000010";
const letterId = "28100000-0000-4000-8000-0000000000dd", endpointId = "28100000-0000-4000-8000-0000000000e1";
const SCENARIOS = ["off", "capture-off", "healthy", "failures", "webhooks", "read-only-member", "error"] as const;
type Scenario = (typeof SCENARIOS)[number];
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const ahead = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function view(scenario: Scenario, extraEndpoints: unknown[], retried: boolean) {
 const failures = scenario === "failures" || scenario === "webhooks" || scenario === "read-only-member";
 return {
  workspaceId, viewer: { kind: "agency", canChange: scenario !== "read-only-member" }, captureOn: scenario !== "capture-off",
  stream: { lastSequence: 42, lastEventAt: scenario === "capture-off" ? null : ago(12) },
  counts: scenario === "capture-off" ? [] : [{ type: "booking.made", count: 6 }, { type: "inquiry.received", count: 9 }],
  lanes: failures ? [{ subscriber: "app:bookings:stop_follow_ups", deliveredThrough: 40, behind: 2, attempts: 2, nextAttemptAt: ahead(14), lastError: "timed out" }] : [],
  deadLetters: failures ? [{ id: letterId, subscriber: `webhook:${endpointId}`, eventId: null, type: "booking.made", sequence: 37, subjectKind: "booking", occurredAt: ago(300), attempts: 8, lastError: "The address did not accept the event.", deadAt: ago(240), replayRequestedAt: retried ? ago(1) : null, replayedAt: null, replayOutcome: null }] : [],
  endpoints: scenario === "webhooks" || scenario === "read-only-member" || extraEndpoints.length ? [{ id: endpointId, url: "https://maker.example.test/strelva-events", eventTypes: ["booking.made", "inquiry.received"], status: "active", disabledReason: null, secretHint: "wxyz", createdByKind: "agency", agencyName: "North Studio", createdAt: ago(5000) }, ...extraEndpoints] : [],
  webhooksOn: scenario === "webhooks" || scenario === "read-only-member",
 };
}

export function AgencyClientEventsFixture() {
 const [scenario, setScenario] = useState<Scenario>("healthy");
 const state = { extra: [] as unknown[], retried: false };
 const request: typeof fetch = async (_input, init) => {
  if (scenario === "off") return Response.json({ error: "Events aren't turned on." }, { status: 503 });
  if (scenario === "error") return Response.json({}, { status: 500 });
  if (init?.method === "POST") {
   const body = JSON.parse(String(init.body));
   if (body.action === "retry") { state.retried = true; return Response.json({ view: view(scenario, state.extra, true) }); }
   if (body.action === "create_webhook" || body.action === "rotate_webhook_secret") return Response.json({ view: {}, secret: "whsec_example_only" });
   return Response.json({ view: {} });
  }
  return Response.json(view(scenario, state.extra, state.retried));
 };
 return <div className="grid gap-8"><SelectInput label="Fixture state" value={scenario} onChange={event => setScenario(event.target.value as Scenario)} options={SCENARIOS.map(value => ({ value, label: value }))} />
  <AgencyClientEvents key={scenario} agencyWorkspaceId={agencyWorkspaceId} workspaceId={workspaceId} clientName="Fictional Buffalo client" request={request} /></div>;
}
