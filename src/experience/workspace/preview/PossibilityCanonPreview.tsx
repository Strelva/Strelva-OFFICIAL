"use client";

import { useState } from "react";
import { StEmpty, StHead, StMono, StNotice, StPage, StPill, StPillLink, StSkeleton, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { PossibilityComparison } from "@/experience/systems/PossibilityComparison";
import { MakeRealProgress } from "@/experience/systems/MakeRealProgress";
import { PossibilityTry } from "@/experience/systems/PossibilityTry";
import type { SystemActivation } from "@/experience/systems/model";
import { SystemsCanonShell } from "./SystemsCanonShell";
import styles from "./possibility-canon.module.css";

// Fictional fhHa1/uKByO/D3FVqz/Z4ysc content, never a published schedule.
const dates = [{ day: 14, weekday: "Wed" }, { day: 16, weekday: "Fri" }, { day: 23, weekday: "Fri" }];
const running: SystemActivation = {
  id: "fictional-session-release", title: "Attorneys request a session date", headline: "Making it real", partlyLive: false, done: 2, total: 5,
  lines: [
    { label: "Session page built at attymooney.com/sessions", state: "Done", detail: "Hidden from visitors until the last step." },
    { label: "Calendar access prepared", state: "Done", detail: "Fictional read-only access. No real calendar is connected." },
    { label: "Rehearsing a request end to end", state: "Running", detail: "A made-up visitor asks for Fri 16. Nobody receives a message." },
    { label: "Your confirmation email", state: "Not started", detail: "Needs your OK on the wording. No email is sent in this preview." },
    { label: "Page goes live and is read back", state: "Not started", detail: "No publication happens in this preview." },
  ],
};

function BrowserLabel({ path }: { path: string }) { return <div className={styles.browserBar}><span aria-hidden="true">● ● ●</span><StMono>{path}</StMono></div>; }

function CandidatePage() {
  const [day, setDay] = useState(16);
  const [sent, setSent] = useState(false);
  return <div className={styles.clientPage}>
    <h2>Request a mediation session</h2>
    <p>Pick an open date. The firm confirms every request before it is booked.</p>
    <div className={styles.dateChoices} role="radiogroup" aria-label="Test session date">{dates.map(date => <button key={date.day} type="button" role="radio" aria-checked={day === date.day} onClick={() => { setDay(date.day); setSent(false); }}>{date.weekday} {date.day}</button>)}</div>
    <div className={styles.requestLine}><span>{dates.find(date => date.day === day)?.weekday} {day} · half-day</span><StPill variant="soft" onClick={() => setSent(true)}>Request this date</StPill></div>
    {sent ? <StNotice>Test submission, nobody was told. Nothing is kept or booked.</StNotice> : null}
  </div>;
}

export function PossibilityCanonPreview({ state = "ready", mode = "light", making = false }: { state?: string; mode?: "light" | "dark"; making?: boolean }) {
  const [refresh, setRefresh] = useState(false);
  const [started, setStarted] = useState(making);
  const [later, setLater] = useState(false);
  const stale = state === "stale" && !refresh;
  const permission = state === "permission";
  return <SystemsCanonShell mode={mode}><StPage>
    <StHead crumb={{ label: "Mediation sessions", href: "/preview/strelva/sessions" }} title={started ? "Making it real" : "Attorneys request a session date"} beacon={started ? "need" : "draft"} meta={started ? "Fictional rehearsal · 2 of 5 done · nothing is published here" : "A Possibility · made Oct 6 · nothing about it is live"} />
    {state === "loading" ? <><StSkeleton label="Opening this Possibility" /><StSkeleton width="70%" /></> : state === "empty" ? <StEmpty>{started ? "No release is recorded for these sessions." : "No Possibility is being explored for these sessions."}</StEmpty> : state === "error" ? <StNotice tone="critical">This Possibility could not be opened. Nothing changed. <StTextButton href="/preview/strelva/possibility">Try again</StTextButton></StNotice> : permission && started ? <StNotice>Your account cannot inspect this release. Ask the business owner for access.</StNotice> : started ? <div className={styles.progressColumns}>
      <MakeRealProgress activation={state === "partly" ? { ...running, partlyLive: true, headline: "Partly live in this fictional example", lines: [...running.lines.slice(0, 2), { label: "Add the booking link on Google", state: "Waiting", detail: "Fictional provider access has not been approved." }, ...running.lines.slice(3)] } : running} />
      <div className={styles.sideNote}><StNotice>This is a local rehearsal. In a real release, Strelva records every outside effect that lands and every step that stops.</StNotice><StSurface label="Confirmation email wording"><strong>Confirmation email wording</strong><p className="mt-3 text-sm text-gray-muted">“The firm has your request for Fri, Oct 16 and will confirm by email.”</p><div className="mt-4"><StPill variant="soft" disabled>Needs a separate review</StPill></div></StSurface></div>
    </div> : <>
      {permission ? <StNotice>You can compare this Possibility. Only the business owner can make real.</StNotice> : null}
      {later ? <StNotice>Kept for later in this preview. Nothing changed.</StNotice> : null}
      <PossibilityComparison title="Attorneys request a session date" livePath="attymooney.com/contact" candidatePath="attymooney.com/sessions"
        staleReason={stale ? "Your hours changed on Oct 8." : undefined} onRefresh={stale ? () => setRefresh(true) : undefined}
        live={<><BrowserLabel path="attymooney.com/contact" /><div className={styles.clientPage}><h2>Schedule a session</h2><p>Call the office or use the form below to find a date.</p><div className={styles.formLine} /><div className={styles.formMessage} /></div></>}
        candidate={<><BrowserLabel path="attymooney.com/sessions" /><CandidatePage /></>}
        scope="Adds 1 page and 1 System. Changes nothing on your other pages."
        actions={<><StTextButton onClick={() => setLater(true)}>Not now</StTextButton><StPillLink variant="soft" href="/preview/strelva/try?state=sessions">Try it as a visitor</StPillLink><StPill disabled={permission || stale} title={stale ? "Refresh this Possibility first." : permission ? "Only the business owner can make real." : undefined} onClick={() => setStarted(true)}>Make real</StPill></>} />
    </>}
  </StPage></SystemsCanonShell>;
}

export function SessionsVisitorTryFixture() {
  const [duration, setDuration] = useState("half");
  const [day, setDay] = useState(16);
  const [sent, setSent] = useState(false);
  return <PossibilityTry state={{ kind: "ready", view: { businessName: "The Mooney Firm", proposingActor: { kind: "agency", displayName: "Strelva Agency" }, agencyBrand: { agencyId: "fixture-strelva-agency", name: "Strelva Agency", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" }, title: "Attorneys request a session date", intent: "Fictional visitor preview. No real calendar, messages or approval access.", changes: [], introduces: [], takesSubmissions: true } }} previewContent={<>
    <div className={styles.clientHeader}><strong>The Mooney Firm</strong><span>Attorneys · Workplace mediation · About · Fees · Contact</span></div>
    <StSurface label="Fictional visitor booking page"><div className={styles.visitorColumns}>
      <div><p className={styles.muted}>The Mooney Firm</p><h2>Request a mediation session</h2><p>Pick an open date. The firm confirms every request before it’s booked.</p><div className={styles.durationChoices} role="radiogroup" aria-label="Test session length">{[{ value: "half", label: "Half-day", hours: "4 hours" }, { value: "full", label: "Full-day", hours: "8 hours" }].map(choice => <button key={choice.value} type="button" role="radio" aria-checked={duration === choice.value} onClick={() => { setDuration(choice.value); setSent(false); if (choice.value === "full") setDay(23); }}>{choice.label}<span>{choice.hours}</span></button>)}</div><p className={styles.muted}>Eastern time</p></div>
      <div><strong>October 2026</strong><div className={styles.month} role="group" aria-label="Test dates in October 2026">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(label => <span key={label} className={styles.muted}>{label}</span>)}{Array.from({ length: 4 }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: 31 }, (_, index) => index + 1).map(value => <button key={value} type="button" disabled={!dates.some(date => date.day === value) || duration === "full" && value !== 23} aria-pressed={day === value} onClick={() => { setDay(value); setSent(false); }}>{value}</button>)}</div></div>
      <div><strong>{dates.find(date => date.day === day)?.weekday}, Oct {day}</strong><p className={styles.muted}>{duration === "half" ? "Half-day" : "Full-day"}</p><StPill variant="soft" block aria-pressed={true}>9:00 am–{duration === "half" ? "1:00" : "5:00"} pm</StPill><div className="mt-6"><StPill block onClick={() => setSent(true)}>Continue</StPill></div>{sent ? <p role="status" className="mt-4 text-sm">Test submission, nobody was told. No booking or record was made.</p> : <p className={styles.muted}>You won’t share names or dispute details yet.</p>}</div>
    </div></StSurface>
  </>} />;
}
