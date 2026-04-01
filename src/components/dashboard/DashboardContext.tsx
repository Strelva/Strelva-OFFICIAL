"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode, type Dispatch, type SetStateAction } from "react";

type Panel = "content" | "preview" | "chat";
type RightTab = "properties" | "chat";
type OverlayView = "overview" | "bookings" | "settings" | null;
type EditMode = "live" | "draft";

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

  // Right panel tab
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;

  // Panel collapse (desktop)
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;

  // Overlay sheets
  overlayView: OverlayView;
  setOverlayView: (view: OverlayView) => void;

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

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<Panel>("chat");
  const [chatPrompt, setChatPromptState] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [activeSection, setActiveSectionState] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("chat");
  const [overlayView, setOverlayView] = useState<OverlayView>(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("reb-overview-shown")) {
      return null;
    }
    return "overview";
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [scrollToSection, setScrollToSection] = useState<string | null>(null);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("draft");
  const [hasDraft, setHasDraft] = useState<Record<string, boolean>>({});

  // Load collapse state from localStorage on mount
  useEffect(() => {
    const stored = getStoredCollapse();
    setLeftCollapsed(stored.left);
    setRightCollapsed(stored.right);
  }, []);

  // Mark overview as shown for this browser session
  useEffect(() => {
    if (overlayView === "overview" && typeof window !== "undefined") {
      sessionStorage.setItem("reb-overview-shown", "1");
    }
  }, [overlayView]);

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

  return (
    <DashboardContext.Provider
      value={{
        activePanel,
        setActivePanel,
        chatPrompt,
        setChatPrompt,
        activeSection,
        setActiveSection,
        rightTab,
        setRightTab,
        leftCollapsed,
        rightCollapsed,
        toggleLeft,
        toggleRight,
        overlayView,
        setOverlayView,
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
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
