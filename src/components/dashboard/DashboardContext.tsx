"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode, type Dispatch, type SetStateAction } from "react";

type Panel = "content" | "preview" | "chat";
type RightTab = "properties" | "chat";
type EditMode = "live" | "draft";
type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";

export interface ImpersonationContext {
  isActive: boolean;
  actorEmail: string | null;
  tenantId: string;
}

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

  // Tenant site URL
  tenantId: string;
  siteUrl: string;
  previewUrl: string;
  dashboardBasePath: string;
  dashboardHref: (path: string) => string;

  // Site model identifier
  siteModel: string;

  // Whether AI agent auto-publishes or creates drafts
  autoPublish: boolean;

  // Billing state from the tenant record
  subscriptionStatus: SubscriptionStatus;
  hasStripeCustomer: boolean;

  // Super-admin visibility
  impersonation: ImpersonationContext;
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
  dashboardBasePath = "",
  siteModel = "wellness",
  autoPublish = true,
  subscriptionStatus = "none",
  hasStripeCustomer = false,
  impersonation,
}: {
  children: ReactNode;
  tenantId?: string;
  siteUrl?: string;
  previewUrl?: string;
  dashboardBasePath?: string;
  siteModel?: string;
  autoPublish?: boolean;
  subscriptionStatus?: SubscriptionStatus;
  hasStripeCustomer?: boolean;
  impersonation?: ImpersonationContext;
}) {
  const [activePanel, setActivePanel] = useState<Panel>("content");
  const [chatPrompt, setChatPromptState] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [activeSection, setActiveSectionState] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<string>("home");
  const [rightTab, setRightTab] = useState<RightTab>("chat");
  const [refreshKey, setRefreshKey] = useState(0);
  const [scrollToSection, setScrollToSection] = useState<string | null>(null);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("draft");
  const [hasDraft, setHasDraft] = useState<Record<string, boolean>>({});
  const dashboardHref = useCallback(
    (path: string) => `${dashboardBasePath}${path.startsWith("/") ? path : `/${path}`}`,
    [dashboardBasePath]
  );

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
    if (section) setRightTab("properties"); // Auto-switch to properties when selecting a section
  }, []);

  const setChatPrompt = useCallback((prompt: string) => {
    setChatPromptState(prompt);
    setRightTab("chat"); // Switch to chat tab when using chat prompt
    setActivePanel("chat"); // Switch to chat on mobile
    setChatDrawerOpen(true); // Also open the floating drawer
  }, []);

  // Until hydration is complete, expose the server default (false)
  // so consumers render the same tree structure the server did.
  const safeLeftCollapsed = hasMounted ? leftCollapsed : false;
  const safeRightCollapsed = hasMounted ? rightCollapsed : false;

  return (
    <DashboardContext.Provider
      value={{
        activePanel,
        setActivePanel,
        chatPrompt,
        setChatPrompt,
        activeSection,
        setActiveSection,
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
        tenantId,
        siteUrl,
        previewUrl,
        dashboardBasePath,
        dashboardHref,
        siteModel,
        autoPublish,
        subscriptionStatus,
        hasStripeCustomer,
        impersonation: impersonation || { isActive: false, actorEmail: null, tenantId },
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
