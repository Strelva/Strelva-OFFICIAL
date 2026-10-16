"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Copy, Mail } from "lucide-react";
import type { ServiceRequest, ServiceRequestAgency } from "@/platform/service-requests";
import type { OfferingCollection, OfferingInstallation } from "@/platform/offerings";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { BringInAgency } from "./BringInAgency";
import type { AgencyScope } from "@/platform/agency-directory/contract";
import { useServiceRequestProviders } from "./useServiceRequestProviders";
import { ServiceRequestDeliveryCompletion } from "./ServiceRequestDeliveryCompletion";
import { StEmpty, StHead, StNotice, StPage, StPill, StPillLink, StRows, StRow, StSection, StSkeleton, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
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

export function WorkspaceHelp({ workspaceName, hasManagedService: _hasManagedService, onAgency, initialRequest = "", requestSubject = "Strelva — product help or request", workspaceId, agencyOptions, providerOptions, scope = ["help_request"], onSaved, canManageAgencies = false, initialAgencyScope }: WorkspaceHelpProps) {
  const [request, setRequest] = useState(initialRequest);
  const [outcome, setOutcome] = useState("");
  const suppliedRecipients = useMemo(() => agencyOptions === undefined ? providerOptions : agencyOptions.map(option => ({ label: option.label, provider: option.agency })), [agencyOptions, providerOptions]);
  const agencyChoices = useServiceRequestProviders(suppliedRecipients === undefined ? workspaceId : undefined);
  const recipients = useMemo(() => suppliedRecipients === undefined ? agencyChoices.providers.map(agency => ({ label: agency.name, provider: { kind: "agency" as const, agencyWorkspaceId: agency.agencyWorkspaceId } })) : suppliedRecipients.filter(option => option.provider.kind === "agency"), [suppliedRecipients, agencyChoices.providers]);
  const [provider, setProvider] = useState<ServiceRequestAgency | null>(null);
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
  const body = `${workspaceName ? `Workspace: ${workspaceName}\n\n` : ""}${request.trim()}${outcome.trim() ? `\n\nDesired outcome:\n${outcome.trim()}` : ""}`;
  async function copy() {
    try { await navigator.clipboard.writeText(body); setMessage("Copied. Your request has not been sent."); }
    catch { setMessage("Copy is unavailable. Select and copy your text below."); }
  }
  async function saveServiceRequest() {
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
      setMessage("Saved for review. This does not mean an agency accepted it or that work has started.");
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
  function acceptanceLabel(item: ServiceRequest): string {
    if (item.status === "withdrawn") return "Withdrawn";
    return item.providerAcceptance.status === "pending"
      ? "Pending agency review"
      : item.providerAcceptance.status === "accepted"
        ? "Accepted for review"
        : "Agency declined";
  }
  function openDeliveryControls() {
    setDeliveryContextRequested(true);
    setDeliveryContextAttempt((value) => value + 1);
  }
  return <StPage>
    <div ref={headingRef} tabIndex={-1}><StHead title="What do you need?" meta="Send a request to your agency, bring one in, or contact Strelva about the platform itself." /></div>
    <StSection title="Tell us about it." id="request-title"><StSurface label="Help request">
      <div className={styles.form}>
        <label htmlFor="capability-request">What are you trying to do?</label>
        <textarea ref={requestRef} id="capability-request" rows={6} maxLength={3000} value={request} onChange={event => { setRequest(event.target.value); setSaved(null); setMessage(""); }} placeholder="What do you use today? What would make it better?" />
        {workspaceId ? <>
          <label htmlFor="request-outcome">What would a useful outcome look like? <span>(optional)</span></label>
          <textarea id="request-outcome" rows={4} maxLength={3000} value={outcome} onChange={event => { setOutcome(event.target.value); setSaved(null); setMessage(""); }} placeholder="Add detail if the outcome needs more explanation." />
          {agencyChoices.loading ? <><p role="status">Loading agency choices…</p><StSkeleton label="Loading agency choices" /></> : agencyChoices.error ? <StNotice tone="critical">{agencyChoices.error}</StNotice> : !recipients.length ? <StNotice>Bring in an agency below before requesting work. Platform support remains available by email.</StNotice> : null}
          <label htmlFor="request-provider">Who should review this?</label>
          <select id="request-provider" value={provider ? JSON.stringify(provider) : ""} onChange={event => { const option = selectableRecipients.find(item => JSON.stringify(item.provider) === event.target.value); if (option) { setProvider(option.provider); setSaved(null); setMessage(""); } }}><option value="">Choose an agency</option>{selectableRecipients.map(option => <option key={JSON.stringify(option.provider)} value={JSON.stringify(option.provider)}>{option.label}</option>)}</select>
        </> : null}
        <p>Include an example if it helps. Leave out passwords and private information.</p>
        <div className={styles.actions}>
          {workspaceId ? <StPill disabled={saving || !provider || provider.kind !== "agency" || !request.trim() || Boolean(editingRequest && (editingRequest.status === "withdrawn" || (editingRequest.status !== "draft" && editingRequest.providerAcceptance.status !== "pending")))} onClick={() => void saveServiceRequest()}>{saving ? "Saving…" : saved ? "Saved" : "Save request"}</StPill> : null}
          <StPillLink variant={workspaceId ? "soft" : "primary"} href={`mailto:hello@strelva.com?subject=${encodeURIComponent(requestSubject)}&body=${encodeURIComponent(body)}`}><Mail size={16} aria-hidden="true" />Email platform support</StPillLink>
          <StTextButton disabled={!request.trim()} onClick={() => void copy()}><Copy size={16} aria-hidden="true" />Copy request</StTextButton>
        </div>
        <p>{workspaceId ? "Saving keeps this request available in your workspace and in the selected agency’s review inbox. It does not set a price or date, grant authority, or start work." : "Opens your email app. Nothing is sent until you send it; requests are not delivery commitments."}</p>
        {message ? <p role="status">{message}</p> : null}
      </div>
    </StSurface></StSection>
    {workspaceId ? <StSection title="Saved requests" id="saved-requests-title" action={editingRequest ? <StTextButton onClick={startNewRequest}>Start another request</StTextButton> : undefined}>
      {loadingSavedRequests ? <><p role="status">Loading saved requests…</p><StSkeleton label="Loading saved requests" /></> : savedRequestsError ? <StNotice tone="critical">{savedRequestsError}</StNotice> : savedRequests.length ? <StRows>{savedRequests.map(item => <StRow key={item.id} onClick={() => reopenServiceRequest(item)} title={item.request} detail={`${acceptanceLabel(item)} · ${providerLabel(item.provider, recipients)}`} end={<ArrowRight size={16} aria-hidden="true" />} />)}</StRows> : <StEmpty>No saved requests yet.</StEmpty>}
    </StSection> : null}
    {editingRequest?.provider.kind === "agency" && editingRequest.providerAcceptance.status === "accepted" && !deliveryContext ? <StSection title="Move this accepted request into delivery" id={`delivery-controls-${editingRequest.id}`}>
      <p className={styles.copy}>The agency accepted the request for review. Open the delivery controls to choose the exact approved scope and resource before granting revocable work access.</p>
      <StPill variant="soft" disabled={deliveryContextLoading} onClick={openDeliveryControls}>{deliveryContextLoading ? "Loading delivery controls…" : "Review delivery options"}</StPill>
      {deliveryContextError ? <StNotice tone="critical">{deliveryContextError} <StTextButton onClick={openDeliveryControls}>Try again</StTextButton></StNotice> : null}
    </StSection> : null}
    {editingRequest && deliveryContext ? <ServiceRequestDeliveryCompletion request={editingRequest} installation={deliveryContext.installation} responsibilities={deliveryContext.responsibilities} onRequestUpdated={updated => { setEditingRequest(updated); setSaved(updated); setSavedRequests(current => current.map(item => item.id === updated.id ? updated : item)); }} /> : null}
    {workspaceId ? <div id="bring-in-an-agency"><BringInAgency workspaceId={workspaceId} canManage={canManageAgencies} initialScope={initialAgencyScope} /></div> : <StSection title="Want it done for you?">
      <p className={styles.copy}>Open your business in Strelva to bring in an agency. You choose what it can do, and it accepts before anything changes.</p>
    </StSection>}
    <StSection title="Working for a client?">
      <p className={styles.copy}>Use an agency workspace to prepare assessments and hand a copy to your client. Access is scoped to the work that was shared; broader product management still needs a supported permission.</p>
      {onAgency ? <StTextButton onClick={onAgency}>Sharing &amp; agency access<ArrowRight size={16} aria-hidden="true" /></StTextButton> : null}
    </StSection>
  </StPage>;
}
