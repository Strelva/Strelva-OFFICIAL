"use client";

import { useState } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StPage, StHead, StComposerDock, StComposerBar, StNotice } from "@/components/ui/strelva/Kit";
import { DecisionPolicyPanel, type DecisionPolicyState } from "@/experience/workspace/DecisionPolicySettings";
import { buildPolicyView, type PolicyView } from "@/platform/needs-you/policy-model";

/** Fictional policy state. Never calls the real policy write or notification path. */
export function OwnerPolicyPreview({ state = "ready" }: { state?: string }) {
  const [view, setView] = useState<PolicyView>(() => buildPolicyView({ settings: [], history: [] }));
  const [ask, setAsk] = useState("");
  const [notice, setNotice] = useState<Parameters<typeof DecisionPolicyPanel>[0]["notice"]>(null);
  const load: DecisionPolicyState = state === "off" ? { status: "disabled" } : state === "loading" ? { status: "loading" } : state === "error" ? { status: "error", message: "Who decides could not be loaded. Nothing about it changed." } : { status: "ready", role: state === "permission" || state === "denied" ? "member" : "owner", view: state === "empty" ? { ...view, kinds: [] } : view };
  return <StrelvaShell signedIn={false} systemsReleased appBase="/preview/strelva" active="settings" title="" businessContext="The Mooney Firm" accountName="sheri" notice={<p className="px-5 py-2 text-xs text-gray-muted">Fictional local policy preview · saving changes only this page</p>}><StPage><StHead crumb={{ label: "Business details", href: "/preview/strelva" }} title="Who decides" meta="You can always ask to see more before it happens · never less than Strelva’s default" />
    <DecisionPolicyPanel state={load} pending={null} notice={notice} onRetry={() => setNotice({ kind: "copy.routine", tone: "error", text: "Fictional retry only. No policy was read." })} onChange={(item, change, done) => {
      const route = change.action === "set" ? change.route : item.strelvaRoute;
      setView({ ...view, kinds: view.kinds.map(row => row.kind === item.kind ? { ...row, route, ownerRoute: change.action === "reset" ? null : route, ownerVersion: row.ownerVersion + 1 } : row) });
      setNotice({ kind: item.kind, tone: "done", text: `${done} Fictional preview only.` });
    }} />
    <StNotice>All four real policy routes remain visible. “After notice” means Strelva waits before acting; it does not mean telling you after.</StNotice>
  </StPage><StComposerDock><StComposerBar scope="Business details" placeholder="Ask about who decides" value={ask} onChange={setAsk} onSubmit={() => setAsk("")} /></StComposerDock></StrelvaShell>;
}
