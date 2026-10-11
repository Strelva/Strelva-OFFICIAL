"use client";

import { useState } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StComposerBar, StComposerDock, StEmpty, StHead, StLabel, StLedger, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSkeleton, StSplit, StTextButton, StToast } from "@/components/ui/strelva/Kit";

/** Fictional canon C2/C3 only. No record, Google, calendar or website calls. */
const FACTS = [
  { title: "Pre-session calls are free", quote: "The first call is always on us.", source: "attymooney.com/fees" },
  { title: "Sheri is admitted in New York and Pennsylvania", quote: "…licensed to practice in NY and PA.", source: "attymooney.com/about" },
  { title: "Sessions can be held over video", quote: "Remote sessions available on request.", source: "Google listing" },
];

export function BusinessRecordPreview({ surface, state = "ready" }: { surface: "record" | "facts"; state?: string }) {
  const [ask, setAsk] = useState("");
  const [holiday, setHoliday] = useState("Closed Nov 27");
  const [editing, setEditing] = useState(true);
  const [receipt, setReceipt] = useState("");
  const [facts, setFacts] = useState(FACTS);
  const [results, setResults] = useState<string[]>([]);
  const unavailable = state === "loading" || state === "empty" || state === "error" || state === "permission";
  return <StrelvaShell signedIn={false} systemsReleased appBase="/preview/strelva" active="settings" title="" businessContext="The Mooney Firm" accountName="sheri" notice={<p className="px-5 py-2 text-xs text-gray-muted">Fictional local preview · record, use counts and receipts are examples</p>}>
    <StPage><StHead crumb={{ label: "Business details", href: "/preview/strelva?scenario=mooney&systems=on" }} title={surface === "facts" ? `${facts.length} facts Strelva found but you haven’t said` : "The business record"} beacon={surface === "facts" && facts.length ? "need" : undefined} meta={surface === "facts" ? "Until you confirm, Strelva won’t write them anywhere new." : "Every fact Strelva writes anywhere comes from here · you change it once"} />
      {state === "loading" ? <StSection title="Loading facts"><StSkeleton /><StSkeleton width="70%" /></StSection> : state === "error" ? <StNotice tone="critical">The record couldn’t load. Nothing changed.</StNotice> : state === "permission" ? <StNotice>Only the owner can change or confirm these facts.</StNotice> : state === "empty" ? <StEmpty>No facts have been recorded yet.</StEmpty> : null}
      {!unavailable && surface === "facts" ? <><StRows label="Facts to confirm">{facts.map(fact => <StRow key={fact.title} title={fact.title} detail={`“${fact.quote}”`} end={<div className="grid justify-items-end gap-2"><span className="flex gap-4"><StTextButton onClick={() => { setFacts(facts.filter(row => row !== fact)); setReceipt(`Marked not right in this fictional preview: ${fact.title}`); }}>Not right</StTextButton><StPill variant="soft" onClick={() => { setFacts(facts.filter(row => row !== fact)); setReceipt(`Confirmed in this fictional preview: ${fact.title}. No outside change was made.`); }}>Yes</StPill></span><StMono>{fact.source}</StMono></div>} />)}</StRows>{!facts.length ? <StEmpty>All example facts have been reviewed. Nothing was published.</StEmpty> : null}<p className="text-sm text-gray-muted">Strelva only asks about facts it would use. Ones you’ve said yourself are never asked again.</p></> : null}
      {!unavailable && surface === "record" ? <StSplit aside={editing ? <><StLabel>{holiday} will update</StLabel><StRows><StRow title="attymooney.com" detail="A notice on the contact page from Nov 20" /><StRow title="Google listing" detail="Holiday hours · Google reviews it" /><StRow title="Mediation sessions" detail="Nov 27 no longer offered" /></StRows><p className="text-sm text-gray-muted">Reminders: none scheduled that day. You get a receipt from each place once it’s changed.</p><StLedger path="Holiday hours" lines={[{ sign: "-", text: "Not recorded" }, { sign: "+", text: holiday }]} /><span className="flex flex-wrap gap-4"><StTextButton onClick={() => setEditing(false)}>Cancel</StTextButton><StPill onClick={() => { setResults(["Website · example change confirmed", "Google · example accepted, confirmation pending", "Mediation sessions · example date removed"]); setEditing(false); }}>Save and update 3 places</StPill></span></> : <StEmpty>Select a fact to see exactly where the example change goes.</StEmpty>}>
        <StSection title="Hours"><StRows><StRow title="Mon–Fri" value="9 AM – 5 PM" end={<><StMono>You said</StMono><StMono>in 4</StMono></>} /><StRow title="Sat, Sun" value="Closed" end={<><StMono>You said</StMono><StMono>in 4</StMono></>} /><StRow title="Holidays" value={<button type="button" className="text-accent-text" onClick={() => { setHoliday("Closed Nov 27"); setEditing(true); }}>{holiday}</button>} selected={editing} end={<><StMono>{editing ? "Editing" : "You said"}</StMono><StMono>in 4</StMono></>} /></StRows></StSection>
        <StSection title="Services and prices"><StRows><StRow title="Half-day session" value="[fee] · up to 4 hours" end={<><StMono>You said</StMono><StMono>in 3</StMono></>} /><StRow title="Full-day session" value="[fee] · up to 8 hours" end={<><StMono>You said</StMono><StMono>in 3</StMono></>} /><StRow title="Pre-session call" value="No charge" end={<StTextButton href="/preview/strelva/business-record?surface=facts">From your site · confirm</StTextButton>} /></StRows></StSection>
        <StSection title="Contact"><StRows><StRow title="Inquiries go to" value="sheri@attymooney.com" end={<StMono>You said · in 2</StMono>} /><StRow title="Phone" value="[phone]" end={<StMono>You said · in 3</StMono>} /></StRows></StSection>
      </StSplit> : null}
      {results.length ? <StSection title="Receipts · fictional"><StRows>{results.map(result => <StRow key={result} title={result} />)}</StRows></StSection> : null}
      {receipt ? <StToast>{receipt}</StToast> : null}
    </StPage><StComposerDock><StComposerBar scope="Business details" placeholder="Tell Strelva something about the business" value={ask} onChange={setAsk} onSubmit={() => { setReceipt("Fictional preview. Your message was not sent."); setAsk(""); }} /></StComposerDock>
  </StrelvaShell>;
}
