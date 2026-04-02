"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Monitor, Tablet, Smartphone, ExternalLink, Loader2 } from "lucide-react";
import { useDashboard } from "./DashboardContext";

const DEVICES = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%" },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "768px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "390px" },
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

type DeviceId = (typeof DEVICES)[number]["id"];

export function SitePreview() {
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [iframeLoading, setIframeLoading] = useState(true);
  const {
    refreshKey,
    scrollToSection,
    setScrollToSection,
    setActiveSection,
    activeSection,
    editMode,
    triggerRefresh,
  } = useDashboard();
  const activeDevice = DEVICES.find((d) => d.id === device)!;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build iframe URL — navigate to the page containing the active section
  const SECTION_TO_PAGE: Record<string, string> = {
    hero: "home", services: "services", story: "about", testimonials: "home",
    events: "events", providers: "providers", contact: "contact", faq: "faq", shop: "shop",
  };
  const currentPage = activeSection ? (SECTION_TO_PAGE[activeSection] || "home") : "home";
  const pagePath = PAGE_PATHS[currentPage] || "/";
  const editParam = editMode === "draft" ? "?edit=true" : "";
  const iframeSrc = `${pagePath}${editParam}`;

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
          window.location.origin
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
      if (event.origin !== window.location.origin) return;
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
  }, [setActiveSection, handleInlineEdit]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-9 border-b border-gray-border shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-[6px] h-[6px] rounded-full bg-emerald-500" />
        </div>

        <div className="flex items-center gap-2">
          {/* Device switcher */}
          <div className="flex items-center gap-0.5 bg-gray-bg rounded-full p-0.5">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                onClick={() => setDevice(d.id)}
                className={`flex items-center justify-center w-8 h-8 rounded-full text-[11px] transition-all duration-150 ${
                  device === d.id
                    ? "bg-white text-warm-black shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-gray-muted hover:text-gray-fg"
                }`}
                title={d.label}
                aria-label={`${d.label} view`}
              >
                <d.icon className="w-[14px] h-[14px]" strokeWidth={1.5} />
              </button>
            ))}
          </div>

          <a
            href="/"
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
      <div className="flex-1 flex justify-center p-3 overflow-hidden bg-gray-bg-hover">
        <div
          className="relative h-full rounded-lg overflow-hidden transition-all duration-300 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
          style={{
            width: activeDevice.width,
            maxWidth: "100%",
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
