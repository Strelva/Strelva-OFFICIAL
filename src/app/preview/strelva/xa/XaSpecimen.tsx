"use client";

import { useEffect, useRef, useState } from "react";
import { StPill, StTextButton } from "@/components/ui/strelva/Kit";
import { XaAnswers, XaBrowser, XaCollapse, XaComposer, XaGlide, XaGreeting, XaHeadline, XaPanel, XaPebble, XaScene, XaStatus, XaSystemTile, XaUndo, XaWorking, type XaPose, type XaSystemKind, type XaWorkingStep } from "@/components/ui/strelva/Xa";
import styles from "./xa-specimen.module.css";

const KINDS: readonly XaSystemKind[] = ["website", "bookings", "inbox", "form", "listing", "reviews", "newsletter", "payments", "documents", "phone"];
const POSES: readonly XaPose[] = ["pebble", "fixing", "waving", "adds", "lineup", "resting", "website"];
const STEP_LABELS = ["Closed Thu and Fri on /book", "Opened harbordental.com/book to read it back", "Checked it on a phone screen"];
const DAYS = [["Mon", "23", ["8:00", "10:30", "2:00"]], ["Tue", "24", ["9:15", "1:30", "3:45"]], ["Wed", "25", ["8:30", "11:00", "2:15"]], ["Thu", "26", null], ["Fri", "27", null], ["Sat", "28", ["9:00", "11:00"]]] as const;
const QUEUE = [
  { id: "n", initial: "N", color: "#9C522C", title: "Showings calendar stopped syncing with Google Calendar", detail: "North Coast Realty · since 6:14 am · Pebble is saving requests", action: "Reconnect" },
  { id: "l", initial: "L", color: "#4F7590", title: "Ruth asked for a Spanish version of the intake form", detail: "Lakeview Mediation · due Friday", action: "Open" },
  { id: "h", initial: "H", color: "#2F5236", title: "After-hours reply is ready to offer as a Possibility", detail: "From your Library · yesterday", action: "Review" },
];

type YesState = "waiting" | "going" | "live";

