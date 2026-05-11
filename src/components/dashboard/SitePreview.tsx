"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AlertCircle, ExternalLink, Eye, Loader2, Maximize2, MessageCircle, Monitor, Pencil, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";
import { SECTION_LABELS } from "@/components/ui/section-labels";

type Breakpoint = { label: string; icon: typeof Monitor; width: number | null };
type PreviewStatus = "loading" | "ready" | "error";

const BREAKPOINTS: readonly Breakpoint[] = [
  { label: "Mobile", icon: Smartphone, width: 375 },
  { label: "Tablet", icon: Tablet, width: 768 },
  { label: "Desktop", icon: Monitor, width: 1280 },
  { label: "Fluid", icon: Maximize2, width: null },
] as const;

const PAGE_PATHS: Record<string, string> = {
  home: "/",
  services: "/services",
  about: "/about",
  contact: "/contact",
  events: "/events",
  faq: "/faq",
  providers: "/providers",
  shop: "/shop",
};

const PREVIEW_TIMEOUT_MS = 12000;

interface ContextMenu {
  section: string;
  label: string;
  x: number;
  y: number;
}

export function SitePreview() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(
    BREAKPOINTS[BREAKPOINTS.length - 1]
  );
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");
  const [previewErrorDismissed, setPreviewErrorDismissed] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const {
    refreshKey,
    scrollToSection,
    setScrollToSection,
    setActiveSection,
    activeSection,
    editMode,
    setHasDraft,
    triggerRefresh,
    siteUrl,
    previewUrl,
    siteModel,
    activePage,
    setChatPrompt,
    setRightTab,
  } = useDashboard();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Build section→page mapping from the active site model's page config so
  // clicking a section jumps the preview to the right page.
  const siteModelPages = getDefaultPageConfig(siteModel);
  const sectionToPage: Record<string, string> = {};
  for (const [page, config] of Object.entries(siteModelPages)) {
    for (const s of config.sections) {
      if (!sectionToPage[s.type]) sectionToPage[s.type] = page;
    }
  }
  const currentPage = activeSection
    ? (sectionToPage[activeSection] || activePage || "home")
    : (activePage || "home");
  const pagePath = PAGE_PATHS[currentPage] || (currentPage === "home" ? "/" : `/${currentPage}`);
  // Build query params: always include preview=true, optionally edit=true
  const params = new URLSearchParams();
  params.set("preview", "true");
  if (editMode === "draft") {
    params.set("edit", "true");
  }
  const base = previewUrl || siteUrl || "";
  const iframeSrc = `${base}${pagePath}?${params.toString()}`;
  const liveTargetUrl = `${siteUrl || base || ""}${pagePath}`;
  const isExternalPreview = (() => {
    if (typeof window === "undefined" || !base) return false;
    try {
      return new URL(base).origin !== window.location.origin;
    } catch {
      return false;
    }
  })();
  const activeSectionLabel = activeSection
    ? SECTION_LABELS[activeSection] || activeSection
    : null;

  // Reset loading state when refreshKey or page changes (derived-state pattern).
  const [prevIframeKey, setPrevIframeKey] = useState({ refreshKey, pagePath });
  if (
    prevIframeKey.refreshKey !== refreshKey ||
    prevIframeKey.pagePath !== pagePath
  ) {
    setPrevIframeKey({ refreshKey, pagePath });
    setPreviewStatus("loading");
    setPreviewErrorDismissed(false);
  }

  useEffect(() => {
    if (previewStatus !== "loading") return;
    const timeout = window.setTimeout(() => {
      setPreviewStatus("error");
    }, PREVIEW_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [iframeSrc, previewStatus]);

  // Clear active section when the user switches pages via the Pages tab
  const prevPageRef = useRef(activePage);
  useEffect(() => {
    if (activePage !== prevPageRef.current) {
      prevPageRef.current = activePage;
      setActiveSection(null);
    }
  }, [activePage, setActiveSection]);

  // Handle scroll-to-section requests from ContentBrowser
  useEffect(() => {
    if (scrollToSection && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: "reb-scroll-to", section: scrollToSection },
          "*"
        );
      } catch {
        iframeRef.current.src = `${pagePath}#${scrollToSection}`;
      }
      setScrollToSection(null);
    }
  }, [scrollToSection, setScrollToSection, pagePath]);

  // Send highlight to iframe when activeSection changes
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: "reb-highlight-section", section: activeSection },
        "*"
      );
    }
  }, [activeSection]);

  // Handle inline edit saves from iframe
  const handleInlineEdit = useCallback(async (section: string, field: string, value: string) => {
    const isDraft = editMode === "draft";
    const contentUrl = `/api/content/${section}${isDraft ? "?draft=true" : ""}`;

    try {
      const res = await fetch(contentUrl, { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      data[field] = value;
      const saveRes = await fetch(contentUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (saveRes.ok) {
        if (isDraft) {
          setHasDraft((prev) => ({ ...prev, [section]: true }));
        }
        triggerRefresh();
      }
    } catch {}
  }, [editMode, setHasDraft, triggerRefresh]);

  // Listen for messages from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const { data } = event;
      const allowedOrigins = [window.location.origin];
      if (siteUrl) {
        try { allowedOrigins.push(new URL(siteUrl).origin); } catch {}
      }
      if (previewUrl) {
        try { allowedOrigins.push(new URL(previewUrl).origin); } catch {}
      }
      if (!allowedOrigins.includes(event.origin)) return;
      if (!data?.type?.startsWith("reb-")) return;

      if (data.type === "reb-section-clicked") {
        setActiveSection(data.section);
        setContextMenu(null);
      }
      if (data.type === "reb-inline-edit") {
        handleInlineEdit(data.section, data.field, data.value);
      }
      if (data.type === "reb-context-menu") {
        // Convert iframe coordinates to canvas-relative coordinates
        const iframeEl = iframeRef.current;
        const canvasEl = canvasRef.current;
        if (iframeEl && canvasEl) {
          const iframeRect = iframeEl.getBoundingClientRect();
          const canvasRect = canvasEl.getBoundingClientRect();
          setContextMenu({
            section: data.section,
            label: SECTION_LABELS[data.section] || data.label || data.section,
            x: data.x + iframeRect.left - canvasRect.left,
            y: data.y + iframeRect.top - canvasRect.top,
          });
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [setActiveSection, handleInlineEdit, siteUrl, previewUrl]);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  // Context menu actions
  const handleEditSection = useCallback(() => {
    if (!contextMenu) return;
    setActiveSection(contextMenu.section);
    setRightTab("properties");
    setContextMenu(null);
  }, [contextMenu, setActiveSection, setRightTab]);

  const handleAskAI = useCallback(() => {
    if (!contextMenu) return;
    const label = contextMenu.label;
    setChatPrompt(`Update my ${label.toLowerCase()}`);
    setContextMenu(null);
  }, [contextMenu, setChatPrompt]);

  const handleViewSection = useCallback(() => {
    if (!contextMenu) return;
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: "reb-scroll-to", section: contextMenu.section },
        "*"
      );
    }
    setContextMenu(null);
  }, [contextMenu]);

  const retryPreview = useCallback(() => {
    setPreviewErrorDismissed(false);
    setPreviewStatus("loading");
    triggerRefresh();
  }, [triggerRefresh]);

  const focusSelectedSection = useCallback(() => {
    if (!activeSection) return;
    setRightTab("properties");
    setScrollToSection(activeSection);
  }, [activeSection, setRightTab, setScrollToSection]);

  const askAIForSelectedSection = useCallback(() => {
    const label = activeSectionLabel || "selected section";
    setChatPrompt(`Update my ${label.toLowerCase()}`);
    setRightTab("chat");
  }, [activeSectionLabel, setChatPrompt, setRightTab]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-border shrink-0 bg-surface">
        <div className="flex items-center gap-2">
          <div className="w-[5px] h-[5px] rounded-full bg-emerald-500" />
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-gray-muted">Preview</span>
          <span className="text-[10px] text-gray-subtle ml-1">Click the preview to select sections</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Breakpoint switcher */}
          <div className="flex items-center gap-0.5 bg-gray-bg rounded-full p-0.5">
            {BREAKPOINTS.map((bp) => {
              const active = breakpoint.label === bp.label;
              return (
                <button
                  key={bp.label}
                  onClick={() => setBreakpoint(bp)}
                  aria-pressed={active}
                  aria-label={`${bp.label}${bp.width ? ` (${bp.width}px)` : ""}`}
                  title={bp.width ? `${bp.label} (${bp.width}px)` : bp.label}
                  className={`flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ${
                    active
                      ? "bg-surface-raised text-white shadow-sm"
                      : "text-gray-muted hover:text-white"
                  }`}
                >
                  <bp.icon className="w-[13px] h-[13px]" strokeWidth={1.5} />
                  <span>{bp.label}</span>
                </button>
              );
            })}
          </div>

          <a
            href={siteUrl || "/"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-7 h-7 rounded-full text-gray-muted hover:text-white hover:bg-gray-bg transition-colors duration-150"
            title="Open in new tab"
          >
            <ExternalLink className="w-[14px] h-[14px]" strokeWidth={1.5} />
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-gray-border bg-surface px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-warm-white">
            {activeSectionLabel ? `Selected: ${activeSectionLabel}` : "Choose a section above or ask AI to make an update."}
          </p>
          <p className="truncate text-[10px] text-gray-faint">
            Loading {liveTargetUrl || pagePath}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={focusSelectedSection}
            disabled={!activeSection}
            className="rounded-md border border-gray-border px-2.5 py-1.5 text-[11px] text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Edit selected section
          </button>
          <button
            type="button"
            onClick={askAIForSelectedSection}
            className="rounded-md border border-gray-border px-2.5 py-1.5 text-[11px] text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white"
          >
            Ask AI to update
          </button>
          <a
            href={siteUrl || "/"}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-gray-border px-2.5 py-1.5 text-[11px] text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white"
          >
            Open live site
          </a>
          <button
            type="button"
            onClick={retryPreview}
            className="inline-flex items-center gap-1 rounded-md border border-gray-border px-2.5 py-1.5 text-[11px] text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white"
          >
            <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
            Refresh preview
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="flex-1 flex justify-center p-4 overflow-hidden bg-surface-base relative">
        <div
          key={`flash-${refreshKey}`}
          className={`relative h-full w-full rounded-xl overflow-hidden transition-[max-width] duration-200 ease-out bg-surface shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_2px_12px_rgba(0,0,0,0.4)] ${refreshKey > 0 ? "preview-flash" : ""}`}
          style={{
            maxWidth: breakpoint.width ? `${breakpoint.width}px` : "100%",
            marginInline: "auto",
          }}
        >
          <iframe
            ref={iframeRef}
            key={`${refreshKey}-${pagePath}`}
            src={iframeSrc}
            className="w-full h-full border-0"
            title="Live site preview"
            onLoad={() => setPreviewStatus("ready")}
          />
          {previewStatus === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-bg-alt">
              <div className="flex max-w-sm flex-col items-center gap-2 px-6 text-center">
                <Loader2 className="w-5 h-5 text-gray-muted animate-spin" strokeWidth={1.5} />
                <span className="text-[11px] text-gray-muted">Loading preview for {pagePath === "/" ? "home" : pagePath}</span>
                <span className="max-w-full truncate text-[10px] text-gray-faint">{iframeSrc}</span>
              </div>
            </div>
          )}
          {previewStatus === "error" && !previewErrorDismissed && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-bg-alt p-6">
              <div className="max-w-md rounded-xl border border-gray-border bg-surface px-5 py-4 text-center shadow-xl">
                <AlertCircle className="mx-auto mb-3 h-5 w-5 text-amber-300" strokeWidth={1.5} />
                <p className="text-sm font-medium text-warm-white">Live preview is taking longer than expected</p>
                <p className="mt-2 text-xs leading-5 text-gray-muted">
                  This is usually a DNS, auth, or network delay. You can still edit the selected section on the right or open the live site directly.
                </p>
                <p className="mt-3 truncate rounded-md bg-surface-base px-3 py-2 font-mono text-[10px] text-gray-faint">
                  {iframeSrc}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={retryPreview}
                    className="rounded-md bg-warm-white px-3 py-2 text-xs font-medium text-warm-black hover:bg-warm-white/90"
                  >
                    Retry preview
                  </button>
                  <a
                    href={siteUrl || "/"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-gray-border px-3 py-2 text-xs text-gray-muted hover:text-warm-white"
                  >
                    Open live site
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewErrorDismissed(true)}
                    className="rounded-md border border-gray-border px-3 py-2 text-xs text-gray-muted hover:text-warm-white"
                  >
                    Continue editing
                  </button>
                </div>
              </div>
            </div>
          )}
          {previewStatus === "ready" && isExternalPreview && !previewErrorDismissed && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-bg-alt/95 p-6">
              <div className="max-w-md rounded-xl border border-gray-border bg-surface px-5 py-4 text-center shadow-xl">
                <AlertCircle className="mx-auto mb-3 h-5 w-5 text-amber-300" strokeWidth={1.5} />
                <p className="text-sm font-medium text-warm-white">Live site preview opens separately</p>
                <p className="mt-2 text-xs leading-5 text-gray-muted">
                  This tenant uses the public site as the source of truth, and the browser may block embedding it here. Keep editing the selected section on the right or open the live site in a new tab.
                </p>
                <p className="mt-3 truncate rounded-md bg-surface-base px-3 py-2 font-mono text-[10px] text-gray-faint">
                  {liveTargetUrl}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={liveTargetUrl || siteUrl || "/"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-warm-white px-3 py-2 text-xs font-medium text-warm-black hover:bg-warm-white/90"
                  >
                    Open live site
                  </a>
                  <button
                    type="button"
                    onClick={retryPreview}
                    className="rounded-md border border-gray-border px-3 py-2 text-xs text-gray-muted hover:text-warm-white"
                  >
                    Retry preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewErrorDismissed(true)}
                    className="rounded-md border border-gray-border px-3 py-2 text-xs text-gray-muted hover:text-warm-white"
                  >
                    Continue editing
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Glass context menu */}
        {contextMenu && (
          <div
            ref={menuRef}
            className="glass-menu absolute z-50 animate-overlay-enter"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
          >
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <span className="text-[11px] font-medium text-white/90">{contextMenu.label}</span>
            </div>
            <div className="py-1">
              <button
                onClick={handleEditSection}
                className="glass-menu-item"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                Edit fields
              </button>
              <button
                onClick={handleAskAI}
                className="glass-menu-item"
              >
                <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                Ask AI to update
              </button>
              <button
                onClick={handleViewSection}
                className="glass-menu-item"
              >
                <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                Scroll to section
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
