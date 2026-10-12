"use client";

import { actorLabel } from "@/platform/presentation/actor";

import { useEffect, useRef, useState } from "react";
import { Menu, LockKeyhole } from "lucide-react";
import { AppFrame } from "@/experience/app-frame/AppFrame";
import { PREVIEW_STRELVA_AGENCY_BRAND } from "./chrome-fixture";
import { StrelvaSidebar } from "@/experience/app-frame/StrelvaSidebar";
import { StComposerBar, StComposerDock, StEmpty, StHead, StHold, StLabel, StLedger, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSegmented, StSkeleton, StState, StSteps, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import styles from "./website-canon.module.css";

export type WebsiteCanonView = "review" | "published" | "history" | "pause" | "checks";
export type WebsiteCanonState = "ready" | "loading" | "empty" | "error" | "permission";
const ROOT = "/preview/strelva/website-canon";

/** Fictional Mooney review receipts and checks. All changes stay in memory;
 * this fixture never contacts a site, publishes, pauses, rolls back or sends.
 * The pause frame concerns Mediation sessions, not taking a website offline.
 */
export function WebsiteCanonPreview({ initialView, state = "ready", mode = "light" }: { initialView: WebsiteCanonView; state?: WebsiteCanonState; mode?: "light" | "dark" }) {
  const [view, setView] = useState(initialView);
  const [compare, setCompare] = useState<"before" | "after">("after");
  const [published, setPublished] = useState(initialView === "published" || initialView === "history");
  const [publishStep, setPublishStep] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [rolledBack, setRolledBack] = useState(false);
  const [editing, setEditing] = useState(false);
  const [halfDay, setHalfDay] = useState("[2027 fee]");
  const [fullDay, setFullDay] = useState("[2027 fee]");
  const [message, setMessage] = useState("");
  const [ask, setAsk] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const canAct = state === "ready";
  const href = (next: WebsiteCanonView) => `${ROOT}?view=${next}${mode === "dark" ? "&mode=dark" : ""}`;

  function undo() {
    if (!canAct || !published) return;
    setPublished(false);
    setCompare("before");
    setView("review");
    setMessage("Earlier fees restored in this fictional preview. A new entry records the undo; the original receipt is kept.");
  }

  useEffect(() => {
    if (publishStep === null) return;
    const timer = window.setTimeout(() => {
      if (publishStep < 3) setPublishStep(publishStep + 1);
      else { setPublished(true); setPublishStep(null); setView("published"); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [publishStep]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!canAct || !published || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || event.shiftKey || event.altKey) return;
      if (event.target instanceof HTMLElement && (event.target.closest("input, textarea") || event.target.isContentEditable)) return;
      event.preventDefault();
      setPublished(false); setCompare("before"); setView("review");
      setMessage("Earlier fees restored in this fictional preview. A new entry records the undo; the original receipt is kept.");
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [canAct, published]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [view]);

  function publish() {
    if (!canAct || publishStep !== null || published) return;
    setEditing(false); setMessage(""); setPublishStep(0);
  }

  const review = view === "review";
  const title = view === "history" ? "History" : view === "pause" ? "Mediation sessions" : view === "checks" ? rolledBack ? "The last working copy is restored" : "attymooney.com isn't loading for visitors" : published ? "The fees page is live" : "Update the fees page for 2027";
  const meta = view === "history" ? "Every change to attymooney.com, newest first. Each entry names who acted." : view === "pause" ? paused ? "Paused for new requests · existing reservations kept" : "Live for requests · 2 reservations held" : view === "checks" ? rolledBack ? "Fictional rollback completed · the latest check passed" : "Since 9:14 AM · 3 checks failed · fictional retry sequence" : published ? "Published 2:14 PM · read back 2:14 PM · matches" : "2 lines on 1 page · you asked Tue · nothing is live yet";
  const beacon = view === "history" ? undefined : view === "checks" && !rolledBack ? "down" : view === "pause" && paused ? "draft" : published || view === "pause" || rolledBack ? "live" : "need";

  return <div data-workspace-theme="linen" data-workspace-mode={mode} className={styles.root}>
    <AppFrame showNavigationToggle={false} navigationOpen={navigationOpen} onCloseNavigation={() => setNavigationOpen(false)} navigationTriggerRef={menuRef}
      navigation={<StrelvaSidebar ownerBrand={PREVIEW_STRELVA_AGENCY_BRAND} accountName="Sheri" accountDetail="Fictional preview" signOut={null} systemsReleased appBase="/preview/strelva" mobileOpen={navigationOpen} onCloseMobile={() => setNavigationOpen(false)} workspaceName="The Mooney Firm" pinned={[
        { id: "website", title: "attymooney.com", kind: "website", href: href("review"), current: view !== "pause" },
        { id: "sessions", title: "Mediation sessions", kind: "bookings", href: href("pause"), current: view === "pause" },
      ]} />}
      header={<div className={styles.previewHeader}><button ref={menuRef} type="button" className={styles.menu} aria-label="Open navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Menu size={18} /></button><span>Fictional preview · local changes only</span><StTextButton href={`/preview/strelva/kit?mode=${mode}`}>Kit</StTextButton></div>}>
      <div ref={contentRef} className={styles.scroll}>
        <StPage>
          <StHead crumb={{ label: state === "permission" ? "Home" : "attymooney.com", href: "/preview/strelva?scenario=mooney&systems=on" }} title={state === "ready" ? title : state === "permission" ? "Website unavailable" : state === "loading" ? "Loading website" : state === "error" ? "Website details unavailable" : view === "history" ? "History" : view === "checks" ? "Website checks" : view === "pause" ? "Mediation sessions" : "Website changes"} meta={state === "ready" ? meta : undefined} beacon={state === "ready" ? beacon : undefined} actions={canAct && view !== "pause" && view !== "history" ? <StTextButton onClick={() => setView("history")}>History</StTextButton> : undefined} />
          {state === "loading" ? <StSection title="Loading this website"><StSkeleton label="Loading website details" width="64%" /><StSkeleton width="42%" /><StSkeleton width="80%" /></StSection>
            : state === "permission" ? <StNotice tone="need">This business is unavailable to your account. Ask an owner to restore your access. No website details or controls are available.</StNotice>
              : state === "error" ? <StNotice tone="critical">This website&apos;s details could not be loaded. Nothing changed. <StTextButton href={href(view)}>Try again</StTextButton></StNotice>
                : state === "empty" ? <StEmpty action={<StTextButton href="/preview/strelva">Back to Home</StTextButton>}>No {view === "history" ? "changes have been recorded" : view === "checks" ? "checks have been recorded" : view === "pause" ? "session requests are open" : "website change is ready to review"} yet.</StEmpty>
                  : <>
                    {message ? <StNotice>{message}</StNotice> : null}
                    {(view === "review" || view === "published") && <div className={styles.reviewGrid}>
                      <div className={styles.pageColumn}>
                        {review && publishStep === null && <div className={styles.compare}><StSegmented label="Compare the fees page" value={compare} onChange={setCompare} options={[{ value: "before", label: "Before" }, { value: "after", label: "After" }]} /><StLabel>Highlighted rows change</StLabel></div>}
                        <FeesPage year={compare === "before" && !published ? "2026" : "2027"} halfDay={halfDay} fullDay={fullDay} />
                      </div>
                      <div className={styles.decisionColumn}>
                        {!published && publishStep === null ? <>
                          <StLedger path="/fees" count="2 lines" lines={[{ sign: "-", text: "Half-day: [2026 fee]" }, { sign: "+", text: `Half-day: ${halfDay}` }, { sign: "-", text: "Full-day: [2026 fee]" }, { sign: "+", text: `Full-day: ${fullDay}` }]} />
                          <StSection title="After you publish, Strelva Agency"><StSteps label="After publication" steps={[{ title: "Reads the live page back and compares it", state: "pending" }, { title: "Updates fees in your business record", state: "pending" }, { title: "Keeps the earlier page so you can undo", state: "pending" }]} /></StSection>
                          {editing ? <StSurface label="Edit proposed fees"><form className={styles.editForm} onSubmit={event => { event.preventDefault(); setEditing(false); setMessage("Wording saved for review in this preview. Nothing is live yet."); }}><label>Half-day fee<input value={halfDay} onChange={event => setHalfDay(event.target.value)} required /></label><label>Full-day fee<input value={fullDay} onChange={event => setFullDay(event.target.value)} required /></label><StPill variant="soft" type="submit">Save wording for review</StPill></form></StSurface> : <StHold label="Hold to publish" onAccept={publish} block />}
                          <div className={styles.actions}><StTextButton onClick={() => setMessage("Kept for later in this preview. Nothing is live yet.")}>Not yet</StTextButton><StTextButton onClick={() => setEditing(!editing)}>{editing ? "Cancel editing" : "Change the wording"}</StTextButton></div>
                        </> : <>
                          <StSteps label={published ? "Publication receipt" : "Publishing the fictional page"} steps={[
                            { title: "Published", state: published || (publishStep ?? 0) > 0 ? "done" : "active", time: published ? "2:14:02" : undefined, detail: "1 page, 2 lines." },
                            { title: "Read the live page back", state: published || (publishStep ?? 0) > 1 ? "done" : publishStep === 1 ? "active" : "pending", time: published ? "2:14:09" : undefined, detail: published ? "What visitors see matches what you approved." : "Comparing the approved lines." },
                            { title: "Business record updated", state: published || (publishStep ?? 0) > 2 ? "done" : publishStep === 2 ? "active" : "pending", time: published ? "2:14:10" : undefined, detail: "Fees now read 2027 everywhere Strelva Agency writes them." },
                            { title: "Old page kept", state: published ? "done" : publishStep === 3 ? "active" : "pending", time: published ? "2:14:10" : undefined, detail: "The earlier copy is available to undo." },
                          ]} />
                          {published ? <StToast onUndo={undo}>Published · attymooney.com/fees</StToast> : <StNotice>Rehearsing publication locally. No live site is being changed.</StNotice>}
                        </>}
                      </div>
                    </div>}
                    {view === "history" && <StRows label="Website history">
                      {!published && <StRow lead={<StState kind="live">Today</StState>} title="Earlier fees restored" detail={`${actorLabel({ kind: "agency", displayName: "Strelva Agency" })} · a new release`} end={<StState kind="live">Undo recorded</StState>} />}
                      <StRow lead={<StState kind="live">Today</StState>} title="Fees added to the fees page" detail={actorLabel({ kind: "agency", displayName: "Strelva Agency" })} align="start" end={published ? <StTextButton onClick={undo}>Undo</StTextButton> : <StLabel>Original receipt kept</StLabel>}><div className={styles.historyLedger}><StLedger path="/fees" lines={[{ sign: "+", text: "Half-day and full-day session fees, linked from Fees" }]} /></div></StRow>
                      <StRow lead={<StState kind="need">Earlier</StState>} title="Rebuilt version prepared, not live" detail={actorLabel({ kind: "agency", displayName: "Strelva Agency" })} align="start" end={<StTextButton href="/preview/strelva/rebuild">Compare with live</StTextButton>}><div className={styles.historyLedger}><StLedger path="attymooney.com" lines={[{ sign: "+", text: "10 public pages carried over" }, { sign: "+", text: "239 facts kept their source quotes" }]} /><StLabel>40 facts wait for your confirmation</StLabel></div></StRow>
                      <StRow lead={<StState kind="live">Oct 1</StState>} title="Read the current site" detail={`${actorLabel({ kind: "agency", displayName: "Strelva Agency" })} · 10 public pages read`} />
                    </StRows>}
                    {view === "pause" && <div className={styles.pause}><StSurface label={paused ? "Paused Mediation sessions" : "Pause Mediation sessions"}><StSection title={paused ? "Mediation sessions are paused" : "Pause Mediation sessions?"}><p className={styles.body}>{paused ? "The request form is hidden in this fictional preview. You can resume it whenever you're ready." : "Attorneys stop seeing the request form on attymooney.com. Nothing you already have is lost."}</p><StNotice><StLabel>Stays as it is</StLabel><ul className={styles.kept}><li>Half-day · [Matter A], Wed Oct 14</li><li>Full-day · [Matter B], Wed Oct 21</li><li>Every request already received</li></ul></StNotice><div className={styles.actions}><StTextButton onClick={() => { setView("review"); setMessage(paused ? "Mediation sessions remain paused in this preview." : "Mediation sessions kept live in this preview."); }}>{paused ? "Back to website" : "Keep it live"}</StTextButton><span className={styles.push} /><StHold label={paused ? "Hold to resume" : "Hold to pause"} onAccept={() => { if (canAct) setPaused(!paused); }} /></div></StSection></StSurface></div>}
                    {view === "checks" && <div className={styles.checkGrid}>
                      <StSection title="Checks" meta="attymooney.com"><StRows label="Website checks">{(rolledBack ? [{ time: "9:17 AM", ok: true }] : [{ time: "9:16 AM", ok: false }, { time: "9:15 AM", ok: false }, { time: "9:14 AM", ok: false }, { time: "9:10 AM", ok: true }]).map(check => <StRow key={check.time} lead={<StState kind={check.ok ? "live" : "down"}><StMono>{check.time}</StMono></StState>} title={check.ok ? "Site loaded, form reachable" : "No response from the site"} end={<StMono>{check.ok ? "200" : "timeout"}</StMono>} />)}</StRows></StSection>
                      <div className={styles.decisionColumn}><StSection title="What Strelva Agency is doing"><StSteps label="Responding to the incident" steps={rolledBack ? [{ title: "Restored the earlier copy", state: "done", detail: "Fictional rollback receipt recorded." }, { title: "Read the page back", state: "done", detail: "The fictional site loaded and the form was reachable." }] : [{ title: "Detected the site stopped responding", state: "done", time: "9:14", detail: "Three checks in a row timed out." }, { title: "Retrying every minute", state: "active", time: "now", detail: "Fictional preview; no checks run against a live site." }, { title: "Roll back if you say so", state: "pending", detail: "The last working copy is ready." }]} /></StSection>{!rolledBack ? <StHold label="Hold to roll back" onAccept={() => { if (canAct) setRolledBack(true); }} /> : <StNotice>The earlier copy is restored in this preview. The incident remains in History.</StNotice>}<StSection title="Affected"><StRows label="Affected Systems"><StRow title="attymooney.com" end={<StState kind={rolledBack ? "live" : "down"}>{rolledBack ? "Working" : "Not loading"}</StState>} /><StRow title="Inquiries" detail="The form is on the site" end={<StState kind={rolledBack ? "live" : "down"}>{rolledBack ? "Working" : "Affected"}</StState>} /><StRow title="Mediation intake" end={<StState kind="live">Fine</StState>} /><StRow title="Mediation sessions" end={<StState kind="draft">Draft · not affected</StState>} /></StRows></StSection></div>
                    </div>}
                  </>}
        </StPage>
        <StComposerDock><StComposerBar scope={view === "pause" ? "Mediation sessions" : "attymooney.com"} placeholder={review ? "Ask about this change" : "Ask Strelva to change or make something"} value={ask} onChange={setAsk} disabled={!canAct} onSubmit={() => { setMessage("Strelva kept your words in this fictional preview. Publishing still needs the change's own Hold to publish control."); setAsk(""); }} /></StComposerDock>
      </div>
    </AppFrame>
  </div>;
}

function FeesPage({ year, halfDay, fullDay }: { year: "2026" | "2027"; halfDay: string; fullDay: string }) {
  return <StSurface pad={false} label={`Fees page ${year}`}><div className={styles.browserBar}><span className={styles.browserDots} aria-hidden="true">● ● ●</span><span className={styles.address}><LockKeyhole size={12} aria-hidden="true" /><StMono>attymooney.com/fees</StMono></span></div><div className={styles.clientPage}><h2 className="font-display">Fees</h2><p>Mediation is billed per session. Fees are shared between parties unless agreed otherwise.</p><dl><div data-highlight={year === "2027"}><dt>Half-day session (up to 4 hours)</dt><dd>{year === "2027" ? halfDay : "[2026 fee]"}</dd></div><div data-highlight={year === "2027"}><dt>Full-day session (up to 8 hours)</dt><dd>{year === "2027" ? fullDay : "[2026 fee]"}</dd></div><div><dt>Pre-session call</dt><dd>No charge</dd></div><div><dt>Cancellation within 48 hours</dt><dd>Half the session fee</dd></div></dl></div></StSurface>;
}
