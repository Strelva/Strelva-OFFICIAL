"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
import type { ServiceRequest, ServiceRequestAgency } from "@/platform/service-requests";
import type { OfferingCollection, OfferingInstallation } from "@/platform/offerings";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { BringInAgency } from "./BringInAgency";
import type { AgencyScope } from "@/platform/agency-directory/contract";
import { useServiceRequestProviders } from "./useServiceRequestProviders";
import { ServiceRequestDeliveryCompletion } from "./ServiceRequestDeliveryCompletion";
import { XaButton, XaButtonLink, XaHeadline, XaLabel, XaRow, XaRows, XaSays, XaStatus, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import styles from "./owner-help.module.css";

export interface WorkspaceHelpAgencyOption {
  label: string;
  agency: ServiceRequestAgency;
}

/** @deprecated Use WorkspaceHelpAgencyOption. */
export interface WorkspaceHelpProviderOption {
  label: string;
  provider: ServiceRequestAgency;
}

export interface WorkspaceHelpProps {
  workspaceName?: string;
  hasManagedService?: boolean;
  onAgency?: () => void;
  initialRequest?: string;
  requestSubject?: string;
  /** The active customer workspace. Omit to keep the email/copy-only fallback. */
  workspaceId?: string;
  /** Eligible recipients resolved by the server. The component never accepts a raw agency id. */
  agencyOptions?: readonly WorkspaceHelpAgencyOption[];
  /** @deprecated Use agencyOptions. */
  providerOptions?: readonly WorkspaceHelpProviderOption[];
  scope?: readonly string[];
  onSaved?: (request: ServiceRequest) => void;
  /** An owner may bring in and end agencies (ADR 0015); others see the list. */
  canManageAgencies?: boolean;
  initialAgencyScope?: AgencyScope;
  /** Where saved requests and their delivery deadlines are reviewed, when the business has that page. */
  deliveryHref?: string;
}

function requestKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `request-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function providerLabel(provider: ServiceRequestAgency, options: readonly WorkspaceHelpProviderOption[]): string {
  const match = options.find((option) => JSON.stringify(option.provider) === JSON.stringify(provider));
  if (match) return match.label;
  return provider.kind === "strelva" ? "Historical Strelva Agency request" : "Agency";
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

function installationForRequest(request: ServiceRequest, collection: OfferingCollection): OfferingInstallation | null {
  const eligible = collection.installations.filter((installation) => {
    if (installation.status !== "active" || installation.businessId !== request.businessId || installation.responsibility.kind !== "provider_requested") return false;
    if (request.provider.kind === "strelva") return installation.responsibility.providerKind === "strelva";
    return installation.responsibility.providerKind === "agency"
      && installation.responsibility.agencyWorkspaceId === request.provider.agencyWorkspaceId;
  });
  if (request.installationId) return eligible.find((installation) => installation.id === request.installationId) ?? null;
  return eligible.find((installation) => sameValues(installation.acceptedScope, request.scope))
    ?? eligible[0]
    ?? null;
}

function responseMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function WorkspaceHelp({ workspaceName, hasManagedService: _hasManagedService, onAgency, initialRequest = "", requestSubject = "Strelva: product help or request", workspaceId, agencyOptions, providerOptions, scope = ["help_request"], onSaved, canManageAgencies = false, initialAgencyScope, deliveryHref }: WorkspaceHelpProps) {
  const [request, setRequest] = useState(initialRequest);
  const [outcome, setOutcome] = useState("");
  const suppliedRecipients = useMemo(() => agencyOptions === undefined ? providerOptions : agencyOptions.map(option => ({ label: option.label, provider: option.agency })), [agencyOptions, providerOptions]);
  const agencyChoices = useServiceRequestProviders(suppliedRecipients === undefined ? workspaceId : undefined);
  const recipients = useMemo(() => suppliedRecipients === undefined ? agencyChoices.providers.map(agency => ({ label: agency.name, provider: { kind: "agency" as const, agencyWorkspaceId: agency.agencyWorkspaceId } })) : suppliedRecipients.filter(option => option.provider.kind === "agency"), [suppliedRecipients, agencyChoices.providers]);
  const [provider, setProvider] = useState<ServiceRequestAgency | null>(null);
  // XS: with exactly one agency that can take requests, it is the recipient; a pick from a list of one is friction.
  const onlyRecipient = recipients.length === 1 ? recipients[0]!.provider : null;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<ServiceRequest | null>(null);
  const [editingRequest, setEditingRequest] = useState<ServiceRequest | null>(null);
  const selectableRecipients = useMemo(() => {
    if (!editingRequest || recipients.some((option) => JSON.stringify(option.provider) === JSON.stringify(editingRequest.provider))) return recipients;
    return [
      {
        label: editingRequest.provider.kind === "agency" ? "Current agency" : "Strelva Agency",
        provider: editingRequest.provider,
      },
      ...recipients,
    ];
  }, [editingRequest, recipients]);
  const [savedRequests, setSavedRequests] = useState<ServiceRequest[]>([]);
  const [loadingSavedRequests, setLoadingSavedRequests] = useState(Boolean(workspaceId));
  const [savedRequestsError, setSavedRequestsError] = useState("");
  const [deliveryContext, setDeliveryContext] = useState<{ installation: OfferingInstallation; responsibilities: readonly { id: string; title: string }[] } | null>(null);
  const [deliveryContextLoading, setDeliveryContextLoading] = useState(false);
  const [deliveryContextError, setDeliveryContextError] = useState("");
  const [deliveryContextRequested, setDeliveryContextRequested] = useState(false);
  const [deliveryContextAttempt, setDeliveryContextAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const headingRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<HTMLTextAreaElement>(null);
  const saveKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const activeWorkspaceRef = useRef(workspaceId);
  const providerWorkspaceRef = useRef(workspaceId);
  const transport = useWorkspaceRequest();
  useEffect(() => {
    if (initialRequest.trim()) requestRef.current?.focus();
    else headingRef.current?.focus();
  }, [initialRequest]);
  useEffect(() => {
    if (providerWorkspaceRef.current !== workspaceId) {
      providerWorkspaceRef.current = workspaceId;
      setProvider(null);
      return;
    }
    const current = recipients.some((option) => JSON.stringify(option.provider) === JSON.stringify(provider));
    const editingProvider = editingRequest && JSON.stringify(editingRequest.provider) === JSON.stringify(provider);
    if (!current && !editingProvider) setProvider(null);
  }, [editingRequest, provider, recipients, workspaceId]);
  useEffect(() => {
    activeWorkspaceRef.current = workspaceId;
    setRequest(initialRequest);
    setOutcome("");
    setSaved(null);
    setEditingRequest(null);
    setSavedRequests([]);
    setSavedRequestsError("");
    setLoadingSavedRequests(Boolean(workspaceId));
    setMessage("");
  }, [initialRequest, workspaceId]);
  useEffect(() => {
    if (!workspaceId) {
      setSavedRequests([]);
      setLoadingSavedRequests(false);
      setSavedRequestsError("");
      return;
    }
    const abort = new AbortController();
    setLoadingSavedRequests(true);
    setSavedRequestsError("");
    transport(`/api/service-requests?businessId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: abort.signal }).then(async (response) => {
      const responseBody = (await response.json().catch(() => null)) as { requests?: ServiceRequest[]; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(responseBody?.error?.message || "Saved requests could not be loaded.");
      if (!abort.signal.aborted) setSavedRequests(Array.isArray(responseBody?.requests) ? responseBody.requests : []);
    }).catch((error) => {
      if (!abort.signal.aborted) setSavedRequestsError(error instanceof Error ? error.message : "Saved requests could not be loaded.");
    }).finally(() => {
      if (!abort.signal.aborted) setLoadingSavedRequests(false);
    });
    return () => abort.abort();
  }, [transport, workspaceId]);
  useEffect(() => {
    setDeliveryContext(null);
    setDeliveryContextError("");
    setDeliveryContextRequested(false);
  }, [editingRequest?.id, editingRequest?.providerAcceptance.status, workspaceId]);
  useEffect(() => {
    if (!deliveryContextRequested || !workspaceId || !editingRequest || editingRequest.providerAcceptance.status !== "accepted") return;
    const requestAtStart = editingRequest;
    const abort = new AbortController();
    setDeliveryContextLoading(true);
    setDeliveryContextError("");
    Promise.all([
      transport(`/api/offerings?businessId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: abort.signal }),
      transport(`/api/workspace?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: abort.signal }),
    ]).then(async ([offeringResponse, workspaceResponse]) => {
      const [offeringBody, workspaceBody] = await Promise.all([
        offeringResponse.json().catch(() => null) as Promise<OfferingCollection | { error?: unknown } | null>,
        workspaceResponse.json().catch(() => null) as Promise<{ work?: Array<{ id?: unknown; title?: unknown; productId?: unknown; resourceKind?: unknown }> ; error?: unknown } | null>,
      ]);
      if (!offeringResponse.ok) throw new Error(responseMessage(offeringBody, "The installed offering could not be loaded."));
      if (!workspaceResponse.ok) throw new Error(responseMessage(workspaceBody, "Approved work could not be loaded."));
      if (activeWorkspaceRef.current !== workspaceId || editingRequest?.id !== requestAtStart.id) return;
      const installation = installationForRequest(requestAtStart, offeringBody as OfferingCollection);
      if (!installation) throw new Error("No active offering matches this accepted agency request yet.");
      const work = Array.isArray(workspaceBody?.work) ? workspaceBody.work : [];
      const responsibilities = work.flatMap((item) => {
        if (typeof item.id !== "string" || typeof item.title !== "string" || item.productId !== "operations" || item.resourceKind !== "responsibility") return [];
        return [{ id: item.id, title: item.title }];
      });
      setDeliveryContext({ installation, responsibilities });
    }).catch((cause) => {
      if (!abort.signal.aborted && activeWorkspaceRef.current === workspaceId) setDeliveryContextError(cause instanceof Error ? cause.message : "Delivery controls could not be loaded.");
    }).finally(() => {
      if (!abort.signal.aborted && activeWorkspaceRef.current === workspaceId) setDeliveryContextLoading(false);
    });
    return () => abort.abort();
  }, [deliveryContextAttempt, deliveryContextRequested, editingRequest, transport, workspaceId]);
  const activeProvider = provider ?? (editingRequest ? null : onlyRecipient);
  const body = `${workspaceName ? `Workspace: ${workspaceName}\n\n` : ""}${request.trim()}${outcome.trim() ? `\n\nDesired outcome:\n${outcome.trim()}` : ""}`;
  async function copy() {
    try { await navigator.clipboard.writeText(body); setMessage("Copied. Your request has not been sent."); }
    catch { setMessage("Copy is unavailable. Select and copy your text below."); }
  }
  async function saveServiceRequest() {
    const provider = activeProvider;
    if (!workspaceId || !provider || provider.kind !== "agency") return;
    const cleanScope = editingRequest
      ? [...editingRequest.scope]
      : [...new Set(scope.map((item) => item.trim()).filter(Boolean))];
    if (!request.trim() || !cleanScope.length) {
      setMessage("Add what you are trying to do before saving.");
      return;
    }
    const savedOutcome = outcome.trim() || request.trim();
    const context = editingRequest
      ? { ...editingRequest.context }
      : workspaceName ? { workspaceName, source: "workspace_help" } : { source: "workspace_help" };
    const saveWorkspaceId = workspaceId;
    const signature = JSON.stringify({ workspaceId: saveWorkspaceId, requestId: editingRequest?.id ?? null, expectedRevision: editingRequest?.revision ?? null, request: request.trim(), outcome: savedOutcome, context, scope: cleanScope, provider });
    if (!saveKeyRef.current || saveKeyRef.current.signature !== signature) saveKeyRef.current = { signature, key: requestKey() };
    setSaving(true);
    setMessage("");
    try {
      const response = await transport("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          businessId: saveWorkspaceId,
          ...(editingRequest ? { requestId: editingRequest.id, expectedRevision: editingRequest.revision } : {}),
          status: "requested",
          request: request.trim(),
          outcome: savedOutcome,
          context,
          scope: cleanScope,
          provider,
          idempotencyKey: saveKeyRef.current.key,
        }),
      });
      const responseBody = (await response.json().catch(() => null)) as { request?: ServiceRequest; error?: { message?: string } } | null;
      if (!response.ok || !responseBody?.request) throw new Error(responseBody?.error?.message || "The request could not be saved.");
      if (activeWorkspaceRef.current !== saveWorkspaceId) return;
      setSaved(responseBody.request);
      setEditingRequest(responseBody.request);
      setSavedRequests((current) => [responseBody.request!, ...current.filter((item) => item.id !== responseBody.request!.id)]);
      setMessage(`Sent to ${providerLabel(responseBody.request.provider, selectableRecipients)} for review. That doesn’t mean they accepted it or started work.`);
      onSaved?.(responseBody.request);
    } catch (error) {
      if (activeWorkspaceRef.current !== saveWorkspaceId) return;
      setMessage(error instanceof Error ? error.message : "The request could not be saved.");
    } finally {
      if (activeWorkspaceRef.current === saveWorkspaceId) setSaving(false);
    }
  }
  function reopenServiceRequest(item: ServiceRequest) {
    setRequest(item.request);
    setOutcome(item.outcome === item.request ? "" : item.outcome);
    setProvider(item.provider);
    setSaved(item);
    setEditingRequest(item);
    setMessage(item.status === "withdrawn"
      ? "Loaded a withdrawn request. It cannot be edited."
      : item.providerAcceptance.status === "pending"
        ? "Loaded the saved request. Saving again updates its current revision."
        : "Loaded the saved request. Agency response is recorded and the request cannot be edited.");
    requestRef.current?.focus();
  }
  function startNewRequest() {
    setRequest("");
    setOutcome("");
    setProvider(null);
    setSaved(null);
    setEditingRequest(null);
    setMessage("");
    requestRef.current?.focus();
  }
  /** Who and when on every row; a dot and a word only where the owner is needed (the agency declined it). */
  function requestDetail(item: ServiceRequest): ReactNode {
    const who = providerLabel(item.provider, recipients);
    const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(item.updatedAt || item.createdAt));
    if (item.status !== "withdrawn" && item.providerAcceptance.status === "declined") return <XaStatus kind="waits" size="sm">{`${who} declined · ${when}`}</XaStatus>;
    return item.status === "withdrawn" ? `You withdrew it · ${when}` : `${who} · ${when}`;
  }
  function openDeliveryControls() {
    setDeliveryContextRequested(true);
    setDeliveryContextAttempt((value) => value + 1);
  }
  const chosen = activeProvider ? selectableRecipients.find(option => JSON.stringify(option.provider) === JSON.stringify(activeProvider)) : undefined;
  const singleRecipient = !editingRequest && selectableRecipients.length === 1 ? selectableRecipients[0] : undefined;
  const locked = Boolean(editingRequest && (editingRequest.status === "withdrawn" || (editingRequest.status !== "draft" && editingRequest.providerAcceptance.status !== "pending")));
  const sendLabel = saving ? "Sending" : saved ? "Sent" : chosen ? `Send to ${chosen.label}` : "Send request";
  const mailto = `mailto:hello@strelva.com?subject=${encodeURIComponent(requestSubject)}&body=${encodeURIComponent(body)}`;
  return <div className={styles.page}>
    <div ref={headingRef} tabIndex={-1} className={styles.heading}>
      <XaHeadline size="md" quiet={workspaceId ? "Say it the way you’d tell a person." : "Write it here, then email it to Strelva."}>What do you need?</XaHeadline>
    </div>

    <section className={styles.composer} aria-labelledby="request-title">
      <h2 id="request-title" className={styles.srOnly}>Your request</h2>
      <label htmlFor="capability-request" className={styles.srOnly}>What are you trying to do?</label>
      <textarea ref={requestRef} id="capability-request" className={styles.ask} rows={4} maxLength={3000} value={request} onChange={event => { setRequest(event.target.value); setSaved(null); setMessage(""); }} placeholder="What are you trying to do? What do you use today?" />
      {workspaceId ? <>
        <label htmlFor="request-outcome" className={styles.outcomeLabel}>What would done look like? <span>Optional</span></label>
        <textarea id="request-outcome" className={styles.outcome} rows={2} maxLength={3000} value={outcome} onChange={event => { setOutcome(event.target.value); setSaved(null); setMessage(""); }} placeholder="Add detail if the outcome needs it." />
        <div className={styles.composerBar}>
          {singleRecipient ? <p className={styles.goesTo}>Goes to <strong>{singleRecipient.label}</strong></p> : !selectableRecipients.length && !agencyChoices.loading ? <p className={styles.goesTo}>Goes to <strong>no agency yet</strong></p> : <><label htmlFor="request-provider" className={styles.goesTo}>Goes to</label>
          <select id="request-provider" className={styles.provider} value={provider ? JSON.stringify(provider) : ""} disabled={agencyChoices.loading} onChange={event => { const option = selectableRecipients.find(item => JSON.stringify(item.provider) === event.target.value); if (option) { setProvider(option.provider); setSaved(null); setMessage(""); } }}><option value="">Choose an agency</option>{selectableRecipients.map(option => <option key={JSON.stringify(option.provider)} value={JSON.stringify(option.provider)}>{option.label}</option>)}</select></>}
          <span className={styles.barEnd} data-ready={Boolean(request.trim() && activeProvider) || undefined}><XaButton variant="primary" busy={saving} disabled={saving || !activeProvider || activeProvider.kind !== "agency" || !request.trim() || locked} onClick={() => void saveServiceRequest()}>{sendLabel}</XaButton></span>
        </div>
        {agencyChoices.loading ? <p role="status" className={styles.barNote}>Reading which agencies can take requests</p>
          : agencyChoices.error ? <p role="alert" className={styles.barNote} data-tone="error">{agencyChoices.error}</p>
            : !recipients.length ? <p className={styles.barNote}>No agency can take requests yet. Bring one in below, or email Strelva about the platform.</p> : null}
      </> : <div className={styles.composerBar}><span className={styles.barEnd}><XaButtonLink variant="primary" href={mailto}><Mail size={16} aria-hidden="true" />Email platform support</XaButtonLink></span></div>}
    </section>

    <p className={styles.after}>
      {workspaceId ? <>{selectableRecipients.length ? "Your agency reads it first. Nothing starts until they reply. " : null}<a href={mailto} className={styles.textLink}>Email platform support</a></>
        : <>Opens your email app. Nothing is sent until you send it.{request.trim() ? <> <button type="button" className={styles.textLink} onClick={() => void copy()}>Copy request</button></> : null}</>}
    </p>
    {message ? <div role="status"><XaSays>{message}</XaSays></div> : null}

    {workspaceId ? <section className={styles.section} aria-labelledby="saved-requests-title">
      <div className={styles.sectionHead}><XaLabel as="h2" id="saved-requests-title">Your requests</XaLabel><span className={styles.headLinks}>{editingRequest ? <XaTextLink onClick={startNewRequest}>Start another request</XaTextLink> : null}{editingRequest && deliveryHref ? <span aria-hidden="true"> · </span> : null}{deliveryHref ? <XaTextLink href={deliveryHref}>All requests</XaTextLink> : null}</span></div>
      {loadingSavedRequests ? <XaWorking title="Reading your requests" steps={[]} />
        : savedRequestsError ? <XaSays>{savedRequestsError}</XaSays>
          : savedRequests.length ? <XaRows label="Your requests">{savedRequests.map(item => <XaRow key={item.id} onClick={() => reopenServiceRequest(item)} current={editingRequest?.id === item.id} title={item.request} detail={requestDetail(item)} />)}</XaRows>
            : <p className={styles.quiet}>Nothing sent yet. Requests you send show here with what the agency said.</p>}
    </section> : null}

    {editingRequest?.provider.kind === "agency" && editingRequest.providerAcceptance.status === "accepted" && !deliveryContext ? <section className={styles.section} aria-labelledby={`delivery-controls-${editingRequest.id}`}>
      <XaLabel as="h2" id={`delivery-controls-${editingRequest.id}`}>Move this accepted request into delivery</XaLabel>
      <p className={styles.quiet}>The agency accepted it for review. Choose the exact scope and the one resource they may work on before giving them access you can take back.</p>
      <div><XaButton variant="secondary" busy={deliveryContextLoading} onClick={openDeliveryControls}>{deliveryContextLoading ? "Loading delivery controls" : "Review delivery options"}</XaButton></div>
      {deliveryContextError ? <XaSays links={[<XaTextLink key="retry" onClick={openDeliveryControls}>Try again</XaTextLink>]}>{deliveryContextError}</XaSays> : null}
    </section> : null}
    {editingRequest && deliveryContext ? <ServiceRequestDeliveryCompletion request={editingRequest} installation={deliveryContext.installation} responsibilities={deliveryContext.responsibilities} onRequestUpdated={updated => { setEditingRequest(updated); setSaved(updated); setSavedRequests(current => current.map(item => item.id === updated.id ? updated : item)); }} /> : null}

    {workspaceId ? <div id="bring-in-an-agency"><BringInAgency workspaceId={workspaceId} canManage={canManageAgencies} initialScope={initialAgencyScope} /></div> : <section className={styles.section} aria-labelledby="done-for-you">
      <XaLabel as="h2" id="done-for-you">Want it done for you?</XaLabel>
      <p className={styles.quiet}>Open your business in Strelva to bring in an agency. You choose what it can do, and it accepts before anything changes.</p>
    </section>}

    <section className={styles.section} aria-labelledby="for-a-client">
      <XaLabel as="h2" id="for-a-client">Working for a client?</XaLabel>
      <p className={styles.quiet}>An agency workspace prepares work and hands a copy to the client. It only sees what the client shared.{onAgency ? <> <XaTextLink onClick={onAgency}>Sharing &amp; agency access</XaTextLink></> : null}</p>
    </section>
  </div>;
}
