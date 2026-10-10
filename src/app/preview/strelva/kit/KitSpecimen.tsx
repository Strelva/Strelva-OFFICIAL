"use client";

import { useState } from "react";
import { StBeacon, StComposerBar, StComposerDock, StEmpty, StField, StSplit, StHead, StHold, StKbd, StLabel, StLedger, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSegmented, StSkeleton, StStamp, StState, StSteps, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";

/** Fictional content only. Every kit piece in its states, light and dark. */
export function KitSpecimen({ mode }: { mode: "light" | "dark" }) {
  const [who, setWho] = useState<"handles" | "after" | "ask">("ask");
  const [ask, setAsk] = useState("");
  const [accepted, setAccepted] = useState(false);
  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode={mode} style={{ minHeight: "100dvh", background: "radial-gradient(circle at 1px 1px, var(--st-dot) 1px, transparent 1.4px) 0 0 / 24px 24px, var(--st-canvas)", fontFamily: "var(--font-workspace), system-ui, sans-serif" }}>
    <StPage>
      <StHead crumb={{ label: "Preview", href: "/preview/strelva" }} title="Strelva 1.0 kit" meta="Fictional content · every piece in its states" actions={<StTextButton href={`/preview/strelva/kit?mode=${mode === "dark" ? "light" : "dark"}`}>{mode === "dark" ? "Light" : "Dark"}</StTextButton>} />
      <StSection title="Needs you" meta="open rows, one primary each">
        <StRows label="Needs you">
          <StRow lead={<StBeacon kind="need" pulse />} kind="Google review reply" title="Reply to M. Patel’s 5-star review" detail="“Thank you for helping us settle this without court.” Reply drafted." end={<><StTextButton>Not yet</StTextButton><StTextButton>Open</StTextButton><StPill>Post reply</StPill></>} />
          <StRow lead={<StBeacon kind="need" />} kind="Website change" title="Update the fees page for 2027" detail="2 lines change on attymooney.com/fees." end={<><StTextButton>Not yet</StTextButton><StPill>Review</StPill></>} />
        </StRows>
      </StSection>
      <StSection title="Systems" meta="not working first" action={<StTextButton>All Systems</StTextButton>}>
        <StRows label="Systems">
          <StRow href="#" title="North Coast form" detail="Stopped sending at 7:00" end={<><StState kind="down">Not working</StState><StMono tone="critical">2h</StMono></>} />
          <StRow href="#" title="attymooney.com" detail="10 pages · last change Oct 7" end={<><StState kind="live">Live</StState><StMono>checked 2m ago</StMono></>} />
          <StRow href="#" title="Mediation sessions" detail="Attorneys request a session date" end={<StState kind="draft">Possibility</StState>} />
        </StRows>
      </StSection>
      <StSection title="Steps" meta="Make real, item by item">
        <StSteps label="Making it real" steps={[{ title: "Session page built", state: "done", time: "0:12", detail: "Hidden from visitors until the last step." }, { title: "Rehearsing a request end to end", state: "active", time: "1:05" }, { title: "Your confirmation email", state: "pending", detail: "Needs your OK on the wording." }, { title: "Calendar read", state: "failed", detail: "Google stopped answering. Nothing is live." }]} />
      </StSection>
      <StSection title="A change, and the yes">
        <StLedger path="attymooney.com/fees" count="2 lines" lines={[{ sign: "-", text: "Half-day: [2026 fee]" }, { sign: "+", text: "Half-day: [2027 fee]" }]} />
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <StHold label={accepted ? "Published" : "Hold to publish"} onAccept={() => setAccepted(true)} />
          <StTextButton>Not yet</StTextButton>
          {accepted ? <StToast onUndo={() => setAccepted(false)}>Published · attymooney.com/fees</StToast> : null}
        </div>
      </StSection>
      <StSection title="Fields and consequences" action={<StTextButton href="/preview/strelva/entry">Open entry specimen</StTextButton>}><StSplit aside={<StNotice action={<StPill variant="soft">Review</StPill>}>A change shows where it will go before you save.</StNotice>}><StField label="Business name" hint="The same fact wherever it is used"><input defaultValue="The Mooney Firm" /></StField><StRows><StRow title="Hours" value={<StMono>9 AM – 5 PM</StMono>} end={<StMono>in 4 places</StMono>} /></StRows></StSplit></StSection>
      <StSection title="Who decides" meta="only stricter than Strelva’s default">
        <StSegmented label="Fixing a broken link" value={who} onChange={setWho} options={[{ value: "handles", label: "Strelva handles it" }, { value: "after", label: "Tell me after" }, { value: "ask", label: "Ask me first" }]} disabledValues={["handles"]} disabledReason="Looser than Strelva allows for this kind" />
      </StSection>
      <StSection title="Objects, notices, empty, loading">
        <StSurface tone="need" selected label="Draft reply"><StLabel>Your reply, written by Strelva</StLabel><p style={{ margin: "8px 0 12px", fontSize: 15, lineHeight: "24px" }}>Hi Dana, yes, Sheri mediates disputes between partners. You can ask for a session date here and Sheri will confirm it.</p><div style={{ display: "flex", gap: 16, alignItems: "center" }}><StTextButton>Edit</StTextButton><StTextButton>Not yet</StTextButton><span style={{ flex: 1 }} /><StPill>Send reply</StPill></div></StSurface>
        <StNotice tone="need">Your hours changed on Oct 8. Strelva redoes the open dates before this becomes real.</StNotice>
        <StNotice tone="critical">Couldn’t load this client at 2:06. Showing Tuesday’s numbers. Strelva retries every 5 min.</StNotice>
        <StEmpty action={<StPill variant="soft">Rehearse the form</StPill>}>No inquiries yet. The form was checked at 7:00 and works.</StEmpty>
        <div style={{ display: "grid", gap: 8, maxWidth: 360 }}><StSkeleton width="70%" /><StSkeleton width="45%" /></div>
        <p style={{ margin: 0, display: "flex", gap: 12, alignItems: "center" }}><StStamp>checked 2m ago</StStamp><StKbd>⌘ K</StKbd><StPill variant="soft">Soft action</StPill><StPill size="lg">Large primary</StPill></p>
      </StSection>
    </StPage>
    <StComposerDock><StComposerBar scope="attymooney.com" placeholder="Ask about attymooney.com" value={ask} onChange={setAsk} onSubmit={() => setAsk("")} /></StComposerDock>
  </div>;
}
