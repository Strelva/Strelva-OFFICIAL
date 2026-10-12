"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Inbox,
  Link2,
  ListFilter,
  LockKeyhole,
  Mail,
  Pause,
  Play,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { StrelvaInquiryForm, type PublicInquiryForm } from "@/products/inquiries/client";
import type { JsonValue } from "@/products/inquiries/contracts";
import type {
  InquiryCapabilityDefinition,
  InquiryCapabilityState,
  InquiryConnectionView,
  InquiryRecord,
  InquiryRecordDefinition,
  InquiryRequestState,
  InquiryShapeLineKind,
  InquirySurfaceSnapshot,
  InquiryWork,
  ResponsibilityAction,
  ResponsibilityPolicy,
} from "./contracts";
import { phaseForWork, phaseLabel, requestStateLabel } from "./contracts";
import { useInquiry } from "./context";
import { InquiryAttentionView, InquiryPatternsView } from "./InquiryPortfolioViews";
import styles from "./inquiry.module.css";
import recordStyles from "./record-canon.module.css";
import { StEmpty, StField, StHead, StMono, StNotice, StPage, StPill, StRows, StRow, StSection, StState, StSteps, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import { RecordMessageReview } from "./RecordMessageReview";
import { inquiryActorLabel, inquiryChangeActorLabels } from "./recorded-actors";

export function ViewRouter() {
  const { view, requestId, inquiryId } = useInquiry();
  if (view === "home") return <HomeView />;
  if (view === "attention") return <InquiryAttentionView />;
  if (view === "new") return <NewView />;
  if (view === "shape") return <ShapeView key={requestId || "shape"} />;
  if (view === "work") return <WorkView />;
  if (view === "plan") return <PlanView />;
  if (view === "preview") return <PreviewView key={requestId || "preview"} />;
  if (view === "rehearsal") return <RehearsalView />;
  if (view === "receipt") return <ReceiptView />;
  if (view === "search") return <SearchView />;
  if (view === "record") return <RecordView key={inquiryId || "records"} />;
  if (view === "why") return <WhyView />;
  if (view === "responsibility") return <ResponsibilityView />;
  if (view === "connections") return <ConnectionsView />;
  if (view === "onboarding") return <OnboardingView />;
  if (view === "patterns") return <InquiryPatternsView />;
  return <AccountView />;
}

function PageIntro({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return <StHead crumb={{ label: eyebrow.charAt(0) + eyebrow.slice(1).toLowerCase() }} title={title} meta={children} actions={action} />;
}

function HomeView() {
  const { snapshot, navigate } = useInquiry();
  const needs = snapshot.state.requests.filter((work) => work.state === "shaped" || work.state === "ready_to_publish" || work.state === "failed" || work.state === "planned" || work.state === "editing");
  const blockedRecords = snapshot.state.inquiries.filter((record) => record.status === "blocked");
  const handling = snapshot.state.responsibilities.filter((policy) => policy.status === "active" || policy.status === "paused");
  const changed = snapshot.state.changes.filter((change) => ["published", "published_unverified", "undone_unverified"].includes(change.status));
  const live = snapshot.capabilities.filter((capability) => capability.status === "live" || capability.status === "live_unverified" || capability.status === "paused");
  return <StPage>
    <PageIntro eyebrow={snapshot.audience === "agency" ? "AGENCY ATTENTION" : "YOUR BUSINESS"} title={snapshot.audience === "agency" ? "One decision at a time." : "Inquiries"}>
      {snapshot.audience === "agency" ? "See the next assigned client decision, then move it forward with a clear receipt." : "Customer requests, running rules, and the changes waiting for your review."}
    </PageIntro>
    {snapshot.deliveryEvidence?.available === false ? <p className={styles.readOnlyCopy} role="status">Delivery evidence is unavailable right now. Provider outcomes may be missing from Needs you and the record timeline.</p> : null}
    <div className={styles.homeSections}>
      <HomeSection title="Needs you" description="Approvals, questions, and problems." icon={CircleHelp}>
        {needs.length > 0 || blockedRecords.length > 0 ? <>{needs.map((work) => <WorkRow key={work.id} work={work} onOpen={() => navigate("work", { requestId: work.id })} />)}{blockedRecords.map((record) => <BlockedRecordRow key={record.id} record={record} onOpen={() => navigate("record", { inquiryId: record.id })} />)}</> : <EmptySection text={snapshot.readOnly ? "Nothing can be approved from this read-only scope." : "Nothing needs your decision right now."} />}
      </HomeSection>
      <HomeSection title="Running" description="Rules you’ve asked to keep running." icon={Sparkles}>
        {handling.length > 0 ? handling.map((policy) => <ResponsibilityRow key={policy.id} policy={policy} />) : <EmptySection text="No inquiry rules are running yet." />}
      </HomeSection>
      <HomeSection title="What changed" description="Recent changes, with details and undo." icon={ClipboardCheck}>
        {changed.length > 0 ? changed.map((change) => <ChangeRow key={change.id} change={change} />) : <EmptySection text="No change receipt is recorded yet." />}
      </HomeSection>
      <HomeSection title="What&apos;s live" description="What this business has running." icon={ShieldCheck}>
        {live.length > 0 ? live.map((capability) => <CapabilityRow key={capability.id} capability={capability} />) : <EmptySection text="No inquiry form is live here yet." />}
      </HomeSection>
    </div>
    <div className={styles.homeLinks}>
      <button type="button" onClick={() => navigate("attention")}><ClipboardCheck size={16} aria-hidden="true" />Needs you across businesses</button>
      <button type="button" onClick={() => navigate("patterns")}><Sparkles size={16} aria-hidden="true" />Reuse an inquiry pattern</button>
      <button type="button" onClick={() => navigate("onboarding")}><Link2 size={16} aria-hidden="true" />Check business details</button>
      <button type="button" onClick={() => navigate("connections")}><Settings2 size={16} aria-hidden="true" />Connections</button>
      <button type="button" onClick={() => navigate("responsibility")}><LockKeyhole size={16} aria-hidden="true" />Read running rules</button>
    </div>
  </StPage>;
}

function BlockedRecordRow({ record, onOpen }: { record: InquiryRecord; onOpen: () => void }) {
  return <div className={styles.workRow} data-state="blocked"><span className={styles.rowIcon} aria-hidden="true"><AlertCircle size={17} /></span><button type="button" className={styles.rowMain} onClick={onOpen}><span className={styles.rowTitle}>{record.fields.name || record.id}</span><span className={styles.rowMeta}>{record.id} · Provider outcome needs review</span></button><span className={styles.rowStatus} data-state="blocked">Blocked</span><button className={styles.rowAction} type="button" onClick={onOpen} aria-label={`Inspect ${record.id}`}><ChevronRight size={17} aria-hidden="true" /></button></div>;
}

function HomeSection({ title, description, icon: Icon, children }: { title: string; description: string; icon: LucideIcon; children: ReactNode }) {
  return <StSection title={<><Icon size={17} aria-hidden="true" />{title}</>} meta={description}>{children}</StSection>;
}

function EmptySection({ text }: { text: string }) {
  return <StEmpty>{text}</StEmpty>;
}

function WorkRow({ work, onOpen }: { work: InquiryWork; onOpen: () => void }) {
  const phase = phaseForWork(work);
  return <div className={styles.workRow} data-state={work.state}>
    <span className={styles.rowIcon} aria-hidden="true"><FileText size={17} /></span>
    <button type="button" className={styles.rowMain} onClick={onOpen}><span className={styles.rowTitle}>{work.intent}</span><span className={styles.rowMeta}>{phaseLabel(phase)} · {requestStateLabel(work.state)} · {work.businessId}</span></button>
    <span className={styles.rowStatus} data-state={work.state}>{requestStateLabel(work.state)}</span>
    <button className={styles.rowAction} type="button" onClick={onOpen} aria-label={`Open ${work.intent}`}><ChevronRight size={17} aria-hidden="true" /></button>
  </div>;
}

function ResponsibilityRow({ policy }: { policy: ResponsibilityPolicy }) {
  const { snapshot, navigate, perform, pending, can } = useInquiry();
  const capability = snapshot.capabilities.find((item) => item.id === policy.capabilityId);
  const requestId = capability?.activeRequestId;
  const paused = policy.status === "paused" || Boolean(requestId && snapshot.pausedRequestIds?.includes(requestId));
  const canPause = Boolean(requestId) && can("canManageResponsibility");
  async function togglePause() {
    if (!requestId || !canPause) return;
    await perform({ kind: paused ? "resume" : "pause", requestId, actorId: policy.sponsorId });
  }
  return <div className={styles.workRow} data-state={paused ? "paused" : "active"}>
    <span className={styles.rowIcon} aria-hidden="true"><LockKeyhole size={17} /></span>
    <button type="button" className={styles.rowMain} onClick={() => navigate("responsibility", { requestId })}><span className={styles.rowTitle}>{policy.title}</span><span className={styles.rowMeta}>{policy.scope} · {paused ? "Paused" : "Handling"}</span></button>
    <span className={styles.rowStatus} data-state={paused ? "paused" : "active"}>{paused ? "Paused" : "Handling"}</span>
    <button className={styles.rowAction} type="button" onClick={() => void togglePause()} disabled={!canPause || pending || snapshot.readOnly} aria-label={`${paused ? "Resume" : "Pause"} ${policy.title}`} title={!canPause ? "Pause permission or active work is not recorded" : undefined}>{paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}</button>
  </div>;
}

function ChangeRow({ change }: { change: NonNullable<InquirySurfaceSnapshot["state"]["changes"]>[number] }) {
  const { navigate, perform, snapshot, pending, can } = useInquiry();
  const work = snapshot.state.requests.find((item) => item.id === change.requestId);
  async function undo() {
    if (!work) return;
    const result = await perform({ kind: "undo", requestId: work.id, actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner" });
    if (result?.change) navigate("receipt", { requestId: work.id });
  }
  return <div className={styles.changeRow} data-status={change.status}><span className={styles.rowIcon} aria-hidden="true"><RotateCcw size={17} /></span><button className={styles.rowMain} type="button" onClick={() => work && navigate("receipt", { requestId: work.id })}><span className={styles.rowTitle}>{change.summary}</span><span className={styles.rowMeta}>{change.items.length} affected part{change.items.length === 1 ? "" : "s"} · Release {change.targetVersion}</span></button><span className={styles.rowStatus} data-state={change.status}>{change.status === "published" ? "Receipt" : "Undo recorded"}</span>{change.undoAvailable && work ? <StTextButton type="button" onClick={undo} disabled={pending || snapshot.readOnly || !can("canPublish")}>Undo</StTextButton> : <span className={styles.rowActionPlaceholder} aria-hidden="true" />}</div>;
}

function CapabilityRow({ capability }: { capability: InquiryCapabilityState }) {
  const { navigate } = useInquiry();
  const label = capability.live?.name || "Inquiry form";
  return <div className={styles.capabilityRow}><span className={styles.rowIcon} aria-hidden="true"><Inbox size={17} /></span><button className={styles.rowMain} type="button" onClick={() => navigate("preview", { requestId: capability.activeRequestId })}><span className={styles.rowTitle}>{label}</span><span className={styles.rowMeta}>{capability.live ? <>Release {capability.live.version}</> : "Draft"} · {capability.status === "live_unverified" ? "verification pending" : capability.status}</span></button><span className={styles.rowQuiet}>{capability.status === "paused" ? "Paused" : "Live"}</span></div>;
}

function NewView() {
  const { snapshot, perform, navigate, pending, can, initialRequestText } = useInquiry();
  const [intent, setIntent] = useState(() => initialRequestText);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!intent.trim() || !can("canStart")) return;
    const result = await perform({ kind: "start", input: { actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner", intent: intent.trim() } });
    if (result?.work) navigate("shape", { requestId: result.work.id });
  }
  return <StPage>
    <PageIntro eyebrow="NEW INQUIRY WORK" title="Start with the request." action={<StTextButton type="button" onClick={() => navigate("home")}><ArrowLeft size={15} aria-hidden="true" />Home</StTextButton>}>
      Write one sentence about the customer request. Strelva will propose a shape you can change before work starts.
    </PageIntro>
    <form className={styles.newForm} onSubmit={submit}>
      <div className={styles.formMark}><span>{snapshot.business.name}</span></div>
      <StField label="What should your inquiry form do?"><textarea id="new-inquiry-intent" value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="Collect quote requests and follow up when nobody replies…" maxLength={2000} rows={4} disabled={snapshot.readOnly || pending} /></StField>
      <div className={styles.formFooter}><span>Selected business: <strong>{snapshot.business.name}</strong></span><StPill type="submit" disabled={!intent.trim() || !can("canStart") || pending}>{pending ? "Capturing…" : "Shape this request"}<ArrowRight size={16} aria-hidden="true" /></StPill></div>
      {!can("canStart") ? <p className={styles.readOnlyCopy}>This business is read-only for your account. You can inspect existing work, but you cannot start a request.</p> : null}
    </form>
    <div className={styles.exampleStrip}><span className={styles.eyebrow}>TRY A NARROW REQUEST</span><div><button type="button" onClick={() => setIntent("Collect quote requests and route them to the recorded inbox.")} disabled={snapshot.readOnly}>Collect quote requests</button><button type="button" onClick={() => setIntent("Make the booking request easier to complete.")} disabled={snapshot.readOnly}>Make booking easier</button><button type="button" onClick={() => setIntent("Follow up when a customer has not received a reply.")} disabled={snapshot.readOnly}>Follow up safely</button></div></div>
  </StPage>;
}

function ShapeView() {
  const { selectedWork, perform, navigate, snapshot, pending, can } = useInquiry();
  const [selected, setSelected] = useState<InquiryShapeLineKind[]>(() => selectedWork?.shape.selectedLineIds || []);
  if (!selectedWork) return <Unavailable title="This request is unavailable" description="The work may have moved or you may no longer have access to this business." />;
  const work = selectedWork;
  const lines = work.shape.lines;
  async function accept() {
    if (!can("canEdit")) return;
    const result = await perform({ kind: "accept-shape", requestId: work.id, input: { actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner", selectedLineIds: selected } });
    if (result?.work) navigate("work", { requestId: result.work.id });
  }
  function toggle(id: InquiryShapeLineKind, required: boolean) {
    if (required) return;
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  return <StPage>
    <PageIntro eyebrow="SHAPE · BEFORE PREPARATION" title={work.shape.title} action={<StTextButton type="button" onClick={() => navigate("new")}><ArrowLeft size={15} aria-hidden="true" />New</StTextButton>}>
      {work.context ? `Started from inquiry ${work.context.inquiryId} at form Release ${work.context.capabilityVersion}. ${work.shape.summary}` : work.shape.summary}
    </PageIntro>
    <section className={styles.shapePanel} aria-labelledby="shape-parts-title">
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>EDITABLE SHAPE</span><h2 id="shape-parts-title" className="font-display">What this request touches</h2><p>Strike out an optional part before you give Strelva permission to prepare it.</p></div><span className={styles.versionTag}>Shape Release {work.shape.version}</span></div>
      <div className={styles.shapeLines}>
        {lines.map((line) => {
          const active = selected.includes(line.id);
          return <div className={`${styles.shapeLine} ${!active ? styles.shapeLineRemoved : ""}`} key={line.id} data-selected={active}>
            <button type="button" className={styles.shapeToggle} aria-pressed={active} onClick={() => toggle(line.id, line.required)} disabled={line.required || !can("canEdit")} aria-label={`${active ? "Keep" : "Strike out"} ${line.kind.replaceAll("_", " ")}`}><span className={styles.shapeCheck}>{active ? <Check size={14} aria-hidden="true" /> : null}</span><span className={styles.shapeKind}>{line.kind.replaceAll("_", " ")}</span><span className={active ? styles.shapeSentence : styles.shapeSentenceStrike}>{line.sentence}</span><small>{line.kind === "follow_up" ? "follow-up rule" : line.touches}{line.required ? " · required" : " · optional"}</small></button>
          </div>;
        })}
      </div>
      <div className={styles.shapeFacts}><span><Mail size={15} aria-hidden="true" />Sender: {snapshot.business.name}. Reply routing is checked before delivery.</span><span><LockKeyhole size={15} aria-hidden="true" />Nothing publishes from Shape.</span><span><ShieldCheck size={15} aria-hidden="true" />Rehearsal must pass before Make real.</span></div>
      <div className={styles.panelFooter}><StPill type="button" variant="soft" onClick={() => navigate("home")}>Save for later</StPill><StPill type="button" onClick={() => void accept()} disabled={pending || !can("canEdit")}>{pending ? "Saving shape…" : "Go with this shape"}<ArrowRight size={16} aria-hidden="true" /></StPill></div>
    </section>
  </StPage>;
}

function WorkView() {
  const { selectedWork, navigate, snapshot } = useInquiry();
  if (!selectedWork) return <WorkCollection />;
  const phase = phaseForWork(selectedWork);
  return <StPage>
    <PageIntro eyebrow="REQUEST" title={selectedWork.intent} action={<StTextButton type="button" onClick={() => navigate("home")}><ArrowLeft size={15} aria-hidden="true" />Home</StTextButton>}>
      {snapshot.business.name} · {phaseLabel(phase)} · {requestStateLabel(selectedWork.state)}{selectedWork.context ? ` · from inquiry ${selectedWork.context.inquiryId}, form at time of submission: Release ${selectedWork.context.capabilityVersion}` : ""}
    </PageIntro>
    <PhaseRail state={selectedWork.state} />
    <section className={styles.workPanel} aria-labelledby="work-request-title">
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>REQUEST</span><h2 id="work-request-title" className="font-display">The request keeps its history.</h2><p>Intent, shape, plan, result, and receipt remain one inspectable thread.</p></div><span className={styles.stateTag} data-state={selectedWork.state}>{requestStateLabel(selectedWork.state)}</span></div>
      <div className={styles.workActions}><StPill variant="soft" type="button" onClick={() => navigate("shape", { requestId: selectedWork.id })}>Inspect shape</StPill>{selectedWork.plan ? <StPill variant="soft" type="button" onClick={() => navigate("plan", { requestId: selectedWork.id })}>Open plan</StPill> : null}<StPill type="button" onClick={() => navigate(selectedWork.state === "ready_to_publish" ? "rehearsal" : selectedWork.state === "handled" ? "receipt" : "preview", { requestId: selectedWork.id })}>{selectedWork.state === "ready_to_publish" ? "Review rehearsal" : selectedWork.state === "handled" ? "View receipt" : "Open preview"}<ArrowRight size={16} aria-hidden="true" /></StPill></div>
      <details className={styles.inspector}><summary>Inspect release and scope</summary><dl className={styles.detailList}><div><dt>Business</dt><dd>{snapshot.business.name}</dd></div><div><dt>Form</dt><dd>{selectedWork.draft?.name || snapshot.capabilities.find(form => form.id === selectedWork.capabilityId)?.live?.name || "Inquiry form"}</dd></div><div><dt>Actor</dt><dd>{inquiryChangeActorLabels(snapshot, { actorIds: [selectedWork.actorId], requestId: selectedWork.id, capabilityId: selectedWork.capabilityId, businessId: selectedWork.businessId, createdAt: selectedWork.createdAt, updatedAt: selectedWork.updatedAt })}</dd></div><div><dt>Release</dt><dd>{selectedWork.draft?.version || selectedWork.shape.version}</dd></div></dl></details>
    </section>
    <WorkFlowSections work={selectedWork} />
    <WorkTimeline work={selectedWork} />
  </StPage>;
}

function WorkCollection() {
  const { snapshot, navigate } = useInquiry();
  return <StPage><PageIntro eyebrow="RECENT CHANGES" title="Requests you can resume.">Requests, rehearsals, and changes stay in the selected Business scope.</PageIntro><section className={styles.collection}><div className={styles.collectionHeader}><span className={styles.eyebrow}>REQUESTS</span><span>{snapshot.state.requests.length > 0 ? `${snapshot.state.requests.length} available in this scope` : "No requests recorded"}</span></div>{snapshot.state.requests.length > 0 ? snapshot.state.requests.map((work) => <WorkRow key={work.id} work={work} onOpen={() => navigate("work", { requestId: work.id })} />) : <EmptySection text="Start a new request when you have a customer workflow to handle." />}</section></StPage>;
}

function PhaseRail({ state }: { state: InquiryRequestState }) {
  const phases = ["Asked", "In progress", "Ready for review", "Your system", "Done"];
  const phaseIndex = state === "handled" ? 4 : ["ready_to_publish", "editing"].includes(state) ? 2 : ["planned", "rehearsing"].includes(state) ? 1 : ["publishing", "live_unverified"].includes(state) ? 3 : 0;
  return <ol className={styles.phaseRail} aria-label="Request stages">{phases.map((phase, index) => <li key={phase} className={index <= phaseIndex ? styles.phaseDone : ""} data-current={index === phaseIndex}><span>{index < phaseIndex ? <Check size={13} aria-hidden="true" /> : index + 1}</span><small>{phase}</small></li>)}</ol>;
}

function WorkTimeline({ work }: { work: InquiryWork }) {
  const { snapshot } = useInquiry();
  const events = snapshot.state.actionReceipts.filter((receipt) => receipt.requestId === work.id);
  return <section className={styles.timelineBlock} aria-labelledby="work-timeline-title"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>EVIDENCE</span><h2 id="work-timeline-title" className="font-display">What has happened</h2></div></div>{events.length > 0 ? <ol className={styles.eventList}>{events.map((event) => <li key={event.id}><span className={styles.eventDot} aria-hidden="true" /><div><strong>{event.action.replaceAll("_", " ")}</strong><p>{event.what}</p><small>{inquiryActorLabel(event.actor)} · {event.outcome}</small></div></li>)}</ol> : <EmptySection text="No action receipt is recorded for this request yet." />}</section>;
}

function WorkFlowSections({ work }: { work: InquiryWork }) {
  const { snapshot, navigate } = useInquiry();
  const receipt = snapshot.state.changes.find((change) => change.requestId === work.id);
  const latestRun = [...snapshot.state.rehearsalRuns].filter((run) => run.requestId === work.id).sort((left, right) => Date.parse(right.ranAt) - Date.parse(left.ranAt))[0];
  return <div className={styles.workFlow} aria-label="Inquiry request from idea to live result">
    <section className={styles.workFlowSection} aria-labelledby="work-shape-title"><div className={styles.flowHeading}><span className={styles.eyebrow}>1 · SHAPE</span><h2 id="work-shape-title" className="font-display">The approved boundary</h2><StTextButton type="button" onClick={() => navigate("shape", { requestId: work.id })}>Inspect shape</StTextButton></div><p>{work.shape.summary}</p><ul className={styles.flowLines}>{work.shape.lines.map((line) => <li key={line.id} data-selected={line.selected}><strong>{humanize(line.kind)}</strong><span>{line.sentence}</span></li>)}</ul></section>
    <section className={styles.workFlowSection} aria-labelledby="work-plan-title"><div className={styles.flowHeading}><span className={styles.eyebrow}>2 · PLAN</span><h2 id="work-plan-title" className="font-display">What Strelva will check</h2>{work.plan ? <StTextButton type="button" onClick={() => navigate("plan", { requestId: work.id })}>Open plan</StTextButton> : null}</div>{work.plan ? <ol className={styles.flowSteps}>{work.plan.steps.map((step) => <li key={step.id}><strong>{step.label}</strong><span>{step.id === "rehearsal" ? "Try the form with a made-up customer before it can go live." : step.explanation}</span></li>)}</ol> : <EmptySection text="Accept the Shape to create a plan." />}</section>
    <section className={styles.workFlowSection} aria-labelledby="work-preview-title"><div className={styles.flowHeading}><span className={styles.eyebrow}>3 · EDITABLE PREVIEW</span><h2 id="work-preview-title" className="font-display">The customer-facing result</h2>{work.draft ? <StTextButton type="button" onClick={() => navigate("preview", { requestId: work.id })}>Open full preview</StTextButton> : null}</div>{work.draft ? <div className={styles.flowPreview}><InlinePreviewEditor key={`${work.id}:${work.draft.version}`} work={work} /><div className={styles.flowRules}><span>{work.draft.routing?.sentence || "No routing rule recorded."}</span><span>{work.draft.followUp?.sentence || "No follow-up rule recorded."}</span></div></div> : <EmptySection text="The editable preview appears after the accepted Shape." />}</section>
    <section className={styles.workFlowSection} aria-labelledby="work-receipt-title"><div className={styles.flowHeading}><span className={styles.eyebrow}>4 · RECEIPT</span><h2 id="work-receipt-title" className="font-display">Before and after stay together</h2>{receipt ? <StTextButton type="button" onClick={() => navigate("receipt", { requestId: work.id })}>Open receipt</StTextButton> : null}</div>{receipt ? <ChangeReceiptPanel receipt={receipt} currentDefinition={work.draft} /> : <EmptySection text="A Change receipt is created when the accepted draft is first built or edited." />}</section>
    <section className={styles.workFlowSection} aria-labelledby="work-live-title"><div className={styles.flowHeading}><span className={styles.eyebrow}>5 · MAKE REAL</span><h2 id="work-live-title" className="font-display">Rehearse this release first</h2><StTextButton type="button" onClick={() => navigate("rehearsal", { requestId: work.id })}>Review rehearsal</StTextButton></div><p>{latestRun && latestRun.definitionVersion === work.draft?.version && latestRun.passed ? `Release ${work.draft?.version} passed the recorded checks.` : "Make real remains unavailable until the exact draft revision passes rehearsal."}</p><WorkMakeLive work={work} latestRun={latestRun} /></section>
  </div>;
}

function InlinePreviewEditor({ work }: { work: InquiryWork }) {
  const { snapshot, perform, pending, can } = useInquiry();
  const draft = work.draft;
  const [headline, setHeadline] = useState(() => draft?.form.title || "");
  const [intro, setIntro] = useState(() => draft?.form.intro || "");
  if (!draft) return <EmptySection text="The editable preview appears after the accepted Shape." />;
  const currentDraft = draft;
  const changed = headline !== currentDraft.form.title || intro !== currentDraft.form.intro;
  async function save() {
    if (!changed || !can("canEdit")) return;
    const actorId = snapshot.audience === "agency" ? "agency-member" : "business-owner";
    if (headline !== currentDraft.form.title) await perform({ kind: "edit", requestId: work.id, input: { actorId, source: "manual", path: "form.title", after: headline, expectedBefore: currentDraft.form.title } });
    if (intro !== currentDraft.form.intro) await perform({ kind: "edit", requestId: work.id, input: { actorId, source: "manual", path: "form.intro", after: intro, expectedBefore: currentDraft.form.intro } });
  }
  const previewDefinition = publicFormFromDefinition(currentDraft, headline, intro);
  return <div className={styles.inlinePreview}><div className={styles.inlinePreviewEditor}><label htmlFor={`inline-preview-title-${work.id}`}>Form title<input id={`inline-preview-title-${work.id}`} value={headline} onChange={(event) => setHeadline(event.target.value)} disabled={!can("canEdit") || pending} /></label><label htmlFor={`inline-preview-intro-${work.id}`}>Introduction<textarea id={`inline-preview-intro-${work.id}`} value={intro} onChange={(event) => setIntro(event.target.value)} rows={3} disabled={!can("canEdit") || pending} /></label><div className={styles.inlineEditorFooter}><span>{changed ? "Unsaved preview changes" : `Release ${currentDraft.version} preview`}</span><StPill type="button" variant="soft" onClick={() => void save()} disabled={!changed || pending || !can("canEdit")}>{pending ? "Saving…" : "Save preview changes"}</StPill></div></div><div className={styles.inlineSharedPreview}><StrelvaInquiryForm definition={previewDefinition} submitLabel="Send inquiry" /></div></div>;
}

function WorkMakeLive({ work, latestRun }: { work: InquiryWork; latestRun: InquirySurfaceSnapshot["state"]["rehearsalRuns"][number] | undefined }) {
  const { snapshot, perform, navigate, pending, can } = useInquiry();
  const ready = Boolean(latestRun?.passed && latestRun.definitionVersion === work.draft?.version);
  async function makeLive() {
    if (!ready || !can("canPublish")) return;
    const result = await perform({ kind: "publish", requestId: work.id, actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
    if (result?.change) navigate("receipt", { requestId: work.id });
  }
  return <StPill type="button" onClick={() => void makeLive()} disabled={!ready || pending || !can("canPublish")}>{pending ? "Making live…" : "Make it live"}<ArrowRight size={16} aria-hidden="true" /></StPill>;
}

function PlanView() {
  const { selectedWork, navigate, can } = useInquiry();
  if (!selectedWork) return <Unavailable title="The plan is unavailable" description="Return to Recent changes and open an accessible request." />;
  const work = selectedWork;
  const currentPlan = work.plan;
  return <StPage>
    <PageIntro eyebrow="REQUEST · PLAN" title="A small plan with a clear boundary." action={<StTextButton type="button" onClick={() => navigate("work", { requestId: work.id })}><ArrowLeft size={15} aria-hidden="true" />Request</StTextButton>}>
      {work.intent}
    </PageIntro>
    <section className={styles.planPanel} aria-labelledby="plan-title">
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Plan · Release {currentPlan?.version || work.draft?.version || work.shape.version}</span><h2 id="plan-title" className="font-display">What Strelva will check</h2><p>The plan uses fixed inquiry components. A change to the shape creates a new revision.</p></div><span className={styles.scopeTag}>{work.businessId}</span></div>
      {currentPlan ? <ol className={styles.planList}>{currentPlan.steps.map((step, index) => <li key={step.id}><span className={styles.planIndex}>{index + 1}</span><div><strong>{step.label}</strong><p>{step.id === "rehearsal" ? "Try the form with a made-up customer before it can go live." : step.explanation}</p><small>{step.requiresApproval ? "Person approval required" : "No external approval"} · {step.reversible ? "Reversible" : "Record preserved"}</small></div></li>)}</ol> : <EmptySection text="The plan has not been built from the accepted shape yet." />}
      <div className={styles.acceptanceBox}><span className={styles.eyebrow}>ACCEPTANCE</span><ul>{currentPlan?.acceptance.map((item) => <li key={item}><Check size={14} aria-hidden="true" />{item}</li>)}</ul></div>
      <div className={styles.panelFooter}><StPill type="button" variant="soft" onClick={() => navigate("shape", { requestId: work.id })}>Change shape</StPill><StPill type="button" onClick={() => navigate("preview", { requestId: work.id })} disabled={!can("canEdit") || !work.draft}>Open editable preview<ArrowRight size={16} aria-hidden="true" /></StPill></div>
    </section>
  </StPage>;
}

function PreviewView() {
  const { selectedWork, navigate, snapshot, perform, pending, can } = useInquiry();
  const draft = selectedWork?.draft;
  const [headline, setHeadline] = useState(() => draft?.form.title || "");
  const [intro, setIntro] = useState(() => draft?.form.intro || "");
  if (!selectedWork || !draft) return <Unavailable title="The preview is unavailable" description="Accept the Shape first, then open the result Strelva prepared." />;
  const work = selectedWork;
  const currentDraft = draft;
  async function saveEdit(path: string, value: JsonValue, expectedBefore: JsonValue | undefined) {
    if (!can("canEdit")) return;
    await perform({ kind: "edit", requestId: work.id, input: { actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner", source: "manual", path, after: value, expectedBefore } });
  }
  async function saveAll() {
    if (headline !== currentDraft.form.title) await saveEdit("form.title", headline, currentDraft.form.title);
    if (intro !== currentDraft.form.intro) await saveEdit("form.intro", intro, currentDraft.form.intro);
  }
  const previewDefinition = publicFormFromDefinition(currentDraft, headline, intro);
  const latestChange = snapshot.state.changes.find((change) => change.requestId === work.id);
  return <StPage>
    <PageIntro eyebrow="RESULT · EDITABLE PREVIEW" title="Review the exact customer-facing form." action={<StTextButton type="button" onClick={() => navigate("plan", { requestId: selectedWork.id })}><ArrowLeft size={15} aria-hidden="true" />Plan</StTextButton>}>
      Your edits and your written instruction become one Change receipt for this form revision.
    </PageIntro>
    <section className={styles.previewGrid} aria-label="Editable inquiry preview">
      <div className={styles.previewSurface}>
        <div className={styles.previewHeader}><span className={styles.previewBrand}><span>{snapshot.business.name} preview</span></span><span className={styles.versionTag}>Release {currentDraft.version}</span></div>
        <div className={styles.previewEditor}>
          <label htmlFor="preview-headline">Form title<input id="preview-headline" value={headline} onChange={(event) => setHeadline(event.target.value)} disabled={!can("canEdit") || pending} /></label>
          <label htmlFor="preview-intro">Introduction<textarea id="preview-intro" value={intro} onChange={(event) => setIntro(event.target.value)} rows={3} disabled={!can("canEdit") || pending} /></label>
          <div className={styles.sharedFormPreview}><StrelvaInquiryForm definition={previewDefinition} submitLabel="Send inquiry" /></div>
        </div>
      </div>
      <aside className={styles.previewAside} aria-label="Preview consequences">
        <section><span className={styles.eyebrow}>ROUTING</span><h2 className="font-display">Where it goes</h2><p>{currentDraft.routing ? currentDraft.routing.sentence : "No routing rule was selected in the Shape."}</p><small>{currentDraft.routing ? `${currentDraft.routing.destination} · within ${currentDraft.routing.withinMinutes} minutes` : "A person must choose a route before publication."}</small></section>
        <section><span className={styles.eyebrow}>FOLLOW-UP</span><h2 className="font-display">If nobody replies</h2><p>{currentDraft.followUp ? currentDraft.followUp.sentence : "No follow-up rule was selected in the Shape."}</p><small>{currentDraft.followUp ? `${currentDraft.followUp.maxAttempts} attempt · sender: ${currentDraft.followUp.disclosure}` : "No message will be scheduled."}</small></section>
        <section><span className={styles.eyebrow}>CHANGE</span><h2 className="font-display">One receipt</h2><p>{latestChange ? latestChange.summary : "Your next edit will create a structured Change receipt."}</p><StTextButton type="button" onClick={() => navigate("receipt", { requestId: work.id })}>Inspect before and after <ArrowRight size={14} aria-hidden="true" /></StTextButton></section>
      </aside>
    </section>
    <RuleEditor key={`${work.id}:${currentDraft.version}`} work={work} />
    <div className={styles.editorActions}><StPill type="button" variant="soft" onClick={() => navigate("rehearsal", { requestId: work.id })}>Go to rehearsal</StPill><StPill type="button" onClick={() => void saveAll()} disabled={!can("canEdit") || pending}>{pending ? "Saving edit…" : "Save preview edit"}<Check size={16} aria-hidden="true" /></StPill></div>
  </StPage>;
}

function RuleEditor({ work }: { work: InquiryWork }) {
  const { snapshot, perform, pending, can } = useInquiry();
  const draft = work.draft;
  const [destination, setDestination] = useState(() => draft?.routing?.destination || "");
  const [withinMinutes, setWithinMinutes] = useState(() => String(draft?.routing?.withinMinutes || 10));
  const [afterMinutes, setAfterMinutes] = useState(() => String(draft?.followUp?.afterMinutes || 1_440));
  const [maxAttempts, setMaxAttempts] = useState(() => String(draft?.followUp?.maxAttempts || 1));
  const [messageTemplate, setMessageTemplate] = useState(() => draft?.followUp?.messageTemplate || "");
  const [formError, setFormError] = useState("");
  if (!draft) return null;
  const routing = draft.routing;
  const followUp = draft.followUp;
  const changed = Boolean(routing && (destination !== routing.destination || Number(withinMinutes) !== routing.withinMinutes)) || Boolean(followUp && (Number(afterMinutes) !== followUp.afterMinutes || Number(maxAttempts) !== followUp.maxAttempts || messageTemplate !== followUp.messageTemplate));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || !can("canEdit")) return;
    const nextWithin = Number(withinMinutes);
    const nextAfter = Number(afterMinutes);
    const nextAttempts = Number(maxAttempts);
    if ((routing && (!destination.trim() || !Number.isSafeInteger(nextWithin) || nextWithin < 1)) || (followUp && (!Number.isSafeInteger(nextAfter) || nextAfter < 1 || !Number.isSafeInteger(nextAttempts) || nextAttempts < 1 || !messageTemplate.trim()))) {
      setFormError("Enter a destination and whole minute values for each rule.");
      return;
    }
    setFormError("");
    await perform({
      kind: "edit-rules",
      requestId: work.id,
      input: {
        actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner",
        source: "manual",
        ...(routing ? { routing: { destination: destination.trim(), withinMinutes: nextWithin } } : {}),
        ...(followUp ? { followUp: { afterMinutes: nextAfter, maxAttempts: nextAttempts, messageTemplate: messageTemplate.trim() } } : {}),
      },
    });
  }
  return <form className={styles.ruleEditor} onSubmit={(event) => void save(event)} aria-labelledby="rule-editor-title">
    <div className={styles.ruleEditorHeader}><div><span className={styles.eyebrow}>PLAIN RULES</span><h2 id="rule-editor-title" className="font-display">Edit what happens next.</h2><p>Choose who receives new inquiries and when Strelva should follow up.</p></div><span className={styles.versionTag}>Draft Release {draft.version}</span></div>
    <div className={styles.ruleEditorGrid}>
      {routing ? <fieldset className={styles.ruleFieldset}><legend>Routing</legend><label>Send new inquiries to<input value={destination} onChange={(event) => setDestination(event.target.value)} disabled={!can("canEdit") || pending} maxLength={200} /></label><label>Within minutes<input type="number" min={1} step={1} value={withinMinutes} onChange={(event) => setWithinMinutes(event.target.value)} disabled={!can("canEdit") || pending} /></label><p className={styles.ruleHint}>Current sentence: {routing.sentence}</p></fieldset> : <fieldset className={styles.ruleFieldset}><legend>Routing</legend><p className={styles.ruleHint}>No routing rule is in this Shape. Start a new Shape to add one.</p></fieldset>}
      {followUp ? <fieldset className={styles.ruleFieldset}><legend>Follow-up</legend><label>Follow up after minutes<input type="number" min={1} step={1} value={afterMinutes} onChange={(event) => setAfterMinutes(event.target.value)} disabled={!can("canEdit") || pending} /></label><label>Maximum attempts<input type="number" min={1} step={1} value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} disabled={!can("canEdit") || pending} /></label><label>Message to send<textarea rows={3} value={messageTemplate} onChange={(event) => setMessageTemplate(event.target.value)} disabled={!can("canEdit") || pending} maxLength={5_000} /></label><p className={styles.ruleHint}>Strelva identifies itself in this message. Current sentence: {followUp.sentence}</p><p className={styles.ruleHint}>Reply checks cover this inquiry’s Strelva reply address. If your team answers somewhere else, mark the inquiry handled here to stop follow-ups. Missing reply evidence blocks an automatic send.</p></fieldset> : <fieldset className={styles.ruleFieldset}><legend>Follow-up</legend><p className={styles.ruleHint}>No follow-up rule is in this Shape. Start a new Shape to add one.</p></fieldset>}
    </div>
    {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
    <div className={styles.ruleEditorFooter}><span>{changed ? "Unsaved rule changes" : "Rules match this draft revision."}</span><StPill type="submit" variant="soft" disabled={!changed || pending || !can("canEdit")}>{pending ? "Saving rules…" : "Save rule changes"}</StPill></div>
  </form>;
}

function publicFormFromDefinition(definition: InquiryCapabilityDefinition, title: string, intro: string): PublicInquiryForm {
  return {
    schemaVersion: 1,
    capabilityId: definition.id,
    version: definition.version,
    name: definition.name,
    form: {
      ...definition.form,
      title,
      intro,
    },
  };
}

function RehearsalView() {
  const { selectedWork, snapshot, perform, navigate, pending, can } = useInquiry();
  if (!selectedWork) return <Unavailable title="The rehearsal is unavailable" description="Open a shaped request to rehearse its exact revision." />;
  const work = selectedWork;
  const run = [...snapshot.state.rehearsalRuns].filter((item) => item.requestId === work.id).sort((left, right) => Date.parse(right.ranAt) - Date.parse(left.ranAt))[0];
  const currentVersion = work.draft?.version || null;
  const currentRun = run && run.definitionVersion === currentVersion ? run : undefined;
  async function runNow() {
    await perform({ kind: "rehearse", requestId: work.id, actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner" });
  }
  async function makeLive() {
    if (!can("canPublish")) return;
    const result = await perform({ kind: "publish", requestId: work.id, actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner" });
    if (result?.change) navigate("receipt", { requestId: work.id });
  }
  async function simulateInquiry() {
    if (!snapshot.rehearsal || !work.draft) return;
    const fields = currentRun?.syntheticRecord?.fields || Object.fromEntries(work.draft.form.fields.map((field) => [field.id, field.kind === "email" ? "test.customer@example.invalid" : field.kind === "phone" ? "(555) 555-0100" : field.label]));
    const result = await perform({ kind: "simulate-inquiry", capabilityId: work.capabilityId, fields, actorId: "rehearsal-test" });
    if (result?.record) navigate("record", { inquiryId: result.record.id });
  }
  return <StPage>
    <PageIntro eyebrow="REQUEST · REHEARSAL" title="Run the saved release safely." action={<StTextButton type="button" onClick={() => navigate("preview", { requestId: work.id })}><ArrowLeft size={15} aria-hidden="true" />Preview</StTextButton>}>
      Synthetic customer input, a test inbox, a fast-forwarded follow-up, and blocked external writes are recorded as one run.
    </PageIntro>
    <section className={styles.rehearsalPanel} aria-labelledby="rehearsal-title">
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Release {currentVersion || "not set"}</span><h2 id="rehearsal-title" className="font-display">{currentRun ? `${currentRun.passedCount} of ${currentRun.totalCount} checks passed` : "No rehearsal for this revision yet"}</h2><p>{currentRun ? "The result below is derived from named checks that ran." : "Make real stays unavailable until this exact draft revision passes rehearsal."}</p></div><span className={styles.stateTag} data-state={currentRun?.passed ? "passed" : "pending"}>{currentRun?.passed ? "Passed" : "Pending"}</span></div>
      {currentRun ? <div className={styles.rehearsalGrid}><section><h3 className="font-display">Named checks</h3><ul className={styles.checkList}>{currentRun.checks.map((check) => <li key={check.id} data-status={check.status}><span>{check.status === "passed" ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></li>)}</ul></section><section className={styles.syntheticColumn}><h3 className="font-display">Synthetic evidence</h3><div className={styles.syntheticItem}><span className={styles.eyebrow}>TEST CUSTOMER RECORD</span><strong>{currentRun.syntheticRecord ? "Created, not persisted" : "No synthetic record"}</strong><p>{currentRun.syntheticRecord ? Object.entries(currentRun.syntheticRecord.fields).map(([key, value]) => `${key}: ${value}`).join(" · ") : "The run did not create a record."}</p></div><div className={styles.syntheticItem}><span className={styles.eyebrow}>TEST INBOX</span><strong>{currentRun.testInbox.length > 0 ? "Accepted by test inbox" : "No test message"}</strong><p>{currentRun.testInbox.map((message) => `${message.to} · ${message.disclosedAs}`).join(" · ") || "No test inbox evidence."}</p></div><div className={styles.syntheticItem}><span className={styles.eyebrow}>FAST FOLLOW-UP</span><strong>{currentRun.fastForwardMinutes} minutes simulated</strong><p>{currentRun.outboundMessages.length > 0 ? "A synthetic message was produced." : "No live outbound message was sent."}</p></div></section></div> : <EmptySection text="Run this exact draft through the eight fixed checks to create rehearsal evidence." />}
      <div className={styles.rehearsalGuard}><LockKeyhole size={16} aria-hidden="true" /><span>External email, calendar, Stripe, Google, MLS, publication, and arbitrary network writes are blocked in rehearsal.</span></div>
      <div className={styles.panelFooter}><StPill type="button" variant="soft" onClick={() => void runNow()} disabled={pending || !can("canEdit")}>{pending ? "Running checks…" : currentRun ? "Run again" : "Run rehearsal"}<ClipboardCheck size={16} aria-hidden="true" /></StPill>{snapshot.rehearsal ? <StPill type="button" variant="soft" onClick={() => void simulateInquiry()} disabled={pending || !currentRun?.passed}>Send test inquiry</StPill> : null}<StPill type="button" onClick={() => void makeLive()} disabled={!currentRun?.passed || pending || !can("canPublish")}>Make it live<ArrowRight size={16} aria-hidden="true" /></StPill></div>
    </section>
  </StPage>;
}

function ReceiptView() {
  const { selectedWork, snapshot, perform, navigate, pending, can } = useInquiry();
  if (!selectedWork) return <Unavailable title="The receipt is unavailable" description="Open a request from Recent changes to inspect its change evidence." />;
  const work = selectedWork;
  const receipts = snapshot.state.changes.filter((change) => change.requestId === work.id);
  const receipt = receipts[0];
  async function undo() {
    if (!can("canPublish")) return;
    const result = await perform({ kind: "undo", requestId: work.id, actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner" });
    if (result?.change) navigate("receipt", { requestId: work.id });
  }
  return <StPage>
    <PageIntro eyebrow="RESULT · RECEIPT" title="A record of what changed." action={<StTextButton type="button" onClick={() => navigate("work", { requestId: work.id })}><ArrowLeft size={15} aria-hidden="true" />Request</StTextButton>}>
      Before and after are projected from the same versioned Change used by the editable preview.
    </PageIntro>
    {receipt ? <ChangeReceiptPanel receipt={receipt} currentDefinition={work.draft} /> : <EmptySection text="No Change receipt is recorded for this request yet." />}
    {receipt ? <div className={styles.receiptActions}><StPill type="button" variant="soft" onClick={() => navigate("preview", { requestId: work.id })}>Open editable preview</StPill>{receipt.undoAvailable ? <StTextButton type="button" tone="danger" onClick={() => void undo()} disabled={pending || !can("canPublish")}><RotateCcw size={15} aria-hidden="true" />Undo this Change</StTextButton> : <span className={styles.receiptHint}>Undo is unavailable for this release.</span>}</div> : null}
    <section className={styles.receiptTrust}><ShieldCheck size={17} aria-hidden="true" /><p><strong>What this proves.</strong> The receipt records the actor, target, revision, exact items, and verification evidence. A provider acceptance is kept separate from read-back verification.</p></section>
  </StPage>;
}

function ChangeReceiptPanel({ receipt, currentDefinition }: { receipt: NonNullable<InquirySurfaceSnapshot["state"]["changes"]>[number]; currentDefinition?: InquiryCapabilityDefinition | null }) {
  const { snapshot } = useInquiry();
  const formItem = receipt.items.find((item) => item.kind === "form");
  const recordItems = receipt.items.filter((item) => item.kind === "record");
  const ruleItems = receipt.items.filter((item) => item.kind === "routing_rule" || item.kind === "follow_up_rule");
  return <section className={styles.receiptPanel} aria-labelledby={`receipt-${receipt.id}`}>
    <div className={styles.panelHeading}><div><span className={styles.eyebrow}>CHANGE {receipt.id}</span><h2 id={`receipt-${receipt.id}`} className="font-display">{receipt.summary}</h2><p>Release {receipt.targetVersion} · {inquiryChangeActorLabels(snapshot, receipt)} · {receipt.status.replaceAll("_", " ")}</p></div><span className={styles.receiptStamp}><CheckCircle2 size={15} aria-hidden="true" />Receipt</span></div>
    {formItem ? <ReceiptFormPair item={formItem} items={receipt.items.filter((item) => item.kind === "form")} currentDefinition={currentDefinition} /> : null}
    {ruleItems.length > 0 ? <section className={styles.receiptRules} aria-label="Rule changes"><span className={styles.eyebrow}>RULES</span>{ruleItems.map((item) => <div className={styles.receiptRule} key={item.id}><strong>{item.kind === "routing_rule" ? "Routing" : "Follow-up"}</strong><div className={styles.beforeAfter}><span><small>Before</small><del>{receiptRuleSentence(item.before)}</del></span><ArrowRight size={15} aria-hidden="true" /><span><small>After</small><b>{receiptRuleSentence(item.after)}</b></span></div></div>)}</section> : null}
    {recordItems.length > 0 ? <ReceiptRecordPair item={recordItems[0]!} items={recordItems} currentDefinition={currentDefinition} /> : null}
    <div className={styles.receiptItems}>{receipt.items.filter((item) => item !== formItem && !recordItems.includes(item) && !ruleItems.includes(item)).map((item) => <div className={styles.receiptItem} key={item.id}><div><span className={styles.receiptKind}>{item.kind.replaceAll("_", " ")}</span><strong>{item.path}</strong></div><div className={styles.beforeAfter}><span><small>Before</small><del>{formatReceiptValue(item.before)}</del></span><ArrowRight size={15} aria-hidden="true" /><span><small>After</small><b>{formatReceiptValue(item.after)}</b></span></div></div>)}</div>
    <dl className={styles.receiptMeta}><div><dt>Why</dt><dd>{receipt.summary}</dd></div><div><dt>Evidence</dt><dd>{receipt.verification?.evidence.join(" · ") || (snapshot.rehearsal ? "Rehearsal evidence is pending for this release." : "No verification evidence recorded yet.")}</dd></div><div><dt>Records preserved</dt><dd>{receipt.preservedInquiryIds.length > 0 ? receipt.preservedInquiryIds.join(", ") : "No inquiry IDs were removed by this Change."}</dd></div></dl>
  </section>;
}

function formatReceiptValue(value: unknown): string {
  if (value === null || value === undefined) return "Nothing recorded";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => formatReceiptValue(item)).join(", ");
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.map(([key, child]) => `${key.replaceAll(/([A-Z])/g, " $1").toLowerCase()}: ${formatReceiptValue(child)}`).join(" · ");
  }
  return "Structured value";
}

function receiptRuleSentence(value: unknown): string {
  if (value && typeof value === "object" && "sentence" in value && typeof value.sentence === "string") return value.sentence;
  return formatReceiptValue(value);
}

function ReceiptFormPair({ item, items, currentDefinition }: { item: NonNullable<InquirySurfaceSnapshot["state"]["changes"]>[number]["items"][number]; items: NonNullable<InquirySurfaceSnapshot["state"]["changes"]>[number]["items"]; currentDefinition?: InquiryCapabilityDefinition | null }) {
  const beforeDefinition = currentDefinition ? formBeforeReceipt(currentDefinition, items) : null;
  const afterValue = currentDefinition ? currentDefinition.form : item.after;
  const beforeValue = currentDefinition ? beforeDefinition?.form || null : item.before;
  return <section className={styles.receiptFormPair} aria-label="Form before and after"><span className={styles.eyebrow}>FORM PREVIEW</span><div className={styles.receiptFormColumns}><div><small>Before</small><ReceiptFormValue value={beforeValue} emptyLabel="No form yet" /></div><ArrowRight size={17} aria-hidden="true" /><div><small>After</small><ReceiptFormValue value={afterValue} /></div></div></section>;
}

function ReceiptFormValue({ value, emptyLabel = "The form definition was not included in this receipt." }: { value: unknown; emptyLabel?: string }) {
  if (value === null || value === undefined) return <p className={styles.receiptMissing}>{emptyLabel}</p>;
  const form = publicFormFromReceiptValue(value);
  return form ? <div className={styles.receiptForm}><StrelvaInquiryForm definition={form} submitLabel="Send inquiry" /></div> : <p className={styles.receiptMissing}>{emptyLabel}</p>;
}

function ReceiptRecordPair({ item, items, currentDefinition }: { item: NonNullable<InquirySurfaceSnapshot["state"]["changes"]>[number]["items"][number]; items: NonNullable<InquirySurfaceSnapshot["state"]["changes"]>[number]["items"]; currentDefinition?: InquiryCapabilityDefinition | null }) {
  const beforeDefinition = currentDefinition ? recordBeforeReceipt(currentDefinition, items) : null;
  const beforeValue = currentDefinition ? beforeDefinition : item.before;
  const afterValue = currentDefinition ? currentDefinition.record : item.after;
  return <section className={styles.receiptFormPair} aria-label="Record definition before and after"><span className={styles.eyebrow}>RECORD PREVIEW</span><div className={styles.receiptFormColumns}><div><small>Before</small><ReceiptRecordValue value={beforeValue} /></div><ArrowRight size={17} aria-hidden="true" /><div><small>After</small><ReceiptRecordValue value={afterValue} /></div></div></section>;
}

function ReceiptRecordValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <p className={styles.receiptMissing}>No record type yet</p>;
  if (!isRecordDefinition(value)) return <p className={styles.receiptMissing}>Record details were not included in this receipt.</p>;
  return <div className={styles.receiptRecord}><strong>{value.singularLabel}</strong><span>{value.pluralLabel}</span><ul>{value.fields.map((field) => <li key={field.id}><b>{field.label}</b><small>{field.kind}{field.required ? " · required" : " · optional"}</small></li>)}</ul></div>;
}

function isRecordDefinition(value: unknown): value is InquiryRecordDefinition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<InquiryRecordDefinition>;
  return candidate.component === "record_detail" && candidate.type === "inquiry" && typeof candidate.singularLabel === "string" && typeof candidate.pluralLabel === "string" && Array.isArray(candidate.fields);
}

function recordBeforeReceipt(definition: InquiryCapabilityDefinition, items: NonNullable<InquirySurfaceSnapshot["state"]["changes"]>[number]["items"]): InquiryRecordDefinition | null {
  const initial = items.find((item) => item.path === "record")?.before;
  const before = isRecordDefinition(initial) ? initial : null;
  const changes = items.filter((item) => item.path.startsWith("record."));
  if (changes.length === 0) return before;
  const result = before ? cloneRecordDefinition(before) : cloneRecordDefinition(definition.record);
  for (const item of changes) setRecordDefinitionPath(result, item.path, item.before);
  return result;
}

function cloneRecordDefinition(definition: InquiryRecordDefinition): InquiryRecordDefinition {
  return JSON.parse(JSON.stringify(definition)) as InquiryRecordDefinition;
}

function setRecordDefinitionPath(definition: InquiryRecordDefinition, path: string, value: JsonValue | null): void {
  const segments = path.split(".");
  if (segments[0] !== "record" || segments.length < 2) return;
  let current: unknown = definition;
  for (const segment of segments.slice(0, -1)) {
    if (!current || typeof current !== "object") return;
    current = (current as Record<string, unknown>)[segment];
  }
  if (!current || typeof current !== "object") return;
  const last = segments[segments.length - 1]!;
  if (Array.isArray(current)) {
    const index = Number(last);
    if (Number.isInteger(index) && index >= 0 && index < current.length) current[index] = value;
  } else if (Object.prototype.hasOwnProperty.call(current, last)) {
    (current as Record<string, unknown>)[last] = value;
  }
}

function formBeforeReceipt(definition: InquiryCapabilityDefinition, items: NonNullable<InquirySurfaceSnapshot["state"]["changes"]>[number]["items"]): InquiryCapabilityDefinition | null {
  const initial = items.find((item) => item.path === "form")?.before;
  const before = initial && typeof initial === "object" && !Array.isArray(initial)
    ? { ...definition, form: initial as unknown as InquiryCapabilityDefinition["form"] }
    : null;
  const changes = items.filter((item) => item.path.startsWith("form."));
  if (changes.length === 0) return before;
  const result = before || cloneDefinition(definition);
  for (const item of changes) setDefinitionPath(result, item.path, item.before);
  return result;
}

function cloneDefinition(definition: InquiryCapabilityDefinition): InquiryCapabilityDefinition {
  return JSON.parse(JSON.stringify(definition)) as InquiryCapabilityDefinition;
}

function setDefinitionPath(definition: InquiryCapabilityDefinition, path: string, value: JsonValue | null): void {
  const segments = path.split(".");
  if (segments[0] !== "form" || segments.length < 2) return;
  let current: unknown = definition;
  for (const segment of segments.slice(0, -1)) {
    if (!current || typeof current !== "object") return;
    current = (current as Record<string, unknown>)[segment];
  }
  if (!current || typeof current !== "object") return;
  const last = segments[segments.length - 1]!;
  if (Array.isArray(current)) {
    const index = Number(last);
    if (Number.isInteger(index) && index >= 0 && index < current.length) current[index] = value;
  } else if (Object.prototype.hasOwnProperty.call(current, last)) {
    (current as Record<string, unknown>)[last] = value;
  }
}

function publicFormFromReceiptValue(value: unknown): PublicInquiryForm | null {
  if (!value || typeof value !== "object") return null;
  const form = value as Partial<PublicInquiryForm["form"]>;
  if (form.component !== "form" || typeof form.id !== "string" || typeof form.title !== "string" || typeof form.intro !== "string" || form.disclosure !== "Strelva" || !Array.isArray(form.fields)) return null;
  return { schemaVersion: 1, capabilityId: form.id, version: 1, name: form.title, form: form as PublicInquiryForm["form"] };
}

function SearchView() {
  const { snapshot, navigate } = useInquiry();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const works = snapshot.state.requests.filter((work) => matches(normalized, [work.intent, work.id, work.businessId, work.capabilityId]));
  const records = snapshot.state.inquiries.filter((record) => matches(normalized, [record.id, record.businessId, record.capabilityId, ...Object.values(record.fields)]));
  const changes = snapshot.state.changes.filter((change) => matches(normalized, [change.id, change.requestId, change.capabilityId, change.summary]));
  const anyResults = normalized ? works.length + records.length + changes.length > 0 : false;
  return <StPage><PageIntro eyebrow="SEARCH" title="Find requests in this business.">Search is permission-scoped. It only searches objects already returned for this actor.</PageIntro><label className={styles.searchField} htmlFor="inquiry-search"><Search size={18} aria-hidden="true" /><span className={styles.srOnly}>Search inquiries</span><input id="inquiry-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a request, record, or change…" autoComplete="off" /></label>{normalized && anyResults ? <div className={styles.searchResults}>{works.length > 0 ? <SearchGroup title="Requests" icon={FileText}>{works.map((work) => <button type="button" key={work.id} onClick={() => navigate("work", { requestId: work.id })}><span><strong>{work.intent}</strong><small>{requestStateLabel(work.state)} · {work.businessId}</small></span><ChevronRight size={16} aria-hidden="true" /></button>)}</SearchGroup> : null}{records.length > 0 ? <SearchGroup title="Records" icon={Inbox}>{records.map((record) => <button type="button" key={record.id} onClick={() => navigate("record", { inquiryId: record.id })}><span><strong>{record.id}</strong><small>{record.businessId} · {record.status}</small></span><ChevronRight size={16} aria-hidden="true" /></button>)}</SearchGroup> : null}{changes.length > 0 ? <SearchGroup title="Changes" icon={RotateCcw}>{changes.map((change) => <button type="button" key={change.id} onClick={() => navigate("receipt", { requestId: change.requestId })}><span><strong>{change.summary}</strong><small>Release {change.targetVersion} · {change.status}</small></span><ChevronRight size={16} aria-hidden="true" /></button>)}</SearchGroup> : null}</div> : <div className={styles.searchEmpty}>{normalized ? <><Search size={22} aria-hidden="true" /><h2 className="font-display">No matching requests</h2><p>Try a request name or record ID within {snapshot.business.name}.</p></> : <><ListFilter size={22} aria-hidden="true" /><h2 className="font-display">Search is ready</h2><p>Type a business-scoped request, record, or change.</p></>}</div>}</StPage>;
}

function SearchGroup({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return <section className={styles.searchGroup} aria-labelledby={`search-${title.toLowerCase()}`}><div className={styles.sectionHeading}><div className={styles.sectionTitle}><Icon size={16} aria-hidden="true" /><h2 id={`search-${title.toLowerCase()}`} className="font-display">{title}</h2></div></div><div className={styles.searchGroupRows}>{children}</div></section>;
}

function matches(query: string, values: unknown[]): boolean {
  if (!query) return false;
  return values.some((value) => typeof value === "string" && value.toLowerCase().includes(query));
}

function RecordView() {
  const { snapshot, selectedRecord, navigate } = useInquiry();
  const records = snapshot.state.inquiries;
  if (snapshot.recordsAvailable === false) return <Unavailable title="Inquiry records are unavailable" description="The record store could not be reached. Your inquiries have not been replaced with an empty list." />;
  if (!selectedRecord) return <RecordList records={records} />;
  return <RecordDetail record={selectedRecord} onBack={() => navigate("record", { inquiryId: null })} />;
}

function RecordList({ records }: { records: InquiryRecord[] }) {
  const { snapshot, navigate, perform, pending, can } = useInquiry();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"assign" | "mark_handled" | null>(null);
  const [lastBulkIds, setLastBulkIds] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState("");
  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  async function executeBulk() {
    if (!bulkAction || selectedIds.length === 0 || !can("canManageRecords")) return;
    const result = await perform({ kind: "bulk-record", recordIds: selectedIds, action: bulkAction, actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
    if (result) {
      setLastBulkIds(result.affectedRecordIds || selectedIds);
      setBulkMessage(result.message || `${selectedIds.length} record${selectedIds.length === 1 ? "" : "s"} received an individual result.`);
      setSelectedIds([]);
      setBulkAction(null);
    }
  }
  async function undoBulk() {
    if (lastBulkIds.length === 0 || !can("canManageRecords")) return;
    const result = await perform({ kind: "bulk-undo", recordIds: lastBulkIds, actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
    if (result) {
      setBulkMessage(result.message || "The grouped change was undone. All inquiry records were kept.");
      setLastBulkIds([]);
    }
  }
  const allSelected = records.length > 0 && selectedIds.length === records.length;
  return <div data-workspace-theme="linen"><StPage>
    <StHead title="Inquiries" crumb={{ label: "Home", onClick: () => navigate("home") }} meta="Customer records and their recorded history." />
    {bulkMessage ? <StToast>{bulkMessage}{lastBulkIds.length > 0 ? <StTextButton onClick={() => void undoBulk()} disabled={pending || !can("canManageRecords")}>Undo this group</StTextButton> : null}</StToast> : null}
    <StSection title="Inquiries received">
      {records.length > 0 ? <>
        <div className={recordStyles.bulkControls}><label><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : records.map((record) => record.id))} aria-label="Select all records in this business" /> Select all records in this scope</label>{selectedIds.length > 0 ? <><StMono>{selectedIds.length} selected</StMono><StPill variant="soft" onClick={() => setBulkAction("assign")} disabled={!can("canManageRecords")}>Assign</StPill><StPill variant="soft" onClick={() => setBulkAction("mark_handled")} disabled={!can("canManageRecords")}>Mark handled</StPill></> : null}</div>
        <StRows label="Inquiry records">{records.map((record) => <StRow key={record.id} lead={<label className={recordStyles.select}><input type="checkbox" checked={selectedIds.includes(record.id)} onChange={() => toggle(record.id)} aria-label={`Select ${record.id}`} /><span className={styles.srOnly}>{record.id}</span></label>} title={<StTextButton onClick={() => navigate("record", { inquiryId: record.id })}>{record.fields.name || record.id}</StTextButton>} detail={<><StMono>{record.id}</StMono> · {humanize(record.status)} · form at time of submission: Release <StMono>{record.capabilityVersion}</StMono></>} end={<><StMono>{formatDate(record.receivedAt)}</StMono><StTextButton onClick={() => navigate("record", { inquiryId: record.id })} aria-label={`Inspect ${record.id}`}>Open</StTextButton></>} />)}</StRows>
      </> : <StEmpty>A submitted inquiry will appear here with its received facts and timeline.</StEmpty>}
    </StSection>
    {bulkAction ? <BulkConfirm action={bulkAction} recordIds={selectedIds} onCancel={() => setBulkAction(null)} onConfirm={() => void executeBulk()} pending={pending} /> : null}
  </StPage></div>;
}

function BulkConfirm({ action, recordIds, onCancel, onConfirm, pending }: { action: "assign" | "mark_handled"; recordIds: string[]; onCancel: () => void; onConfirm: () => void; pending: boolean }) {
  return <section className={styles.confirmPanel} aria-labelledby="bulk-confirm-title"><span className={styles.eyebrow}>CONFIRM BULK ACTION</span><h2 id="bulk-confirm-title" className="font-display">{action === "assign" ? "Assign these records?" : "Mark these records handled?"}</h2><p>These selected records become one change with one receipt and one undo. All records stay in place.</p><ul className={styles.targetList}>{recordIds.map((id) => <li key={id}>{id}</li>)}</ul><div className={styles.panelFooter}><StPill type="button" variant="soft" onClick={onCancel} disabled={pending}>Cancel</StPill><StPill type="button" onClick={onConfirm} disabled={pending}>{pending ? "Recording results…" : "Confirm exact records"}</StPill></div></section>;
}

function RecordDetail({ record, onBack }: { record: InquiryRecord; onBack: () => void }) {
  const { snapshot, navigate, perform, pending, can } = useInquiry();
  const timeline = snapshot.state.timeline.filter((event) => event.inquiryId === record.id).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const [bulkMessage, setBulkMessage] = useState("");
  async function mark(action: "assign" | "mark_handled") {
    if (!can("canManageRecords")) return;
    const result = await perform({ kind: "bulk-record", recordIds: [record.id], action, actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
    if (result) setBulkMessage(result.message || "The record was updated. Its receipt is in the timeline.");
  }
  return <div data-workspace-theme="linen"><StPage>
    <StHead title={record.fields.name || record.id} crumb={{ label: "All records", onClick: onBack }} meta={<>Received <StMono>{formatDate(record.receivedAt)}</StMono></>} />
    {bulkMessage ? <StToast>{bulkMessage}</StToast> : null}
    <div className={recordStyles.layout}><StSurface label="Submitted inquiry facts"><div className={recordStyles.stack}>
      <StState kind={record.status === "blocked" ? "down" : record.status === "follow_up_pending" ? "need" : record.status === "new" ? "draft" : "live"}>{humanize(record.status)}</StState>
      <dl className={recordStyles.facts}>{Object.entries(record.fields).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{value || "Nothing recorded"}</dd></div>)}</dl>
      <div className={recordStyles.meta}><span>Form at time of submission: Release <StMono>{record.capabilityVersion}</StMono></span><span>{record.assigneeId ? <>Assigned to <StMono>{record.assigneeId}</StMono></> : "Unassigned"}</span></div>
      <div className={recordStyles.actions}><StPill variant="soft" onClick={() => void mark("assign")} disabled={pending || !can("canManageRecords")}>Assign to me</StPill><StPill variant="soft" onClick={() => void mark("mark_handled")} disabled={pending || !can("canManageRecords")}>Mark handled</StPill></div>
    </div></StSurface><RecordTimeline events={timeline} /></div>
    <RecordMessageReview record={record} />
    <div className={recordStyles.stack}><OnThisInput record={record} /><StTextButton onClick={() => navigate("why", { inquiryId: record.id })}>Ask Why from recorded evidence</StTextButton></div>
  </StPage></div>;
}

function OnThisInput({ record }: { record: InquiryRecord }) {
  const { snapshot, perform, navigate, pending, can } = useInquiry();
  const [intent, setIntent] = useState("");
  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = intent.trim();
    if (!request || !can("canStart")) return;
    const result = await perform({ kind: "contextual-request", inquiryId: record.id, intent: request, actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner" });
    if (result?.work) navigate("shape", { requestId: result.work.id, inquiryId: record.id });
  }
  return <section className={styles.onThisInput} aria-labelledby="on-this-input-title"><span className={styles.eyebrow}>ON THIS INPUT</span><h2 id="on-this-input-title" className="font-display">Keep the next action bounded.</h2><p>Use the submitted facts for this record only. Strelva cannot widen the business or form scope from a selected record.</p><ul>{Object.keys(record.fields).slice(0, 4).map((key) => <li key={key}>{humanize(key)}</li>)}</ul><form className={styles.contextualRequest} onSubmit={(event) => void ask(event)}><label htmlFor={`on-this-request-${record.id}`}>Ask about this inquiry<textarea id={`on-this-request-${record.id}`} value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="What should happen next?" rows={3} maxLength={2_000} disabled={pending || !can("canStart")} /></label><div className={styles.contextualFooter}><small>This request stays attached to {record.id} and its form revision.</small><StPill type="submit" variant="soft" disabled={pending || !intent.trim() || !can("canStart")}>{pending ? "Starting…" : "Start from this inquiry"}<ArrowRight size={15} aria-hidden="true" /></StPill></div></form></section>;
}

function RecordTimeline({ events }: { events: InquirySurfaceSnapshot["state"]["timeline"] }) {
  const { snapshot } = useInquiry();
  return <StSection title="What happened" meta="Recorded events">
    {snapshot.deliveryEvidence?.available === false ? <StNotice tone="need">Delivery evidence is unavailable right now. Provider outcomes may be missing from this timeline.</StNotice> : null}
    {events.length > 0 ? <StSteps label="Inquiry history" steps={events.map((event) => ({
      title: humanize(event.type),
      state: event.outcome === "failed" || event.outcome === "blocked" ? "failed" : "done",
      time: Number.isFinite(Date.parse(event.at)) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.at)) : "Time not recorded",
      detail: <><span>{event.summary}</span><span className={recordStyles.eventMeta}>{inquiryActorLabel(event.actor)} · {humanize(event.outcome)}{event.receiptId ? <> · receipt <StMono>{event.receiptId}</StMono></> : null}</span>{event.evidence.length > 0 ? <span className={recordStyles.eventMeta}>Evidence: {event.evidence.join(" · ")}</span> : null}</>,
    }))} /> : <StEmpty>No timeline events are recorded for this inquiry.</StEmpty>}
  </StSection>;
}

function WhyView() {
  const { selectedRecord, selectedWhy, navigate, perform, snapshot, pending, can } = useInquiry();
  if (!selectedRecord) return <Unavailable title="Why needs a record" description="Open an inquiry first to see what happened to it." />;
  const record = selectedRecord;
  async function applyFix() {
    if (!selectedWhy?.fix || !can("canEdit")) return;
    await perform({ kind: "fix-why", requestId: record.id, path: selectedWhy.fix.targetPath, actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
  }
  return <StPage><PageIntro eyebrow="WHY · RECORDED EVIDENCE" title="What caused this outcome?" action={<StTextButton type="button" onClick={() => navigate("record", { inquiryId: record.id })}><ArrowLeft size={15} aria-hidden="true" />Record</StTextButton>}>{selectedWhy ? selectedWhy.summary : "There is not enough history to explain this inquiry yet."}</PageIntro>{snapshot.deliveryEvidence?.available === false ? <p className={styles.readOnlyCopy} role="status">Delivery evidence is unavailable right now. Why cannot offer a provider-based fix until the timeline can be read.</p> : null}{selectedWhy ? <section className={styles.whyPanel} aria-labelledby="why-chain-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>TIMELINE</span><h2 id="why-chain-title" className="font-display">Recorded steps</h2><p>Every step below comes from the inquiry timeline. Missing links remain visible.</p></div></div><ol className={styles.whyChain}>{selectedWhy.steps.map((step) => <li key={step.eventId || step.label} data-status={step.status}><span>{step.status === "ok" ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}</span><div><strong>{step.label}</strong><p>{step.sentence}</p>{step.eventId ? <StTextButton type="button" onClick={() => navigate("record", { inquiryId: record.id })}>Open record history</StTextButton> : <small>No recorded update yet.</small>}</div></li>)}</ol>{selectedWhy.brokenStep ? <div className={styles.whyBroken}><AlertCircle size={16} aria-hidden="true" /><p><strong>Broken step.</strong> {selectedWhy.brokenStep.sentence}</p></div> : null}{selectedWhy.fix ? <div className={styles.fixProposal}><span className={styles.eyebrow}>SUGGESTED FIX</span><h3 className="font-display">{selectedWhy.fix.title}</h3><p>{selectedWhy.fix.reason}</p><StPill type="button" onClick={() => void applyFix()} disabled={pending || !can("canEdit")}>Review this fix</StPill></div> : <EmptySection text="No safe fix proposal was returned for the recorded evidence." />}</section> : <section className={styles.missingEvidence}><CircleHelp size={18} aria-hidden="true" /><h2 className="font-display">The cause cannot be determined.</h2><p>There is not enough recorded history to explain this outcome yet.</p><StPill type="button" variant="soft" onClick={() => navigate("record", { inquiryId: record.id })}>Inspect the record</StPill></section>}</StPage>;
}

function ResponsibilityView() {
  const { snapshot, selectedWork, navigate, perform, pending, can } = useInquiry();
  const policy = snapshot.state.responsibilities.find((item) => item.capabilityId === selectedWork?.capabilityId) || snapshot.state.responsibilities[0];
  if (!policy) return <Unavailable title="No running rules are recorded" description="No ongoing inquiry rules have been recorded for this business." />;
  const policyId = policy.id;
  async function promote() {
    if (!can("canManageResponsibility")) return;
    await perform({ kind: "promote-responsibility", responsibilityId: policyId, actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
  }
  return <StPage><PageIntro eyebrow="RUNNING" title={policy.title} action={<StTextButton type="button" onClick={() => navigate("home")}><ArrowLeft size={15} aria-hidden="true" />Home</StTextButton>}>{policy.scope} · {policy.status === "paused" ? "Paused" : "Active"}</PageIntro><section className={styles.responsibilityPanel} aria-labelledby="responsibility-scope-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>SCOPE</span><h2 id="responsibility-scope-title" className="font-display">What Strelva may handle</h2></div><span className={styles.stateTag} data-state={policy.status}>{policy.status}</span></div><p>{policy.scope}</p><div className={styles.responsibilityColumns}><ResponsibilityList title="Allowed" items={policy.allowedActions.map((item) => humanize(item))} /><ResponsibilityList title="Pre-authorized" items={policy.preAuthorizedActions.map((item) => humanize(item))} /><ResponsibilityList title="Never" items={policy.never.map((item) => item.sentence)} /><ResponsibilityList title="Ask first" items={policy.approval.map((item) => item.sentence)} /></div></section><ResponsibilityEditor key={`${policy.id}:${policy.updatedAt}:${policy.title}:${policy.scope}`} policy={policy} /><section className={styles.responsibilityDetails} aria-labelledby="responsibility-limits-title"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>OPERATING LIMITS</span><h2 id="responsibility-limits-title" className="font-display">The boundary stays inspectable.</h2></div></div><dl className={styles.detailList}><div><dt>Budget</dt><dd>{policy.budget.dailyMessages} messages per day · {policy.budget.timezone}</dd></div><div><dt>Escalation</dt><dd>{policy.escalation.primary}{policy.escalation.secondary ? ` · backup ${policy.escalation.secondary}` : ""}</dd></div><div><dt>Voice</dt><dd>{policy.voice}</dd></div><div><dt>Hours</dt><dd>{formatHours(policy.hours)}</dd></div><div><dt>Trust</dt><dd>{policy.trust === "trusted" ? "Trusted after a clean record" : "Supervised"}</dd></div><div><dt>Clean record</dt><dd>{policy.cleanReceiptCount} clean receipt{policy.cleanReceiptCount === 1 ? "" : "s"} of {policy.requiredCleanReceipts} required · {policy.failedReceiptCount} failed</dd></div><div><dt>Sponsor</dt><dd>{policy.sponsorId}</dd></div></dl>{policy.trust === "supervised" ? <div className={styles.promotionBox}><ShieldCheck size={17} aria-hidden="true" /><div><strong>Promotion stays explicit.</strong><p>It needs this actor, a clean inspectable record, and the engine&apos;s trust decision. Earlier limits remain in force.</p></div><StPill type="button" variant="soft" onClick={() => void promote()} disabled={pending || !can("canManageResponsibility")}>Request promotion</StPill></div> : <div className={styles.trustBox}><ShieldCheck size={17} aria-hidden="true" /><p>This policy is trusted inside the written scope. New actions outside it still require a person.</p></div>}</section></StPage>;
}

function ResponsibilityList({ title, items }: { title: string; items: string[] }) {
  return <section className={styles.responsibilityList}><h3 className="font-display">{title}</h3>{items.length > 0 ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Nothing recorded.</p>}</section>;
}

const RESPONSIBILITY_ACTION_OPTIONS: ResponsibilityAction[] = ["reply", "ask_question", "assign", "send_message", "schedule_follow_up", "change_rule", "publish", "delete", "change_permissions", "charge", "quote_price", "promise_date"];
const RESPONSIBILITY_DAY_OPTIONS = [{ value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 0, label: "Sun" }];

function ActionChecklist({ legend, selected, onToggle, disabled, available }: { legend: string; selected: ResponsibilityAction[]; onToggle: (action: ResponsibilityAction) => void; disabled: boolean; available?: ResponsibilityAction[] }) {
  return <fieldset className={styles.actionChecklist}><legend>{legend}</legend><div>{RESPONSIBILITY_ACTION_OPTIONS.map((action) => { const unavailable = available ? !available.includes(action) : false; return <label key={action}><input type="checkbox" checked={selected.includes(action)} onChange={() => onToggle(action)} disabled={disabled || unavailable} />{humanize(action)}</label>; })}</div></fieldset>;
}

function ResponsibilityEditor({ policy }: { policy: ResponsibilityPolicy }) {
  const { snapshot, perform, pending, can } = useInquiry();
  const editable = can("canManageResponsibility");
  const [title, setTitle] = useState(() => policy.title);
  const [scope, setScope] = useState(() => policy.scope);
  const [allowedActions, setAllowedActions] = useState<ResponsibilityAction[]>(() => [...policy.allowedActions]);
  const [preAuthorizedActions, setPreAuthorizedActions] = useState<ResponsibilityAction[]>(() => [...policy.preAuthorizedActions]);
  const [never, setNever] = useState(() => policy.never.map((clause) => ({ ...clause })));
  const [approval, setApproval] = useState(() => policy.approval.map((clause) => ({ ...clause })));
  const [dailyMessages, setDailyMessages] = useState(() => String(policy.budget.dailyMessages));
  const [budgetTimezone, setBudgetTimezone] = useState(() => policy.budget.timezone);
  const [primaryEscalation, setPrimaryEscalation] = useState(() => policy.escalation.primary);
  const [secondaryEscalation, setSecondaryEscalation] = useState(() => policy.escalation.secondary || "");
  const [voice, setVoice] = useState(() => policy.voice);
  const [hoursTimezone, setHoursTimezone] = useState(() => policy.hours.timezone);
  const [hoursDays, setHoursDays] = useState<number[]>(() => [...policy.hours.days]);
  const [hoursStart, setHoursStart] = useState(() => policy.hours.start);
  const [hoursEnd, setHoursEnd] = useState(() => policy.hours.end);
  const [requiredCleanReceipts, setRequiredCleanReceipts] = useState(() => String(policy.requiredCleanReceipts));
  const [formError, setFormError] = useState("");

  function toggleAllowed(action: ResponsibilityAction) {
    if (allowedActions.includes(action)) {
      if (preAuthorizedActions.includes(action) || never.some((clause) => clause.action === action) || approval.some((clause) => clause.action === action)) {
        setFormError("Remove this action from its pre-authorized or ask-first wording before removing it from Allowed.");
        return;
      }
      setAllowedActions((current) => current.filter((item) => item !== action));
      return;
    }
    setFormError("");
    setAllowedActions((current) => [...current, action]);
  }
  function togglePreAuthorized(action: ResponsibilityAction) {
    if (!allowedActions.includes(action)) return;
    setPreAuthorizedActions((current) => current.includes(action) ? current.filter((item) => item !== action) : [...current, action]);
  }
  function toggleDay(day: number) {
    setHoursDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((left, right) => left - right));
  }
  function updateClause(kind: "never" | "approval", index: number, sentence: string) {
    if (kind === "never") setNever((current) => current.map((clause, clauseIndex) => clauseIndex === index ? { ...clause, sentence } : clause));
    else setApproval((current) => current.map((clause, clauseIndex) => clauseIndex === index ? { ...clause, sentence } : clause));
  }
  function removeClause(kind: "never" | "approval", index: number) {
    if (kind === "never") setNever((current) => current.filter((_, clauseIndex) => clauseIndex !== index));
    else setApproval((current) => current.filter((_, clauseIndex) => clauseIndex !== index));
  }
  function addClause(kind: "never" | "approval") {
    const current = kind === "never" ? never : approval;
    const action = allowedActions.find((candidate) => !current.some((clause) => clause.action === candidate));
    if (!action) return;
    const sentence = kind === "never" ? `Never ${humanize(action).toLowerCase()}.` : `Ask before ${humanize(action).toLowerCase()}.`;
    if (kind === "never") setNever((items) => [...items, { action, sentence }]);
    else setApproval((items) => [...items, { action, sentence }]);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;
    const daily = Number(dailyMessages);
    const required = Number(requiredCleanReceipts);
    if (allowedActions.length === 0 || !Number.isSafeInteger(daily) || daily < 1 || !Number.isSafeInteger(required) || required < 1 || hoursDays.length === 0 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hoursStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hoursEnd)) {
      setFormError("Give these rules an allowed action, valid limits, at least one day, and HH:mm hours.");
      return;
    }
    setFormError("");
    await perform({
      kind: "update-responsibility",
      responsibilityId: policy.id,
      input: {
        actorId: snapshot.audience === "agency" ? "agency-member" : "business-owner",
        title,
        scope,
        allowedActions,
        preAuthorizedActions,
        never,
        approval,
        budget: { dailyMessages: daily, timezone: budgetTimezone },
        escalation: { primary: primaryEscalation, secondary: secondaryEscalation.trim() || null },
        voice,
        hours: { timezone: hoursTimezone, days: hoursDays, start: hoursStart, end: hoursEnd },
        requiredCleanReceipts: required,
      },
    });
  }
  return <form className={styles.responsibilityEditor} onSubmit={(event) => void save(event)} aria-labelledby="responsibility-editor-title"><div className={styles.responsibilityEditorHeader}><div><span className={styles.eyebrow}>EDITABLE DOCUMENT</span><h2 id="responsibility-editor-title" className="font-display">Keep the boundary in plain language.</h2><p>Saving a boundary edit records the actor and returns these rules to supervised trust.</p></div><span className={styles.stateTag} data-state={policy.trust}>{policy.trust}</span></div><div className={styles.responsibilityFields}><label>Running rule title<input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!editable || pending} maxLength={200} /></label><label>Scope<textarea value={scope} onChange={(event) => setScope(event.target.value)} disabled={!editable || pending} rows={3} maxLength={1_000} /></label></div><div className={styles.responsibilityEditorColumns}><div className={styles.responsibilityEditorColumn}><ActionChecklist legend="Allowed actions" selected={allowedActions} onToggle={toggleAllowed} disabled={!editable || pending} /><ActionChecklist legend="Pre-authorized actions" selected={preAuthorizedActions} onToggle={togglePreAuthorized} available={allowedActions} disabled={!editable || pending} /><ClauseEditor title="Never" clauses={never} onChange={(index, sentence) => updateClause("never", index, sentence)} onRemove={(index) => removeClause("never", index)} onAdd={() => addClause("never")} disabled={!editable || pending} /></div><div className={styles.responsibilityEditorColumn}><ClauseEditor title="Ask first" clauses={approval} onChange={(index, sentence) => updateClause("approval", index, sentence)} onRemove={(index) => removeClause("approval", index)} onAdd={() => addClause("approval")} disabled={!editable || pending} /><fieldset className={styles.ruleFieldset}><legend>Limits and escalation</legend><label>Messages per day<input type="number" min={1} step={1} value={dailyMessages} onChange={(event) => setDailyMessages(event.target.value)} disabled={!editable || pending} /></label><label>Budget timezone<input value={budgetTimezone} onChange={(event) => setBudgetTimezone(event.target.value)} disabled={!editable || pending} /></label><label>Primary escalation contact<input value={primaryEscalation} onChange={(event) => setPrimaryEscalation(event.target.value)} disabled={!editable || pending} /></label><label>Backup escalation contact<input value={secondaryEscalation} onChange={(event) => setSecondaryEscalation(event.target.value)} disabled={!editable || pending} /></label></fieldset><label className={styles.responsibilityTextField}>Approved voice<textarea value={voice} onChange={(event) => setVoice(event.target.value)} disabled={!editable || pending} rows={3} maxLength={1_000} /></label><fieldset className={styles.ruleFieldset}><legend>Hours</legend><label>Hours timezone<input value={hoursTimezone} onChange={(event) => setHoursTimezone(event.target.value)} disabled={!editable || pending} /></label><div className={styles.hoursInputs}><label>Start<input type="time" value={hoursStart} onChange={(event) => setHoursStart(event.target.value)} disabled={!editable || pending} /></label><label>End<input type="time" value={hoursEnd} onChange={(event) => setHoursEnd(event.target.value)} disabled={!editable || pending} /></label></div><div className={styles.dayPicker}><span>Days</span>{RESPONSIBILITY_DAY_OPTIONS.map((day) => <label key={day.value}><input type="checkbox" checked={hoursDays.includes(day.value)} onChange={() => toggleDay(day.value)} disabled={!editable || pending} />{day.label}</label>)}</div></fieldset><label>Clean receipts required<input type="number" min={1} max={100} step={1} value={requiredCleanReceipts} onChange={(event) => setRequiredCleanReceipts(event.target.value)} disabled={!editable || pending} /></label></div></div>{formError ? <p className={styles.formError} role="alert">{formError}</p> : null}<div className={styles.responsibilityEditorFooter}><span>{editable ? "Every save records the rules in History." : "These running rules are read-only for your account."}</span><StPill type="submit"  disabled={!editable || pending}>{pending ? "Saving rules…" : "Save running rules"}</StPill></div></form>;
}

function ClauseEditor({ title, clauses, onChange, onRemove, onAdd, disabled }: { title: string; clauses: Array<{ action: ResponsibilityAction; sentence: string }>; onChange: (index: number, sentence: string) => void; onRemove: (index: number) => void; onAdd: () => void; disabled: boolean }) {
  return <fieldset className={styles.clauseEditor}><legend>{title}</legend>{clauses.map((clause, index) => <div className={styles.clauseRow} key={`${clause.action}-${index}`}><label><span>{humanize(clause.action)}</span><input value={clause.sentence} onChange={(event) => onChange(index, event.target.value)} disabled={disabled} maxLength={1_000} /></label><StTextButton type="button" onClick={() => onRemove(index)} disabled={disabled}>Remove</StTextButton></div>)}<StTextButton type="button" onClick={onAdd} disabled={disabled}>Add {title.toLowerCase()} rule</StTextButton></fieldset>;
}

function ConnectionsView() {
  const { snapshot, navigate } = useInquiry();
  return <StPage><PageIntro eyebrow="CONNECTIONS" title="Recorded connections for this Business." action={<StTextButton type="button" onClick={() => navigate("home")}><ArrowLeft size={15} aria-hidden="true" />Home</StTextButton>}>A connected label records a scoped connection. It does not grant an unrecorded scope or expose a secret.</PageIntro><section className={styles.connectionsPanel} aria-labelledby="connections-title"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>FIVE PROVIDERS</span><h2 id="connections-title" className="font-display">What is recorded</h2></div></div>{snapshot.connections.length > 0 ? <div className={styles.connectionRows}>{snapshot.connections.map((connection) => <ConnectionRow key={connection.id} connection={connection} />)}</div> : <EmptySection text="No connection projection is available for this Business." />}</section></StPage>;
}

function ConnectionRow({ connection }: { connection: InquiryConnectionView }) {
  const { snapshot, selectedWork, navigate, perform, pending, can } = useInquiry();
  const checked = connection.lastCheckedAt ? formatDate(connection.lastCheckedAt) : "Last check not recorded";
  const connected = connection.status === "connected";
  const isEmail = connection.id === "email";
  const emailBinding = selectedWork?.draft?.connections.find((item) => item.id === "email");
  const emailReady = Boolean(selectedWork?.draft);
  const emailAllowed = emailBinding?.status === "connected" && emailBinding.consent === "explicit";
  async function toggleEmailConsent() {
    if (!selectedWork || !can("canManageConnections")) return;
    await perform({ kind: "set-email-consent", requestId: selectedWork.id, granted: !emailAllowed, actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
  }
  return <article className={styles.connectionRow} data-status={connection.status}><div className={styles.connectionIdentity}><span className={styles.rowIcon} aria-hidden="true"><Link2 size={17} /></span><div><h3 className="font-display">{connection.label}</h3><p>{connected ? "Connected for this Business" : connection.status === "unavailable" ? "Unavailable while this connection service is offline" : "Not configured"}</p></div></div><div className={styles.connectionFacts}><div><small>Can see</small><p>{connected && connection.canSee.length > 0 ? connection.canSee.join(" · ") : connected ? "Permission details not recorded" : "No recorded access"}</p></div><div><small>Can do</small><p>{connected && connection.canDo.length > 0 ? connection.canDo.join(" · ") : connected ? "Permission details not recorded" : "No recorded access"}</p></div><div><small>Last checked</small><p>{checked}</p></div></div><div className={styles.connectionActions}><span className={styles.consentTag}>Consent required</span>{isEmail ? <div className={styles.emailConsent}><strong>{selectedWork ? emailReady ? (emailAllowed ? "Email permission allowed for this inquiry" : "Email permission is not allowed for this inquiry") : "Accept this inquiry Shape before granting email permission" : "Choose an inquiry before granting email permission"}</strong><p>Allows this inquiry to use email. Each send still needs your approval or a rule you set. Inbox reading is separate.</p>{selectedWork ? emailReady ? <StTextButton type="button" onClick={() => void toggleEmailConsent()} disabled={pending || !can("canManageConnections")}>{emailAllowed ? "Revoke email permission" : "Allow email for this inquiry"}</StTextButton> : <StTextButton type="button" onClick={() => navigate("work", { requestId: selectedWork.id })}>Open request to accept Shape</StTextButton> : <StTextButton type="button" onClick={() => navigate("work")} disabled={snapshot.state.requests.length === 0}>Choose an inquiry</StTextButton>}</div> : connection.manageHref ? <a className={styles.textButton} href={connection.manageHref}>Manage or disconnect</a> : <span className={styles.connectionUnavailable}>Disconnect is not available from this surface.</span>}</div></article>;
}

function OnboardingView() {
  const { snapshot, navigate, perform, pending, can } = useInquiry();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState(() => snapshot.onboarding.website || "");
  const statements = snapshot.onboarding.statements;
  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = website.trim();
    if (!value || !can("canCorrectOnboarding")) return;
    await perform({ kind: "scan-onboarding", website: value, actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
  }
  async function correct(statementId: string) {
    const statement = statements.find((item) => item.id === statementId);
    if (!statement || !can("canCorrectOnboarding")) return;
    const value = drafts[statementId] ?? statement.value ?? "";
    if (!value.trim()) return;
    await perform({ kind: "correct-onboarding", statementId, value: value.trim(), actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
  }
  return <StPage><PageIntro eyebrow="CHECK MY WEBSITE" title="Start with what the website can show." action={<StTextButton type="button" onClick={() => navigate("home")}><ArrowLeft size={15} aria-hidden="true" />Home</StTextButton>}>{snapshot.onboarding.website ? `Website input: ${snapshot.onboarding.website}` : "No website has been recorded for this Business."}</PageIntro><section className={styles.onboardingPanel} aria-labelledby="onboarding-facts-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>SOURCED FACTS</span><h2 id="onboarding-facts-title" className="font-display">Correct only what the first form needs.</h2><p>Website-only input remains unverified until a real check or your correction records it.</p></div></div><form className={styles.onboardingScan} onSubmit={(event) => void scan(event)}><label htmlFor="onboarding-website">Read website<input id="onboarding-website" type="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" disabled={pending || !can("canCorrectOnboarding")} /></label><StPill type="submit" variant="soft" disabled={pending || !website.trim() || !can("canCorrectOnboarding")}>{pending ? "Reading…" : "Read website"}</StPill><small>Only public page metadata is proposed. The isolated preview blocks website reads.</small></form>{statements.length > 0 ? <div className={styles.statementRows}>{statements.map((statement) => <div className={styles.statementRow} key={statement.id}><div className={styles.statementLabel}><label htmlFor={`onboarding-${statement.id}`}>{statement.label}</label><small>{statement.provenance || "Provenance not recorded"}</small></div><input id={`onboarding-${statement.id}`} value={drafts[statement.id] ?? statement.value ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [statement.id]: event.target.value }))} disabled={!statement.editable || !can("canCorrectOnboarding") || pending} placeholder="Unknown" /><span className={statement.confirmed ? styles.confirmedTag : styles.unknownTag}>{statement.confirmed ? "Confirmed" : "Needs confirmation"}</span>{statement.editable ? <StTextButton type="button" onClick={() => void correct(statement.id)} disabled={!can("canCorrectOnboarding") || pending}>Save correction</StTextButton> : null}</div>)}</div> : <EmptySection text="No sourced statements were returned for this Business." />}</section><section className={styles.checksPanel} aria-labelledby="onboarding-checks-title"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>CHECKS</span><h2 id="onboarding-checks-title" className="font-display">What has been verified</h2></div></div>{snapshot.onboarding.checks.length > 0 ? <ul className={styles.onboardingChecks}>{snapshot.onboarding.checks.map((check) => <li key={check.id} data-status={check.status}><span>{check.status === "passed" ? <CheckCircle2 size={16} aria-hidden="true" /> : check.status === "failed" ? <AlertCircle size={16} aria-hidden="true" /> : <CircleHelp size={16} aria-hidden="true" />}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div><small>{check.status}</small></li>)}</ul> : <EmptySection text="No website checks have run." />}</section></StPage>;
}

function AccountView() {
  const { snapshot, navigate } = useInquiry();
  const account = snapshot.account;
  return <StPage><PageIntro eyebrow="ACCOUNT" title="Your Strelva account." action={<StTextButton type="button" onClick={() => navigate("home")}><ArrowLeft size={15} aria-hidden="true" />Home</StTextButton>}>Account identity and business access stay separate from the selected Business facts.</PageIntro><section className={styles.accountPanel} aria-labelledby="account-title"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>SIGNED-IN PERSON</span><h2 id="account-title" className="font-display">{account?.name || "Name not returned"}</h2><p>{account?.email || "Email not returned"}</p></div></div><div className={styles.accountScope}><span className={styles.eyebrow}>CURRENT ROLE</span><strong>{snapshot.business.role.replaceAll("_", " ")}</strong><p>{snapshot.business.name}</p></div><div className={styles.membershipList}><span className={styles.eyebrow}>MEMBERSHIPS</span>{account?.memberships?.length ? <ul>{account.memberships.map((membership) => <li key={membership.businessId}><strong>{membership.businessName}</strong><span>{membership.role}</span></li>)}</ul> : <p>No membership details were returned.</p>}</div></section></StPage>;
}

function Unavailable({ title, description }: { title: string; description: string }) {
  return <StPage><StHead title={title} /><StNotice>{description}</StNotice></StPage>;
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp) : "Date not recorded";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll(/([A-Z])/g, " $1").trim().replace(/^./, (character) => character.toUpperCase());
}

function formatHours(hours: ResponsibilityPolicy["hours"]): string {
  const days = hours.days.length > 0 ? hours.days.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || String(day)).join(", ") : "No days recorded";
  return `${days} · ${hours.start}–${hours.end} · ${hours.timezone}`;
}
