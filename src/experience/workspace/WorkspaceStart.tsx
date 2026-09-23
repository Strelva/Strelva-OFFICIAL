"use client";

import { ArrowRight, Check, Clipboard, FileSearch, FileText, Globe2, MessageSquareText, Table2 } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { WorkspaceComposer } from "./WorkspaceComposer";
import { Button } from "@/components/ui/Button";
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
  onTemplates?: () => void;
  onDraftChange?: (request: string) => void;
  websiteHandoff?: WorkspaceStartWebsiteHandoff | null;
  onWebsiteHandoffBack?: () => void;
  onContinue: (continuation: WorkspaceStartContinuation) => void;
  onHelp: (request: string) => void;
  /** Open the existing model-backed plan flow. The plan is optional for old callers. */
  onPlan?: (request: string, plan?: WorkspaceStartPlan) => void;
}

const EXAMPLES = [
  { label: "Give staff one place to make requests", request: "Give my team a better way to submit and track requests.", icon: Table2 },
  { label: "Make supplier onboarding consistent", request: "Make supplier onboarding consistent and easy to keep up to date.", icon: FileText },
  { label: "Get a new website live", request: "Have Strelva build a website for my business.", icon: Globe2 },
  { label: "Stop customer inquiries being missed", request: "Make sure customer inquiries are captured and followed up when nobody replies.", icon: MessageSquareText },
  { label: "Make this spreadsheet operational", request: "Turn my spreadsheet into something my team can use and keep up to date.", icon: Table2 },
  { label: "See what AI understands about us", request: "Help me see what AI can understand about my business.", icon: FileSearch },
  { label: "Make our website work better", request: "Improve our website based on what customers need, and let me review the change before it goes live.", icon: Globe2 },
  { label: "Give the team a procedure that stays current", request: "Create a private procedure my team can use and keep current as the process changes.", icon: FileText },
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
    <header className={styles.startProposalHeader}><span className={styles.startProposalIcon}><Globe2 size={19} aria-hidden="true" /></span><p className={styles.eyebrow}>Website work</p></header><h2 id="website-request-handoff-title" className={styles.startProposalTitle}>Open {handoff.site.title} with your request ready</h2>
    <p className={styles.startProposalSummary}>Copy your request, then paste it into the website conversation. Nothing has been sent.</p>
    <label className={styles.startRequestField} htmlFor={requestId}><span>Request to carry with you</span><textarea ref={requestRef} id={requestId} value={handoff.request} readOnly rows={5} /></label>
    {copyError ? <p className={styles.startError} role="alert">{copyError}</p> : null}
    <div className={styles.startProposalActions}><button type="button" className={styles.primaryAction} onClick={() => void copyRequest()}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? "Copied" : "Copy request"}</button><a className={styles.secondaryAction} href={handoff.site.href} target="_blank" rel="noreferrer">Open website<ArrowRight size={16} /></a>{onBack ? <button type="button" className={styles.secondaryAction} onClick={onBack}>Back to request</button> : null}</div>
    {copied ? <p className={styles.startFootnote} role="status">Your request is on the clipboard. Paste it into the website conversation when you are ready.</p> : null}
  </section>;
}

