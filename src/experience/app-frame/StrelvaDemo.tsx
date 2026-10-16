"use client";

import { useState } from "react";
import { XaYes } from "@/components/ui/strelva/Xa";
import { StComposerBar, StComposerDock, StCopy, StHead, StNotice, StPage, StPillLink, StRow, StRows, StSection, StSegmented, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { StrelvaShell, type StrelvaSection } from "./StrelvaShell";

/** Public 1.0 specimen. All actions use local state; no transport or real identity. */
export function StrelvaDemo({ startHref }: { startHref: string }) {
  const [section, setSection] = useState<StrelvaSection>("home");
  const [ask, setAsk] = useState("");
  const [draft, setDraft] = useState("");
  const [comparison, setComparison] = useState<"before" | "after">("after");
  const [live, setLive] = useState(false);
  const [review, setReview] = useState(false);
  const [changed, setChanged] = useState(false);
  const example = () => { setReview(true); setSection("requests"); };
  const titles: Record<StrelvaSection, string> = { home: "Harbor Dental", "needs-you": "Review a change", requests: "Requests", ongoing: "Running", apps: "Systems", work: "Systems", products: "Systems", system: "Appointments", ask: "Ask Strelva", connections: "Connections", settings: "Business details", access: "People & access", help: "Bring in an agency", account: "Your account" };
  return <div data-workspace-theme="linen" data-workspace-mode="light">
    <StrelvaShell workspaceName="Harbor Dental" title="Strelva 1.0 demo" systemsReleased active={section} signedIn={false} signInHref="/sign-in" signOut={null}
      accountName="Demo owner" ownerBrand={{ agencyId: "fictional-north-studio", name: "North Studio", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" }}
      onNavigate={setSection} onStart={() => setSection("ask")} pinned={[{ id: "appointments", title: "Appointments", kind: "bookings", href: "#appointments", current: section === "system", onOpen: () => setSection("system") }]}
      notice={<StNotice>Fictional 1.0 demo. Every change stays in this tab. Nothing is sent, published, booked or saved.</StNotice>}>
      <StPage>
        <StHead title={titles[section]} meta="Fictional business · North Studio helps run its systems" />
        {section === "home" ? <>
          <StCopy>Your business, the systems it runs and the decisions that need you.</StCopy>
          <StRows><StRow title="Appointments" detail={live ? "Live in this demo · Release 2" : "Live in this demo · Release 1"} end={<StTextButton onClick={() => setSection("system")}>Open System</StTextButton>} /><StRow title="A simpler booking page" detail="North Studio prepared a Possibility for you to compare." end={<StTextButton onClick={example}>Review Possibility</StTextButton>} /></StRows>
        </> : section === "ask" ? <>
          <StCopy>Ask for an outcome in your business. In Strelva, you review the proposed work before a live change.</StCopy>
          {draft ? <StNotice>Your demo words: {draft}. This demo does not interpret or send them.</StNotice> : null}
          <StTextButton onClick={example}>Open an example Possibility</StTextButton>
        </> : section === "requests" || section === "needs-you" ? <>
          {review ? <>
            <StSection title="A simpler booking page">
              <StCopy>Proposed by North Studio. Compare the copy a customer would see.</StCopy>
              <StSegmented label="Compare booking copy" value={comparison} onChange={setComparison} options={[{ value: "before", label: "Before" }, { value: "after", label: "After" }]} />
              <StNotice>{comparison === "before" ? "Call Harbor Dental to ask about an appointment." : "Request an appointment with Harbor Dental. Our team confirms your time."}</StNotice>
            </StSection>
            <StCopy>{live ? "Accepted in this demo. No live website changed." : "Accepting changes this fictional page only. No appointment is booked."}</StCopy>
            <XaYes state={live ? "live" : changed ? "undone" : "waiting"} block={false} liveLabel="Live in this demo" settled="Undone in this demo. Nothing else changed."
              onYes={() => { setLive(true); setChanged(true); }} onUndo={() => { setLive(false); setChanged(true); }}
              onNotYet={() => { setReview(false); setSection("home"); }} />
          </> : <><StCopy>No request has been sent. Try the example change to see its review.</StCopy><StTextButton onClick={example}>Review Possibility</StTextButton></>}
        </> : section === "system" || section === "apps" || section === "work" || section === "products" ? <>
          <StRows><StRow title="Appointments" detail="A booking page run by Harbor Dental" end={<StState kind="live">Live in this demo</StState>} /></StRows>
          <StTextButton onClick={example}>Compare a Possibility</StTextButton>
          <StSection title="What changed"><StRows><StRow title={live ? "Release 2 · simpler booking copy" : "Release 1 · original booking page"} detail={changed ? live ? "Accepted by the fictional owner in this tab" : "Undone by the fictional owner in this tab" : "Prepared by North Studio · Runs on Strelva"} end={live ? <StTextButton onClick={() => { setLive(false); setChanged(true); }}>Undo in demo</StTextButton> : undefined} /></StRows></StSection>
          <StSection title="Versions"><StCopy>Downtown runs this System. A Version adapts the same System for another location or client.</StCopy></StSection>
        </> : section === "ongoing" ? <StCopy>No ongoing work has been agreed in this fictional business.</StCopy>
          : section === "settings" ? <StRows><StRow title="Harbor Dental" detail="Fictional dental practice · Buffalo" /><StRow title="Plan and billing" detail="No plan price is published yet. This demo has no subscription." /><StRow title="Export or leave" detail="Nothing is saved by this demo. Closing the tab discards its changes." /></StRows>
          : section === "access" ? <StRows><StRow title="Demo owner" detail="Owns the fictional business" /><StRow title="North Studio" detail="Fictional agency. A real business chooses the areas and access it grants." /></StRows>
          : section === "help" ? <StCopy>You can run your business directly or choose an agency. In your real business, review its proposal and access before anything changes.</StCopy>
          : <StCopy>This demo has no account. Sign in or start your own business from the links below.</StCopy>}
        <StSection title="Try it with your own business"><StPillLink href={startHref}>{startHref === "/audit" ? "Check your website" : "Start your business"}</StPillLink><StTextButton href="/">Back to the two doors</StTextButton></StSection>
      </StPage>
      <StComposerDock><StComposerBar value={ask} onChange={setAsk} scope="Fictional Harbor Dental" placeholder="Try an ask in this demo" onSubmit={() => { setDraft(ask); setAsk(""); setSection("ask"); }} /></StComposerDock>
    </StrelvaShell>
  </div>;
}
