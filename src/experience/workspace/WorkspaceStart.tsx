"use client";

import { ArrowRight, Check, CircleHelp, Clipboard, FileSearch, FileText, Globe2, MessageSquareText, Table2 } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { WorkspaceComposer } from "./WorkspaceComposer";
import styles from "./workspace-surface.module.css";
import {
  createWorkspaceStartContinuation,
  planWorkspaceStart,
  workspaceStartContinueLabel,
  type WorkspaceStartContext,
  type WorkspaceStartContinuation,
  type WorkspaceStartPart,
  type WorkspaceStartPlan,
  type WorkspaceStartWebsiteHandoff,
} from "./workspace-start";

export interface WorkspaceStartProps {
  context: WorkspaceStartContext;
  initialRequest?: string;
  draftKey?: string;
  onDraftChange?: (request: string) => void;
  onTemplates?: () => void;
  websiteHandoff?: WorkspaceStartWebsiteHandoff | null;
  onWebsiteHandoffBack?: () => void;
  onContinue: (continuation: WorkspaceStartContinuation) => void;
  onHelp: (request: string) => void;
  /** Open the existing model-backed plan flow. The plan is optional for old callers. */
  onPlan?: (request: string, plan?: WorkspaceStartPlan) => void;
}

const EXAMPLES = [
  { label: "Create a staff request app", request: "Create a staff request app for our team.", icon: Table2 },
  { label: "Organize onboarding", request: "Organize supplier onboarding requirements.", icon: FileText },
  { label: "Have Strelva build my website", request: "Have Strelva build a website for my business.", icon: Globe2 },
  { label: "Handle customer inquiries", request: "We need a better way to handle customer inquiries and follow up when nobody replies.", icon: MessageSquareText },
  { label: "Turn a file into a tracker", request: "Turn my spreadsheet into a tracker I can filter and keep up to date.", icon: Table2 },
  { label: "Check a business", request: "Help me see what AI can understand about my business.", icon: FileSearch },
  { label: "Improve my website", request: "I want to improve a page on my website and review the change before it goes live.", icon: Globe2 },
  { label: "Draft a private document", request: "Draft a private procedure my team can use and keep a history of changes.", icon: FileText },
] as const;

function renderPlanIcon(route: WorkspaceStartPlan["route"]): ReactNode {
  if (route === "inquiries") return <MessageSquareText size={19} aria-hidden="true" />;
  if (route === "tracker") return <Table2 size={19} aria-hidden="true" />;
  if (route === "website" || route === "websites") return <Globe2 size={19} aria-hidden="true" />;
  if (route === "document") return <FileText size={19} aria-hidden="true" />;
  return <FileSearch size={19} aria-hidden="true" />;
}

function selectionLabel(plan: WorkspaceStartPlan): string | null {
  if (plan.needsSelection === "business") return "business for this work";
  if (plan.needsSelection === "site") return "website for this work";
  return null;
}

function renderPart(part: WorkspaceStartPart, selected: boolean, onToggle: () => void, inputId: string) {
  const body = <><span className={styles.startPartCopy}><strong>{part.label}</strong><small>{part.detail}</small></span></>;
  if (!part.editable) return <div key={part.id} className={styles.startPart}><span className={styles.startPartCheck} aria-hidden="true"><Check size={15} /></span>{body}</div>;
  return <label key={part.id} htmlFor={inputId} className={styles.startPart}><input id={inputId} type="checkbox" checked={selected} onChange={onToggle} /><span className={styles.startPartCheck} aria-hidden="true"><Check size={15} /></span>{body}</label>;
}

function WebsiteRequestHandoff({ handoff, onBack }: { handoff: WorkspaceStartWebsiteHandoff; onBack?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const requestRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useId();

  async function copyRequest() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(handoff.request);
      } else {
        const textarea = requestRef.current;
        if (!textarea) throw new Error("Copy unavailable");
        textarea.focus();
        textarea.select();
        if (!document.execCommand("copy")) throw new Error("Copy unavailable");
      }
      setCopied(true);
      setCopyError("");
    } catch {
      setCopied(false);
      setCopyError("Copy was unavailable. Select the request below and copy it before opening the website.");
    }
  }

  return <section className={styles.startProposal} aria-labelledby="website-request-handoff-title">
    <div className={styles.startProposalHeader}><div className={styles.startProposalIcon}><Globe2 size={19} aria-hidden="true" /></div><div><p className={styles.eyebrow}>Website work</p><h2 id="website-request-handoff-title">Open {handoff.site.title} with your request ready.</h2></div></div>
    <p className={styles.startProposalSummary}>The website opens in a separate step, so this request cannot travel there automatically. Copy it first, then open the website. Nothing has been sent.</p>
    <label className={styles.startRequestField} htmlFor={requestId}><span>Request to carry with you</span><textarea ref={requestRef} id={requestId} value={handoff.request} readOnly rows={5} /></label>
    {copyError ? <p className={styles.startError} role="alert">{copyError}</p> : null}
    <div className={styles.startProposalActions}><button type="button" className={styles.primaryAction} onClick={() => void copyRequest()}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? "Copied" : "Copy request"}</button><a className={styles.secondaryAction} href={handoff.site.href} target="_blank" rel="noreferrer">Open website<ArrowRight size={16} /></a>{onBack ? <button type="button" className={styles.secondaryAction} onClick={onBack}>Back to request</button> : null}</div>
    {copied ? <p className={styles.startFootnote} role="status">Your request is on the clipboard. Paste it into the website conversation when you are ready.</p> : null}
  </section>;
}

