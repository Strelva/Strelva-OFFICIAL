"use client";

import { useState, useRef, useEffect } from "react";
import { Monitor, Tablet, Smartphone, ExternalLink } from "lucide-react";
import { useDashboard } from "./DashboardContext";

const DEVICES = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%" },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "768px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "390px" },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

export function SitePreview() {
  const [device, setDevice] = useState<DeviceId>("desktop");
  const { refreshKey, scrollToSection, setScrollToSection } = useDashboard();
  const activeDevice = DEVICES.find((d) => d.id === device)!;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle scroll-to-section requests from ContentBrowser
  useEffect(() => {
    if (scrollToSection && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: "reb-scroll-to", section: scrollToSection },
          "*"
        );
      } catch {
        iframeRef.current.src = `/#${scrollToSection}`;
      }
      setScrollToSection(null);
    }
  }, [scrollToSection, setScrollToSection]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-9 border-b border-[#e8e8e8] shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-[6px] h-[6px] rounded-full bg-emerald-500" />
        </div>

        <div className="flex items-center gap-2">
          {/* Device switcher */}
          <div className="flex items-center gap-0.5 bg-[#f5f5f5] rounded-full p-0.5">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                onClick={() => setDevice(d.id)}
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] transition-all duration-150 ${
                  device === d.id
                    ? "bg-white text-[#1a1a1a] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-[#999] hover:text-[#666]"
                }`}
                title={d.label}
              >
                <d.icon className="w-[14px] h-[14px]" strokeWidth={1.5} />
              </button>
            ))}
          </div>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-6 h-6 rounded-md text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
            title="Open in new tab"
          >
            <ExternalLink className="w-[14px] h-[14px]" strokeWidth={1.5} />
          </a>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex justify-center p-3 overflow-hidden bg-[#f0f0f0]">
        <div
          className="h-full rounded-lg overflow-hidden transition-all duration-300 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
          style={{
            width: activeDevice.width,
            maxWidth: "100%",
          }}
        >
          <iframe
            ref={iframeRef}
            key={refreshKey}
            src="/"
            className="w-full h-full border-0"
            title="Live site preview"
          />
        </div>
      </div>
    </div>
  );
}
