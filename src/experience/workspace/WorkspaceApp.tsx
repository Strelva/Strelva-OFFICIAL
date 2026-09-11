"use client";

import { WebsiteAuditPage } from "@/products/website-audit";
import { replaceWorkspaceLocation, workspaceReturnTarget } from "@/lib/workspace-location";

import {
  ArrowRight,
  CircleAlert,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { AiVisibilityAssessmentForm, AiVisibilityAssessmentResult } from "@/products/ai-visibility";
import { AccessHandoffOverlay, AccessPanel } from "./WorkspaceAccess";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { normalizeWorkspaceHandoffPreview, normalizeWorkspaceSnapshot, normalizeWorkspaceWork } from "./result";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { WorkspaceRequestContext, useWorkspaceRequest } from "./WorkspaceRequest";
import { TrackerExperience } from "./TrackerExperience";
import { LocalTrackerPreview } from "./preview/LocalTrackerPreview";
import { DocumentExperience } from "./DocumentExperience";
import { LocalDocumentPreview } from "./preview/LocalDocumentPreview";
import { WorkPlanExperience } from "./WorkPlanExperience";
import { WorkBudgetPanel } from "./WorkBudgetPanel";
import { WorkspaceExperimentResult } from "./WorkspaceExperimentResult";
import { parseView as parseInquiryView } from "@/experience/inquiries/context";
import { TRACKER_TEMPLATES, type TrackerTemplateId } from "@/products/tracker/templates";
import type { InquirySurfaceAdapter, InquirySurfaceSnapshot } from "@/experience/inquiries/contracts";
import type {
  WorkspaceAction,
  WorkspaceHandoffPreview,
  WorkspaceSnapshot,
  WorkspaceWork,
} from "./contracts";
import type { WorkspaceInquiryTarget } from "./WorkspaceLayout";
import type { WorkspaceStartContinuation } from "./workspace-start";

type View = "work" | "agency" | "inquiries" | "tracker" | "document" | "plan";
type Notice = { kind: "success" | "error"; message: string } | null;

export interface WorkspaceInquiryConfig {
  tenantId: string;
  label?: string;
  adapter?: InquirySurfaceAdapter;
  initialSnapshot?: InquirySurfaceSnapshot;
}

interface ErrorBody {
  error?: string;
}

class WorkspaceRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & ErrorBody) | null;
  if (!response.ok) throw new WorkspaceRequestError(body?.error || fallback, response.status);
  if (!body) throw new Error(fallback);
  return body;
}

