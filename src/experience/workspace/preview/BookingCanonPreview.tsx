"use client";

import { useState } from "react";
import { PREVIEW_STRELVA_AGENCY_BRAND } from "./chrome-fixture";
import { WorkspacePhoneTabs } from "@/experience/app-frame/WorkspacePhoneTabs";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StComposerBar, StComposerDock, StEmpty, StHead, StHold, StMono, StNotice, StPage, StPill, StRow, StRows, StSegmented, StSkeleton, StState, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import { TextArea } from "@/components/ui/TextInput";
import styles from "./booking-canon.module.css";

/** Fictional canon content. Every decision stays in browser memory; no calendar or email requests. */
export function BookingCanonPreview({ screen, state = "ready", mode: themeMode = "light" }: { mode?: "light" | "dark"; screen: "confirm" | "rules" | "sessions"; state?: string }) {
  const [receipt, setReceipt] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [offering, setOffering] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [mode, setMode] = useState<"request" | "instant">("request");
  const [ask, setAsk] = useState("");
  const title = screen === "sessions" ? "Mediation sessions" : screen === "rules" ? "How sessions get booked" : "Harbor & Lane LLP asks for Fri, Oct 16";
  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode={themeMode} className={styles.preview}><StrelvaShell ownerBrand={PREVIEW_STRELVA_AGENCY_BRAND} appBase="/preview/strelva" title="Fictional preview · no live actions" businessContext={<StTextButton href="/preview/strelva?scenario=mooney&systems=on">The Mooney Firm</StTextButton>} accountName="Sheri" signOut={null} systemsReleased pinned={[{ id: "website", kind: "website", title: "attymooney.com", href: "/preview/strelva?scenario=mooney&systems=on" }, { id: "inquiries", kind: "inquiries", title: "Inquiries", href: "/preview/strelva/inquiries" }, { id: "intake", kind: "app", title: "Mediation intake", href: "/preview/strelva?scenario=mooney&systems=on" }, { id: "sessions", kind: "bookings", title: "Mediation sessions", href: "/preview/strelva/bookings?view=sessions", current: true }]}><StPage width={screen === "confirm" ? "wide" : "column"}>
    <StHead crumb={{ label: screen === "sessions" ? "Systems" : "Mediation sessions", href: screen === "sessions" ? "/preview/strelva/workspace/systems" : "/preview/strelva/bookings?view=sessions" }} title={title} beacon={screen === "confirm" ? "need" : undefined} meta={screen === "sessions" ? "Draft · not bookable from the site yet" : screen === "rules" ? "Changes here go through Needs you before visitors see them." : "Full day · requested Wed 4:12 PM · confirm by Mon so they can plan"} />
    {state === "loading" ? <div className="space-y-5"><StSkeleton label="Reading the booking request" width="60%" /><StSkeleton width="85%" /><StSkeleton width="70%" /></div>
      : state === "permission" ? <StNotice tone="critical">You need the business owner&apos;s permission to decide bookings.</StNotice>
      : state === "error" ? <StNotice tone="critical">The calendar could not be read. This request is kept. Check the calendar before confirming.</StNotice>
      : state === "empty" ? <StEmpty>{screen === "rules" ? "No booking rules are prepared yet. Ask Strelva to prepare them." : screen === "sessions" ? "No session dates are prepared yet. Ask Strelva to prepare them." : "No booking requests need you."}</StEmpty>
      : screen === "rules" ? <>
        <StRows>
          <StRow kind="How a request becomes a session" title={<StSegmented label="Booking mode" value={mode} options={[{ value: "request", label: "Sheri confirms each one" }, { value: "instant", label: "Book instantly" }]} onChange={value => { setMode(value); setReceipt("This change is prepared for Needs you in this fictional preview. Visitor bookings have not changed."); }} />} detail="Instant booking suits fixed-length services, like a class or a repair visit." />
          <StRow kind="Sessions · from the business record" title="Half day · 4 hours · 9–1 or 1–5" detail="Full day · 8 hours · 9–5" />
          <StRow kind="When" title="Mon–Fri · no weekends" detail="At least 2 business days’ notice · up to 60 days ahead" />
          <StRow kind="Between sessions" title="1 session a day at most" />
          <StRow kind="Calendar" title={<StState kind="live">Sheri — Work · Google · read 3 min ago</StState>} detail="Busy times are never shown to visitors, only open dates." />
          <StRow kind="Reminders" title="Day before, 4 PM, from sheri@attymooney.com" detail="Text message reminders: off" />
        </StRows>
        <StNotice>Fictional preview. Reminders and owner notices stay off during rollout.</StNotice>
      </> : screen === "sessions" ? <>
        <StNotice tone="need"><div className="flex flex-wrap items-center justify-between gap-3"><span>Let attorneys request these dates?</span><StPill onClick={() => setReceipt("Review opened in this fictional preview. Mediation sessions remain a draft.")}>Review</StPill></div></StNotice>
        <div className="space-y-5">{[
          { date: "Wed, Oct 14", sessions: [{ name: "Half-day · [Matter A]", time: "9 am – 1 pm", reserved: true }, { name: "Open", time: "1–5 pm", reserved: false }] },
          { date: "Fri, Oct 16", sessions: [{ name: "Open", time: "9 am – 1 pm", reserved: false }] },
          { date: "Wed, Oct 21", sessions: [{ name: "Full-day · [Matter B]", time: "9 am – 5 pm", reserved: true }] },
          { date: "Fri, Oct 23", sessions: [{ name: "Open", time: "9 am – 5 pm", reserved: false }] },
        ].map(day => <section key={day.date} className="space-y-2" aria-label={day.date}><h2 className="text-sm font-medium">{day.date}</h2>{day.sessions.map(session => <StSurface key={session.time} label={session.name}><p className="text-sm font-medium">{session.name}</p><p className="mt-1 text-sm text-gray-muted"><StMono>{session.time}</StMono>{session.reserved ? <> · <StState kind="live">Reserved</StState></> : null}</p></StSurface>)}</section>)}</div>
      </> : <div className={styles.decision}>
        <div className={styles.calendar} aria-label="Fictional calendar comparison: Thursday October 15, Friday October 16, Monday October 19">
          <div className={styles.hours}>{["8", "9", "10", "11", "12", "1", "2", "3", "4", "5"].map(hour => <StMono key={hour}>{hour}</StMono>)}</div>
          {[{ day: "Thu 15", title: "Arbitration · prep", detail: "Busy · from Google", kind: "busy" }, { day: "Fri 16", title: "Harbor & Lane LLP", detail: "Requested · full day", kind: "request" }, { day: "Mon 19", title: "Court · Erie County", detail: "Busy · from Google", kind: "busy" }].map(day => <section className={styles.day} key={day.day} aria-label={day.day}><h2>{day.day}</h2><div className={styles.dayTrack}><div className={styles.event} data-kind={day.kind}><strong>{day.title}</strong><StMono>{day.detail}</StMono></div></div></section>)}
        </div>
        <div className={styles.phoneCalendar}><StSurface label="Calendar availability"><p className="text-sm text-gray-muted">Fri 16 on Sheri — Work</p><p className="mt-2"><StState kind="live">Free all day</StState></p><p className="mt-3 text-sm text-gray-muted">Thu 15</p><p className="mt-2 text-sm text-gray-muted">Arbitration · prep, 9–12</p></StSurface></div>
        <div className={styles.request}>
          <div className={styles.requestText}><p className={styles.label}>From the request</p><p>Two parties, both with counsel. Contract dispute over a supply agreement. Prefers in person.</p><p className="mt-2 text-sm text-gray-muted">Contact: J. Harbon, Harbor &amp; Lane LLP</p></div>
          <div className={styles.availability}><StState kind="live">Fri 16 is free on Sheri — Work</StState></div>
          <div className={styles.actions}>
            <StHold block disabled={Boolean(receipt)} label="Hold to confirm Fri 16" onAccept={() => setReceipt("Fri 16 confirmed in this fictional preview. No calendar change or email was sent.")} />
            <div className={styles.alternatives}><StTextButton disabled={Boolean(receipt)} onClick={() => setOffering(!offering)}>Offer other dates</StTextButton><StTextButton disabled={Boolean(receipt)} onClick={() => setDeclining(!declining)}>Decline with a short reason</StTextButton></div>
            <div className={styles.desktopDates}><p className="text-sm text-gray-muted">Or offer another date</p><div className="mt-2 flex flex-wrap gap-2">{["Wed 14 pm", "Fri 23"].map(date => <StPill key={date} variant="soft" disabled={Boolean(receipt)} aria-pressed={dates.includes(date)} onClick={() => { setOffering(true); setDates(current => current.includes(date) ? current.filter(item => item !== date) : [...current, date]); }}>{date}</StPill>)}</div><p className="mt-2 text-xs text-gray-muted">Nothing is held until they pick a date.</p></div>
            {offering ? <StSurface label="Offer other dates"><p className="text-sm">Choose open dates. Nothing is held until the customer picks one.</p><div className="my-3 flex flex-wrap gap-2">{["Wed 14 pm", "Fri 23"].map(date => <StPill key={date} variant="soft" aria-pressed={dates.includes(date)} onClick={() => setDates(current => current.includes(date) ? current.filter(item => item !== date) : [...current, date])}>{date}</StPill>)}</div><StPill variant="soft" disabled={!dates.length || Boolean(receipt)} onClick={() => setReceipt("Other dates prepared in this fictional preview. No email was sent.")}>Prepare date offer</StPill></StSurface> : null}
            {declining ? <StSurface label="Decline reason"><TextArea label="A short reason" required value={reason} onChange={event => setReason(event.target.value)} /><div className="mt-3"><StPill variant="soft" disabled={!reason.trim() || Boolean(receipt)} onClick={() => setReceipt("Request declined in this fictional preview. No email was sent.")}>Decline request</StPill></div></StSurface> : null}
          </div>
        </div>
      </div>}
    {receipt ? <StToast>{receipt}</StToast> : null}
    <span className="sr-only">Fictional booking data; preview controls do not make outside writes.</span>
  </StPage><StComposerDock><StComposerBar scope="Mediation sessions" placeholder={screen === "sessions" ? "Ask about Mediation sessions" : screen === "rules" ? "Ask to change how sessions are booked" : "Ask about this request"} value={ask} onChange={setAsk} onSubmit={() => { setReceipt("Your message stays in this fictional preview. No booking or rule changed."); setAsk(""); }} /></StComposerDock><WorkspacePhoneTabs className={styles.mobileTabs} appBase="/preview/strelva" systemsReleased active={screen === "confirm" ? "requests" : "system"} systemHref="/preview/strelva/bookings?view=sessions" /></StrelvaShell></div>;
}
