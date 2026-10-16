"use client";

import { ArrowRight, Check, CircleHelp, Clipboard, FileSearch, FileText, Globe2, MessageSquareText, Table2 } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { WorkspaceComposer } from "./WorkspaceComposer";
import { LogoMark } from "@/components/Logo";
import { StHead, StPage, StPill, StSection, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./owner-start.module.css";
import {
  createWorkspaceStartContinuation,
  planWorkspaceStart,
  selfServiceWorkspaceStartPlan,
  workspaceStartContinueLabel,
  type WorkspaceStartContext,
  type WorkspaceStartContinuation,
  type WorkspaceStartPart,
  type WorkspaceStartPlan,
  type WorkspaceStartWebsiteHandoff,
} from "./workspace-start";

export interface WorkspaceStartProps {
  context: WorkspaceStartContext;
  businessName?: string;
  /** STRELVA_SYSTEMS_RELEASE, for the composer's templates label. */
  systemsReleased?: boolean;
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
  { label: "Get a new website live", request: "Have an agency build a website for my business.", icon: Globe2 },
  { label: "Stop customer inquiries being missed", request: "Make sure customer inquiries are captured and followed up when nobody replies.", icon: MessageSquareText },
  { label: "Make this spreadsheet operational", request: "Turn my spreadsheet into something my team can use and keep up to date.", icon: Table2 },
  { label: "See what assistants understand about us", request: "Help me see what assistants can understand about my business.", icon: FileSearch },
  { label: "Make our website work better", request: "Improve our website based on what customers need, and let me review the change before it goes live.", icon: Globe2 },
  { label: "Give the team a procedure that stays current", request: "Create a private procedure my team can use and keep current as the process changes.", icon: FileText },
] as const;

/** Legacy plan records keep their contract; presentation uses the 1.0 vocabulary. */
function startCopy(value: string): string {
  return value.replace(/AI visibility signals/g, "What assistants understand").replace(/inquiry workflow/g, "inquiry system").replace(/An inquiry workflow/g, "An inquiry system");
}

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
  const body = <><span className={styles.startPartCopy}><strong>{startCopy(part.label)}</strong><small>{startCopy(part.detail)}</small></span></>;
  if (!part.editable) return <div key={part.id} className={styles.startPart}><span className={styles.startPartCheck} aria-hidden="true"><Check size={15} /></span>{body}</div>;
  return <label key={part.id} htmlFor={inputId} className={styles.startPart}><input id={inputId} type="checkbox" checked={selected} onChange={onToggle} /><span className={styles.startPartCheck} aria-hidden="true"><Check size={15} /></span>{body}</label>;
}

function WebsiteRequestHandoff({ handoff, onBack }: { handoff: WorkspaceStartWebsiteHandoff; onBack?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const requestRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useId();

  async function copyAsk() {
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
      setCopyError("Copy was unavailable. Select the ask below and copy it before opening the website.");
    }
  }

  return <section className={styles.startProposal} aria-labelledby="website-request-handoff-title"><StSurface label="Website request">
    <div className={styles.startProposalHeader}><div className={styles.startProposalIcon}><Globe2 size={19} aria-hidden="true" /></div><div><p className={styles.eyebrow}>Website work</p><h2 id="website-request-handoff-title">Open {handoff.site.title} with your ask ready.</h2></div></div>
    <p className={styles.startProposalSummary}>The website opens in a separate step, so this ask cannot travel there automatically. Copy it first, then open the website. Nothing has been sent.</p>
    <label className={styles.startAskField} htmlFor={requestId}><span>Ask to carry with you</span><textarea ref={requestRef} id={requestId} value={handoff.request} readOnly rows={5} /></label>
    {copyError ? <p className={styles.startError} role="alert">{copyError}</p> : null}
    <div className={styles.startProposalActions}><StPill type="button"  onClick={() => void copyAsk()}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? "Copied" : "Copy ask"}</StPill><a className={styles.externalLink} href={handoff.site.href} target="_blank" rel="noreferrer">Open website<ArrowRight size={16} /></a>{onBack ? <StTextButton type="button"  onClick={onBack}>Back to ask</StTextButton> : null}</div>
    {copied ? <p className={styles.startFootnote} role="status">Your ask is on the clipboard. Paste it into the website conversation when you are ready.</p> : null}
  </StSurface></section>;
}

