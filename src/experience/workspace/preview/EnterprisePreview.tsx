"use client";

import { useState } from "react";
import { TextInput } from "@/components/ui/TextInput";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StComposerBar, StComposerDock, StEmpty, StHead, StHold, StLedger, StMono, StNotice, StPage, StRows, StRow, StSection, StSegmented, StSkeleton, StState, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import { StTable } from "@/components/ui/strelva/Table";
import { ENTERPRISE_LOCATIONS, ENTERPRISE_NAME, ENTERPRISE_REVIEW, type EnterpriseLocation } from "./enterprise-fixture";
import styles from "@/experience/enterprise/enterprise.module.css";

const BASE = "/preview/strelva/locations";

/** Fictional clinic and quarterly-review presentation only; every action stays local. */
export function EnterprisePreview({ view, state, locationId }: { view: "locations" | "push" | "access-review"; state: string; locationId?: string }) {
  const [notice, setNotice] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [ask, setAsk] = useState("");
  const [decision, setDecision] = useState<"manager" | "required">("manager");
  const [requiredBy, setRequiredBy] = useState("");
  const [selected, setSelected] = useState<EnterpriseLocation | null>(() => ENTERPRISE_LOCATIONS.find(location => location.id === locationId) ?? null);
  const [sent, setSent] = useState(false);
  const [review, setReview] = useState(ENTERPRISE_REVIEW);
  const isProblem = state === "error" || state === "permission";
  const title = view === "push" ? "Push New patient intake v5" : view === "access-review" ? "Quarterly access review" : ENTERPRISE_NAME;
  function exportAudit() {
    const csv = "person,location,role,last_use,review\n" + review.map(row => [row.name, row.location, row.role, row.lastUse, row.kept ? "kept" : "unreviewed"].join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "fictional-access-review.csv"; link.click(); URL.revokeObjectURL(url);
    setNotice("Fictional access review exported. This is not a live audit log.");
  }
  return <div>
    <StrelvaShell title="" workspaceName="Lakeshore PT" accountName="Ops lead" systemsReleased pinned={[{ id: "all-clinics", title: "All clinics", href: BASE, kind: "app" }, ...ENTERPRISE_LOCATIONS.map(location => ({ id: location.id, title: location.name, href: `${BASE}?location=${location.id}`, kind: "app" as const }))]} notice={<p className="px-6 py-2 text-xs text-gray-muted">Fictional clinics and people · local preview only · no live changes</p>}>
      <StPage>
        <StHead title={title} beacon={view === "access-review" ? "need" : view === "push" ? "draft" : undefined} crumb={view !== "locations" ? { label: "All clinics", href: BASE } : undefined} meta={view === "locations" ? "6 clinics · 4 standards · 2 things need the ops lead" : view === "push" ? "Adds a question about prior surgery · each manager says yes for their clinic." : `Due Oct 31 · ${ENTERPRISE_REVIEW.length} people · ${ENTERPRISE_REVIEW.filter(person => person.inactive).length} haven't signed in for 60+ days`} />
        {notice ? <StToast>{notice}</StToast> : null}
        {state === "loading" ? <StSection title={view === "push" ? "Preview, clinic by clinic" : "Loading records"}><StSkeleton label={`Loading ${title}`} /><StSkeleton width="70%" /><StSkeleton width="85%" /></StSection> : isProblem ? <StNotice tone="critical"><p>{state === "permission" ? "These clinics are unavailable to your account. An organization owner can review your access." : "Clinic records could not be loaded. The last saved standard is unchanged."}</p>{state === "error" ? <StTextButton onClick={() => { setRetrying(true); setNotice("Preview retry checked. Fictional records remain unavailable."); }} disabled={retrying}>{retrying ? "Checked" : "Retry"}</StTextButton> : null}</StNotice> : state === "empty" ? <StEmpty>{view === "access-review" ? "No access records to review." : view === "push" ? "No clinic Versions are ready for this standard." : "No clinics yet. Add businesses and locations in your workspace first."}</StEmpty> : view === "locations" ? <>
          <StTable label="Every clinic in one read" rows={ENTERPRISE_LOCATIONS} rowKey={location => location.id} columns={[
            { key: "clinic", label: "Clinic", render: location => <StTextButton onClick={() => setSelected(location)}>{location.name}</StTextButton> },
            { key: "manager", label: "Manager", render: location => location.manager ?? <StMono tone="need">—</StMono> },
            { key: "health", label: "Health", render: location => <StState kind={location.kind}>{location.health}</StState> },
            { key: "standards", label: "Standards", render: location => <StMono tone="text">{location.standards}</StMono> },
            { key: "note", label: "Note", render: location => location.note ? <span className={location.note === "Opens Nov 3" ? "text-gray-muted" : "text-terra"}>{location.note}</span> : "—" },
          ]} />
          {selected ? <StSection title={selected.name} action={<StTextButton onClick={() => setSelected(null)}>Close</StTextButton>}><StSurface label={`${selected.name} location preview`}><StState kind={selected.kind}>{selected.health}</StState><p className="mt-3 text-sm text-gray-muted">{selected.preview}</p><p className="mt-3 text-sm text-gray-muted">{selected.manager ? `Manager: ${selected.manager}` : "No manager is assigned."} · {selected.standards} standards</p></StSurface></StSection> : null}
          <StNotice><div className={styles.summary}><span>Standards</span><span>New patient intake v4 · Booking rules v2 · Review asks v1 · Brand look v3</span><StTextButton href={`${BASE}?view=push`}>Push a standard</StTextButton></div></StNotice>
          <StTextButton href={`${BASE}?view=access-review`}>Review People & access</StTextButton>
        </> : view === "push" ? <>
          <div className={styles.push}><StSection title="Preview, clinic by clinic"><StRows label="Standard previews">{[ENTERPRISE_LOCATIONS[1]!, ENTERPRISE_LOCATIONS[2]!, ENTERPRISE_LOCATIONS[3]!, ENTERPRISE_LOCATIONS[0]!, ENTERPRISE_LOCATIONS[4]!, ENTERPRISE_LOCATIONS[5]!].map(location => <StRow key={location.id} title={location.name} detail={location.preview} lead={<StState kind={location.previewKind}><span className="sr-only">{location.previewKind === "live" ? "Ready" : location.previewKind === "draft" ? "Skipped" : "Needs review"}</span></StState>} onClick={() => setSelected(location)} />)}</StRows></StSection>
            <div className={styles.actions}><StSegmented label="Who decides on the standard" value={decision} options={[{ value: "manager", label: "Each manager decides" }, { value: "required", label: "Required by" }]} onChange={setDecision} />{decision === "required" ? <TextInput type="date" label="Required date" value={requiredBy} onChange={event => setRequiredBy(event.target.value)} /> : null}<p className="text-sm text-gray-muted">Required standards apply on the date you pick. Managers still see the change first.</p>{sent ? <StNotice>Strelva prepared the fictional previews. Each clinic still needs its own review.</StNotice> : <StHold label="Hold to send to 5" disabled={decision === "required" && !requiredBy} onAccept={() => { setSent(true); setNotice("Preview only: Strelva prepared 5 clinic reviews. No manager was contacted and no clinic changed."); }} />}<StTextButton onClick={() => setNotice("Draft kept in this preview. It resets on reload.")}>Save as draft</StTextButton></div>
          </div>
          {selected ? <StSection title={`${selected.name} preview`} action={<StTextButton onClick={() => setSelected(null)}>Close preview</StTextButton>}><StLedger path="New patient intake · question 8" lines={[{ sign: "+", text: "Have you had surgery related to this condition?" }]} /><StNotice>{selected.preview}</StNotice></StSection> : null}
        </> : <>
          <StTable label="Quarterly access review" rows={review} rowKey={person => person.id} columns={[
            { key: "person", label: "Person", render: person => person.name }, { key: "clinic", label: "Clinic", render: person => person.location }, { key: "role", label: "Access", render: person => person.role }, { key: "last", label: "Last signed in", render: person => <StMono tone={person.inactive ? "need" : undefined}>{person.lastUse}</StMono> },
            { key: "review", label: "Review", render: person => person.kept ? "Kept · Oct 1" : <div className="flex gap-4"><StTextButton aria-label={`Keep ${person.name}`} onClick={() => { setReview(current => current.map(row => row.id === person.id ? { ...row, kept: true } : row)); setNotice(`Preview: ${person.name}'s access kept.`); }}>Keep</StTextButton><StTextButton aria-label={`Remove ${person.name}`} onClick={() => { setReview(current => current.filter(row => row.id !== person.id)); setNotice(`Preview: ${person.name}'s access removed. No live record changed.`); }}>Remove</StTextButton></div> },
          ]} />
          <StNotice><div className={styles.summary}><span>Audit</span><span>Every sign-in, permission change and push is kept for [retention period] and exports as CSV.</span><StTextButton onClick={exportAudit}>Export audit log</StTextButton></div></StNotice>
        </>}
      </StPage>
      <StComposerDock><StComposerBar scope="Lakeshore PT" placeholder="Ask across all clinics" value={ask} onChange={setAsk} onSubmit={() => { setNotice("This fictional clinic preview cannot make a request. Open your workspace to ask Strelva."); setAsk(""); }} /></StComposerDock>
    </StrelvaShell>
  </div>;
}
