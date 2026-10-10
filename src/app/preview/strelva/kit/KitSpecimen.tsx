"use client";

import { useRef, useState } from "react";
import { StBeacon, StComposerBar, StComposerDock, StEmpty, StInput, StGrid, StCell, StToggle, StSignedPage, StField, StSplit, StHead, StHold, StKbd, StLabel, StLedger, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSegmented, StSkeleton, StStamp, StState, StSteps, StSurface, StTable, StTextButton, StToast } from "@/components/ui/strelva/Kit";

/** Fictional content only. Every kit piece in its states, light and dark. */
export function KitSpecimen({ mode }: { mode: "light" | "dark" }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusControl = useRef<HTMLButtonElement>(null);
  const [who, setWho] = useState<"handles" | "after" | "ask">("ask");
  const [ask, setAsk] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [accepted, setAccepted] = useState(false);
  const actionRef = useRef<HTMLButtonElement>(null);
  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode={mode} style={{ minHeight: "100dvh", background: "radial-gradient(circle at 1px 1px, var(--st-dot) 1px, transparent 1.4px) 0 0 / 24px 24px, var(--st-canvas)", fontFamily: "var(--font-workspace), system-ui, sans-serif" }}>
    <StPage>
      <StHead headingRef={titleRef} crumb={{ label: "Preview", href: "/preview/strelva" }} title="Strelva 1.0 kit" meta="Fictional content · every piece in its states" actions={<StTextButton href={`/preview/strelva/kit?mode=${mode === "dark" ? "light" : "dark"}`}>{mode === "dark" ? "Light" : "Dark"}</StTextButton>} />
      <details><summary>Standalone entry specimen</summary><StSignedPage label="Standalone entry" footer={<StPill variant="soft">Open Strelva</StPill>}><StHead title="Review before sending" meta="Opening a link does nothing by itself." /><StSurface label="Draft">The exact reply goes here.</StSurface></StSignedPage></details>
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
      <StSection title="Client comparison" meta="open table, labeled records on phones">
        <StTable label="Fictional clients" columns={[{ key: "client", label: "Client" }, { key: "health", label: "Health" }, { key: "revision", label: "Revision", mono: true }]} rows={[{ key: "harbor", cells: { client: "Harbor Dental", health: <StState kind="live">Latest checks passed</StState>, revision: "r12" } }, { key: "north", cells: { client: "North Coast Realty", health: <StState kind="down">Form failing</StState>, revision: "r11" } }]} />
      </StSection>
      <StSection title="Steps" meta="Make real, item by item">
        <StSteps label="Making it real" steps={[{ title: "Session page built", state: "done", time: "0:12", detail: "Hidden from visitors until the last step." }, { title: "Rehearsing a request end to end", state: "active", time: "1:05" }, { title: "Your confirmation email", state: "pending", detail: "Needs your OK on the wording." }, { title: "Page accepted by provider", state: "unverified", detail: "Done, not yet confirmed. Strelva checks the page without publishing it again." }, { title: "Calendar read", state: "failed", detail: "Google stopped answering. Nothing is live." }]} />
      </StSection>
      <StSection title="A change, and the yes">
        <StLedger path="attymooney.com/fees" count="2 lines" lines={[{ sign: "-", text: "Half-day: [2026 fee]" }, { sign: "+", text: "Half-day: [2027 fee]" }]} />
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <StHold aria-label="Publish the fictional fees change" label={accepted ? "Published" : "Hold to publish"} onAccept={() => setAccepted(true)} />
          <StTextButton>Not yet</StTextButton>
          {accepted ? <StToast onUndo={() => setAccepted(false)}>Published · attymooney.com/fees</StToast> : null}
        </div>
      </StSection>
      <StTextButton ref={focusControl} onClick={() => titleRef.current?.focus()}>Focus the page title</StTextButton>
      <StSection title="Fields and consequences" action={<StTextButton href="/preview/strelva/entry">Open entry specimen</StTextButton>}><StSplit aside={<StNotice action={<StPill variant="soft">Review</StPill>}>A change shows where it will go before you save.</StNotice>}><StField label="Business name" hint="The same fact wherever it is used"><input defaultValue="The Mooney Firm" /></StField><StRows><StRow title="Hours" value={<StMono>9 AM – 5 PM</StMono>} end={<StMono>in 4 places</StMono>} /></StRows></StSplit></StSection>
      <StSection title="Who decides" meta="only stricter than Strelva’s default">
        <StSegmented label="Fixing a broken link" value={who} onChange={setWho} options={[{ value: "handles", label: "Strelva handles it" }, { value: "after", label: "Tell me after" }, { value: "ask", label: "Ask me first" }]} disabledValues={["handles"]} disabledReason="Looser than Strelva allows for this kind" />
      </StSection>
      <StSection title="Composer states" meta="Scoped context is not a Live claim">
        <StComposerBar scope="The Mooney Firm" inputRef={inputRef} maxLength={3000} placeholder="Ask Strelva to change something" value={ask} onChange={setAsk} onSubmit={() => setAsk("")} />
        <StComposerBar multiline textareaRef={textareaRef} maxLength={20000} placeholder="Enter sends · Shift + Enter adds a line" value={ask} onChange={setAsk} onSubmit={() => setAsk("")} />
        <StComposerBar disabled placeholder="Shared for review · ask the owner to make changes" value="" onChange={setAsk} onSubmit={() => {}} />
        <StTextButton ref={undefined} onClick={() => inputRef.current?.focus()}>Focus the composer</StTextButton>
      </StSection>
      <StSection title="Forms, switches and comparison">
        <StInput label="Reason" hint="Fictional field, no changes are saved." placeholder="Why should this change?" />
        <StToggle label="Owner emails" checked={false} disabled reason="Off globally during rollout" />
        <StToggle label="Preview switch" checked={accepted} onChange={setAccepted} />
        <StGrid label="Fictional site checks" columns={["Site", "State", "Checked"]}><tr><StCell heading label="Site">example.test</StCell><StCell label="State"><StState kind="live">Up</StState></StCell><StCell label="Checked"><StMono>2m ago</StMono></StCell></tr></StGrid>
      </StSection>
      <StSection title="Objects, notices, empty, loading">
        <StPage><StLabel>Native page inside a System · shares its outer insets</StLabel><StSurface label="Embedded document">The object keeps the whole column, including on a phone.</StSurface></StPage>
        <StSurface tone="need" selected label="Draft reply"><StLabel>Your reply, written by Strelva</StLabel><p style={{ margin: "8px 0 12px", fontSize: 15, lineHeight: "24px" }}>Hi Dana, yes, Sheri mediates disputes between partners. You can ask for a session date here and Sheri will confirm it.</p><div style={{ display: "flex", gap: 16, alignItems: "center" }}><StTextButton>Edit</StTextButton><StTextButton>Not yet</StTextButton><span style={{ flex: 1 }} /><StPill>Send reply</StPill></div></StSurface>
        <StNotice tone="need">Your hours changed on Oct 8. Strelva redoes the open dates before this becomes real.</StNotice>
        <StNotice tone="critical">Couldn’t load this client at 2:06. Showing Tuesday’s numbers. Strelva retries every 5 min.</StNotice>
        <StEmpty action={<StPill variant="soft">Rehearse the form</StPill>}>No inquiries yet. The form was checked at 7:00 and works.</StEmpty>
        <div style={{ display: "grid", gap: 8, maxWidth: 360 }}><StSkeleton width="70%" /><StSkeleton width="45%" /></div>
        <p style={{ margin: 0, display: "flex", gap: 12, alignItems: "center" }}><StStamp>checked 2m ago</StStamp><StKbd>⌘ K</StKbd><StPill ref={actionRef} variant="soft">Soft action</StPill><StTextButton onClick={() => actionRef.current?.focus()}>Focus soft action</StTextButton><StPill size="lg">Large primary</StPill></p>
      </StSection>
    </StPage>
    <StComposerDock><StComposerBar scope="attymooney.com" placeholder="Ask about attymooney.com" value={ask} onChange={setAsk} onSubmit={() => setAsk("")} /></StComposerDock>
  </div>;
}