export function WorkspaceStart({ context, businessName, systemsReleased = false, initialRequest = "", draftKey, onTemplates, onDraftChange, websiteHandoff = null, onWebsiteHandoffBack, onContinue, onHelp, onPlan }: WorkspaceStartProps) {
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

  /** The managed request's second choice: the owner makes the website themselves. Nothing was sent. */
  function makeItYourself() {
    if (!plan) return;
    const next = selfServiceWorkspaceStartPlan(plan);
    if (!next) return;
    setPlan(next);
    setSelectedPartIds(next.selectedPartIds);
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
  return <StPage className={styles.startPage}><div data-workspace-start data-first-run={!plan && !websiteHandoff || undefined}>
    <div className={styles.startHeader}><LogoMark className={styles.mark} /><StHead title={businessName ? `What should Strelva run for ${businessName}?` : "What should Strelva run for your business?"} meta="Paste your website, or say what you need. You'll see everything before it goes live." /></div>

    <div className={styles.firstComposer}><WorkspaceComposer tone={systemsReleased ? "dock" : "default"} key={composerSeed} initialRequest={composerSeed} draftKey={draftKey} disabled={context.readOnly} autoFocus={!plan} onTemplates={onTemplates} systemsReleased={systemsReleased} onSubmit={submit} onChange={request => { setPlan(null); setError(""); onDraftChange?.(request); }} placeholder="What do you want Strelva to make happen?" /></div>

    <StSection title="Start with an outcome" meta="Optional" id={`${formId}-examples`}>
      <div className={styles.startExampleList}>{EXAMPLES.map(({ label, request: exampleRequest, icon: ExampleIcon }) => <StPill key={label} type="button" variant="soft" onClick={() => chooseExample(exampleRequest)}><ExampleIcon size={16} aria-hidden="true" /><span>{label}</span><ArrowRight size={14} aria-hidden="true" /></StPill>)}</div>
    </StSection>

    {websiteHandoff ? <WebsiteRequestHandoff handoff={websiteHandoff} onBack={onWebsiteHandoffBack} /> : plan ? <section className={styles.startProposal} aria-labelledby={`${formId}-proposal`} aria-live="polite"><StSurface label="Proposed next step">
      <div className={styles.startProposalHeader}><div className={styles.startProposalIcon}>{renderPlanIcon(plan.route)}</div><div><p className={styles.eyebrow}>{plan.kind === "help" ? (plan.matchedRoutes?.length ? "Multiple outcomes" : "Ask to review") : "Proposed next step"}</p><h2 id={`${formId}-proposal`}>{startCopy(plan.title)}</h2></div></div>
      <p className={styles.startProposalSummary}>{startCopy(plan.summary)}</p>
      {plan.kind === "help" ? <p className={styles.startAskEcho}><strong>Your ask stays intact:</strong> <span>{plan.request}</span></p> : null}
      <p className={styles.startNextAction}><strong>Next:</strong> {startCopy(plan.nextAction)}</p>
        {plan.kind === "help" ? <><div className={styles.startHelp}><CircleHelp size={17} aria-hidden="true" /><p><strong>Choose a supported next step.</strong> You can assess a business, turn a CSV into an internal tool, set up inquiries, open work on a connected website, start a private document, organize onboarding requirements, build an internal tool, set up Bookings, compare saved sources, or send a request to your agency. No work has started from this ask. {context.readOnly ? "Switch to a business where you can start work before preparing a plan." : "You can ask about the closest path when none of these fits."}</p></div>{plan.reason ? <div className={styles.startBlocked} role="status"><CircleHelp size={17} aria-hidden="true" /><p>{plan.reason}</p></div> : null}</> : <>
        <div className={styles.startParts} aria-label="Proposed result">{plan.parts.map((part) => renderPart(part, selectedPartIds.includes(part.id), () => togglePart(part.id), `${formId}-${part.id}`))}</div>
        {selection ? <label className={styles.startSelect} htmlFor={`${formId}-selection`}><span>{selection}</span><select id={`${formId}-selection`} value={plan.needsSelection === "business" ? businessId : siteId} onChange={(event) => plan.needsSelection === "business" ? setBusinessId(event.target.value) : setSiteId(event.target.value)} required><option value="">Choose one</option>{(plan.needsSelection === "business" ? selectedBusiness : selectedSites).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : null}
        {templates.length ? <label className={styles.startSelect} htmlFor={`${formId}-template`}><span>Starting template <small>Optional</small></span><select id={`${formId}-template`} value={trackerTemplateId} onChange={(event) => setTrackerTemplateId(event.target.value)}><option value="">Start from a blank internal tool</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label> : null}
        {plan.status === "blocked" ? <div className={styles.startBlocked} role="status"><CircleHelp size={17} aria-hidden="true" /><p>{plan.reason}</p></div> : null}
      </>}
      {error ? <p className={styles.startError} role="alert">{error}</p> : null}
      <div className={styles.startProposalActions}>{plan.kind === "help" ? <><StPill type="button"  disabled={!canContinue} onClick={continueToSupportedFlow}>{plan.deliveryMode === "service" ? "Review website request" : "Prepare a plan"}<ArrowRight size={16} /></StPill>{plan.deliveryMode === "service" && plan.selfServiceRoute ? <StTextButton type="button"  onClick={makeItYourself}>Make it yourself instead<ArrowRight size={16} /></StTextButton> : null}<StTextButton type="button"  onClick={() => onHelp(plan.helpRequest || plan.request)}>Ask about available paths<ArrowRight size={16} /></StTextButton></> : plan.status === "blocked" ? <>{canPreparePlan ? <StPill type="button"  onClick={preparePlan}>Prepare a plan<ArrowRight size={16} /></StPill> : null}<StTextButton type="button"  onClick={continueToSupportedFlow}>Ask about this path<ArrowRight size={16} /></StTextButton></> : <><StPill type="button"  disabled={!canContinue} onClick={continueToSupportedFlow}>{workspaceStartContinueLabel(plan)}<ArrowRight size={16} /></StPill>{canPreparePlan ? <StTextButton type="button"  onClick={preparePlan}>Prepare a plan<ArrowRight size={16} /></StTextButton> : null}</>}</div>
      {plan.status === "blocked" && context.readOnly ? <p className={styles.startFootnote}>Use the business switcher above to choose one where you can start work. No work has been created.</p> : null}
    </StSurface></section> : null}
  </div></StPage>;
}
