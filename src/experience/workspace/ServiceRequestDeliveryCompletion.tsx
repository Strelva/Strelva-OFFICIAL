"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AgencyApplicationDraftGrant, OfferingInstallation, ProviderDelivery } from "@/platform/offerings";
import type { ServiceRequest } from "@/platform/service-requests";
import { AgencyWebsiteCustomerControls } from "@/experience/agency-website/AgencyWebsiteCustomerControls";
import { sameAppHref } from "./workspace-discovery";
import { useWorkspaceRequest } from "./WorkspaceRequest";

type DeliveryView = ProviderDelivery & { canManage?: boolean; canAccept?: boolean };
type DeliveryWork = { id: string; title: string };
type AssignmentView = {
  id: string;
  assigneeEmail?: string;
  status: "offered" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  responsibility?: { payload?: { status?: string } };
};

export interface ServiceRequestDeliveryCompletionProps {
  request: ServiceRequest;
  installation: OfferingInstallation;
  responsibilities: readonly DeliveryWork[];
  /** Called after the request row is linked to the accepted delivery. */
  onRequestUpdated?: (request: ServiceRequest) => void;
}

function messageBody(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  if (error && typeof error === "object" && !Array.isArray(error) && typeof (error as { message?: unknown }).message === "string") {
    return String((error as { message: string }).message);
  }
  return typeof error === "string" && error ? error : fallback;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((item) => b.has(item));
}

function requestKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Installation surfaces are server-generated tenant links. Keep the customer
 * review destination attached to that trusted surface instead of sending a
 * bare /dashboard/site path through a multi-site workspace.
 */
function websiteEditorHref(installation: OfferingInstallation): string | null {
  const surface = installation.surfaces?.find((item) => item.id === "managed_website");
  const base = surface?.href ? sameAppHref(surface.href) : null;
  return base ? `${base.replace(/\/$/, "")}/dashboard/site` : null;
}

/**
 * Customer-side completion for an already accepted service request. Every
 * mutation calls the existing assignment, provider-delivery, or request
 * service; this component does not create a second delivery lifecycle.
 */