/** Fictional content only. The XA kit in its states, and the yes played with real components. */
export function XaSpecimen({ mode }: { mode: "light" | "dark" }) {
  const [yes, setYes] = useState<YesState>("waiting");
  const [steps, setSteps] = useState<XaWorkingStep[]>([]);
  const [undone, setUndone] = useState(false);
  const timers = useRef<number[]>([]);
  const [pose, setPose] = useState<XaPose>("pebble");
  const [nav, setNav] = useState("Today");
  const [queue, setQueue] = useState(QUEUE.map(item => item.id));
  const [ask, setAsk] = useState("");
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function putLive() {
    setYes("going"); setUndone(false); setSteps([{ label: STEP_LABELS[0], state: "active" }]);
    // Fixture timing standing in for the server's real progress events.
    const at = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, ms));
    at(650, () => setSteps([{ label: STEP_LABELS[0], state: "done" }, { label: STEP_LABELS[1], state: "active" }]));
    at(1300, () => setSteps([{ label: STEP_LABELS[0], state: "done" }, { label: STEP_LABELS[1], state: "done" }, { label: STEP_LABELS[2], state: "active" }]));
    at(1950, () => { setSteps(STEP_LABELS.map(label => ({ label, state: "done" }))); setYes("live"); });
  }
  function undo() { timers.current.forEach(window.clearTimeout); setYes("waiting"); setSteps([]); setUndone(true); }

  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode={mode} className={styles.root}>
    <header className={styles.top}>
      <div><h1>XA kit</h1><p>Fictional content. Every XA part in its states, and the yes played with the real components.</p></div>
      <StTextButton href={`/preview/strelva/xa?mode=${mode === "dark" ? "light" : "dark"}`}>{mode === "dark" ? "Light" : "Dark"}</StTextButton>
    </header>

    <section className={styles.block} aria-labelledby="xa-yes">
      <h2 id="xa-yes" className={styles.label}>The yes · press Put it live, then Undo</h2>
      <div className={styles.yes}>
        <div className={styles.brief}>
          <XaSystemTile kind="bookings" size={56} />
          <XaHeadline quiet={yes === "live" ? "Strelva read the page back at 8:11." : "Your yes puts it live."}>{yes === "live" ? "Thanksgiving hours are live." : "Maya at North Studio closed online booking for Thanksgiving."}</XaHeadline>
          <XaAnswers rows={[["Patients see", "No times on Thu and Fri, Nov 26–27."], ["Anything else", "Saturday stays 9–1. Nothing else moves."], ["Take it back", "One click, any time, from Minutes."]]} />
          <div className={styles.undoSlot}>{yes === "live" ? <XaUndo onUndo={undo} windowMs={5000}>Live on your booking page</XaUndo> : undone ? <XaUndo>Undone. Nothing else changed.</XaUndo> : null}</div>
        </div>
        <XaPanel width={460} status={yes === "waiting" ? <XaStatus kind="wait">Waits for you</XaStatus> : yes === "going" ? <XaStatus kind="working">Going live</XaStatus> : <XaStatus kind="live">Live · read back 8:11</XaStatus>} meta="Prepared by Maya, 4:12 pm">
          <XaBrowser address="harbordental.com/book" flat>
            <div><p className={styles.pageTitle}>Book a visit</p><p className={styles.pageSub}>Week of Nov 23 · Closed Thu–Fri for Thanksgiving</p></div>
            <div className={styles.week}>{DAYS.map(([day, date, times]) => <div key={day} className={styles.day}><span>{day}</span><b data-closed={!times || undefined}>{date}</b>{times ? times.map(time => <i key={time}>{time}</i>) : <i data-closed={yes === "live" ? "live" : "waiting"}>Closed</i>}</div>)}</div>
          </XaBrowser>
          {yes === "waiting" ? <div className={styles.actions}><StPill size="lg" block onClick={putLive}>Put it live</StPill><StTextButton tone="accent">Not yet</StTextButton></div>
            : <XaWorking done={yes === "live"} title={yes === "live" ? "Live on your booking page" : "Putting it live on your booking page"} steps={steps} />}
        </XaPanel>
      </div>
    </section>

    <section className={styles.block} aria-labelledby="xa-queue">
      <h2 id="xa-queue" className={styles.label}>Handled rows collapse; the rows below travel up</h2>
      <div className={styles.list}>
        {QUEUE.map(item => <XaCollapse key={item.id} show={queue.includes(item.id)}>
          <div className={styles.row}><span className={styles.square} style={{ background: item.color }}>{item.initial}</span><div className={styles.rowText}><p>{item.title}</p><small>{item.detail}</small></div><StPill variant="soft" onClick={() => setQueue(current => current.filter(id => id !== item.id))}>{item.action}</StPill></div>
        </XaCollapse>)}
        {queue.length < QUEUE.length ? <StTextButton onClick={() => setQueue(QUEUE.map(item => item.id))}>Bring them back</StTextButton> : null}
      </div>
    </section>

    <section className={styles.block} aria-labelledby="xa-nav">
      <h2 id="xa-nav" className={styles.label}>Selection glides; the page itself swaps instantly</h2>
      <div className={styles.navDemo}>
        <nav className={styles.nav} aria-label="Specimen navigation">{["Today", "Requests", "Minutes"].map(item => <button key={item} type="button" className={styles.navItem} aria-current={nav === item ? "page" : undefined} onClick={() => setNav(item)}><XaGlide group="specimen" active={nav === item} /><span>{item}</span></button>)}
          <p className={styles.navHead}>Your business</p>
          {(["website", "bookings", "inbox", "listing"] as const).map(kind => <button key={kind} type="button" className={styles.navItem} aria-current={nav === kind ? "page" : undefined} onClick={() => setNav(kind)}><XaGlide group="specimen" active={nav === kind} /><XaSystemTile kind={kind} /><span>{kind[0]!.toUpperCase() + kind.slice(1)}</span></button>)}
        </nav>
        <div className={styles.navPage}><XaGreeting title={nav === "Today" ? "Good morning, Dr. Lin." : nav}>{nav === "Today" ? "Nothing needs you. Everything passed its checks at 7:02." : "This page swapped with no animation, the way Linear does it."}</XaGreeting></div>
      </div>
    </section>

    <section className={styles.block} aria-labelledby="xa-composer">
      <h2 id="xa-composer" className={styles.label}>Composer, carrying what waits</h2>
      <XaComposer waiting={{ kicker: "Waits for you · from Maya at North Studio", title: "Close online booking for Thanksgiving", who: { initial: "M", color: "#3A3C38" }, action: <StPill variant="soft">Review</StPill> }} placeholder="Ask Strelva for anything" value={ask} onChange={setAsk} onSubmit={() => setAsk("")} scope="Harbor Dental" onAdd={() => undefined} />
      <XaComposer waiting={{ kicker: "Waits for you", title: "Confirm the insurance you take", who: { pebble: true }, action: <StPill variant="soft">Confirm</StPill> }} placeholder="Ask Strelva for anything" value="" onChange={() => undefined} onSubmit={() => undefined} scope="Harbor Dental" />
    </section>

    <section className={styles.block} aria-labelledby="xa-characters">
      <h2 id="xa-characters" className={styles.label}>Systems and Pebble</h2>
      <div className={styles.tiles}>{KINDS.map(kind => <figure key={kind}><XaSystemTile kind={kind} size={48} /><figcaption>{kind}</figcaption></figure>)}<figure><XaPebble size={48} /><figcaption>Pebble</figcaption></figure></div>
      <div className={styles.scenes}>
        <XaScene pose={pose} size={280} label={`Pebble, ${pose}`} />
        <div className={styles.poseList}>{POSES.map(item => <StPill key={item} variant={item === pose ? "primary" : "soft"} onClick={() => setPose(item)}>{item}</StPill>)}</div>
      </div>
      <div className={styles.statuses}><XaStatus kind="live">Live</XaStatus><XaStatus kind="wait">Waits for you</XaStatus><XaStatus kind="draft">Draft</XaStatus><XaStatus kind="working">Working</XaStatus><XaStatus kind="down">Not reachable</XaStatus></div>
    </section>
  </div>;
}
