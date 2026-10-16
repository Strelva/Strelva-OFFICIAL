"use client";
/**
 * XA foundation preview: the kit in place inside a real owner screen and a
 * real agency screen, inside the real StrelvaShell and XA sidebar. Fictional
 * fixtures only (Harbor Dental, Dr. Amy Lin, North Studio, Maya Okafor); no
 * server calls, no sends. Screen composition here is a reference for lanes,
 * not a shipped route.
 */
import { useEffect, useRef, useState } from "react";
import { StrelvaShell, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaClientLink, StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import {
  XaAnswers, XaButton, XaButtonLink, XaChoices, XaComposer, XaComposerDock, XaDecision, XaEmpty, XaField, XaHeadline, XaInitial, XaLabel, XaLede, XaLines,
  XaMark, XaPage, XaPebbleScene, XaRollingCount, XaRow, XaRows, XaSays, XaSegmented, XaSheet, XaStatus, XaStream, XaSystemTile, XaTextLink, XaWorking, XaYes,
  type XaWorkingStep, type XaYesState,
} from "@/components/ui/strelva/Xa";
import styles from "./xa-foundation-preview.module.css";

export type XaPreviewScreen = "owner" | "yes" | "agency" | "record";
export type XaPreviewState = "ready" | "empty" | "loading" | "error";

const BASE = "/preview/strelva/xa";
const DAYS = [["Mon", "23", ["8:00", "10:30", "2:00"]], ["Tue", "24", ["9:15", "1:30", "3:45"]], ["Wed", "25", ["8:30", "11:00", "2:15"]], ["Thu", "26", null], ["Fri", "27", null], ["Sat", "28", ["9:00", "11:00"]]] as const;
const YES_STEPS = ["Closed Thu and Fri on harbordental.com/book", "Opened the booking page to read it back", "Checked it on a phone screen"];
const CLIENT_COLORS = { harbor: "#2f5236", north: "#9c522c", lakeview: "#4f7590", fieldwork: "#6b6f68" } as const;

function href(screen: XaPreviewScreen, mode: "light" | "dark", extra = "") {
  return `${BASE}?screen=${screen}${mode === "dark" ? "&mode=dark" : ""}${extra}`;
}

export function XaFoundationPreview({ screen: initialScreen, state, mode }: { screen: XaPreviewScreen; state: XaPreviewState; mode: "light" | "dark" }) {
  const [screen, setScreen] = useState<XaPreviewScreen>(initialScreen);
  const [yes, setYes] = useState<XaYesState>("waiting");
  const [steps, setSteps] = useState<XaWorkingStep[]>([]);
  const [notYet, setNotYet] = useState(false);
  const [ask, setAsk] = useState("");
  const [asked, setAsked] = useState("");
  const [reconnected, setReconnected] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const go = (next: XaPreviewScreen) => { setScreen(next); window.history.replaceState(null, "", href(next, mode, state !== "ready" ? `&state=${state}` : "")); };

  function putLive() {
    setYes("going"); setSteps([{ id: "0", label: YES_STEPS[0], state: "active" }]);
    // Fixture timing standing in for the server's real progress events.
    const at = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, ms));
    at(700, () => setSteps([{ id: "0", label: YES_STEPS[0], state: "done" }, { id: "1", label: YES_STEPS[1], state: "active" }]));
    at(1400, () => setSteps([{ id: "0", label: YES_STEPS[0], state: "done" }, { id: "1", label: YES_STEPS[1], state: "done" }, { id: "2", label: YES_STEPS[2], state: "active" }]));
    at(2100, () => { setSteps(YES_STEPS.map((label, index) => ({ id: String(index), label, state: "done" }))); setYes("live"); });
  }
  function undo() { timers.current.forEach(window.clearTimeout); setYes("undone"); setSteps([]); }

  const agencyView = screen === "agency";
  const yesWaiting = yes === "waiting" || yes === "going";
  const pinned: StrelvaPinnedItem[] = [
    { id: "website", kind: "website", title: "Website", href: href("owner", mode), detail: "Live" },
    { id: "bookings", kind: "bookings", title: "Bookings", href: href("yes", mode), onOpen: () => go("yes"), current: screen === "yes", ...(yesWaiting ? { state: "waits" as const } : { detail: "31 this week" }) },
    { id: "inbox", kind: "inquiries", title: "Inbox", href: href("owner", mode), detail: "3 new" },
    { id: "listing", kind: "listing", title: "Google listing", href: href("owner", mode), state: "draft" },
  ];
  const clients: StrelvaClientLink[] = [
    { id: "harbor", name: "Harbor Dental", href: href("owner", mode), onOpen: () => go("owner"), detail: "Dr. Lin", color: CLIENT_COLORS.harbor },
    { id: "north", name: "North Coast Realty", href: href("agency", mode), detail: reconnected ? "Dana" : undefined, waits: !reconnected, color: CLIENT_COLORS.north },
    { id: "lakeview", name: "Lakeview Mediation", href: href("agency", mode), detail: "Ruth", color: CLIENT_COLORS.lakeview },
    { id: "fieldwork", name: "Fieldwork Studio", href: href("agency", mode), detail: "Ana", color: CLIENT_COLORS.fieldwork },
  ];
  const navigate = (section: StrelvaSection) => {
    if (section === "home" || section === "needs-you") go("owner");
    else if (section === "settings" || section === "access") go("record");
  };
  const shell = {
    appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode,
    notice: <p className={styles.notice}>Fictional preview. Nothing here reaches a real business.</p>,
  } as const;

  const body = state === "loading" ? <LoadingState /> : state === "error" ? <ErrorState retryHref={href(screen, mode)} /> : state === "empty" && !agencyView ? <EmptyState /> : null;

  if (agencyView) return <StrelvaShell {...shell} workspaceName="North Studio" title="Today" accountName="Maya Okafor" active="home" onNavigate={navigate}
    agencyNavigation={{ active: "home", queueCount: reconnected ? 2 : 3, clients, hrefs: { home: href("agency", mode), queue: href("agency", mode), library: href("agency", mode), minutes: href("agency", mode) } }}>
    {body ?? <div className={styles.split}>
      <div className={styles.lead}>
        <XaMark size={40} />
        <div className={styles.greeting}>
          <XaHeadline size="lg">Good morning, Maya.</XaHeadline>
          <XaLede>{reconnected ? "Every client is running. Harbor Dental and Fieldwork wait on their owners. Lakeview is quiet." : "North Coast Realty needs you. Harbor Dental and Fieldwork wait on their owners. Lakeview is quiet."}</XaLede>
        </div>
        <XaComposer value={ask} onChange={setAsk} onSubmit={() => { setAsked(ask); setAsk(""); }} placeholder="Ask Strelva for anything" scope={{ label: "All clients", state: "live" }} onAdd={() => undefined}
          waiting={reconnected ? undefined : { kicker: "North Coast Realty · needs you", title: "Showings calendar stopped syncing. Reconnect Google Calendar", from: { name: "North Coast Realty", color: CLIENT_COLORS.north }, action: <XaButton size="sm" onClick={() => setReconnected(true)}>Reconnect</XaButton> }} />
        {asked ? <AskReply question={asked} /> : null}
        <section aria-labelledby="xa-clients-label" className={styles.stack}>
          <XaLabel id="xa-clients-label">Clients · time this month</XaLabel>
          <XaRows label="Clients">
            <XaRow lead={<XaInitial name="Harbor Dental" color={CLIENT_COLORS.harbor} />} title="Harbor Dental" detail="Waiting on Dr. Lin · new cleaning prices" meta="96 min" href={href("owner", mode)} onClick={() => go("owner")} />
            <XaRow lead={<XaInitial name="North Coast Realty" color={CLIENT_COLORS.north} />} title="North Coast Realty" detail={reconnected ? "Calendar syncing again · Maya reconnected it" : "Needs you · calendar sync"} tone={reconnected ? undefined : "waits"} meta={<><XaRollingCount value={reconnected ? 76 : 74} /> min</>} />
            <XaRow lead={<XaInitial name="Fieldwork Studio" color={CLIENT_COLORS.fieldwork} />} title="Fieldwork Studio" detail="Waiting on Ana · print prices" meta="39 min" />
            <XaRow lead={<XaInitial name="Lakeview Mediation" color={CLIENT_COLORS.lakeview} />} title="Lakeview Mediation" detail="Quiet" meta="22 min" />
          </XaRows>
        </section>
      </div>
      <aside className={styles.side} aria-label="What Pebble is doing">
        <XaPebbleScene pose={reconnected ? "resting" : "fixing"} size={300} label={reconnected ? "Pebble resting beside the calendar" : "Pebble fixing the showings calendar"} />
        <XaWorking state={reconnected ? "done" : "working"} title={reconnected ? "North Coast's showings are syncing again" : "Pebble is holding North Coast's showings"} steps={reconnected
          ? [{ id: "a", label: "Saved 3 showing requests since 6:14", state: "done" }, { id: "b", label: "Sent the 3 held requests to Google Calendar", state: "done" }]
          : [{ id: "a", label: "Saved 3 showing requests since 6:14", state: "done" }, { id: "b", label: "Told visitors Dana confirms by noon", state: "done" }, { id: "c", label: "Waiting for you to reconnect Google", state: "active" }]} />
      </aside>
    </div>}
  </StrelvaShell>;

  const owner = { ...shell, workspaceName: "Harbor Dental", accountName: "Dr. Amy Lin", pinned: state === "empty" ? [] : pinned, onNavigate: navigate, agency: { name: "North Studio", person: "Maya", color: CLIENT_COLORS.harbor } };

  if (screen === "record") return <StrelvaShell {...owner} title="Business record" active="settings"><RecordScreen /></StrelvaShell>;

  if (screen === "yes") {
    const live = yes === "live";
    return <StrelvaShell {...owner} title="Bookings" active="system">
      <div className={styles.yesLayout}>
        <div className={styles.yesBrief}>
          <XaSystemTile kind="bookings" size={56} label="Bookings" />
          {yes === "undone" ? <XaHeadline quiet="Your booking page shows normal hours.">You took it back.</XaHeadline>
            : live ? <XaHeadline quiet="Strelva read the page back at 8:11.">Thanksgiving hours are live.</XaHeadline>
              : <XaHeadline quiet="Your yes puts it live.">Maya at North Studio closed online booking for Thanksgiving.</XaHeadline>}
          <XaAnswers rows={[["Patients see", "No times on Thu and Fri, Nov 26 and 27."], ["Anything else", "Saturday stays 9 to 1. Nothing else moves."], ["Already booked", "No one is booked on those days."], ["Take it back", "One click, any time, from Minutes."]]} />
        </div>
        <XaDecision label="The change to your booking page" status={yes === "undone" ? <XaStatus kind="live">Back to normal hours</XaStatus> : live ? <XaStatus kind="live" breathe>Live · read back 8:11</XaStatus> : yes === "going" ? <XaStatus kind="working">Going live</XaStatus> : <XaStatus kind="waits">Waits for you</XaStatus>} meta="Prepared by Maya, yesterday 4:12 pm"
          yes={<XaYes state={yes} onYes={putLive} onNotYet={() => { setNotYet(true); go("owner"); }} onUndo={undo} onUndoExpired={() => setYes("expired")} working={{ title: live ? "Live on your booking page" : "Putting it live on your booking page", steps }} liveLabel="Live on your booking page" settled={yes === "undone" ? "Undone. Nothing else changed." : "Live. Take it back any time from Minutes."} />}>
          <BookingPage closedLive={live} />
        </XaDecision>
      </div>
      <XaComposerDock><div className={styles.dock}><XaComposer value={ask} onChange={setAsk} onSubmit={() => setAsk("")} placeholder="Ask for a different change" onAdd={() => undefined} /></div></XaComposerDock>
    </StrelvaShell>;
  }

  return <StrelvaShell {...owner} title="Today" active="home" needsYou={{ count: yesWaiting && state === "ready" ? 1 : 0 }}>
    {body ?? <div className={styles.split}>
      <div className={styles.lead}>
        <XaMark size={40} />
        <div className={styles.greeting}>
          <XaHeadline size="lg">Good morning, Dr. Lin.</XaHeadline>
          <XaLede>{yesWaiting ? "One thing waits for you. Your website, bookings and inbox are running." : "Nothing needs you. Everything passed its checks at 7:02."}</XaLede>
        </div>
        <XaComposer value={ask} onChange={setAsk} onSubmit={() => { setAsked(ask); setAsk(""); }} placeholder="Ask Strelva for anything" scope={{ label: "Harbor Dental", state: "live" }} onAdd={() => undefined}
          waiting={yesWaiting ? { kicker: "Waits for you · from Maya", title: "Close online booking for Thanksgiving, Nov 26 and 27", from: { name: "Maya", color: "#3a3c38" }, action: <XaButton size="sm" onClick={() => go("yes")}>Review</XaButton> } : undefined} />
        {notYet ? <XaSays links={[<XaTextLink key="open" onClick={() => { setNotYet(false); go("yes"); }}>Open it</XaTextLink>]}>You said not yet. It stays with Maya until you ask for it again.</XaSays> : null}
        {asked ? <AskReply question={asked} /> : null}
      </div>
      <aside className={styles.side} aria-label="Since yesterday">
        <XaPebbleScene pose="resting" size={300} label="Pebble resting beside the bookings calendar" />
        <div className={styles.since}>
          <XaLabel>Since yesterday</XaLabel>
          <XaLines label="Since yesterday" lines={[
            { time: "6:12", text: "4 people booked online overnight. First up: Ana R., cleaning at 10:30." },
            { time: "6:40", text: "Strelva renewed the security certificate for harbordental.com." },
            { time: "4:12 pm", text: "Maya at North Studio started on Thanksgiving hours. It came to you when it was ready." },
          ]} />
        </div>
      </aside>
    </div>}
  </StrelvaShell>;
}

