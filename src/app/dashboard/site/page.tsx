"use client";

import { useState } from "react";
import { ExternalLink, Monitor, Tablet, Smartphone } from "lucide-react";

const DEVICES = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%" },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "768px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "390px" },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

export default function SitePage() {
  const [device, setDevice] = useState<DeviceId>("desktop");
  const activeDevice = DEVICES.find((d) => d.id === device)!;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626] bg-[#0a0a0a]">
        <div className="flex items-center gap-4">
          <span className="text-xs uppercase tracking-widest text-zinc-500">
            YOUR SITE
          </span>
          <span className="font-mono text-xs text-zinc-400">
            rohlaxwellness.com
          </span>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#141414] border border-[#262626] text-xs text-zinc-300 hover:bg-[#1c1c1c] hover:text-white hover:border-[#333] transition-colors duration-150"
        >
          Open in new tab
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Device toggle + status */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-[#262626] bg-[#0a0a0a]">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-mono text-zinc-400">Live</span>
          <span className="text-xs text-zinc-600 ml-1">&middot;</span>
          <span className="font-mono text-[10px] text-zinc-500 ml-1">
            Real-time preview
          </span>
        </div>

        {/* Device switcher */}
        <div className="flex items-center gap-1 bg-[#141414] border border-[#262626] rounded-md p-0.5">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDevice(d.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all duration-150 ${
                device === d.id
                  ? "bg-[#262626] text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title={d.label}
            >
              <d.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-mono">{d.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Iframe */}
      <div className="flex-1 flex justify-center mx-6 my-4 overflow-hidden">
        <div
          className="h-full rounded-lg border border-[#262626] overflow-hidden transition-all duration-300 bg-white"
          style={{
            width: activeDevice.width,
            maxWidth: "100%",
          }}
        >
          <iframe
            src="/"
            className="w-full h-full border-0"
            title="Live site preview"
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-[#262626] bg-[#0a0a0a]">
        <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-600">
          POWERED BY REB
        </span>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-zinc-500">
            {activeDevice.width === "100%" ? "Full width" : activeDevice.width} · Single-page site
          </span>
        </div>
      </div>
    </div>
  );
}