export function ServiceRequestDeliveryCompletion({ request, installation, responsibilities, onRequestUpdated }: ServiceRequestDeliveryCompletionProps) {
  const transport = useWorkspaceRequest();
  const [currentRequest, setCurrentRequest] = useState(request);
  const [selectedScope, setSelectedScope] = useState<string[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [selectedWorkId, setSelectedWorkId] = useState(responsibilities[0]?.id ?? "");
  const [assigneeEmail, setAssigneeEmail] = useState("");
  const [assignment, setAssignment] = useState<AssignmentView | null>(null);
  const [delivery, setDelivery] = useState<DeliveryView | null>(null);
  const [draftGrant, setDraftGrant] = useState<AgencyApplicationDraftGrant | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deliveryState, setDeliveryState] = useState<"loading" | "ready" | "error">("loading");
  const [assignmentState, setAssignmentState] = useState<"unknown" | "ready" | "error">("unknown");
  const [draftAccessState, setDraftAccessState] = useState<"unknown" | "ready" | "error">("unknown");
  const loadToken = useRef(0);

  const expectedScope = installation.acceptedScope;
  const expectedResources = installation.nativeResources.map((resource) => resource.id);
  const scopeMatchesRequest = sameSet(currentRequest.scope, expectedScope);
  const selectedExactly = sameSet(selectedScope, expectedScope) && sameSet(selectedResources, expectedResources);
  const providerKind = installation.responsibility.kind === "provider_requested" ? installation.responsibility.providerKind : null;
  const agencyWorkspaceId = installation.responsibility.kind === "provider_requested" && installation.responsibility.providerKind === "agency"
    ? installation.responsibility.agencyWorkspaceId
    : undefined;
  const selectedWork = responsibilities.find((item) => item.id === selectedWorkId);
  const completed = assignment?.responsibility?.payload?.status === "completed";
  const applicationWorkId = installation.nativeResources.length === 1 && installation.nativeResources[0]?.kind === "application"
    ? installation.nativeResources[0].id
    : null;
  const websiteBindingId = installation.nativeResources.length === 1 && installation.nativeResources[0]?.kind === "managed_website"
    ? installation.nativeResources[0].id
    : null;
  const customerWebsiteHref = websiteEditorHref(installation);
  const draftGrantActive = draftGrant?.status === "active" && Number.isFinite(Date.parse(draftGrant.expiresAt)) && Date.parse(draftGrant.expiresAt) > Date.now();

  useEffect(() => {
    setCurrentRequest(request);
  }, [request]);

  const load = useCallback(async () => {
    const token = loadToken.current + 1;
    loadToken.current = token;
    const current = () => loadToken.current === token;
    setLoading(true);
    setError("");
    setDeliveryState("loading");
    setAssignmentState("unknown");
    setDraftAccessState("unknown");
    setDelivery(null);
    setAssignment(null);
    setDraftGrant(null);
    let deliveryLoaded = false;
    try {
      const deliveryResponse = await transport(`/api/offerings/provider-delivery?businessId=${encodeURIComponent(currentRequest.businessId)}`, { cache: "no-store" });
      const deliveryBody = await deliveryResponse.json().catch(() => null) as { deliveries?: DeliveryView[] } | null;
      if (!deliveryResponse.ok) throw new Error(messageBody(deliveryBody, "Provider delivery could not be loaded."));
      const found = (deliveryBody?.deliveries ?? []).find((item) => item.installationId === installation.id) ?? null;
      if (!current()) return;
      deliveryLoaded = true;
      setDelivery(found);
      setDeliveryState("ready");
      if (found) {
        const assignmentResponse = await transport(`/api/operational-assignments?assignmentId=${encodeURIComponent(found.assignmentId)}`, { cache: "no-store" });
        const assignmentBody = await assignmentResponse.json().catch(() => null) as { assignment?: AssignmentView; responsibility?: AssignmentView["responsibility"] } | AssignmentView | { error?: unknown } | null;
        if (!current()) return;
        if (!assignmentResponse.ok || !assignmentBody || !("assignment" in assignmentBody) || !assignmentBody.assignment) {
          setAssignmentState("error");
          throw new Error("The assigned work could not be loaded. Try again before changing delivery access.");
        }
        setAssignment({ ...assignmentBody.assignment, responsibility: assignmentBody.responsibility });
        setAssignmentState("ready");
        if (applicationWorkId && providerKind === "agency") {
          const grantResponse = await transport(`/api/agency-application-draft-access?workId=${encodeURIComponent(applicationWorkId)}`, { cache: "no-store" });
          const grantBody = await grantResponse.json().catch(() => null) as { grant?: AgencyApplicationDraftGrant | null } | null;
          if (!current()) return;
          if (!grantResponse.ok || !grantBody || !("grant" in grantBody)) {
            setDraftAccessState("error");
            throw new Error("Draft editing access could not be loaded. Try again before granting or revoking access.");
          }
          if (grantBody.grant) setDraftGrant(grantBody.grant);
          setDraftAccessState("ready");
        } else {
          setDraftAccessState("ready");
        }
      }
      if (current() && (!found || !(applicationWorkId && providerKind === "agency"))) setDraftAccessState("ready");
    } catch (cause) {
      if (current()) {
        if (!deliveryLoaded) setDeliveryState("error");
        setError(cause instanceof Error ? cause.message : "Provider delivery could not be loaded.");
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, [applicationWorkId, currentRequest.businessId, installation.id, providerKind, transport]);

  useEffect(() => { void load(); }, [load]);

  async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await transport(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) throw new Error(messageBody(value, "The delivery step could not be saved."));
    return value;
  }

  async function createDelivery() {
    if (!providerKind || providerKind === "named_third_party" || !selectedWorkId || !selectedExactly || !scopeMatchesRequest || !assigneeEmail.trim()) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const assignmentValue = await post("/api/operational-assignments", {
        action: "offer",
        workId: selectedWorkId,
        assignment: {
          assigneeEmail: assigneeEmail.trim().toLowerCase(),
          assigneeKind: providerKind,
          ...(providerKind === "agency" ? { agencyWorkspaceId } : {}),
          expiresAt,
          idempotencyKey: requestKey("provider-assignment"),
        },
      }) as AssignmentView;
      const deliveryValue = await post("/api/offerings/provider-delivery", {
        action: "request",
        businessId: currentRequest.businessId,
        installationId: installation.id,
        assignmentId: assignmentValue.id,
        idempotencyKey: requestKey("provider-delivery"),
      }) as { delivery?: DeliveryView };
      setAssignment(assignmentValue);
      setDelivery(deliveryValue.delivery ?? null);
      setNotice("The exact scope and resource are assigned to the named provider. Provider acceptance is still pending.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The provider delivery could not be requested.");
    } finally {
      setLoading(false);
    }
  }

  async function decide(decision: "confirmed" | "changes_requested") {
    if (!delivery || delivery.status !== "accepted" || !completed || !decisionNote.trim()) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const value = await post("/api/offerings/provider-delivery", {
        action: "decide", deliveryId: delivery.id, expectedRevision: delivery.revision, decision, note: decisionNote.trim(),
      }) as { delivery?: DeliveryView };
      const decided = value.delivery ?? delivery;
      setDelivery(decided);
      const linked = await post("/api/service-requests", {
        action: "link_delivery",
        businessId: currentRequest.businessId,
        requestId: currentRequest.id,
        installationId: installation.id,
        deliveryId: decided.id,
        expectedRevision: currentRequest.revision,
        idempotencyKey: requestKey("service-request-link"),
      }) as { request?: ServiceRequest };
      if (linked.request) {
        setCurrentRequest(linked.request);
        onRequestUpdated?.(linked.request);
      }
      setNotice(decision === "confirmed" ? "The completed delivery is confirmed and linked to this request." : "Changes were requested and the delivery history is linked to this request.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The delivery decision could not be saved.");
    } finally {
      setLoading(false);
    }
  }

  async function grantDraftEdit() {
    if (!delivery || delivery.status !== "accepted" || providerKind !== "agency" || !applicationWorkId) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const value = await post("/api/agency-application-draft-access", { action: "grant", deliveryId: delivery.id, workId: applicationWorkId }) as { grant?: AgencyApplicationDraftGrant };
      if (!value.grant) throw new Error("The draft permission was not returned.");
      setDraftGrant(value.grant);
      setNotice("The named agency operator can now revise this exact application draft. Publication remains with you.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draft editing could not be granted.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeDraftEdit() {
    if (!draftGrant) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const value = await post("/api/agency-application-draft-access", { action: "revoke", grantId: draftGrant.id }) as { grant?: AgencyApplicationDraftGrant };
      if (value.grant) setDraftGrant(value.grant);
      setNotice("Draft editing is revoked. The delivery and its history remain recorded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draft editing could not be revoked.");
    } finally {
      setLoading(false);
    }
  }

  const scopeSummary = useMemo(() => expectedScope.join(", "), [expectedScope]);
  if (currentRequest.providerAcceptance.status !== "accepted") return null;
  return <section aria-labelledby={`service-delivery-${currentRequest.id}`} className="mt-6 space-y-4 border-t border-gray-border pt-5">
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">Accepted request</p>
      <h3 id={`service-delivery-${currentRequest.id}`} className="mt-1 text-[15px] font-medium text-warm-black">Move this request into delivery</h3>
      <p className="mt-1 text-sm leading-6 text-gray-muted">The provider response accepted review only. Choose the exact approved scope and native resource before creating a revocable work assignment.</p>
    </div>
    {!scopeMatchesRequest ? <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-gray-muted">This request scope does not equal the offering’s accepted scope ({scopeSummary}). Save a revised request before delivery can be linked.</p> : null}
    {deliveryState === "loading" && !delivery ? <p role="status" className="text-sm text-gray-muted">Checking the current delivery state…</p> : null}
    {deliveryState === "ready" && !delivery ? <>
      <label className="grid gap-2 text-sm text-warm-black"><span>Approved exact work</span><select className="min-h-10 rounded-lg border border-gray-border bg-surface px-3" value={selectedWorkId} onChange={(event) => setSelectedWorkId(event.target.value)}><option value="">Choose approved work</option>{responsibilities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <fieldset className="space-y-2"><legend className="text-sm font-medium text-warm-black">Exact accepted scope</legend>{expectedScope.map((value) => <label key={value} className="flex min-h-10 items-center gap-2 text-sm text-gray-muted"><input type="checkbox" checked={selectedScope.includes(value)} onChange={(event) => setSelectedScope((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value))} />{value}</label>)}</fieldset>
      <fieldset className="space-y-2"><legend className="text-sm font-medium text-warm-black">Exact native resource</legend>{installation.nativeResources.map((resource) => <label key={`${resource.kind}:${resource.id}`} className="flex min-h-10 items-center gap-2 text-sm text-gray-muted"><input type="checkbox" checked={selectedResources.includes(resource.id)} onChange={(event) => setSelectedResources((current) => event.target.checked ? [...current, resource.id] : current.filter((item) => item !== resource.id))} />{resource.kind} · {resource.id}</label>)}</fieldset>
      <label className="grid gap-2 text-sm text-warm-black"><span>Named provider operator email</span><input className="min-h-10 rounded-lg border border-gray-border bg-surface px-3" type="email" value={assigneeEmail} onChange={(event) => setAssigneeEmail(event.target.value)} placeholder="verified operator email" /></label>
      {providerKind === "agency" ? <p className="text-xs leading-5 text-gray-muted">This grants the named member of {installation.responsibility.kind === "provider_requested" ? installation.responsibility.providerName : "the agency"} access to this customer work only. It does not add customer workspace membership.</p> : null}
      <Button type="button" disabled={loading || !selectedWork || !selectedExactly || !scopeMatchesRequest || !assigneeEmail.trim()} loading={loading} onClick={() => void createDelivery()}>Create exact provider assignment</Button>
    </> : null}
    {deliveryState === "ready" && delivery ? <div className="space-y-3 rounded-lg border border-gray-border bg-surface p-3 text-sm">
      <p className="text-gray-muted">Delivery status: <strong className="font-medium text-warm-black">{delivery.status}</strong>. Assignment: {assignment?.status ?? (assignmentState === "error" ? "unavailable" : "refreshing")}.</p>
      <p className="text-gray-muted">The provider must accept the assignment and run the approved work. The native execution receipt remains attached to the assigned responsibility.</p>
      <p className="text-xs leading-5 text-gray-muted">The assignment permits the named provider to work on this exact resource. Website preparation or application revision requires a separate customer grant. Publishing remains a customer decision.</p>
      <a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(currentRequest.businessId)}&view=operations&assignmentId=${encodeURIComponent(delivery.assignmentId)}`}>Open assigned work</a>
      {applicationWorkId && delivery.status === "accepted" ? <a className="block underline" href={`/workspace?workspaceId=${encodeURIComponent(currentRequest.businessId)}&work=${encodeURIComponent(applicationWorkId)}`}>Review application draft and publish when ready</a> : null}
      {providerKind === "agency" && websiteBindingId && delivery.status === "accepted" && assignment?.status === "accepted" && assignmentState === "ready" ? <AgencyWebsiteCustomerControls deliveryId={delivery.id} bindingId={websiteBindingId} customerWebsiteHref={customerWebsiteHref} /> : null}
      {providerKind === "agency" && applicationWorkId && delivery.status === "accepted" && assignment?.status === "accepted" && assignmentState === "ready" && draftAccessState === "ready" ? <div className="space-y-3 rounded-lg border border-gray-border p-3">
        <h4 className="font-medium text-warm-black">Application draft editing</h4>
        <p className="text-xs leading-5 text-gray-muted">This permission names {assignment.assigneeEmail ? <strong className="font-medium text-warm-black">{assignment.assigneeEmail}</strong> : "the current agency operator"} and applies only to the installed application above. You can revoke it separately; it also closes when this assignment or delivery expires.</p>
        {draftGrantActive ? <><p className="text-sm text-warm-black">Draft editing is granted through {new Date(draftGrant!.expiresAt).toLocaleString()}.</p><div className="flex flex-wrap gap-2"><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(currentRequest.businessId)}&work=${encodeURIComponent(applicationWorkId)}`}>Review application draft</a><Button type="button" variant="secondary" disabled={loading} onClick={() => void revokeDraftEdit()}>Revoke draft editing</Button></div></> : <><p className="text-sm text-gray-muted">The agency can inspect and rehearse the assigned application. It cannot save a revision until you grant draft editing.</p><Button type="button" disabled={loading} loading={loading} onClick={() => void grantDraftEdit()}>Grant draft editing to named operator</Button></>}
      </div> : null}
      {delivery.status === "accepted" && !currentRequest.deliveryId ? <p className="text-xs text-gray-muted">After the provider completes the work, review the receipt here and confirm it or request changes.</p> : null}
      {delivery.status === "accepted" && completed && !currentRequest.deliveryId ? <div className="space-y-2"><label className="grid gap-2 text-sm text-warm-black"><span>Customer review</span><textarea className="min-h-20 rounded-lg border border-gray-border bg-surface px-3 py-2" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="What did you verify?" /></label><div className="flex flex-wrap gap-2"><Button type="button" disabled={loading || !decisionNote.trim()} loading={loading} onClick={() => void decide("confirmed")}>Confirm completed delivery</Button><Button type="button" variant="secondary" disabled={loading || !decisionNote.trim()} onClick={() => void decide("changes_requested")}>Request changes</Button></div></div> : null}
      {currentRequest.deliveryId ? <p role="status" className="text-xs text-accent">Linked delivery history is recorded on this request.</p> : null}
    </div> : null}
    {loading ? <p role="status" className="text-xs text-gray-muted">Checking the current delivery state…</p> : null}
    {notice ? <p role="status" className="text-sm text-accent">{notice}</p> : null}
    {error ? <p role="alert" className="text-sm text-critical">{error} <button type="button" className="underline" onClick={() => void load()}>Try again</button></p> : null}
  </section>;
}