function AskReply({ question }: { question: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setDone(true), 900); return () => window.clearTimeout(timer); }, []);
  return <section className={styles.reply} aria-label="Strelva's answer">
    <p className={styles.bubble}>{question}</p>
    {done ? <XaStream text="This is a fictional preview, so nothing was read or changed. In the real workspace Strelva answers here, names what it looked at, and asks before anything goes live." />
      : <XaWorking title="Reading your question" steps={[{ id: "r", label: "Looking through Harbor Dental's Systems", state: "active" }]} />}
  </section>;
}

function BookingPage({ closedLive }: { closedLive: boolean }) {
  const [view, setView] = useState<"after" | "now">("after");
  const after = view === "after";
  return <div className={styles.stack}>
    <XaSegmented label="Which version of the page" value={view} onChange={setView} block options={[{ value: "now", label: "Your page now" }, { value: "after", label: closedLive ? "Live now" : "After your yes" }]} />
    <XaPage address="harbordental.com/book" title="Book a visit" flat>
      <p className={styles.pageSub}>{after ? "Week of Nov 23 · Closed Thu and Fri for Thanksgiving" : "Week of Nov 23"}</p>
      <div className={styles.week}>{DAYS.map(([day, date, times]) => {
        const closed = after && !times;
        const shown = times ?? ["9:00", "1:30"];
        return <div key={day} className={styles.day}><span>{day}</span><b data-closed={closed || undefined}>{date}</b>
          {closed ? <i data-closed="true">Closed</i> : shown.map(time => <i key={time}>{time}</i>)}
        </div>;
      })}</div>
    </XaPage>
  </div>;
}

