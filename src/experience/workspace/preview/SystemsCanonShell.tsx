"use client";

import { useState, type ReactNode } from "react";
import { type StrelvaPinnedItem, StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StComposerBar, StComposerDock, StNotice } from "@/components/ui/strelva/Kit";

/** Fictional navigation for this lane's isolated, network-free canon previews. */
export function SystemsCanonShell({ children, businessName = "The Mooney Firm", systemName = "Mediation sessions", mode = "light", pins: suppliedPins, accountName = "Sheri" }: { children: ReactNode; businessName?: string; systemName?: string; mode?: "light" | "dark"; pins?: readonly StrelvaPinnedItem[]; accountName?: string }) {
  const [request, setRequest] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const pins = [
    { id: "website", title: "attymooney.com", href: "/preview/strelva/website", kind: "website" as const },
    { id: "intake", title: "Mediation intake", href: "/preview/strelva/tool", kind: "app" as const },
    { id: "sessions", title: "Mediation sessions", href: "/preview/strelva/sessions", kind: "bookings" as const },
    { id: "tracker", title: "Matter tracker", href: "/preview/strelva/import", kind: "tracker" as const },
    { id: "documents", title: "Documents", href: "/preview/strelva/documents", kind: "document" as const },
  ].map(item => ({ ...item, current: item.title === systemName }));
  return <div data-workspace-theme="linen" data-workspace-mode={mode}>
    <StrelvaShell title="" systemsReleased pinned={suppliedPins ?? pins} businessContext={businessName} accountName={accountName} appBase="/preview/strelva"
      notice={<p className="px-5 pt-2 text-xs text-gray-muted" role="note">Fictional preview · changes reset on reload · no live actions</p>}>
      {children}
      <StComposerDock><div className="flex w-full flex-col items-center gap-2">
        {submitted ? <StNotice>This preview keeps your words here. No request was sent.</StNotice> : null}
        <StComposerBar scope={systemName} placeholder={`Ask about ${systemName}`} value={request} onChange={setRequest} onSubmit={() => setSubmitted(true)} />
      </div></StComposerDock>
    </StrelvaShell>
  </div>;
}
