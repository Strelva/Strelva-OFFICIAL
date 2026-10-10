"use client";

import { useMemo, useState } from "react";
import { StEmpty, StField, StMono, StRow, StRows, StTextButton } from "@/components/ui/strelva/Kit";

export interface AuditEventView {
  id: string;
  time: string;
  action: string;
  targetType: string;
  targetId?: string;
  actorLabel: string;
  tenant: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AuditList({ events }: { events: AuditEventView[] }) {
  const [tenant, setTenant] = useState("");
  const [verb, setVerb] = useState("");
  const [actor, setActor] = useState("");

  const tenants = useMemo(
    () => Array.from(new Set(events.map((e) => e.tenant).filter(Boolean))).sort(),
    [events]
  );
  const verbs = useMemo(
    () => Array.from(new Set(events.map((e) => e.action.split(".").pop() ?? e.action))).sort(),
    [events]
  );
  const actors = useMemo(
    () => Array.from(new Set(events.map((e) => e.actorLabel).filter(Boolean))).sort(),
    [events]
  );

  const filtered = events.filter(
    (e) =>
      (!tenant || e.tenant === tenant) &&
      (!verb || (e.action.split(".").pop() ?? e.action) === verb) &&
      (!actor || e.actorLabel === actor)
  );

  const hasFilter = tenant || verb || actor;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <StField label="Client"><select value={tenant} onChange={event => setTenant(event.target.value)} aria-label="Filter by client"><option value="">All clients</option>{tenants.map(value => <option key={value} value={value}>{value}</option>)}</select></StField>
      <StField label="Action"><select value={verb} onChange={event => setVerb(event.target.value)} aria-label="Filter by action"><option value="">All actions</option>{verbs.map(value => <option key={value} value={value}>{value}</option>)}</select></StField>
      <StField label="Actor"><select value={actor} onChange={event => setActor(event.target.value)} aria-label="Filter by actor"><option value="">All actors</option>{actors.map(value => <option key={value} value={value}>{value}</option>)}</select></StField>
      {hasFilter && <StTextButton onClick={() => { setTenant(""); setVerb(""); setActor(""); }}>Clear</StTextButton>}
      <StMono>{filtered.length} of {events.length}</StMono>
    </div>
    {filtered.length === 0 ? <StEmpty>{events.length === 0 ? "No audited actions yet." : "No actions match these filters."}</StEmpty> : <StRows label="Operator activity">{filtered.map(event => <StRow key={event.id} title={<><StMono>{event.action}</StMono> · {event.targetType}{event.targetId && <> <StMono>{event.targetId}</StMono></>}</>} detail={<>{event.actorLabel}{event.tenant ? ` · ${event.tenant}` : ""}</>} value={<StMono as="time" dateTime={event.time}>{timeAgo(event.time)}</StMono>} />)}</StRows>}
  </div>;
}