async function postAction<T>(action: WorkspaceAction, fallback: string, request: typeof fetch): Promise<T> {
  const response = await request("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  return readResponse<T>(response, fallback);
}

function trackerTemplateId(value: string | undefined): TrackerTemplateId | undefined {
  return value && TRACKER_TEMPLATES.some((template) => template.id === value) ? value as TrackerTemplateId : undefined;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function WorkspaceApp({ request = fetch, appBase = "", signOut, inquiry }: { request?: typeof fetch; appBase?: string; signOut?: React.ReactNode; inquiry?: WorkspaceInquiryConfig } = {}) {
  return <WorkspaceRequestContext.Provider value={request}><WorkspaceContent appBase={appBase} signOut={signOut} inquiry={inquiry} /></WorkspaceRequestContext.Provider>;
}

function usePostAction() {
  const request = useWorkspaceRequest();
  return useCallback(<T,>(action: WorkspaceAction, fallback: string) => postAction<T>(action, fallback, request), [request]);
}

function WorkspaceContent({ appBase, signOut, inquiry: inquiryConfig }: { appBase: string; signOut?: React.ReactNode; inquiry?: WorkspaceInquiryConfig }) {
  const request = useWorkspaceRequest();
  const postAction = usePostAction();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [missingWork, setMissingWork] = useState(false);
  const [returnTarget, setReturnTarget] = useState("/workspace");
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [view, setView] = useState<View>("work");
  const [inquiryTenantId, setInquiryTenantId] = useState<string | null>(null);
  const [assessmentStartContext, setAssessmentStartContext] = useState<WorkspaceStartContinuation | null>(null);
  const [inquiryStartContext, setInquiryStartContext] = useState<WorkspaceStartContinuation | null>(null);
  const [trackerStartContext, setTrackerStartContext] = useState<WorkspaceStartContinuation | null>(null);
  const [documentStartContext, setDocumentStartContext] = useState<WorkspaceStartContinuation | null>(null);
  const [planStartRequest, setPlanStartRequest] = useState<string | null>(null);
  const [home, setHome] = useState(true);
  const [pendingRequest, setPendingRequest] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const attemptRef = useRef<{ signature: string; id: string } | null>(null);
  const [retryWork, setRetryWork] = useState<WorkspaceWork | null>(null);
  const [showAssessment, setShowAssessment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [handoffPreview, setHandoffPreview] = useState<WorkspaceHandoffPreview | null>(null);
  const [handoffToken, setHandoffToken] = useState<string | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const [publicSaveResultId, setPublicSaveResultId] = useState<string | null>(null);
  const [publicSaveSaving, setPublicSaveSaving] = useState(false);
  const [publicSaveError, setPublicSaveError] = useState("");
  const requestRef = useRef(0);
  const activeWorkspaceRef = useRef<string | null>(null);

  const loadWorkspace = useCallback(async (workspaceId?: string, preserveNotice = false) => {
    const requestId = ++requestRef.current;
    activeWorkspaceRef.current = null;
    setLoading(true);
    setSignInRequired(false);
    if (!preserveNotice) setNotice(null);
    setSelectedWorkId(null);
    try {
      const selectedId = workspaceId || new URLSearchParams(window.location.search).get("workspaceId");
      const suffix = selectedId ? `?workspaceId=${encodeURIComponent(selectedId)}` : "";
      const response = await request(`/api/workspace${suffix}`, { cache: "no-store" });
      const data = normalizeWorkspaceSnapshot(await readResponse<WorkspaceSnapshot>(response, "We couldn’t load this workspace."));
      if (requestId !== requestRef.current) return;
      activeWorkspaceRef.current = data.workspaceId;
      setSnapshot(data);
      const params = new URLSearchParams(window.location.search);
      const requestedWork = params.get("work");
      const requestedView = params.get("view");
      const inquiryAvailable = Boolean(inquiryConfig) || data.products.some((product) => product.id === "inquiries" && product.availability === "available");
      const inquiryRoute = requestedView === "inquiries" && inquiryAvailable;
      const inquiryId = params.get("tenantId") || inquiryConfig?.tenantId || data.managedWork?.[0]?.id || null;
      const match = data.work.find(item => item.id === requestedWork);
      const trackerAvailable = data.products.some((product) => product.id === "tracker" && product.availability === "available");
      const trackerRoute = requestedView === "tracker" && (trackerAvailable || match?.productId === "tracker");
      const savedTrackerRoute = Boolean(match?.productId === "tracker" && !inquiryRoute);
      const documentAvailable = data.products.some((product) => product.id === "documents" && product.availability === "available");
      const documentRoute = requestedView === "document" && documentAvailable;
      const savedDocumentRoute = Boolean(match?.productId === "documents" && !inquiryRoute && !trackerRoute);
      const planRoute = requestedView === "plan";
      const savedPlanRoute = Boolean(match?.productId === "work_plans" && !inquiryRoute && !trackerRoute && !documentRoute);
      const validView: View = inquiryRoute ? "inquiries" : trackerRoute || savedTrackerRoute ? "tracker" : documentRoute || savedDocumentRoute ? "document" : planRoute || savedPlanRoute ? "plan" : "work";
      setMissingWork(Boolean(requestedWork && !match));
      setSelectedWorkId(match?.id ?? (requestedWork ? null : data.work[0]?.id) ?? null);
      setInquiryTenantId(inquiryRoute ? inquiryId : null);
      setAssessmentStartContext(null);
      setInquiryStartContext(null);
      setTrackerStartContext(null);
      setDocumentStartContext(null);
      setPlanStartRequest(null);
      if (!preserveNotice) { setHome(!requestedWork && !inquiryRoute && !trackerRoute && !documentRoute && !savedDocumentRoute && !planRoute && !savedPlanRoute); setView(validView); }
      setShowAssessment(!requestedWork && data.work.length === 0 && !inquiryRoute && !trackerRoute && !documentRoute && !savedDocumentRoute && !planRoute && !savedPlanRoute);
      replaceWorkspaceLocation(data.workspaceId, requestedWork || undefined);
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setSnapshot(null);
      if (cause instanceof WorkspaceRequestError && cause.status === 401) setSignInRequired(true);
      setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "We couldn’t load this workspace." });
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [inquiryConfig, request]);

  useEffect(() => {
    const restore = () => {
      setReturnTarget(workspaceReturnTarget(`/workspace${window.location.search}`) || "/workspace");
      void loadWorkspace();
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [loadWorkspace]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hashToken = params.get("handoff");
    if (hashToken) {
      sessionStorage.setItem("strelva:workspace-handoff", hashToken);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    const token = hashToken || sessionStorage.getItem("strelva:workspace-handoff");
    if (!token) return;
    setHandoffToken(token);
    setHandoffLoading(true);
    postAction<WorkspaceHandoffPreview>({ action: "inspect_handoff", token }, "This handoff link is invalid or has expired.")
      .then((preview) => setHandoffPreview(normalizeWorkspaceHandoffPreview(preview)))
      .catch((cause: unknown) => {
        if (cause instanceof WorkspaceRequestError && cause.status === 401) return;
        setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "This handoff link is invalid or has expired." });
        if (cause instanceof WorkspaceRequestError && (cause.status === 403 || cause.status === 404)) {
          sessionStorage.removeItem("strelva:workspace-handoff");
          setHandoffToken(null);
        }
      })
      .finally(() => setHandoffLoading(false));
  }, [postAction]);

  useEffect(() => {
    const resultId = new URLSearchParams(window.location.search).get("save");
    if (resultId && resultId.length <= 256 && /^(scan_[a-z0-9]+|audit_[a-f0-9]{32})$/i.test(resultId)) setPublicSaveResultId(resultId);
  }, []);

  const selectedWork = useMemo(
    () => {
      if (missingWork) return null;
      if (selectedWorkId) return snapshot?.work.find((work) => work.id === selectedWorkId) ?? null;
      if (view === "tracker" || view === "document" || view === "plan") return null;
      return snapshot?.work[0] ?? null;
    },
    [selectedWorkId, snapshot, missingWork, view],
  );
  const currentWorkspaceId = snapshot?.workspaceId;
  const currentActorEmail = snapshot?.actor.email;
  const serverPendingId = snapshot?.pendingAssessments?.[0]?.id;
  useEffect(() => {
    if (!currentWorkspaceId || !currentActorEmail) return;
    let retained: string | null = null;
    try { retained = sessionStorage.getItem(`strelva:assessment:${currentActorEmail}:${currentWorkspaceId}`); } catch { /* Storage may be disabled. */ }
    setPendingRequest(serverPendingId || retained);
    attemptRef.current = null;
  }, [currentWorkspaceId, currentActorEmail, serverPendingId]);

  function rememberAttempt(id: string | null) {
    if (!snapshot) return;
    setPendingRequest(id);
    try {
      const key = `strelva:assessment:${snapshot.actor.email}:${snapshot.workspaceId}`;
      if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key);
    } catch { /* In-page recovery remains available. */ }
  }

  async function recoverAssessment() {
    if (!snapshot || !pendingRequest || recovering) return;
    setRecovering(true);
    try {
      const body = await postAction<{ work: WorkspaceWork }>({ action: "recover_assessment", workspaceId: snapshot.workspaceId, requestId: pendingRequest }, "This assessment could not be recovered yet.");
      if (activeWorkspaceRef.current !== body.work.workspaceId) return;
      rememberAttempt(null);
      replaceWorkspaceLocation(body.work.workspaceId, body.work.id);
      await loadWorkspace(body.work.workspaceId);
    } catch (cause) { setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "Recovery is unavailable. Try again." }); }
    finally { setRecovering(false); }
  }

  const currentWorkspace = snapshot?.workspaces.find((workspace) => workspace.id === snapshot.workspaceId) ?? null;
  const delegatedRead = currentWorkspace?.access === "delegated_read";
  const canShowWorkBudget = Boolean(snapshot && !snapshot.actor.localPreview && !delegatedRead);
  const signInHref = `/sign-in?next=${encodeURIComponent(returnTarget)}`;
  const retryAssessment = retryWork?.assessment?.kind === "ai_visibility" ? retryWork.assessment.payload : null;
  const inquiryEnabled = Boolean(inquiryConfig) || Boolean(snapshot?.products.some((product) => product.id === "inquiries" && product.availability === "available"));
  const inquiryBusinesses = inquiryEnabled && inquiryConfig?.tenantId
    ? [{ id: inquiryConfig.tenantId, title: inquiryConfig.label || inquiryConfig.tenantId }]
    : inquiryEnabled ? (snapshot?.managedWork || []).map((site) => ({ id: site.id, title: site.title })) : [];
  const inquiryStart = inquiryStartContext?.route === "inquiries" && inquiryStartContext.businessId === inquiryTenantId ? inquiryStartContext : null;
  const inquiryParams = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const inquiryTarget: WorkspaceInquiryTarget | undefined = inquiryEnabled && view === "inquiries" && inquiryTenantId
    ? {
      tenantId: inquiryTenantId,
      ...(inquiryConfig?.tenantId === inquiryTenantId && inquiryConfig.adapter ? { adapter: inquiryConfig.adapter } : {}),
      ...(inquiryConfig?.tenantId === inquiryTenantId && inquiryConfig.initialSnapshot ? { initialSnapshot: inquiryConfig.initialSnapshot } : {}),
      initialView: inquiryParams.has("inquiryView") ? parseInquiryView(inquiryParams.get("inquiryView")) : inquiryStart ? "new" : "home",
      initialRequestId: inquiryParams.get("inquiryRequest"),
      initialInquiryId: inquiryParams.get("inquiryRecord"),
      ...(inquiryStart ? { initialRequestText: inquiryStart.request } : {}),
    }
    : undefined;

  function chooseWork(id: string) {
    const chosen = snapshot?.work.find((work) => work.id === id);
    setMissingWork(false);
    setHome(false);
    setSelectedWorkId(id);
    setShowAssessment(false);
    setInquiryTenantId(null);
    setAssessmentStartContext(null);
    setInquiryStartContext(null);
    setTrackerStartContext(null);
    setDocumentStartContext(null);
    setPlanStartRequest(null);
    setView(chosen?.productId === "tracker" ? "tracker" : chosen?.productId === "documents" ? "document" : chosen?.productId === "work_plans" ? "plan" : "work");
    setNotice(null);
  }

  function openWorkFromPlan(id: string) {
    const chosen = snapshot?.work.find((work) => work.id === id);
    chooseWork(id);
    const url = new URL(window.location.href);
    url.searchParams.set("workspaceId", snapshot!.workspaceId);
    url.searchParams.set("work", id);
    clearEmbeddedRouteParams(url);
    url.searchParams.set("view", chosen?.productId === "tracker" ? "tracker" : chosen?.productId === "documents" ? "document" : chosen?.productId === "work_plans" ? "plan" : "work");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function clearEmbeddedRouteParams(url: URL) {
    url.searchParams.delete("tenantId");
    url.searchParams.delete("inquiryView");
    url.searchParams.delete("inquiryRequest");
    url.searchParams.delete("inquiryRecord");
    url.searchParams.delete("trackerWork");
  }

  function chooseInquiry(tenantId: string, context?: WorkspaceStartContinuation) {
    setMissingWork(false);
    setSelectedWorkId(null);
    setInquiryTenantId(tenantId);
    setAssessmentStartContext(null);
    setInquiryStartContext(context?.route === "inquiries" ? context : null);
    setTrackerStartContext(null);
    setDocumentStartContext(null);
    setPlanStartRequest(null);
    setHome(false);
    setView("inquiries");
    setShowAssessment(false);
    setNotice(null);
  }

  function startTracker(context?: WorkspaceStartContinuation) {
    setMissingWork(false);
    setSelectedWorkId(null);
    setInquiryTenantId(null);
    setAssessmentStartContext(null);
    setInquiryStartContext(null);
    setTrackerStartContext(context?.route === "tracker" ? context : null);
    setDocumentStartContext(null);
    setPlanStartRequest(null);
    setHome(false);
    setView("tracker");
    setShowAssessment(false);
    setNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.set("workspaceId", snapshot!.workspaceId);
    url.searchParams.set("view", "tracker");
    url.searchParams.delete("work");
    clearEmbeddedRouteParams(url);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function startDocument(context?: WorkspaceStartContinuation) {
    setMissingWork(false);
    setSelectedWorkId(null);
    setInquiryTenantId(null);
    setAssessmentStartContext(null);
    setInquiryStartContext(null);
    setTrackerStartContext(null);
    setDocumentStartContext(context?.route === "document" ? context : null);
    setPlanStartRequest(null);
    setHome(false);
    setView("document");
    setShowAssessment(false);
    setNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.set("workspaceId", snapshot!.workspaceId);
    url.searchParams.set("view", "document");
    url.searchParams.delete("work");
    clearEmbeddedRouteParams(url);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function startPlan(requestText: string) {
    setMissingWork(false);
    setSelectedWorkId(null);
    setInquiryTenantId(null);
    setAssessmentStartContext(null);
    setInquiryStartContext(null);
    setTrackerStartContext(null);
    setDocumentStartContext(null);
    setPlanStartRequest(requestText);
    setHome(false);
    setView("plan");
    setShowAssessment(false);
    setNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.set("workspaceId", snapshot!.workspaceId);
    url.searchParams.set("view", "plan");
    url.searchParams.delete("work");
    clearEmbeddedRouteParams(url);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function goHome() {
    setMissingWork(false);
    setHome(true);
    setView("work");
    setInquiryTenantId(null);
    setAssessmentStartContext(null);
    setInquiryStartContext(null);
    setTrackerStartContext(null);
    setDocumentStartContext(null);
    setPlanStartRequest(null);
    setShowAssessment(false);
  }

  function handleTrackerSaved(workId: string) {
    if (!snapshot) return;
    setMissingWork(false);
    setSelectedWorkId(workId);
    setInquiryTenantId(null);
    setAssessmentStartContext(null);
    setInquiryStartContext(null);
    setTrackerStartContext(null);
    setDocumentStartContext(null);
    setPlanStartRequest(null);
    setHome(false);
    setView("tracker");
    setShowAssessment(false);
    const url = new URL(window.location.href);
    url.searchParams.set("workspaceId", snapshot.workspaceId);
    url.searchParams.set("view", "tracker");
    url.searchParams.set("work", workId);
    clearEmbeddedRouteParams(url);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void loadWorkspace(snapshot.workspaceId, true);
  }

  function handleDocumentSaved(workId: string) {
    if (!snapshot) return;
    setMissingWork(false);
    setSelectedWorkId(workId);
    setInquiryTenantId(null);
    setAssessmentStartContext(null);
    setInquiryStartContext(null);
    setTrackerStartContext(null);
    setDocumentStartContext(null);
    setPlanStartRequest(null);
    setHome(false);
    setView("document");
    setShowAssessment(false);
    const url = new URL(window.location.href);
    url.searchParams.set("workspaceId", snapshot.workspaceId);
    url.searchParams.set("view", "document");
    url.searchParams.set("work", workId);
    clearEmbeddedRouteParams(url);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void loadWorkspace(snapshot.workspaceId, true);
  }

  function handlePlanSaved(workId: string) {
    if (!snapshot) return;
    setMissingWork(false);
    setSelectedWorkId(workId);
    setInquiryTenantId(null);
    setAssessmentStartContext(null);
    setInquiryStartContext(null);
    setTrackerStartContext(null);
    setDocumentStartContext(null);
    setPlanStartRequest(null);
    setHome(false);
    setView("plan");
    setShowAssessment(false);
    const url = new URL(window.location.href);
    url.searchParams.set("workspaceId", snapshot.workspaceId);
    url.searchParams.set("view", "plan");
    url.searchParams.set("work", workId);
    clearEmbeddedRouteParams(url);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void loadWorkspace(snapshot.workspaceId, true);
  }

  const trackerContent: React.ReactNode | undefined = snapshot && view === "tracker"
    ? snapshot.actor.localPreview
      ? <LocalTrackerPreview workspaceId={snapshot.workspaceId} readOnly={delegatedRead} templateId={trackerTemplateId(trackerStartContext?.trackerTemplateId)} />
      : <>
        <TrackerExperience workspaceId={snapshot.workspaceId} workId={selectedWork?.productId === "tracker" ? selectedWork.id : undefined} readOnly={delegatedRead} onSaved={handleTrackerSaved} templateId={trackerTemplateId(trackerStartContext?.trackerTemplateId)} />
        {canShowWorkBudget && selectedWork?.productId === "tracker" && selectedWork.resourceKind === "tracker" ? <WorkBudgetPanel workspaceId={snapshot.workspaceId} workId={selectedWork.id} productId="tracker" resourceKind="tracker" /> : null}
      </>
    : undefined;
  const documentRequestText = documentStartContext?.route === "document" ? documentStartContext.request : undefined;
  const documentContent: React.ReactNode | undefined = snapshot && view === "document"
    ? snapshot.actor.localPreview
      ? <LocalDocumentPreview key={`${snapshot.workspaceId}:${documentRequestText || "new"}`} workspaceId={snapshot.workspaceId} readOnly={delegatedRead} initialRequestText={documentRequestText} />
      : <DocumentExperience key={`${snapshot.workspaceId}:${selectedWork?.productId === "documents" ? selectedWork.id : "new"}:${documentRequestText || "new"}`} workspaceId={snapshot.workspaceId} workId={selectedWork?.productId === "documents" ? selectedWork.id : undefined} readOnly={delegatedRead} onSaved={handleDocumentSaved} initialRequestText={documentRequestText} />
    : undefined;
  const planContent: React.ReactNode | undefined = snapshot && view === "plan"
    ? <WorkPlanExperience workspaceId={snapshot.workspaceId} workId={selectedWork?.productId === "work_plans" ? selectedWork.id : undefined} initialRequest={planStartRequest || undefined} sources={snapshot.work} readOnly={delegatedRead} localPreview={snapshot.actor.localPreview} onSaved={handlePlanSaved} onOpenWork={openWorkFromPlan} />
    : undefined;

  function clearPublicSaveQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete("save");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function savePublicResult() {
    if (!publicSaveResultId || !snapshot || publicSaveSaving) return;
    setPublicSaveSaving(true);
    setPublicSaveError("");
    try {
      const body = await postAction<{ work: WorkspaceWork; alreadySaved?: boolean }>(
        { action: publicSaveResultId.startsWith("audit_") ? "save_website_audit" : "save_public_result", workspaceId: snapshot.workspaceId, resultId: publicSaveResultId },
        "That result couldn’t be saved.",
      );
      if (activeWorkspaceRef.current !== snapshot.workspaceId) return;
      const normalizedWork = normalizeWorkspaceWork(body.work, { access: currentWorkspace?.kind === "personal" ? "owned" : "member" });
      setSnapshot((current) => {
        if (!current || current.workspaceId !== normalizedWork.workspaceId) return current;
        const work = current.work.some((item) => item.id === normalizedWork.id)
          ? current.work.map((item) => item.id === normalizedWork.id ? normalizedWork : item)
          : [normalizedWork, ...current.work];
        return { ...current, work };
      });
      setSelectedWorkId(normalizedWork.id);
      setMissingWork(false);
      replaceWorkspaceLocation(normalizedWork.workspaceId, normalizedWork.id);
      setHome(false);
      setView("work");
      setShowAssessment(false);
      setPublicSaveResultId(null);
      clearPublicSaveQuery();
      setNotice({
        kind: "success",
        message: body.alreadySaved ? "This result is already saved in your workspace." : "Result saved privately to your workspace.",
      });
    } catch (cause) {
      setPublicSaveError(cause instanceof Error ? cause.message : "That result couldn’t be saved.");
    } finally {
      setPublicSaveSaving(false);
    }
  }

  if (loading && !snapshot) return <WorkspaceLoading label="Opening your private workspace…" />;

  if (!snapshot) {
    return (
      <WorkspaceFrame>
        <StrelvaShell signedIn={false} signInHref={signInHref} title="Your Strelva">
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          {signInRequired ? <LockKeyhole className="h-7 w-7 text-accent-text" strokeWidth={1.5} /> : <CircleAlert className="h-7 w-7 text-critical" strokeWidth={1.5} />}
          <h1 className="mt-5 font-display text-[28px] font-medium text-warm-black">{signInRequired ? "Sign in to open your private work." : "Your workspace didn’t open."}</h1>
          <p role="alert" className="mt-2 text-[14px] leading-relaxed text-gray-muted">{notice?.message}</p>
          {signInRequired ? (
            <Link href={signInHref} className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85">Sign in <ArrowRight className="h-4 w-4" /></Link>
          ) : <Button className="mt-6" onClick={() => void loadWorkspace()}>Try again</Button>}
        </div>
        </StrelvaShell>
      </WorkspaceFrame>
    );
  }

  return (
    <WorkspaceFrame>
      <div inert={Boolean(handoffLoading || (handoffToken && handoffPreview) || publicSaveResultId) || undefined}>
      <WorkspaceLayout appBase={appBase} signOut={signOut} key={snapshot.workspaceId} snapshot={snapshot} home={home} agency={view === "agency"} busy={loading} selectedWork={showAssessment ? null : selectedWork}
        managedWork={snapshot.managedWork}
        managedWorkUnavailable={snapshot.managedWorkUnavailable}
        onHome={goHome}
        onChoose={chooseWork}
        onNew={(context) => { setMissingWork(false); setRetryWork(null); setAssessmentStartContext(context?.route === "assessment" ? context : null); setInquiryStartContext(null); setTrackerStartContext(null); setDocumentStartContext(null); setPlanStartRequest(null); const url = new URL(window.location.href); clearEmbeddedRouteParams(url); url.searchParams.set("workspaceId", snapshot.workspaceId); url.searchParams.set("view", "work"); url.searchParams.delete("work"); window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`); setHome(false); setView("work"); setShowAssessment(true); setNotice(null); }}
        onPlan={startPlan}
        onAgency={() => { setHome(false); setView("agency"); }}
        onInquiry={chooseInquiry}
        onTracker={startTracker}
        onDocument={startDocument}
        trackerTemplates={TRACKER_TEMPLATES.map((template) => ({ id: template.id, label: template.name, description: template.description }))}
        inquiryBusinesses={inquiryBusinesses}
        inquiry={inquiryTarget}
        tracker={trackerContent}
        plan={planContent}
        document={documentContent}
        onWorkspace={(id) => { replaceWorkspaceLocation(id); const url = new URL(window.location.href); clearEmbeddedRouteParams(url); url.searchParams.delete("work"); url.searchParams.delete("view"); window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`); setHome(true); setView("work"); setInquiryTenantId(null); setInquiryStartContext(null); setTrackerStartContext(null); setDocumentStartContext(null); setPlanStartRequest(null); void loadWorkspace(id); }}
        notice={<>
        {pendingRequest ? <div role="status" className="mx-4 mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-gray-border p-4 text-sm"><span>An assessment may still need to finish saving.</span>
          {(snapshot.pendingAssessments?.length || 0) > 1 ? <label className="flex items-center gap-2">Assessment<select className="rounded-lg border border-gray-border bg-surface px-3 py-2" value={pendingRequest} onChange={event => setPendingRequest(event.target.value)}>{!snapshot.pendingAssessments?.some(item => item.id === pendingRequest) ? <option value={pendingRequest}>Current attempt</option> : null}{snapshot.pendingAssessments?.map((item, index) => <option key={item.id} value={item.id}>{index + 1} · {formatDate(item.createdAt)}</option>)}</select></label> : null}<Button disabled={recovering} onClick={() => void recoverAssessment()}>Recover assessment</Button><Button variant="ghost" disabled={recovering} onClick={() => rememberAttempt(null)}>Dismiss</Button></div> : null}
        {notice ? (
        <div inert={Boolean(handoffLoading || (handoffToken && handoffPreview)) || undefined} role={notice.kind === "error" ? "alert" : "status"} className={`mx-4 mt-4 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-[13px] sm:mx-7 ${notice.kind === "error" ? "border-critical/30 bg-critical/10 text-critical" : "border-positive/30 bg-positive/10 text-positive"}`}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 underline underline-offset-2">Dismiss</button>
        </div>
      ) : null}</>}>
          {missingWork ? (
            <div><h1 className="font-display text-3xl text-warm-black">This saved result is unavailable.</h1><p className="mt-4 text-gray-muted">It may have been removed, or your access may have changed. Choose another result from My work or switch to its workspace.</p></div>
          ) : view === "agency" ? (
            <AccessPanel
              snapshot={snapshot}
              currentKind={currentWorkspace?.kind ?? "personal"}
              currentAccess={currentWorkspace?.access ?? "member"}
              currentRole={currentWorkspace?.role}
              selectedWork={selectedWork}
              postAction={postAction}
              onChanged={() => void loadWorkspace(snapshot.workspaceId, true)}
              onAgencyCreated={(workspaceId) => void loadWorkspace(workspaceId)}
              setNotice={setNotice}
            />
          ) : delegatedRead && !selectedWork ? (
            <DelegatedEmpty />
          ) : (showAssessment || !selectedWork) && !delegatedRead ? (
            <AiVisibilityAssessmentForm<WorkspaceWork>
              initialInput={retryAssessment ? { business: retryAssessment.business, url: retryAssessment.url, category: typeof retryWork?.input.category === "string" ? retryWork.input.category : undefined, location: typeof retryWork?.input.location === "string" ? retryWork.input.location : undefined } : undefined}
              initialRequestText={assessmentStartContext?.route === "assessment" ? assessmentStartContext.request : undefined}
              onSubmit={async (input) => {
                const signature = JSON.stringify([snapshot.workspaceId, input]);
                const requestId = attemptRef.current?.signature === signature ? attemptRef.current.id : crypto.randomUUID();
                attemptRef.current = { signature, id: requestId };
                rememberAttempt(requestId);
                const body = await postAction<{ work: WorkspaceWork }>({ action: "assess", workspaceId: snapshot.workspaceId, requestId, ...input }, "The assessment couldn’t be completed. Use Recover assessment before starting again.");
        return normalizeWorkspaceWork(body.work, { access: "owned" });
              }}
              onCancel={snapshot.work.length ? () => { setAssessmentStartContext(null); setShowAssessment(false); } : undefined}
              onCreated={(work) => {
                if (activeWorkspaceRef.current !== work.workspaceId) return;
                setSnapshot((current) => current?.workspaceId === work.workspaceId ? { ...current, work: [work, ...current.work] } : current);
                rememberAttempt(null);
                attemptRef.current = null;
                setAssessmentStartContext(null);
                setSelectedWorkId(work.id);
                replaceWorkspaceLocation(work.workspaceId, work.id);
                setShowAssessment(false);
                setNotice({ kind: "success", message: "Assessment saved privately to this workspace." });
              }}
            />
          ) : selectedWork?.assessment?.kind === "website_audit" && selectedWork.assessment.payload ? (
            <WebsiteAuditPage key={selectedWork.id} initialResult={selectedWork.assessment.payload} saved />
          ) : selectedWork?.assessment?.kind === "ai_visibility" ? (
            <>
            <AiVisibilityAssessmentResult work={selectedWork} onRetry={delegatedRead ? undefined : () => { setAssessmentStartContext(null); setRetryWork(selectedWork); setShowAssessment(true); }} accessLabel={delegatedRead ? "Read-only access granted by the customer" : "Access controlled by this workspace"} />
              {canShowWorkBudget ? <WorkBudgetPanel workspaceId={snapshot.workspaceId} workId={selectedWork.id} productId="ai_visibility" resourceKind={selectedWork.resourceKind} /> : null}
            </>
          ) : selectedWork?.productId === "research" && selectedWork.resourceKind === "experiment" ? (
            <WorkspaceExperimentResult work={selectedWork} onOpenTracker={handleTrackerSaved} />
          ) : selectedWork ? <p className="mx-auto max-w-2xl text-[14px] text-gray-muted">This saved work is unavailable in this release. Its stored record remains unchanged.</p> : null}
      </WorkspaceLayout>
      </div>

      {(handoffLoading || (handoffToken && handoffPreview)) ? (
        <AccessHandoffOverlay
          loading={handoffLoading}
          token={handoffToken}
          preview={handoffPreview}
          postAction={postAction}
          onAccepted={(workspaceId, workId) => {
            replaceWorkspaceLocation(workspaceId, workId);
            const url = new URL(window.location.href);
            url.hash = "";
            window.history.replaceState(null, "", `${url.pathname}${url.search}`);
            sessionStorage.removeItem("strelva:workspace-handoff");
            setHandoffToken(null);
            setHandoffPreview(null);
            void loadWorkspace(workspaceId);
          }}
          onClose={() => {
            const url = new URL(window.location.href);
            url.hash = "";
            window.history.replaceState(null, "", `${url.pathname}${url.search}`);
            sessionStorage.removeItem("strelva:workspace-handoff");
            setHandoffToken(null);
            setHandoffPreview(null);
          }}
        />
      ) : null}

      {!handoffLoading && !(handoffToken && handoffPreview) && publicSaveResultId ? (
        <PublicResultSaveOverlay
          workspaceName={currentWorkspace?.name || "Current workspace"}
          saving={publicSaveSaving}
          error={publicSaveError}
          onSave={() => void savePublicResult()}
          onClose={() => {
            if (publicSaveSaving) return;
            clearPublicSaveQuery();
            setPublicSaveResultId(null);
            setPublicSaveError("");
          }}
        />
      ) : null}
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  return <div data-dashboard className="flex min-h-0 flex-col bg-surface-base text-warm-black">{children}</div>;
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <WorkspaceFrame>
      <StrelvaShell signedIn={false} title="Your Strelva">
      <div role="status" className="flex flex-1 items-center justify-center gap-3 text-[14px] text-gray-muted">
        <Loader2 className="h-4 w-4 animate-spin" />{label}
      </div>
      </StrelvaShell>
    </WorkspaceFrame>
  );
}

function DelegatedEmpty() {
  return (
    <div className="mx-auto max-w-2xl">
      <LockKeyhole className="h-6 w-6 text-accent-text" strokeWidth={1.5} />
      <h1 className="mt-5 font-display text-[36px] font-medium text-warm-black">Customer work shared read-only.</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-muted">There is no work available in this shared view. Only the customer can create or change work here.</p>
    </div>
  );
}

function PublicResultSaveOverlay({ workspaceName, saving, error, onSave, onClose }: { workspaceName: string; saving: boolean; error: string; onSave: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (saving && !dialogRef.current?.querySelector("button:not([disabled])")) dialogRef.current?.focus();
  }, [saving]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saving) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return (
    <div ref={dialogRef} tabIndex={-1} onKeyDown={handleDialogKeyDown} role="dialog" aria-modal="true" aria-labelledby="public-save-title" className="fixed inset-0 z-50 overflow-y-auto bg-overlay-scrim p-3 outline-none sm:p-8">
      <div className="mx-auto flex min-h-full max-w-xl items-center">
        <div className="w-full rounded-2xl border border-gray-border bg-surface p-5 shadow-2xl sm:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-text">Private workspace</p>
          <h1 id="public-save-title" className="mt-3 font-display text-[28px] font-medium leading-tight text-warm-black">Save a private copy of this result?</h1>
          <p className="mt-5 rounded-xl border border-gray-border bg-surface-inset px-4 py-3 text-[13px] text-gray-fg"><span className="font-medium text-warm-black">Workspace:</span> {workspaceName}</p>
          <p className="mt-5 text-[14px] leading-relaxed text-gray-muted">This creates a new private work item in this workspace. The original public report stays separate and its source ownership does not change.</p>
          {error ? <p role="alert" className="mt-4 rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-[13px] leading-relaxed text-critical">{error}</p> : null}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" size="lg" disabled={saving} onClick={onClose}>Back</Button>
            <Button type="button" size="lg" loading={saving} onClick={onSave} icon={<ArrowRight className="h-4 w-4" />}>Save a copy</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
