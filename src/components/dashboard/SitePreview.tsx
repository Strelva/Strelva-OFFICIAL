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
  } = useDashboard();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build section→page mapping from the template's page config
  const templatePages = getDefaultPageConfig(template);
  const sectionToPage: Record<string, string> = {};
  for (const [page, config] of Object.entries(templatePages)) {
    for (const s of config.sections) {
      if (!sectionToPage[s.type]) sectionToPage[s.type] = page;
    }
  }
  const currentPage = activeSection ? (sectionToPage[activeSection] || "home") : "home";
  const pagePath = PAGE_PATHS[currentPage] || "/";
  const editParam = editMode === "draft" ? "?edit=true" : "";
  const baseUrl = siteUrl || "";
  const iframeSrc = `${baseUrl}${pagePath}${editParam}`;

  // Reset loading state when refreshKey changes
  useEffect(() => {
    setIframeLoading(true);
  }, [refreshKey]);

  // Handle scroll-to-section requests from ContentBrowser
  useEffect(() => {
    if (scrollToSection && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: "reb-scroll-to", section: scrollToSection },
          "*"
        );
      } catch {
        iframeRef.current.src = `${baseUrl}${pagePath}#${scrollToSection}`;
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
      <div className="flex items-center justify-between px-4 h-9 border-b border-gray-border shrink-0 bg-surface">
        <div className="flex items-center gap-2">
          <div className="w-[6px] h-[6px] rounded-full bg-emerald-500" />
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
                  className={`flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium transition-all duration-150 ${
                    active
                      ? "bg-surface-raised text-warm-black shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
                      : "text-gray-muted hover:text-gray-fg"
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
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors duration-150"
            title="Open in new tab"
          >
            <ExternalLink className="w-[14px] h-[14px]" strokeWidth={1.5} />
          </a>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex justify-center p-3 overflow-hidden bg-surface-base">
        <div
          className="relative h-full w-full rounded-lg overflow-hidden transition-[max-width] duration-200 ease-out bg-surface shadow-[0_1px_4px_rgba(0,0,0,0.3)]"
          style={{
            maxWidth: breakpoint.width ? `${breakpoint.width}px` : "100%",
            marginInline: "auto",
          }}
        >
          <iframe
            ref={iframeRef}
            key={refreshKey}
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
