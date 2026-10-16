"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Eye, MessageCircle, Pencil } from "lucide-react";
import { XaButton, XaSays, XaSegmented, XaTextLink } from "@/components/ui/strelva/Xa";
import { useDashboard } from "./DashboardContext";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import type { EditableNode, EditableNodeType } from "@/lib/editor-types";
import { getEditablePathValue, setEditablePathValue } from "@/lib/editable-path";

type Breakpoint = { label: string; width: number | null };
type PreviewStatus = "loading" | "ready" | "error";
type PreviewSource = "live" | "editable";

/** The three screens people see your site on, named in words, not icons. */
const BREAKPOINTS: readonly Breakpoint[] = [
  { label: "Phone", width: 375 },
  { label: "Tablet", width: 768 },
  { label: "Computer", width: 1280 },
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

const PREVIEW_TIMEOUT_MS = 7000;
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

export function SitePreview({
  isEditing = false,
  onToggleEdit,
}: {
  isEditing?: boolean;
  onToggleEdit?: () => void;
} = {}) {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(
    BREAKPOINTS[2]!
  );
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");
  const [previewSource, setPreviewSource] = useState<PreviewSource>("editable");
  const [previewErrorDismissed, setPreviewErrorDismissed] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  // On a phone the preview opens as the phone page itself, never a shrunken
  // desktop; the screen switch is hidden there because only one screen fits.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setNarrow(query.matches);
      if (query.matches) setBreakpoint(BREAKPOINTS[0]!);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
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
    setChatPrompt,
    setRightTab,
    setSelectedNode,
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
    // The frame scales to the canvas's content box, not its padded width, so a
    // scaled page never spills past either edge.
    const updateSize = () => {
      const style = window.getComputedStyle(canvas);
      setCanvasWidth(canvas.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0"));
    };
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
  // The Page selector is the source of truth for which page the canvas shows.
  // Only fall back to a section's canonical page when the selected section does
  // NOT live on the active page — otherwise sections shared across pages (Page
  // Header, Call to Action) would drag the canvas back to whichever page
  // declares them first (e.g. Contact's Page Header showing the About page).
  const activePageHasActiveSection = activeSection
    ? (siteModelPages[activePage]?.sections?.some((s) => s.type === activeSection) ?? false)
    : false;
  const currentPage = activeSection && !activePageHasActiveSection
    ? (sectionToPage[activeSection] || activePage || "home")
    : (activePage || "home");
  const pagePath = PAGE_PATHS[currentPage] || (currentPage === "home" ? "/" : `/${currentPage}`);
  const editableParams = new URLSearchParams();
  if (tenantId) {
    editableParams.set("tenant", tenantId);
  }
  editableParams.set("preview", "true");
  if (isEditing && editMode === "draft") {
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
  const effectivePreviewSource = hasAnyDraft ? "editable" : requestedPreviewSource;
  const iframeSrc = effectivePreviewSource === "live" && siteUrl ? liveIframeSrc : editableIframeSrc;
  const liveTargetUrl = `${siteUrl || base || ""}${pagePath}`;
  const isLivePreview = effectivePreviewSource === "live" && !!siteUrl;
  const previewKind = isLivePreview ? "Active site preview" : "Editable preview";
  const activeSectionLabel = activeSection ? SECTION_LABELS[activeSection] || activeSection : null;
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

  // Handle scroll-to-section requests from the managed website editor
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

  // Handshake: tell the editable preview which origin to trust, so the in-page
  // overlay will post click/select messages back. Without this the overlay
  // silently drops every canvas interaction.
  useEffect(() => {
    if (!isEditing || previewStatus !== "ready" || effectivePreviewSource !== "editable") return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    let targetOrigin = window.location.origin;
    try {
      targetOrigin = new URL(iframeSrc, window.location.origin).origin;
    } catch {}
    // Re-send a few times: the in-page overlay attaches its listener a tick after
    // the iframe's load event, so a single post can miss the handshake.
    const send = () => {
      try {
        win.postMessage({ type: "reb-edit-mode", enabled: true }, targetOrigin);
      } catch {}
    };
    send();
    const timers = [200, 500, 1000].map((ms) => window.setTimeout(send, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [isEditing, previewStatus, effectivePreviewSource, iframeSrc]);

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
          setActiveSection(node.section);
          setRightTab("properties");
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
          setActiveSection(data.section);
          setRightTab("properties");
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

  const askAIForActiveSection = useCallback(() => {
    if (!activeSectionLabel) return;
    setChatPrompt(buildAskAIPrompt(activeSectionLabel));
    setRightTab("chat");
  }, [activeSectionLabel, setChatPrompt, setRightTab]);

  const draftWord = isEditing && hasAnyDraft ? "Draft, not live yet" : null;

  return (
    <div className="flex h-full flex-col">
      {/* One bar, every control in words: what you see, which screen, reload, edit. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--st-line)] bg-[var(--st-canvas)] px-3 py-2.5">
        {isEditing ? (
          <XaSegmented label="Which version" value={effectivePreviewSource} onChange={(value) => setPreviewSource(value)} options={[
            { value: "editable", label: hasAnyDraft ? "Your draft" : "Editable" },
            // Live is off without a live address, and while a draft exists the preview stays on it.
            { value: "live", label: "Live site", disabled: !siteUrl || hasAnyDraft },
          ]} />
        ) : <span className="text-[13px] text-[var(--st-text-2)]">{draftWord ?? "How your site looks now"}</span>}
        {draftWord && isEditing ? <span className="text-[13px] text-[var(--st-need)]">{draftWord}</span> : null}
        <span className="flex-1" />
        {!narrow ? <XaSegmented label="Screen size" value={breakpoint.label} onChange={(label) => setBreakpoint(BREAKPOINTS.find((bp) => bp.label === label) ?? BREAKPOINTS[2]!)}
          options={BREAKPOINTS.map((bp) => ({ value: bp.label, label: bp.label }))} /> : null}
        <XaTextLink onClick={retryPreview}>Reload</XaTextLink>
        {siteUrl ? <a href={liveTargetUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-[14px] font-medium text-[var(--st-accent)] hover:underline">Open live site</a> : null}
        <XaButton size="sm" onClick={onToggleEdit} className="whitespace-nowrap">
          {isEditing ? <><Eye size={15} aria-hidden="true" />Done editing</> : <><Pencil size={15} aria-hidden="true" />Edit site</>}
        </XaButton>
      </div>

      {/* The page itself, framed at the chosen screen size on paper. */}
      <div ref={canvasRef} className={`relative flex flex-1 overflow-hidden bg-[var(--st-canvas)] p-4 xl:p-7 ${shouldScaleFrame ? "justify-start" : "justify-center"}`}>
        <div
          key={`flash-${refreshKey}`}
          className={`relative h-full w-full shrink-0 overflow-hidden rounded-[var(--st-r-lg)] bg-[var(--st-surface)] shadow-[var(--st-shadow-sm)] transition-[max-width] duration-(--motion-base) ease-out ${refreshKey > 0 ? "preview-flash" : ""}`}
          style={{
            width: breakpoint.width ? `${breakpoint.width}px` : "100%",
            maxWidth: breakpoint.width ? undefined : "100%",
            height: shouldScaleFrame ? `${100 / frameScale}%` : "100%",
            // Scaled frames anchor top-left inside the canvas content box (an
            // auto margin on an overflowing flex item collapses to 0 and the
            // old top-center origin then shifted the page off one edge).
            marginInline: shouldScaleFrame ? 0 : "auto",
            alignSelf: "flex-start",
            transform: shouldScaleFrame ? `scale(${frameScale})` : undefined,
            transformOrigin: "top left",
          }}
        >
          <iframe
            ref={iframeRef}
            key={`${effectivePreviewSource}-${refreshKey}-${pagePath}`}
            src={iframeSrc}
            className="h-full w-full border-0"
            title={previewKind}
            onLoad={() => setPreviewStatus("ready")}
          />
          {previewStatus === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--st-surface)]" role="status">
              <span className="text-[14px] text-[var(--st-text-2)]">Opening {isLivePreview ? "your live site" : "your site"}</span>
            </div>
          )}
          {previewStatus === "error" && !previewErrorDismissed && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--st-surface)] p-6">
              <div className="flex max-w-md flex-col gap-4" role="alert">
                <XaSays links={[
                  <XaTextLink key="retry" onClick={retryPreview}>Try again</XaTextLink>,
                  <a key="live" href={siteUrl || "/"} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--st-accent)] hover:underline">Open the live site</a>,
                  <XaTextLink key="go" onClick={() => setPreviewErrorDismissed(true)}>Keep editing</XaTextLink>,
                ]}>Your site is taking longer than usual to open here. It is still up; you can keep editing the part you picked.</XaSays>
              </div>
            </div>
          )}
        </div>

        {/* The part you picked, and the one thing to do with it. */}
        {isEditing && activeSectionLabel && previewStatus === "ready" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
            <p className="pointer-events-auto m-0 flex items-center gap-3 rounded-full bg-[var(--st-surface)] py-2 pl-4 pr-4 text-[14px] text-[var(--st-text)] shadow-[var(--st-shadow-sm)]">
              <span className="max-w-[200px] truncate font-medium">{activeSectionLabel}</span>
              <XaTextLink onClick={askAIForActiveSection}>Ask Strelva to change this</XaTextLink>
            </p>
          </div>
        )}

        {contextMenu && (
          <div
            ref={menuRef}
            role="menu"
            aria-label={contextMenu.label}
            className="absolute z-50 min-w-[220px] overflow-hidden rounded-[var(--st-r-md)] bg-[var(--st-surface)] py-1 shadow-[var(--st-shadow-lg)]"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          >
            <p className="m-0 border-b border-[var(--st-line)] px-3 py-2 text-[13px] font-medium text-[var(--st-text-2)]">{contextMenu.label}</p>
            <button type="button" role="menuitem" onClick={handleEditSection} className="flex w-full items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left text-[14px] text-[var(--st-text)] hover:bg-[var(--st-hover)] focus-visible:bg-[var(--st-hover)] focus-visible:outline-none"><Pencil size={15} strokeWidth={1.6} aria-hidden="true" />Change its words</button>
            <button type="button" role="menuitem" onClick={handleAskAI} className="flex w-full items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left text-[14px] text-[var(--st-text)] hover:bg-[var(--st-hover)] focus-visible:bg-[var(--st-hover)] focus-visible:outline-none"><MessageCircle size={15} strokeWidth={1.6} aria-hidden="true" />Ask Strelva to change it</button>
            <button type="button" role="menuitem" onClick={handleViewSection} className="flex w-full items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left text-[14px] text-[var(--st-text)] hover:bg-[var(--st-hover)] focus-visible:bg-[var(--st-hover)] focus-visible:outline-none"><Eye size={15} strokeWidth={1.6} aria-hidden="true" />Scroll to it</button>
          </div>
        )}
      </div>
    </div>
  );
}
