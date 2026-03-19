"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageCircle,
  Globe,
  FileStack,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "AI Chat", href: "/dashboard/chat", icon: MessageCircle },
  { label: "My Site", href: "/dashboard/site", icon: Globe },
  { label: "Content", href: "/dashboard/content", icon: FileStack },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardSidebar({ siteName = "Your Business" }: { siteName?: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 bg-[#0a0a0a] border-b border-[#262626]">
        <span className="text-sm font-semibold text-white">{siteName}</span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-10 h-10 flex items-center justify-center rounded-md text-zinc-400 hover:text-white transition-colors duration-150"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-full w-64 bg-[#0a0a0a] border-r border-[#262626] flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:static md:z-auto`}
      >
        {/* Logo area */}
        <div className="px-6 py-6 border-b border-[#262626]">
          <h1 className="text-base font-semibold text-white tracking-tight">
            {siteName}
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
              LIVE
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-[#1c1c1c] text-white border-l-2 border-violet-600 rounded-r-lg"
                    : "text-zinc-400 hover:text-white hover:bg-[#141414] rounded-lg"
                }`}
              >
                <item.icon className={`w-4 h-4 transition-colors duration-150 ${active ? "text-violet-400" : "text-zinc-500 group-hover:text-violet-400"}`} />
                <span className={`transition-transform duration-150 ${active ? "" : "group-hover:translate-x-0.5"}`}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#262626]">
          <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-600">
            POWERED BY REB
          </p>
        </div>
      </aside>
    </>
  );
}