function RecordScreen() {
  const [editing, setEditing] = useState<string | null>(null);
  const [hours, setHours] = useState("Mon–Fri 8–5 · Sat 9–1");
  const [saturday, setSaturday] = useState<"9-1" | "closed" | "9-3">("9-1");
  const [insurance, setInsurance] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [draft, setDraft] = useState(hours);
  const rows = [
    { id: "hours", label: "Hours", value: hours, readers: ["website", "bookings", "listing"], by: "You · Tuesday" },
    { id: "phone", label: "Phone", value: "(716) 555-0142", readers: ["website", "listing", "form"], by: "Found on your site" },
    { id: "services", label: "Services", value: "Cleanings, fillings, crowns, children's visits", readers: ["website", "bookings"], by: "North Studio · Oct 9" },
  ];
  return <div className={styles.record}>
    <XaHeadline quiet="Every System reads it, so nothing drifts.">Said once, here.</XaHeadline>
    <XaRows label="Business record">
      {rows.map(row => <li key={row.id} className={styles.recordRow}>
        {editing === row.id ? <form className={styles.recordEdit} onSubmit={event => { event.preventDefault(); setHours(draft); setEditing(null); }}>
          <XaField label={row.label} value={draft} onChange={event => setDraft(event.target.value)} hint="Strelva updates every place that reads this, then reads each one back." autoFocus />
          <XaChoices label="On Saturdays" value={saturday} onChange={setSaturday} options={[{ value: "9-1", label: "9 to 1" }, { value: "9-3", label: "9 to 3" }, { value: "closed", label: "Closed" }]} />
          <div className={styles.recordActions}><XaButton type="submit">Save hours</XaButton><XaButton variant="quiet" onClick={() => setEditing(null)}>Cancel</XaButton></div>
        </form> : <>
          <button type="button" className={styles.recordValue} onClick={() => { setDraft(row.value); setEditing(row.id); }} aria-label={`Change ${row.label.toLowerCase()}: ${row.value}`}>
            <small>{row.label}</small><span>{row.value}</span>
          </button>
          <span className={styles.readers} aria-label={`Read by ${row.readers.join(", ")}`}>{row.readers.map(kind => <XaSystemTile key={kind} kind={kind} size={24} />)}</span>
          <span className={styles.saidBy}>{row.by}</span>
        </>}
      </li>)}
      <li className={styles.recordRow}>
        <div className={styles.recordValue} data-static><small>Insurance</small><span>Delta Dental, Cigna, MetLife</span></div>
        <span className={styles.readers} aria-label="Read by website, form and payments"><XaSystemTile kind="website" size={24} /><XaSystemTile kind="form" size={24} /><XaSystemTile kind="payments" size={24} /></span>
        <span className={styles.saidBy}>{insurance ? <XaStatus kind="live" size="sm">You · just now</XaStatus> : <><XaStatus kind="waits" size="sm">Waits for you</XaStatus><XaButton variant="primary" size="sm" onClick={() => setInsurance(true)}>Confirm</XaButton></>}</span>
      </li>
    </XaRows>
    <XaSays links={[<XaTextLink key="remove" onClick={() => setRemoving(true)}>Remove North Studio</XaTextLink>]}>Change a detail here and I update every place that reads it, then read each one back.</XaSays>
    <XaSheet open={removing} onClose={() => setRemoving(false)} title="Remove North Studio?"
      art={<span className={styles.unplug} aria-hidden="true"><XaInitial name="Harbor Dental" size={40} shape="round" /><i /><XaInitial name="North Studio" size={40} shape="round" color="#a3a69f" /></span>}
      actions={<><XaButton variant="primary" size="lg" block onClick={() => setRemoving(false)}>Remove North Studio</XaButton><XaButton variant="quiet" size="lg" onClick={() => setRemoving(false)}>Keep them</XaButton></>}>
      <XaAnswers labelWidth={120} rows={[["You keep", "Your website, bookings, inbox and every record."], ["They lose", "Access to Harbor Dental, from the moment you confirm."], ["In progress", "Thanksgiving hours stay waiting for you."]]} />
    </XaSheet>
  </div>;
}

