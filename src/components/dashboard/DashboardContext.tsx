"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { EditableNode } from "@/lib/editor-types";

type Panel = "content" | "preview" | "chat";
type RightTab = "properties" | "chat" | "layout" | "request";
type EditMode = "live" | "draft";
type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";
type PlanOverride = "founder_comp" | null;
type EditReceiptStatus = "draft" | "published" | "discarded";
type EditReceiptSource = "field_editor" | "inline_canvas" | "layout_editor" | "ai";

export interface ImpersonationContext {
  isActive: boolean;
  actorEmail: string | null;
  /** The signed-in person's display name (login identity, not the tenant). */
  actorName: string | null;
  /** Whether the signed-in person is a Strelva super-admin. */
  isSuperAdmin: boolean;
  tenantId: string;
}

export interface EditReceipt {
  id: string;
  section: string;
  sectionLabel: string;
  field: string;
  fieldLabel: string;
  before: string;
  after: string;
  source: EditReceiptSource;
  status: EditReceiptStatus;
  timestamp: number;
}

export type NewEditReceipt = Omit<EditReceipt, "id" | "status" | "timestamp"> & {
  status?: EditReceiptStatus;
};

interface DashboardContextValue {
  // Mobile tab
  activePanel: Panel;
  setActivePanel: (panel: Panel) => void;

  // Content card -> Chat pre-fill
  chatPrompt: string;
  setChatPrompt: (prompt: string) => void;

  // Active section (expanded card in left panel)
  activeSection: string | null;
  setActiveSection: (section: string | null) => void;
  selectedNode: EditableNode | null;
  setSelectedNode: (node: EditableNode | null) => void;

  // Active page (selected in ContentBrowser Pages tab). Shared so
  // SitePreview's iframe src and PageStructurePanel can react to it.
  activePage: string;
  setActivePage: (page: string) => void;

  // Right panel tab
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;

  // Panel collapse (desktop)
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;

  // Iframe refresh + scroll-to-section
  refreshKey: number;
  triggerRefresh: () => void;
  scrollToSection: string | null;
  setScrollToSection: (section: string | null) => void;

  // Chat drawer
  chatDrawerOpen: boolean;
  setChatDrawerOpen: (open: boolean) => void;

  // Draft mode
  editMode: EditMode;
  setEditMode: (mode: EditMode) => void;
  hasDraft: Record<string, boolean>;
  setHasDraft: Dispatch<SetStateAction<Record<string, boolean>>>;
  hasPageConfigDraft: boolean;
  setHasPageConfigDraft: Dispatch<SetStateAction<boolean>>;
  reloadDraftState: () => Promise<void>;
  editReceipts: EditReceipt[];
  addEditReceipts: (receipts: NewEditReceipt[]) => void;
  markDraftReceipts: (status: Exclude<EditReceiptStatus, "draft">) => void;

  // Tenant site URL
  tenantId: string;
  siteUrl: string;
  previewUrl: string;
  liveSyncEnabled: boolean;
  dashboardBasePath: string;
  dashboardHref: (path: string) => string;

  // Site model identifier
  siteModel: string;

  // Whether AI agent auto-publishes or creates drafts
  autoPublish: boolean;

  // Billing state from the tenant record
  subscriptionStatus: SubscriptionStatus;
  hasStripeCustomer: boolean;
  planOverride: PlanOverride;
  commercialPlanLabel: string;
  commercialPlanMonthlyCents: number;

  // Super-admin visibility
  impersonation: ImpersonationContext;

  // Read-only mode: the public demo (and any other non-editable context like a
  // suspended tenant). Write controls disable themselves; the API layer is the
  // real backstop (a no-session demo viewer 401s on every mutation regardless).
  readOnly: boolean;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}

/** Safe version that returns null outside provider */
export function useDashboardOptional() {
  return useContext(DashboardContext);
}

function getStoredCollapse(): { left: boolean; right: boolean } {
  if (typeof window === "undefined") return { left: false, right: false };
  try {
    const stored = localStorage.getItem("reb-panel-collapse");
    if (stored) return JSON.parse(stored);
  } catch {}
  return { left: false, right: false };
}

