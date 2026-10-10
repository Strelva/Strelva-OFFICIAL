"use client";

import { useState } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StComposerBar, StComposerDock, StEmpty, StHead, StMono, StNotice, StPage, StRow, StRows, StSkeleton, StState } from "@/components/ui/strelva/Kit";

export type OwnerRunningPreviewState = "ready" | "loading" | "empty" | "error" | "permission";
const checks = [
  { id: "website", title: "The workshop website loads and every page is current", detail: "Checks the fictional website each hour. A failed check asks Strelva to investigate.", freshness: "Checked 2m ago", needsYou: false },
  { id: "inquiry", title: "Every inquiry reaches the workshop", detail: "Checks a fictional inquiry each morning and confirms its arrival.", freshness: "Checked 7:00 AM", needsYou: false },
  { id: "reply", title: "Every inquiry gets a first reply the same day", detail: "Standard replies follow the agreed policy. New wording waits for you.", freshness: "Last reply Thu 2:41 PM", needsYou: false },
  { id: "certificate", title: "The website stays secure", detail: "The fictional certificate is renewed before it expires.", freshness: "Next check Dec 30", needsYou: false },
  { id: "reminder", title: "Customers get a reminder the day before an appointment", detail: "The reminder waits until a calendar is connected and the scope is agreed.", freshness: "Needs a calendar", needsYou: true },
] as const;

/** The managed condition/freshness projection is illustrative; real Running is untouched. */
export function OwnerRunningPreview({ state, dark = false }: { state: OwnerRunningPreviewState; dark?: boolean }) {
  const [ask, setAsk] = useState("");
  const [draft, setDraft] = useState("");
  return <div data-workspace-theme="linen" data-workspace-mode={dark ? "dark" : "light"}>
    <StrelvaShell title="Running" active="ongoing" systemsReleased businessContext={<span>Fictional Workshop</span>} accountName="Fictional owner" signOut={<span>Local preview</span>}
      notice={<p role="note" className="px-5 py-3 text-sm text-gray-muted">Local rehearsal · fictional checks and times. No provider checks, messages or business changes run here.</p>}
    >
      <StPage>
        <StHead title="Running" meta={state === "ready" ? <><StMono>{checks.length}</StMono> things Strelva keeps true · checked on a clock</> : "What Strelva keeps true, with its latest check."} />
        {state === "loading" ? <div role="status" aria-label="Checking what Strelva keeps running"><StSkeleton /><StSkeleton width="84%" /><StSkeleton width="72%" /></div>
          : state === "empty" ? <StEmpty>Nothing is running yet. Ask Strelva what you want to keep true.</StEmpty>
          : state === "error" ? <StNotice tone="critical">The latest checks could not be loaded. This does not establish whether anything is working.</StNotice>
          : state === "permission" ? <StNotice>You cannot see what is running for this business. Ask an owner or admin for access.</StNotice>
          : <StRows label="What Strelva keeps true">{checks.map(check => <StRow key={check.id} title={check.title} detail={check.detail}
            end={<><StState kind={check.needsYou ? "need" : "live"}>{check.needsYou ? "Needs you" : "Running"}</StState><StMono>{check.freshness}</StMono></>}
          />)}</StRows>}
        {draft ? <StNotice><span role="status">Local question drafted: {draft}. Nothing was sent, started or approved.</span></StNotice> : null}
      </StPage>
      {state !== "permission" ? <StComposerDock><StComposerBar scope="Fictional Workshop" placeholder="Ask Strelva to change or make something" value={ask} onChange={setAsk} disabled={state === "loading"}
        onSubmit={() => { setDraft(ask.trim()); setAsk(""); }} /></StComposerDock> : null}
    </StrelvaShell>
  </div>;
}