export function WorkspaceStart({ context, initialRequest = "", draftKey, onTemplates, onDraftChange, websiteHandoff = null, onWebsiteHandoffBack, onContinue, onHelp, onPlan }: WorkspaceStartProps) {
  const [composerSeed, setComposerSeed] = useState(initialRequest);
  const [plan, setPlan] = useState<WorkspaceStartPlan | null>(() => initialRequest.trim() ? planWorkspaceStart(initialRequest, context) : null);
  const [selectedPartIds, setSelectedPartIds] = useState<readonly string[]>(() => plan?.selectedPartIds || []);
  const [businessId, setBusinessId] = useState(() => plan?.route === "inquiries" && context.inquiryBusinesses?.length === 1 ? context.inquiryBusinesses[0]!.id : "");
  const [siteId, setSiteId] = useState(() => plan?.route === "website" && context.managedSites?.length === 1 ? context.managedSites[0]!.id : "");
  const [trackerTemplateId, setTrackerTemplateId] = useState(() => plan?.suggestedTemplateId || "");
  const [error, setError] = useState("");
  const formId = useId();


  function submit(request: string) {
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
    setComposerSeed(value);
    setPlan(null);
    setError("");
    onDraftChange?.(value);
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
  const answering = Boolean(plan || websiteHandoff);
  return <div className={styles.startPage} data-workspace-start data-state={answering ? "answer" : "ask"}>
    {!answering ? <header className={styles.startHeader}>
      <h1>What should happen next?</h1>
      <p>Describe the outcome. Strelva works out the right app, workflow or change.</p>
    </header> : null}

    <div><WorkspaceComposer key={composerSeed} initialRequest={composerSeed} draftKey={draftKey} disabled={context.readOnly} autoFocus={!plan} compact={answering} onTemplates={answering ? undefined : onTemplates} onSubmit={submit} onChange={request => { setPlan(null); setError(""); onDraftChange?.(request); }} placeholder="What do you want Strelva to make happen?" /></div>

    {websiteHandoff ? <WebsiteRequestHandoff handoff={websiteHandoff} onBack={onWebsiteHandoffBack} /> : plan ? <section className={styles.startProposal} aria-labelledby={`${formId}-proposal`} aria-live="polite">
      <header className={styles.startProposalHeader}><span className={styles.startProposalIcon}>{renderPlanIcon(plan.route)}</span><p className={styles.eyebrow}>{plan.kind === "help" ? (plan.matchedRoutes?.length ? "Several outcomes" : "Needs a closer look") : "Strelva suggests"}</p></header>
      <h2 id={`${formId}-proposal`} className={styles.startProposalTitle}>{plan.title}</h2>
      {plan.parts[0]?.detail !== plan.summary ? <p className={styles.startProposalSummary}>{plan.summary}</p> : null}
        {plan.kind === "help" ? <>{plan.reason ? <p className={styles.startBlocked} role="status">{plan.reason}</p> : <p className={styles.startNextAction}>{context.readOnly ? "Switch to a workspace you own to plan this." : "Strelva can draft a plan for the whole request, or you can ask which path fits."}</p>}</> : <>
        <div className={styles.startParts} aria-label="Proposed result">{plan.parts.map((part) => renderPart(part, selectedPartIds.includes(part.id), () => togglePart(part.id), `${formId}-${part.id}`))}</div>
        {selection ? <label className={styles.startSelect} htmlFor={`${formId}-selection`}><span>{selection}</span><select id={`${formId}-selection`} value={plan.needsSelection === "business" ? businessId : siteId} onChange={(event) => plan.needsSelection === "business" ? setBusinessId(event.target.value) : setSiteId(event.target.value)} required><option value="">Choose one</option>{(plan.needsSelection === "business" ? selectedBusiness : selectedSites).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : null}
        {templates.length ? <label className={styles.startSelect} htmlFor={`${formId}-template`}><span>Starting template <small>Optional</small></span><select id={`${formId}-template`} value={trackerTemplateId} onChange={(event) => setTrackerTemplateId(event.target.value)}><option value="">Start from a blank tracker</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label> : null}
        {plan.status === "blocked" ? <p className={styles.startBlocked} role="status">{plan.reason}</p> : null}
      </>}
      {error ? <p className={styles.startError} role="alert">{error}</p> : null}
      <div className={styles.startProposalActions}>{plan.kind === "help" ? <><button type="button" className={styles.primaryAction} disabled={!canContinue} onClick={continueToSupportedFlow}>{plan.deliveryMode === "service" ? "Review website request" : "Prepare a plan"}<ArrowRight size={16} /></button><button type="button" className={styles.quietAction} onClick={() => onHelp(plan.helpRequest || plan.request)}>Ask about available paths</button></> : plan.status === "blocked" ? <>{canPreparePlan ? <button type="button" className={styles.primaryAction} onClick={preparePlan}>Prepare a plan<ArrowRight size={16} /></button> : null}<button type="button" className={styles.quietAction} onClick={continueToSupportedFlow}>Ask about this path</button></> : <><button type="button" className={styles.primaryAction} disabled={!canContinue} onClick={continueToSupportedFlow}>{workspaceStartContinueLabel(plan)}<ArrowRight size={16} /></button>{canPreparePlan ? <button type="button" className={styles.quietAction} onClick={preparePlan}>Prepare a plan</button> : null}</>}</div>
      {plan.kind !== "help" ? <p className={styles.startFootnote}>{plan.nextAction}</p> : null}
    </section> : <section className={styles.startExamples} aria-labelledby={`${formId}-examples`}>
      <h2 id={`${formId}-examples`} className={styles.startExamplesTitle}>Or start from an example</h2>
      <div className={styles.startExampleList}>{EXAMPLES.map(({ label, request: exampleRequest, icon: ExampleIcon }) => <Button key={label} type="button" variant="ghost" className={styles.startExample} onClick={() => chooseExample(exampleRequest)}><ExampleIcon size={16} aria-hidden="true" /><span>{label}</span></Button>)}</div>
    </section>}
  </div>;
}