function EmptyState() {
  return <div className={styles.center}>
    <XaEmpty pose="waving" title="Nothing is running yet." job="Pebble read harbordental.com: 14 pages and 1 form"
      action={<XaButton variant="primary">Bring in harbordental.com</XaButton>} secondary={<XaTextLink>or say what you need</XaTextLink>}>
      Strelva found harbordental.com. Bring it in as it is; nothing about it changes until you say so.
    </XaEmpty>
  </div>;
}

function LoadingState() {
  return <div className={styles.split} aria-busy="true">
    <div className={styles.lead}>
      <XaMark size={40} />
      <div className={styles.greeting}><StSkeleton width="70%" label="Loading Harbor Dental" /><StSkeleton width="90%" /></div>
      <XaComposer value="" onChange={() => undefined} onSubmit={() => undefined} placeholder="Ask Strelva for anything" disabled />
    </div>
  </div>;
}

function ErrorState({ retryHref }: { retryHref: string }) {
  return <div className={styles.center}>
    <section className={styles.error} aria-labelledby="xa-error-title">
      <XaPebbleScene pose="fixing" size={200} label="Pebble fixing the connection" />
      <XaHeadline as="h2" size="sm" id="xa-error-title" quiet="Your website, bookings and inbox keep running.">Harbor Dental did not load just now.</XaHeadline>
      <XaWorking title="Pebble is retrying the connection" steps={[{ id: "1", label: "Last good read at 7:02", state: "done" }]} />
      <XaButtonLink href={retryHref}>Try again</XaButtonLink>
    </section>
  </div>;
}
