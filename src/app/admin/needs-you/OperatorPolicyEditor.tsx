"use client";

import { useId, useState, useTransition } from "react";
import { StCopy, StField, StMono, StTable, StTextButton } from "@/components/ui/strelva/Kit";
import type { LadderRoute } from "@/platform/needs-you/contracts";
import { ROUTE_WORDS } from "@/platform/needs-you/policy-words";
import { STRELVA_REASONS, type PolicyKindView, type PolicyView } from "@/platform/needs-you/policy-model";
import { setStrelvaPolicyAction } from "./actions";

const REASON_WORDS: Record<(typeof STRELVA_REASONS)[number], string> = {
  strelva_default: "Strelva's default for this business",
  earned_trust: "Earned trust (approval streak)",
  seed: "Seeded from today's settings",
  inquiry_promote: "Inquiry policy promotion",
};

/** The operator's words: "You decide" in the owner's screen is "Owner decides" here. */
function routeLabel(route: LadderRoute): string {
  return route === "owner_decides" ? "Owner decides" : ROUTE_WORDS[route].label;
}


/**
 * Strelva's layer for one business: per kind, Strelva's route (never below
 * the floor), with the owner's stricter setting and the route in force shown
 * beside it. The owner's layer is read only here.
 */
export function OperatorPolicyEditor({ workspaceId, view: initial, readOnly = false }: { workspaceId: string; view: PolicyView; readOnly?: boolean }) {
  const [view, setView] = useState(initial);
  const [reason, setReason] = useState<(typeof STRELVA_REASONS)[number]>("strelva_default");
  const [notice, setNotice] = useState<{ kind: string; ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const reasonId = useId();

  function save(item: PolicyKindView, route: LadderRoute | null) {
    if (readOnly) return;
    setNotice(null);
    start(async () => {
      const change = route
        ? { action: "set" as const, kind: item.kind, systemId: null, route, reason, expectedVersion: item.strelvaVersion }
        : { action: "reset" as const, kind: item.kind, systemId: null, reason, expectedVersion: item.strelvaVersion };
      const result = await setStrelvaPolicyAction({ workspaceId, change });
      if (result.ok) setView(result.view);
      setNotice({ kind: item.kind, ok: result.ok, text: result.message });
    });
  }

  return <div className="space-y-6">
    <StField label="Reason recorded with each change">
      <select disabled={readOnly} id={reasonId} value={reason} onChange={event => setReason(event.target.value as typeof reason)}>
        {STRELVA_REASONS.map(value => <option key={value} value={value}>{REASON_WORDS[value]}</option>)}
      </select>
    </StField>
    <StCopy muted>Choices never fall below the fixed rule. The owner’s setting is read only here.</StCopy>
    <StTable label="Strelva's route, the floor, the owner's setting and the route in force for each kind of change"
      columns={[{ key: "kind", label: "Kind" }, { key: "strelva", label: "Strelva’s route" }, { key: "owner", label: "Owner" }, { key: "route", label: "In force" }]}
      rows={view.kinds.map(item => ({ key: item.kind, cells: {
        kind: <><span>{item.label}</span><div><StMono>{item.kind}</StMono></div><StCopy muted>Floor: {routeLabel(item.floor)}</StCopy>{notice?.kind === item.kind ? <span role={notice.ok ? "status" : "alert"}>{notice.text}</span> : null}</>,
        strelva: item.fixed ? "Always the owner's (fixed rule)" : <div className="space-y-2"><StField label={`Strelva's route for ${item.label}`}><select value={item.strelvaRoute} disabled={pending || readOnly} onChange={event => save(item, event.target.value as LadderRoute)}>{item.strelvaChoices.map(route => <option key={route} value={route}>{routeLabel(route)}</option>)}</select></StField>{!item.strelvaIsDefault ? <StTextButton disabled={pending || readOnly} onClick={() => save(item, null)} aria-label={`Reset Strelva's route for ${item.label} to the default`}>Reset</StTextButton> : null}</div>,
        owner: item.ownerRoute ? routeLabel(item.ownerRoute) : "No setting",
        route: routeLabel(item.route),
      } }))} />
  </div>;
}
