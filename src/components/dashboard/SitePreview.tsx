"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Monitor, Tablet, Smartphone, Maximize2, ExternalLink, Loader2 } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";

type Breakpoint = { label: string; icon: typeof Monitor; width: number | null };

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

export function SitePreview() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(
    BREAKPOINTS[BREAKPOINTS.length - 1]
  );
  const [iframeLoading, setIframeLoading] = useState(true);
  const {
    refreshKey,
    scrollToSection,
    setScrollToSection,
    setActiveSection,
    activeSection,
    editMode,
    triggerRefresh,
    siteUrl,
    template,
    activePage,
  } = useDashboard();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build section→page mapping from the template's page config so
  // clicking a section jumps the preview to the right page.
  const templatePages = getDefaultPageConfig(template);
  const sectionToPage: Record<string, string> = {};
  for (const [page, config] of Object.entries(templatePages)) {
    for (const s of config.sections) {
      if (!sectionToPage[s.type]) sectionToPage[s.type] = page;
    }
  }
  // Priority: active section's home page > active page > home.
  // The Pages tab sets activePage; selecting a section overrides with
  // that section's parent page.
  const currentPage = activeSection
    ? (sectionToPage[activeSection] || activePage || "home")
    : (activePage || "home");
  // Fall back to `/${slug}` for user-created pages not in the static
  // PAGE_PATHS map.
  const pagePath = PAGE_PATHS[currentPage] || (currentPage === "home" ? "/" : `/${currentPage}`);
  const editParam = editMode === "draft" ? "?edit=true" : "";
  // Use the public site URL for the iframe so the preview shows the actual
  // client site, not the admin dashboard's own routes.
  const base = siteUrl || "";
  const iframeSrc = `${base}${pagePath}${editParam}`;

  // Reset loading state when refreshKey or page changes
  useEffect(() => {
    setIframeLoading(true);
  }, [refreshKey, pagePath]);

  // Clear active section when the user switches pages via the Pages tab,
  // so the section→page override (line 59-61) doesn't fight the new page.
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
    try {
      const res = await fetch(`/api/content/${section}`, { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      data[field] = value;
      const saveRes = await fetch(`/api/content/${section}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (saveRes.ok) {
        triggerRefresh();
      }
    } catch {}
  }, [triggerRefresh]);

  // Listen for messages from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const { data } = event;
      const allowedOrigins = [window.location.origin];
      if (siteUrl) {
        try { allowedOrigins.push(new URL(siteUrl).origin); } catch {}
      }
      if (!allowedOrigins.includes(event.origin)) return;
      if (!data?.type?.startsWith("reb-")) return;

      if (data.type === "reb-section-clicked") {
        setActiveSection(data.section);
      }
      if (data.type === "reb-inline-edit") {
        handleInlineEdit(data.section, data.field, data.value);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [setActiveSection, handleInlineEdit, siteUrl]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-border shrink-0 bg-surface">
        <div className="flex items-center gap-2">
          <div className="w-[5px] h-[5px] rounded-full bg-emerald-500" />
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-gray-muted">Preview</span>
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

      {/* Canvas */}
      <div className="flex-1 flex justify-center p-4 overflow-hidden bg-surface-base">
        <div
          className="relative h-full w-full rounded-xl overflow-hidden transition-[max-width] duration-200 ease-out bg-surface shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_2px_12px_rgba(0,0,0,0.4)]"
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
            onLoad={() => setIframeLoading(false)}
          />
          {iframeLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-bg-alt">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 text-gray-muted animate-spin" strokeWidth={1.5} />
                <span className="text-[11px] text-gray-muted">Loading preview...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
