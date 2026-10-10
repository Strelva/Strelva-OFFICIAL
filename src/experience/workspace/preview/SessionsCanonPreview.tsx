"use client";

import { useState } from "react";
import { StEmpty, StHead, StHold, StMono, StNotice, StPage, StPill, StSegmented, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { SchedulingCalendar } from "@/experience/scheduling/SchedulingCalendar";
import styles from "./sessions-canon.module.css";

// Fictional calendar records matching fhHa1. No writes, grants or notifications.
const interval = (day: number, start: number, end: number) => ({ start: `2026-10-${day}T${String(start).padStart(2, "0")}:00:00-04:00`, end: `2026-10-${day}T${String(end).padStart(2, "0")}:00:00-04:00` });
const windows = [interval(14, 9, 17), interval(16, 9, 13), interval(21, 9, 17), interval(23, 9, 17)];
const reservations = [ { ...interval(14, 9, 13), requestId: "fictional-matter-a", title: "Half-day · [Matter A]", status: "reserved" }, { ...interval(21, 9, 17), requestId: "fictional-matter-b", title: "Full-day · [Matter B]", status: "reserved" } ];

export function SessionsCanonPreview({ state = "ready" }: { state?: string }) {
  const [sessionType, setSessionType] = useState("half");
  const [day, setDay] = useState(16);
  const [notice, setNotice] = useState("");
  const [decision, setDecision] = useState<"pending" | "accepted" | "later">("pending");
  const permission = state === "permission";
  const openDates = sessionType === "full" ? [23] : [14, 16, 23];
  return <StPage width="wide">
    <StHead crumb={{ label: "The Mooney Firm", href: "/preview/strelva" }} title="Mediation sessions" meta="Draft · reservations are held in this workspace. Attorneys can’t book from attymooney.com yet." actions={<StTextButton disabled={permission || state !== "ready"} onClick={() => setNotice("This preview holds no new reservation. The saved schedule has its own Reserve a time form.")}>Reserve a time</StTextButton>} />
    {state === "loading" ? <div className={styles.loading}><StSkeleton label="Loading session windows" /><StSkeleton width="75%" label="Loading reservations" /></div> : state === "error" ? <StNotice tone="critical">Session windows couldn’t be loaded. No reservations changed. <StTextButton href="/preview/strelva/sessions">Try again</StTextButton></StNotice> : state === "empty" ? <StEmpty>No session windows yet. Save your availability before reserving a time.</StEmpty> : <>
      {permission ? <StNotice>You can view these sessions. Only someone allowed to manage this System can reserve a time or accept the proposed change.</StNotice> : null}
      <div className={styles.layout}>
        <SchedulingCalendar availability={windows} reservations={reservations} timeZone="America/New_York" />
        <section className={styles.proposal} aria-labelledby="session-proposal">
          <p className={styles.due}>Needs you · due <StMono>Oct 16</StMono></p>
          <h2 id="session-proposal">Let attorneys request these dates from attymooney.com</h2>
          <StSurface label="Proposed visitor form"><div className={styles.visitor}>
            <h3>Request a session date</h3>
            <StSegmented label="Session length" value={sessionType} options={[{ value: "half", label: "Half-day" }, { value: "full", label: "Full-day" }]} onChange={value => { setSessionType(value); if (value === "full") setDay(23); }} />
            <div className={styles.dates} role="radiogroup" aria-label="Session date">{openDates.map(value => <button key={value} type="button" role="radio" aria-checked={day === value} onClick={() => setDay(value)}><span>{value === 14 ? "Wed" : "Fri"}</span><strong>{value}</strong></button>)}</div>
            <StPill variant="soft" block onClick={() => setNotice(`Fictional request for Oct ${day}. Nothing was sent or booked.`)}>Request this date</StPill>
          </div></StSurface>
          <p className={styles.explanation}>Only the open windows show. Each request lands here for you to confirm before anything is booked.</p>
          {decision === "pending" ? <div className={styles.actions}><StHold label="Hold to accept" disabled={permission} onAccept={() => { setDecision("accepted"); setNotice("Accepted in this fictional preview. The website and bookings remain unchanged."); }} /><StTextButton disabled={permission} onClick={() => setDecision("later")}>Not now</StTextButton></div> : <StState kind={decision === "accepted" ? "live" : "draft"}>{decision === "accepted" ? "Accepted in preview only" : "Kept for later in this preview"}</StState>}
        </section>
      </div>
      <div className={styles.footer}><p>Not synced to a calendar. Reservations stay here until you connect one.</p><div><StTextButton disabled={permission} onClick={() => setNotice("Outlook connection is not performed in this fictional preview.")}>Connect Outlook</StTextButton><StTextButton disabled={permission} onClick={() => setNotice("Google Calendar connection is not performed in this fictional preview.")}>Connect Google Calendar</StTextButton></div></div>
    </>}
    {notice ? <StNotice>{notice}</StNotice> : null}
  </StPage>;
}