export function DashboardProvider({
  children,
  tenantId = "",
  siteUrl = "",
  previewUrl = "",
  liveSyncEnabled = false,
  dashboardBasePath = "",
  siteModel = "wellness",
  autoPublish = true,
  subscriptionStatus = "none",
  hasStripeCustomer = false,
  planOverride = null,
  commercialPlanLabel = "Growth",
  commercialPlanMonthlyCents = 19_900,
  impersonation,
  readOnly = false,
}: {
  children: ReactNode;
  tenantId?: string;
  siteUrl?: string;
  previewUrl?: string;
  liveSyncEnabled?: boolean;
  dashboardBasePath?: string;
  siteModel?: string;
  autoPublish?: boolean;
  subscriptionStatus?: SubscriptionStatus;
  hasStripeCustomer?: boolean;
  planOverride?: PlanOverride;
  commercialPlanLabel?: string;
  commercialPlanMonthlyCents?: number;
  impersonation?: ImpersonationContext;
  readOnly?: boolean;
}) {
  const [activePanel, setActivePanel] = useState<Panel>("content");
  const [chatPrompt, setChatPromptState] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [activeSection, setActiveSectionState] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<string>("home");
  const [rightTab, setRightTab] = useState<RightTab>("chat");
  const [selectedNode, setSelectedNodeState] = useState<EditableNode | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scrollToSection, setScrollToSection] = useState<string | null>(null);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("draft");
  const [hasDraft, setHasDraft] = useState<Record<string, boolean>>({});
  const [hasPageConfigDraft, setHasPageConfigDraft] = useState(false);
  const [editReceipts, setEditReceipts] = useState<EditReceipt[]>([]);
  const dashboardHref = useCallback(
    (path: string) => `${dashboardBasePath}${path.startsWith("/") ? path : `/${path}`}`,
    [dashboardBasePath]
  );

  const reloadDraftState = useCallback(async () => {
    try {
      const res = await fetch(dashboardHref("/api/publish"), { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      setHasDraft(
        data.contentDrafts && typeof data.contentDrafts === "object"
          ? data.contentDrafts
          : {}
      );
      setHasPageConfigDraft(Boolean(data.pageConfigDraft));
    } catch {}
  }, [dashboardHref]);

  // Apply localStorage collapse state after hydration completes.
  // First render always uses server default (false) so the client
  // tree structure matches what the server rendered — preventing
  // hydration mismatch and the "parentNode" null error. The cascade
  // only fires once, on mount.
  useEffect(() => {
    const stored = getStoredCollapse();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeftCollapsed(stored.left);
    setRightCollapsed(stored.right);
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void reloadDraftState();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [reloadDraftState]);

  const persistCollapse = (left: boolean, right: boolean) => {
    try {
      localStorage.setItem("reb-panel-collapse", JSON.stringify({ left, right }));
    } catch {}
  };

  const toggleLeft = useCallback(() => {
    setLeftCollapsed((prev) => {
      const next = !prev;
      persistCollapse(next, rightCollapsed);
      return next;
    });
  }, [rightCollapsed]);

  const toggleRight = useCallback(() => {
    setRightCollapsed((prev) => {
      const next = !prev;
      persistCollapse(leftCollapsed, next);
      return next;
    });
  }, [leftCollapsed]);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const setActiveSection = useCallback((section: string | null) => {
    setActiveSectionState(section);
    if (!section) setSelectedNodeState(null);
    if (section) setRightTab("properties"); // Auto-switch to properties when selecting a section
  }, []);

  const setSelectedNode = useCallback((node: EditableNode | null) => {
    setSelectedNodeState(node);
    if (node?.section) {
      setActiveSectionState(node.section);
    }
  }, []);

  const setChatPrompt = useCallback((prompt: string) => {
    setChatPromptState(prompt);
    setRightTab("chat"); // Switch to chat tab when using chat prompt
    setActivePanel("chat"); // Switch to chat on mobile
    setChatDrawerOpen(true); // Also open the floating drawer
  }, []);

  const addEditReceipts = useCallback((receipts: NewEditReceipt[]) => {
    if (receipts.length === 0) return;
    const timestamp = Date.now();
    setEditReceipts((prev) => {
      const nextReceipts = receipts.map(({ status = "draft", ...receipt }, index) => ({
        ...receipt,
        id: `${receipt.section}:${receipt.field}:${timestamp}:${index}`,
        status,
        timestamp,
      }));
      const replacedKeys = new Set(nextReceipts.map((receipt) => `${receipt.section}:${receipt.field}`));
      return [
        ...nextReceipts,
        ...prev.filter((receipt) => receipt.status !== "draft" || !replacedKeys.has(`${receipt.section}:${receipt.field}`)),
      ].slice(0, 30);
    });
  }, []);

  const markDraftReceipts = useCallback((status: Exclude<EditReceiptStatus, "draft">) => {
    setEditReceipts((prev) =>
      prev.map((receipt) =>
        receipt.status === "draft"
          ? { ...receipt, status, timestamp: Date.now() }
          : receipt
      )
    );
  }, []);

  // Until hydration is complete, expose the server default (false)
  // so consumers render the same tree structure the server did.
  const safeLeftCollapsed = hasMounted ? leftCollapsed : false;
  const safeRightCollapsed = hasMounted ? rightCollapsed : false;

  // Memoize the context value: ~15 consumers read this, so a fresh object every
  // render re-rendered the whole dashboard tree on any state change (a chat
  // keystroke, a refresh bump) and made consumers that dep on the value loop.
  // All the callbacks below are already useCallback-stable, so this is the fix.
  const value = useMemo(
    () => ({
      activePanel,
      setActivePanel,
      chatPrompt,
      setChatPrompt,
      activeSection,
      setActiveSection,
      selectedNode,
      setSelectedNode,
      activePage,
      setActivePage,
      rightTab,
      setRightTab,
      leftCollapsed: safeLeftCollapsed,
      rightCollapsed: safeRightCollapsed,
      toggleLeft,
      toggleRight,
      refreshKey,
      triggerRefresh,
      scrollToSection,
      setScrollToSection,
      chatDrawerOpen,
      setChatDrawerOpen,
      editMode,
      setEditMode,
      hasDraft,
      setHasDraft,
      hasPageConfigDraft,
      setHasPageConfigDraft,
      reloadDraftState,
      editReceipts,
      addEditReceipts,
      markDraftReceipts,
      tenantId,
      siteUrl,
      previewUrl,
      liveSyncEnabled,
      dashboardBasePath,
      dashboardHref,
      siteModel,
      autoPublish,
      subscriptionStatus,
      hasStripeCustomer,
      planOverride,
      commercialPlanLabel,
      commercialPlanMonthlyCents,
      impersonation: impersonation || { isActive: false, actorEmail: null, actorName: null, isSuperAdmin: false, tenantId },
      readOnly,
    }),
    [
      activePanel, setActivePanel, chatPrompt, setChatPrompt, activeSection, setActiveSection,
      selectedNode, setSelectedNode, activePage, setActivePage, rightTab, setRightTab,
      safeLeftCollapsed, safeRightCollapsed, toggleLeft, toggleRight, refreshKey, triggerRefresh,
      scrollToSection, setScrollToSection, chatDrawerOpen, setChatDrawerOpen, editMode, setEditMode,
      hasDraft, setHasDraft, hasPageConfigDraft, setHasPageConfigDraft, reloadDraftState,
      editReceipts, addEditReceipts, markDraftReceipts, tenantId, siteUrl, previewUrl,
      liveSyncEnabled, dashboardBasePath, dashboardHref, siteModel, autoPublish, subscriptionStatus,
      hasStripeCustomer, planOverride, commercialPlanLabel, commercialPlanMonthlyCents, impersonation, readOnly,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
