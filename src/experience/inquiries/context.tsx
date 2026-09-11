"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { JsonValue } from "@/products/inquiries/contracts";
import type {
  InquiryRecord,
  InquirySurfaceAction,
  InquirySurfaceAdapter,
  InquirySurfaceResult,
  InquirySurfaceSnapshot,
  InquiryView,
  InquiryWork,
  WhyResult,
} from "./contracts";

export type InquiryExperienceProps = {
  audience?: "business" | "agency";
  scenario?: string;
  initialView?: InquiryView;
  initialRequestId?: string | null;
  initialInquiryId?: string | null;
  /** Request text carried in from the shared workspace start screen. */
  initialRequestText?: string | null;
  basePath?: string;
  /** Prefix route state when the surface is embedded in another app frame. */
  routePrefix?: string;
  adapter?: InquirySurfaceAdapter;
  initialSnapshot?: InquirySurfaceSnapshot;
};

type ProviderProps = {
  adapter: InquirySurfaceAdapter;
  initialSnapshot?: InquirySurfaceSnapshot;
  initialView: InquiryView;
  initialRequestId?: string | null;
  initialInquiryId?: string | null;
  initialRequestText?: string | null;
  basePath: string;
  routePrefix?: string;
  children: ReactNode;
};

export type InquiryPermission =
  | "canStart"
  | "canEdit"
  | "canPublish"
  | "canManageRecords"
  | "canCorrectOnboarding"
  | "canManageResponsibility"
  | "canManageConnections";

export type InquiryContextValue = {
  snapshot: InquirySurfaceSnapshot;
  view: InquiryView;
  requestId: string | null;
  inquiryId: string | null;
  initialRequestText: string;
  basePath: string;
  pending: boolean;
  message: string;
  error: string;
  selectedWork: InquiryWork | undefined;
  selectedRecord: InquiryRecord | undefined;
  selectedCapability: InquirySurfaceSnapshot["capabilities"][number] | undefined;
  selectedWhy: WhyResult | undefined;
  can: (permission: InquiryPermission) => boolean;
  navigate: (view: InquiryView, ids?: { requestId?: string | null; inquiryId?: string | null }) => void;
  perform: (action: InquirySurfaceAction) => Promise<InquirySurfaceResult | null>;
  clearFeedback: () => void;
};

const InquiryContext = createContext<InquiryContextValue | null>(null);

export function useInquiry(): InquiryContextValue {
  const context = useContext(InquiryContext);
  if (!context) throw new Error("Inquiry components must be rendered inside InquiryExperience.");
  return context;
}

const VIEWS: InquiryView[] = [
  "home",
  "new",
  "shape",
  "work",
  "plan",
  "preview",
  "rehearsal",
  "receipt",
  "search",
  "record",
  "why",
  "responsibility",
  "connections",
  "onboarding",
  "account",
  "attention",
  "patterns",
];

export function parseView(value: string | null): InquiryView {
  return value && VIEWS.includes(value as InquiryView) ? value as InquiryView : "home";
}

/**
 * Host-provided authorization is authoritative. The read-only fallback keeps
 * older snapshots safe while the server adds the explicit permission fields.
 */
export function canInquiry(snapshot: InquirySurfaceSnapshot, permission: InquiryPermission): boolean {
  const explicit = snapshot.permissions?.[permission];
  if (explicit !== undefined) return explicit;
  return snapshot.rehearsal ? !snapshot.readOnly : false;
}

function InquiryProvider({
  adapter,
  initialSnapshot,
  initialView,
  initialRequestId,
  initialInquiryId,
  initialRequestText,
  basePath,
  routePrefix,
  children,
}: ProviderProps) {
  const [snapshot, setSnapshot] = useState<InquirySurfaceSnapshot>(() => initialSnapshot || adapter.getSnapshot());
  const [view, setView] = useState<InquiryView>(initialView);
  const [requestId, setRequestId] = useState<string | null>(initialRequestId || null);
  const [inquiryId, setInquiryId] = useState<string | null>(initialInquiryId || null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [whyByInquiry, setWhyByInquiry] = useState<Record<string, WhyResult>>(() => initialSnapshot?.whyByInquiry || {});

  const routeParam = useCallback((name: "view" | "request" | "record") => {
    if (!routePrefix) return name === "record" ? "inquiry" : name;
    return `${routePrefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }, [routePrefix]);

  const navigate = useCallback((nextView: InquiryView, ids: { requestId?: string | null; inquiryId?: string | null } = {}) => {
    const nextRequestId = ids.requestId === undefined ? requestId : ids.requestId;
    const nextInquiryId = ids.inquiryId === undefined ? inquiryId : ids.inquiryId;
    setView(nextView);
    setRequestId(nextRequestId || null);
    setInquiryId(nextInquiryId || null);
    setMessage("");
    setError("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set(routeParam("view"), nextView);
      if (nextRequestId) url.searchParams.set(routeParam("request"), nextRequestId);
      else url.searchParams.delete(routeParam("request"));
      if (nextInquiryId) url.searchParams.set(routeParam("record"), nextInquiryId);
      else url.searchParams.delete(routeParam("record"));
      window.history.pushState(null, "", url);
    }
  }, [inquiryId, requestId, routeParam]);

  useEffect(() => {
    function syncFromLocation() {
      const params = new URLSearchParams(window.location.search);
      setView(parseView(params.get(routeParam("view"))));
      setRequestId(params.get(routeParam("request")));
      setInquiryId(params.get(routeParam("record")));
    }
    // Authenticated entry pages load their private state after hydration. Restore
    // the addressed receipt or record on that first mount as well as on Back.
    if (new URLSearchParams(window.location.search).has(routeParam("view"))) syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [routeParam]);

  const perform = useCallback(async (action: InquirySurfaceAction): Promise<InquirySurfaceResult | null> => {
    setPending(true);
    setMessage("");
    setError("");
    try {
      const result = await Promise.resolve(adapter.execute(action));
      setSnapshot(result.snapshot);
      if (result.why) {
        setWhyByInquiry((current) => ({ ...current, [result.why!.inquiryId]: result.why! }));
      }
      if (result.message) setMessage(result.message);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Refresh to check the latest receipt before trying again.");
      return null;
    } finally {
      setPending(false);
    }
  }, [adapter]);

  const selectedWork = useMemo(
    () => snapshot.state.requests.find((work) => work.id === requestId),
    [requestId, snapshot.state.requests],
  );
  const selectedRecord = useMemo(
    () => snapshot.state.inquiries.find((record) => record.id === inquiryId),
    [inquiryId, snapshot.state.inquiries],
  );
  const selectedCapability = useMemo(
    () => selectedWork
      ? snapshot.capabilities.find((capability) => capability.id === selectedWork.capabilityId)
      : snapshot.capabilities[0],
    [selectedWork, snapshot.capabilities],
  );
  const selectedWhy = selectedRecord
    ? snapshot.whyByInquiry?.[selectedRecord.id] || whyByInquiry[selectedRecord.id]
    : undefined;
  const can = useCallback((permission: InquiryPermission) => canInquiry(snapshot, permission), [snapshot]);

  const value: InquiryContextValue = {
    snapshot,
    view,
    requestId,
    inquiryId,
    initialRequestText: initialRequestText || "",
    basePath,
    pending,
    message,
    error,
    selectedWork,
    selectedRecord,
    selectedCapability,
    selectedWhy,
    can,
    navigate,
    perform,
    clearFeedback: () => { setMessage(""); setError(""); },
  };

  return <InquiryContext.Provider value={value}>{children}</InquiryContext.Provider>;
}

export { InquiryProvider };

export type { JsonValue };