export function WorkspaceStart({ context, initialRequest = "", draftKey, onDraftChange, onTemplates, websiteHandoff = null, onWebsiteHandoffBack, onContinue, onHelp, onPlan }: WorkspaceStartProps) {
  const [request, setRequest] = useState(initialRequest);
  const [plan, setPlan] = useState<WorkspaceStartPlan | null>(() => initialRequest.trim() ? planWorkspaceStart(initialRequest, context) : null);
  const [selectedPartIds, setSelectedPartIds] = useState<readonly string[]>(() => initialRequest.trim() ? planWorkspaceStart(initialRequest, context).selectedPartIds : []);
  const [businessId, setBusinessId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [trackerTemplateId, setTrackerTemplateId] = useState("");
  const [error, setError] = useState("");
  const formId = useId();


  function submit(request: string) {
    setRequest(request);
    onDraftChange?.(request);
    const next = planWorkspaceStart(request, context);
    setPlan(next);
    setSelectedPartIds(next.selectedPartIds);
    setBusinessId(next.route === "inquiries" && context.inquiryBusinesses?.length === 1 ? context.inquiryBusinesses[0]!.id : "");
    setSiteId(next.route === "website" && context.managedSites?.length === 1 ? context.managedSites[0]!.id : "");
    setTrackerTemplateId(next.suggestedTemplateId || "");
    setError("");
  }

  function chooseExample(value: string) {
    setRequest(value);
    onDraftChange?.(value);
    setPlan(null);
    setError("");
  }

  function togglePart(partId: string) {
    setSelectedPartIds((current) => current.includes(partId) ? current.filter((id) => id !== partId) : [...current, partId]);
  }

  function continueToSupportedFlow() {
    if (!plan) return;
    if (plan.deliveryMode === "service") {
      if (context.readOnly || context.native?.help === false || !plan.canContinue) return;
      onHelp(plan.helpRequest || plan.request);
      return;
    }
    if (plan.kind === "help") {
      if (!plan.canContinue) {
        onHelp(plan.helpRequest || plan.request);
        return;
      }
      if (onPlan) onPlan(plan.helpRequest || plan.request, plan);
      else onHelp(plan.helpRequest || plan.request);
      return;
    }
    if (plan.status !== "ready") {
      onHelp(plan.helpRequest || plan.request);
      return;
    }
    const continuation = createWorkspaceStartContinuation(plan, selectedPartIds, { businessId: businessId || undefined, siteId: siteId || undefined, trackerTemplateId: trackerTemplateId || undefined }, context);
    if (!continuation) {
      setError(plan.needsSelection === "business" ? "Choose the business this work concerns." : plan.needsSelection === "site" ? "Choose the website this work concerns." : "Keep the required parts selected before continuing.");
      return;
    }
    onContinue(continuation);
  }

  const canContinue = plan?.kind === "help"
    ? plan.canContinue
    : plan?.status === "ready" && (!plan.needsSelection || (plan.needsSelection === "business" ? Boolean(businessId) : Boolean(siteId)));
  const canPreparePlan = Boolean(onPlan) && !context.readOnly && plan?.deliveryMode !== "service";
  function preparePlan() {
    if (!plan || !canPreparePlan) return;
    onPlan?.(plan.request, plan);
  }
  const selection = plan ? selectionLabel(plan) : null;
  const selectedBusiness = plan?.route === "inquiries" ? context.inquiryBusinesses || [] : [];
  const selectedSites = plan?.route === "website" ? context.managedSites || [] : [];
  const templates = plan?.route === "tracker" ? context.trackerTemplates || [] : [];
  return <div className={styles.startPage} data-workspace-start>
    <header className={styles.startHeader}>
      <p className={styles.eyebrow}>New work</p>
      <h1>What does your business need?</h1>
      <p>Describe the result in your own words. You can review what Strelva proposes before any work starts.</p>
    </header>

    <WorkspaceComposer initialRequest={request} draftKey={draftKey} disabled={Boolean(context.readOnly)} autoFocus onSubmit={submit} onTemplates={onTemplates} />

    <section className={styles.startExamples} aria-labelledby={`${formId}-examples`}>
      <div className={styles.startSectionHeading}><h2 id={`${formId}-examples`}>Try an example</h2><span>Optional</span></div>
      <div className={styles.startExampleList}>{EXAMPLES.map(({ label, request: exampleRequest, icon: ExampleIcon }) => <button key={label} type="button" className={styles.startExample} onClick={() => chooseExample(exampleRequest)}><ExampleIcon size={16} aria-hidden="true" /><span>{label}</span><ArrowRight size={14} aria-hidden="true" /></button>)}</div>
    </section>

    {websiteHandoff ? <WebsiteRequestHandoff handoff={websiteHandoff} onBack={onWebsiteHandoffBack} /> : plan ? <section className={styles.startProposal} aria-labelledby={`${formId}-proposal`} aria-live="polite">
      <div className={styles.startProposalHeader}><div className={styles.startProposalIcon}>{renderPlanIcon(plan.route)}</div><div><p className={styles.eyebrow}>{plan.kind === "help" ? (plan.matchedRoutes?.length ? "Multiple outcomes" : "Request to review") : "Proposed next step"}</p><h2 id={`${formId}-proposal`}>{plan.title}</h2></div></div>
      <p className={styles.startProposalSummary}>{plan.summary}</p>
      {plan.kind === "help" ? <p className={styles.startRequestEcho}><strong>Your request stays intact:</strong> <span>{plan.request}</span></p> : null}
      <p className={styles.startNextAction}><strong>Next:</strong> {plan.nextAction}</p>
        {plan.kind === "help" ? <><div className={styles.startHelp}><CircleHelp size={17} aria-hidden="true" /><p><strong>Let’s prepare this request.</strong> Review the proposed results and anything that needs your decision. Nothing has started yet. {context.readOnly ? "Switch to a workspace you own before preparing a plan." : "You can ask about the closest path when none of these fits."}</p></div>{plan.reason ? <div className={styles.startBlocked} role="status"><CircleHelp size={17} aria-hidden="true" /><p>{plan.reason}</p></div> : null}</> : <>
        <div className={styles.startParts} aria-label="Proposed shape">{plan.parts.map((part) => renderPart(part, selectedPartIds.includes(part.id), () => togglePart(part.id), `${formId}-${part.id}`))}</div>
        {selection ? <label className={styles.startSelect} htmlFor={`${formId}-selection`}><span>{selection}</span><select id={`${formId}-selection`} value={plan.needsSelection === "business" ? businessId : siteId} onChange={(event) => plan.needsSelection === "business" ? setBusinessId(event.target.value) : setSiteId(event.target.value)} required><option value="">Choose one</option>{(plan.needsSelection === "business" ? selectedBusiness : selectedSites).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : null}
        {templates.length ? <label className={styles.startSelect} htmlFor={`${formId}-template`}><span>Starting shape <small>Optional</small></span><select id={`${formId}-template`} value={trackerTemplateId} onChange={(event) => setTrackerTemplateId(event.target.value)}><option value="">Start from a blank tracker</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label> : null}
        {plan.status === "blocked" ? <div className={styles.startBlocked} role="status"><CircleHelp size={17} aria-hidden="true" /><p>{plan.reason}</p></div> : null}
      </>}
      {error ? <p className={styles.startError} role="alert">{error}</p> : null}
      <div className={styles.startProposalActions}>{plan.kind === "help" ? <><button type="button" className={styles.primaryAction} disabled={!canContinue} onClick={continueToSupportedFlow}>{plan.deliveryMode === "service" ? "Review website request" : "Prepare a plan"}<ArrowRight size={16} /></button><button type="button" className={styles.secondaryAction} onClick={() => onHelp(plan.helpRequest || plan.request)}>Ask about available paths<ArrowRight size={16} /></button></> : plan.status === "blocked" ? <>{canPreparePlan ? <button type="button" className={styles.primaryAction} onClick={preparePlan}>Prepare a plan<ArrowRight size={16} /></button> : null}<button type="button" className={styles.secondaryAction} onClick={continueToSupportedFlow}>Ask about this path<ArrowRight size={16} /></button></> : <><button type="button" className={styles.primaryAction} disabled={!canContinue} onClick={continueToSupportedFlow}>{workspaceStartContinueLabel(plan)}<ArrowRight size={16} /></button>{canPreparePlan ? <button type="button" className={styles.secondaryAction} onClick={preparePlan}>Prepare a plan<ArrowRight size={16} /></button> : null}</>}</div>
      {plan.status === "blocked" && context.readOnly ? <p className={styles.startFootnote}>Use the workspace selector above to switch to a workspace you own. No work has been created.</p> : null}
    </section> : null}
  </div>;
}
