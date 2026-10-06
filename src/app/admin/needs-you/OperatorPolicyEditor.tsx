"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
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

const selectClass = "w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50";

/**
 * Strelva's layer for one business: per kind, Strelva's route (never below
 * the floor), with the owner's stricter setting and the route in force shown
 * beside it. The owner's layer is read only here.
 */
export function OperatorPolicyEditor({ workspaceId, view: initial }: { workspaceId: string; view: PolicyView }) {
  const [view, setView] = useState(initial);
  const [reason, setReason] = useState<(typeof STRELVA_REASONS)[number]>("strelva_default");
  const [notice, setNotice] = useState<{ kind: string; ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const reasonId = useId();

  function save(item: PolicyKindView, route: LadderRoute | null) {
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

  return (
    <div className="space-y-3">
      <div className="max-w-sm px-[18px]">
        <label htmlFor={reasonId} className="mb-1 block text-xs text-gray-muted">Reason recorded with each change</label>
        <select id={reasonId} className={selectClass} value={reason} onChange={event => setReason(event.target.value as typeof reason)}>
          {STRELVA_REASONS.map(value => <option key={value} value={value}>{REASON_WORDS[value]}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-t border-glass-border text-left text-[12.5px]">
          <caption className="sr-only">Strelva&apos;s route, the floor, the owner&apos;s setting and the route in force for each kind of change</caption>
          <thead className="text-gray-faint">
            <tr>
              <th scope="col" className="px-[18px] py-2 font-medium">Kind</th>
              <th scope="col" className="px-2 py-2 font-medium">Strelva&apos;s route</th>
              <th scope="col" className="px-2 py-2 font-medium">Owner</th>
              <th scope="col" className="px-[18px] py-2 font-medium">In force</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-glass-border">
            {view.kinds.map(item => (
              <tr key={item.kind} className="align-top">
                <th scope="row" className="px-[18px] py-2.5 font-normal">
                  <span className="block text-warm-white">{item.label}</span>
                  <span className="block font-mono text-[11px] text-gray-faint">{item.kind} · floor {routeLabel(item.floor).toLowerCase()}</span>
                  {notice?.kind === item.kind ? <span role="status" className={`mt-1 block text-[11.5px] ${notice.ok ? "text-positive" : "text-critical"}`}>{notice.text}</span> : null}
                </th>
                <td className="px-2 py-2.5">
                  {item.fixed ? <span className="text-gray-muted">Always the owner&apos;s (fixed rule)</span> : <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Strelva's route for ${item.label}`} className={`${selectClass} min-w-[13rem] flex-1`} value={item.strelvaRoute} disabled={pending}
                      onChange={event => save(item, event.target.value as LadderRoute)}>
                      {item.strelvaChoices.map(route => <option key={route} value={route}>{routeLabel(route)}</option>)}
                    </select>
                    {!item.strelvaIsDefault ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(item, null)} aria-label={`Reset Strelva's route for ${item.label} to the default`}>Reset</Button> : null}
                  </div>}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 text-gray-muted">{item.ownerRoute ? routeLabel(item.ownerRoute) : "No setting"}</td>
                <td className="px-[18px] py-2.5 text-warm-white">{routeLabel(item.route)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
