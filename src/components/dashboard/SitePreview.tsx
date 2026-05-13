"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AlertCircle, ExternalLink, Eye, Loader2, Maximize2, MessageCircle, Minimize2, Monitor, Pencil, RefreshCw, Smartphone, Tablet, Wand2 } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import type { EditableNode, EditableNodeType } from "@/lib/editor-types";
import { getEditablePathValue, setEditablePathValue } from "@/lib/editable-path";

type Breakpoint = { label: string; icon: typeof Monitor; width: number | null };
type PreviewStatus = "loading" | "ready" | "error";
type PreviewSource = "live" | "editable";

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
const EDITABLE_NODE_TYPES = new Set<EditableNodeType>([
  "section",
  "text",
  "image",
  "button",
  "link",
  "content",
]);

interface ContextMenu {
  section: string;
  label: string;
  x: number;
  y: number;
}

function labelFromEditablePath(path: string): string {
  const parts = path.split(".").filter(Boolean);
  const last = parts[parts.length - 1] || path;
  const cleaned = last
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!cleaned) return path;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function summarizeEditableValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Empty";
  if (typeof value === "string") {
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) return "Empty";
    return compact.length > 92 ? `${compact.slice(0, 89)}...` : compact;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "Updated content";
}

function normalizeInlineText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function editableValuesMatch(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a === b || normalizeInlineText(a) === normalizeInlineText(b);
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return Object.is(a, b);
  }
}

