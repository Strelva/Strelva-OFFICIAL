"use client";
import { useState, type ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { PREVIEW_STRELVA_AGENCY_BRAND } from "./chrome-fixture";
import { StComposerBar, StComposerDock, StNotice } from "@/components/ui/strelva/Kit";

/** Fictional shell, using the real navigation component. No provider reads. */
export function PublishingPreviewFrame({ children, place, mode = "light", publicPage = false }: { children: ReactNode; place: string; mode?: string; publicPage?: boolean }) {
  const [ask, setAsk] = useState("");
  const [asked, setAsked] = useState(false);
  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode={mode === "dark" ? "dark" : "light"}>
    {publicPage ? <><p role="note" style={{ padding: "8px 20px", margin: 0, fontSize: 12 }}>Local preview · fictional records · no live actions</p>{children}</> : <StrelvaShell ownerBrand={PREVIEW_STRELVA_AGENCY_BRAND} title="" systemsReleased signedIn signOut={null} appBase="/preview/strelva" accountName="sheri" workspaceName="The Mooney Firm" active="system"
      notice={<p role="note" style={{ margin: 0, fontSize: 12 }}>Local preview · fictional records · no Google changes or email sends</p>}
      pinned={[{ id: "website", title: "attymooney.com", kind: "website", href: "/preview/strelva?scenario=mooney" }, { id: "google", title: "Google listing", kind: "listing", current: place === "Google listing", href: "/preview/strelva/publishing?kind=google" }, { id: "newsletter", title: "Newsletter", kind: "newsletter", current: place === "Newsletter", href: "/preview/strelva/publishing?kind=newsletter" }]}>
      {children}
      {asked ? <StNotice>This preview kept your request on this page. Nothing was sent or approved.</StNotice> : null}
      <StComposerDock><StComposerBar scope={place} placeholder={`Ask about ${place === "Recaps" ? "your results" : `your ${place.toLowerCase()}`}`} value={ask} onChange={setAsk} onSubmit={() => { setAsked(true); setAsk(""); }} /></StComposerDock>
    </StrelvaShell>}
  </div>;
}