function comparablePreviewHost(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost")) return null;
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function buildAskAIPrompt(sectionLabel: string, fieldLabel?: string): string {
  const target = fieldLabel ? `${fieldLabel} in the ${sectionLabel}` : `${sectionLabel} section`;
  return `Update the ${target} on my site. Keep the current business facts, make it more specific, and save it as a draft before anything goes live.`;
}

function toEditableNode(data: Record<string, unknown>): EditableNode | null {
  const section = typeof data.section === "string" ? data.section : null;
  if (!section) return null;
  const nodeType = typeof data.nodeType === "string" && EDITABLE_NODE_TYPES.has(data.nodeType as EditableNodeType)
    ? data.nodeType as EditableNodeType
    : "section";
  const rect = data.rect && typeof data.rect === "object" && !Array.isArray(data.rect)
    ? data.rect as EditableNode["rect"]
    : undefined;

  return {
    section,
    field: typeof data.field === "string" ? data.field : undefined,
    label: typeof data.label === "string" ? data.label : undefined,
    nodeType,
    rect,
  };
}

export function SitePreview() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(
    BREAKPOINTS[2]
  );
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");
  const [previewSource, setPreviewSource] = useState<PreviewSource>("live");
  const [scaffoldMode, setScaffoldMode] = useState(false);
  const [previewErrorDismissed, setPreviewErrorDismissed] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const {
    refreshKey,
    scrollToSection,
    setScrollToSection,
    setActiveSection,
    activeSection,
    editMode,
    hasDraft,
    hasPageConfigDraft,
    setHasDraft,
    triggerRefresh,
    tenantId,
    siteUrl,
    previewUrl,
    dashboardHref,
    siteModel,
    activePage,
    setActivePage,
    setChatPrompt,
    setRightTab,
    setSelectedNode,
    selectedNode,
    addEditReceipts,
  } = useDashboard();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const frameScale = breakpoint.width && canvasWidth > 0
    ? Math.min(1, Math.max(0.35, canvasWidth / breakpoint.width))
    : 1;
  const shouldScaleFrame = Boolean(breakpoint.width && frameScale < 1);
  const hasAnyDraft = Object.values(hasDraft).some(Boolean) || hasPageConfigDraft;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => setCanvasWidth(canvas.clientWidth);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Build section→page mapping from the active site model's page config so
  // clicking a section jumps the preview to the right page.
  const siteModelPages = getDefaultPageConfig(siteModel);
  const sectionToPage: Record<string, string> = {};
  for (const [page, config] of Object.entries(siteModelPages)) {
    for (const s of config.sections) {
      if (!sectionToPage[s.type]) sectionToPage[s.type] = page;
    }
  }
  const pageOptions = Object.keys(siteModelPages)
    .sort((a, b) => (a === "home" ? -1 : b === "home" ? 1 : a.localeCompare(b)))
    .map((page) => ({
      value: page,
      label: page === "home" ? "Home" : page.charAt(0).toUpperCase() + page.slice(1),
    }));
  const currentPage = activeSection
    ? (sectionToPage[activeSection] || activePage || "home")
    : (activePage || "home");
  const pagePath = PAGE_PATHS[currentPage] || (currentPage === "home" ? "/" : `/${currentPage}`);
  const editableParams = new URLSearchParams();
  if (tenantId) {
    editableParams.set("tenant", tenantId);
  }
  editableParams.set("preview", "true");
  if (editMode === "draft") {
    editableParams.set("edit", "true");
  }
  editableParams.set("refresh", String(refreshKey));
  const base = previewUrl || siteUrl || "";
  const directEditableIframeSrc = `${base}${pagePath}?${editableParams.toString()}`;
  const livePreviewParams = new URLSearchParams({
    path: pagePath,
    refresh: String(refreshKey),
  });
  const editPreviewParams = new URLSearchParams({
    path: pagePath,
    refresh: String(refreshKey),
  });
  const liveIframeSrc = dashboardHref(`/api/live-preview?${livePreviewParams.toString()}`);
  const sitePreviewHost = siteUrl ? comparablePreviewHost(siteUrl) : null;
  const editablePreviewHost = previewUrl ? comparablePreviewHost(previewUrl) : null;
  const usesManagedEditPreview = Boolean(sitePreviewHost && editablePreviewHost && sitePreviewHost === editablePreviewHost);
  const editableIframeSrc = usesManagedEditPreview
    ? dashboardHref(`/api/edit-preview?${editPreviewParams.toString()}`)
    : directEditableIframeSrc;
  const requestedPreviewSource = previewSource === "live" && !siteUrl ? "editable" : previewSource;
  const effectivePreviewSource = hasAnyDraft && !scaffoldMode ? "editable" : requestedPreviewSource;
  const iframeSrc = effectivePreviewSource === "live" && siteUrl ? liveIframeSrc : editableIframeSrc;
  const liveTargetUrl = `${siteUrl || base || ""}${pagePath}`;
  const isLivePreview = effectivePreviewSource === "live" && !!siteUrl;
  const previewKind = isLivePreview ? "Active site preview" : "Editable preview";
  const previewBadgeLabel = isLivePreview ? "Active site" : hasAnyDraft ? "Draft preview" : "Editable preview";
  const previewBadgeDetail = (() => {
    try {
      const url = new URL(isLivePreview ? liveTargetUrl : iframeSrc, "http://localhost");
      return isLivePreview ? url.hostname : "unpublished Scaffold copy";
    } catch {
      return isLivePreview ? "live site" : "unpublished Scaffold copy";
    }
  })();
  // Cross-origin tenant preview hosts are expected: they still communicate
  // selection events to the dashboard through postMessage.
  const showExternalPreviewNotice = false;
  const activeSectionLabel = activeSection
    ? SECTION_LABELS[activeSection] || activeSection
    : null;
  const scaffoldSections = [...(siteModelPages[activePage]?.sections || [])]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      value: section.type,
      label: SECTION_LABELS[section.type] || section.type,
    }));

  // Reset loading state when refreshKey or page changes (derived-state pattern).
  const [prevIframeKey, setPrevIframeKey] = useState({ refreshKey, pagePath, previewSource: effectivePreviewSource });
  if (
    prevIframeKey.refreshKey !== refreshKey ||
    prevIframeKey.pagePath !== pagePath ||
    prevIframeKey.previewSource !== effectivePreviewSource
  ) {
    setPrevIframeKey({ refreshKey, pagePath, previewSource: effectivePreviewSource });
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

  useEffect(() => {
    if (!scaffoldMode) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setScaffoldMode(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [scaffoldMode]);

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
    const contentUrl = dashboardHref(`/api/content/${section}${isDraft ? "?draft=true" : ""}`);

    try {
      const res = await fetch(contentUrl, { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const beforeValue = getEditablePathValue(data, field);
      if (editableValuesMatch(beforeValue, value)) return;
      const nextData = setEditablePathValue(data, field, value);
      const saveRes = await fetch(contentUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(nextData),
      });
      if (saveRes.ok) {
        addEditReceipts([{
          section,
          sectionLabel: SECTION_LABELS[section] || labelFromEditablePath(section),
          field,
          fieldLabel: labelFromEditablePath(field),
          before: summarizeEditableValue(beforeValue),
          after: summarizeEditableValue(value),
          source: "inline_canvas",
          status: isDraft ? "draft" : "published",
        }]);
        if (isDraft) {
          setHasDraft((prev) => ({ ...prev, [section]: true }));
        }
        triggerRefresh();
      }
    } catch {}
  }, [addEditReceipts, dashboardHref, editMode, setHasDraft, triggerRefresh]);

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

      if (data.type === "reb-node-selected") {
        const node = toEditableNode(data);
        if (node) {
          setSelectedNode(node);
          setRightTab(node.nodeType === "section" ? "layout" : "properties");
          setContextMenu(null);
        }
      }
      if (data.type === "reb-section-clicked") {
        if (typeof data.section === "string") {
          setSelectedNode({
            section: data.section,
            nodeType: "section",
            label: SECTION_LABELS[data.section] || data.section,
          });
          setRightTab("layout");
        } else {
          setActiveSection(data.section);
        }
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
            x: data.x * frameScale + iframeRect.left - canvasRect.left,
            y: data.y * frameScale + iframeRect.top - canvasRect.top,
          });
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [setActiveSection, handleInlineEdit, siteUrl, previewUrl, setRightTab, setSelectedNode, frameScale]);

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
    setChatPrompt(buildAskAIPrompt(label));
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
    const fieldLabel =
      selectedNode?.section === activeSection && selectedNode.field
        ? selectedNode.label || labelFromEditablePath(selectedNode.field)
        : undefined;
    setChatPrompt(buildAskAIPrompt(label, fieldLabel));
    setRightTab("chat");
  }, [activeSection, activeSectionLabel, selectedNode, setChatPrompt, setRightTab]);

  return (
    <div
        className={
          scaffoldMode
            ? "fixed inset-0 z-[80] flex h-screen flex-col bg-[oklch(4%_0.01_255)] animate-overlay-enter"
            : "flex h-full flex-col"
        }
    >
      {/* Canvas */}
      <div
        ref={canvasRef}
        className={`relative flex flex-1 justify-center overflow-hidden ${
          scaffoldMode ? "bg-[oklch(4%_0.01_255)] p-0" : "bg-surface-base p-3 xl:p-4"
        }`}
      >
        {!scaffoldMode && (
          <div className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-9.5rem)] items-center gap-2 rounded-full border border-white/10 bg-[rgba(8,8,10,0.76)] px-3 py-2 text-white shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isLivePreview ? "bg-emerald-300" : "bg-amber-300"
              }`}
            />
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em]">
              {previewBadgeLabel}
            </span>
            <span className="min-w-0 truncate text-[11px] text-white/55">
              {previewBadgeDetail}
            </span>
          </div>
        )}

        {!scaffoldMode && (
          <button
            type="button"
            onClick={() => {
              setPreviewSource("editable");
              setScaffoldMode(true);
            }}
            className="absolute right-4 top-4 z-20 inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-[rgba(8,8,10,0.76)] px-3 text-[12px] font-medium text-white shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:bg-[rgba(8,8,10,0.9)]"
          >
            <Wand2 className="h-3.5 w-3.5" strokeWidth={1.6} />
            Edit mode
          </button>
        )}

        {scaffoldMode && (
          <div className="pointer-events-none absolute inset-x-4 bottom-5 z-20 flex items-end justify-center">
            <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-[rgba(8,8,10,0.8)] p-2 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-overlay-enter">
              <div className="flex items-center gap-1.5 px-2">
                <Wand2 className="h-3.5 w-3.5 text-white" strokeWidth={1.6} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white">Site editor</span>
              </div>
              <span className="mx-1 h-6 w-px bg-white/10" />
              <select
                value={activePage}
                onChange={(event) => {
                  setActiveSection(null);
                  setActivePage(event.target.value);
                }}
                className="h-8 min-w-[112px] rounded-full border border-white/10 bg-white/8 px-3 text-[11px] font-medium text-white outline-none transition-colors focus:border-white/30"
                aria-label="Page"
              >
                {pageOptions.map((page) => (
                  <option key={page.value} value={page.value}>
                    {page.label}
                  </option>
                ))}
              </select>
              <select
                value={activeSection || ""}
                onChange={(event) => setActiveSection(event.target.value || null)}
                className="h-8 min-w-[172px] rounded-full border border-white/10 bg-white/8 px-3 text-[11px] font-medium text-white outline-none transition-colors focus:border-white/30"
                aria-label="Section"
              >
                <option value="">Select section</option>
                {scaffoldSections.map((section) => (
                  <option key={section.value} value={section.value}>
                    {section.label}
                  </option>
                ))}
              </select>
              <span className="mx-1 h-6 w-px bg-white/10" />
            {[
              { value: "editable", label: "Edit" },
              { value: "live", label: "Live" },
            ].map((source) => {
              const active = effectivePreviewSource === source.value;
              const disabled = source.value === "live" && !siteUrl;
              return (
                <button
                  key={source.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPreviewSource(source.value as PreviewSource)}
                  aria-pressed={active}
                  className={`h-7 rounded-full px-3 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-white text-black"
                      : disabled
                        ? "cursor-not-allowed text-white/25"
                        : "text-white/65 hover:text-white"
                  }`}
                >
                  {source.label}
                </button>
              );
            })}
            <span className="mx-1 h-6 w-px bg-white/10" />
            {BREAKPOINTS.map((bp) => {
              const active = breakpoint.label === bp.label;
              return (
                <button
                  key={bp.label}
                  onClick={() => setBreakpoint(bp)}
                  aria-pressed={active}
                  aria-label={`${bp.label}${bp.width ? ` (${bp.width}px)` : ""}`}
                  title={bp.width ? `${bp.label} (${bp.width}px)` : bp.label}
                  className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
                    active ? "bg-white/12 text-white" : "text-white/55 hover:text-white"
                  }`}
                >
                  <bp.icon className="h-[13px] w-[13px]" strokeWidth={1.5} />
                  <span className="hidden xl:inline">{bp.label}</span>
                </button>
              );
            })}
            <span className="mx-1 h-6 w-px bg-white/10" />
            <button
              type="button"
              onClick={focusSelectedSection}
              disabled={!activeSection || isLivePreview}
              className="h-7 rounded-full px-3 text-[11px] font-medium text-white/65 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              Edit fields
            </button>
            <button
              type="button"
              onClick={askAIForSelectedSection}
              className="h-7 rounded-full px-3 text-[11px] font-medium text-white/65 transition-colors hover:text-white"
            >
              Ask AI
            </button>
            <a
              href={siteUrl || "/"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 w-7 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white"
              title="Open live site"
            >
              <ExternalLink className="h-[14px] w-[14px]" strokeWidth={1.5} />
            </a>
            <button
              type="button"
              onClick={retryPreview}
              className="flex h-7 w-7 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white"
              title="Refresh preview"
            >
              <RefreshCw className="h-[14px] w-[14px]" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => {
                setScaffoldMode(false);
                if (!hasAnyDraft && siteUrl) setPreviewSource("live");
              }}
              className="flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] font-medium text-black transition-colors hover:bg-white/90"
              title="Exit Scaffold mode"
              aria-label="Exit Scaffold mode"
            >
              <Minimize2 className="h-[13px] w-[13px]" strokeWidth={1.5} />
              Exit
            </button>
          </div>
        </div>
        )}
        <div
          key={`flash-${refreshKey}`}
          className={`relative h-full w-full shrink-0 overflow-hidden bg-surface transition-[max-width] duration-200 ease-out ${
            scaffoldMode
              ? "rounded-none"
              : `rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_2px_12px_rgba(0,0,0,0.4)] xl:rounded-xl ${refreshKey > 0 ? "preview-flash" : ""}`
          }`}
          style={{
            width: breakpoint.width ? `${breakpoint.width}px` : "100%",
            maxWidth: breakpoint.width ? undefined : "100%",
            height: shouldScaleFrame ? `${100 / frameScale}%` : "100%",
            marginInline: "auto",
            transform: shouldScaleFrame ? `scale(${frameScale})` : undefined,
            transformOrigin: "top center",
          }}
        >
          <iframe
            ref={iframeRef}
            key={`${effectivePreviewSource}-${refreshKey}-${pagePath}`}
            src={iframeSrc}
            className="w-full h-full border-0"
            title={previewKind}
            onLoad={() => setPreviewStatus("ready")}
          />
          {previewStatus === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-bg-alt">
              <div className="flex max-w-sm flex-col items-center gap-2 px-6 text-center">
                <Loader2 className="w-5 h-5 text-gray-muted animate-spin" strokeWidth={1.5} />
                <span className="text-[11px] text-gray-muted">
                  Loading {isLivePreview ? "active site" : "editable preview"} for {pagePath === "/" ? "home" : pagePath}
                </span>
                <span className="max-w-full truncate text-[10px] text-gray-faint">{iframeSrc}</span>
              </div>
            </div>
          )}
          {previewStatus === "error" && !previewErrorDismissed && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-bg-alt p-6">
              <div className="max-w-md rounded-xl border border-gray-border bg-surface px-5 py-4 text-center shadow-xl">
                <AlertCircle className="mx-auto mb-3 h-5 w-5 text-amber-300" strokeWidth={1.5} />
                <p className="text-sm font-medium text-warm-white">{previewKind} is taking longer than expected</p>
                <p className="mt-2 text-xs leading-5 text-gray-muted">
                  This is usually a DNS, auth, or network delay. You can still edit the selected section on the right or open the active site directly.
                </p>
                <p className="mt-3 truncate rounded-md bg-surface-base px-3 py-2 font-mono text-[10px] text-gray-faint">
                  {iframeSrc}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={retryPreview}
                    className="rounded-md bg-warm-white px-3 py-2 text-xs font-medium text-on-warm-white hover:bg-warm-white/90"
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
          {previewStatus === "ready" && showExternalPreviewNotice && !previewErrorDismissed && (
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
                    className="rounded-md bg-warm-white px-3 py-2 text-xs font-medium text-on-warm-white hover:bg-warm-white/90"
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
