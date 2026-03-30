"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin" },
  { label: "Hero", href: "/admin/hero" },
  { label: "Services", href: "/admin/services" },
  { label: "Story", href: "/admin/story" },
  { label: "Testimonials", href: "/admin/testimonials" },
  { label: "Events", href: "/admin/events" },
  { label: "Providers", href: "/admin/providers" },
  { label: "FAQ", href: "/admin/faq" },
  { label: "Shop", href: "/admin/shop" },
  { label: "Contact", href: "/admin/contact" },
  { label: "Settings", href: "/admin/settings" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleLogout = () => {
    signOut({ redirectUrl: "/" });
  };

  const displayName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "Admin";

  const sidebarContent = (
    <>
      <div className="p-6" style={{ borderBottom: "1px solid var(--cream-dark)" }}>
        <h2 className="font-display text-lg" style={{ color: "var(--bark)" }}>{displayName}</h2>
        <p className="text-xs mt-1" style={{ color: "var(--bark-faded)" }}>Content Management</p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={
                    isActive
                      ? { background: "var(--sage)", color: "var(--pure-white)" }
                      : { color: "var(--bark-light)" }
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "var(--cream-dark)";
                      e.currentTarget.style.color = "var(--bark)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--bark-light)";
                    }
                  }}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 space-y-1" style={{ borderTop: "1px solid var(--cream-dark)" }}>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="block px-4 py-2.5 text-sm rounded-lg transition-colors text-left"
          style={{ color: "var(--sage)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(124,154,142,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          View Site
        </a>
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2.5 text-sm rounded-lg transition-colors text-left"
          style={{ color: "var(--bark-faded)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--terra)";
            e.currentTarget.style.background = "rgba(181,99,75,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--bark-faded)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          Log Out
        </button>
      </div>
    </>
  );

  return (
    <>
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14"
        style={{ background: "var(--pure-white)", borderBottom: "1px solid var(--cream-dark)" }}
      >
        <button
          onClick={() => setOpen(!open)}
          className="p-2 -ml-2 rounded-lg transition-colors"
          style={{ color: "var(--bark)" }}
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" />
            ) : (
              <path d="M3 5h14M3 10h14M3 15h14" />
            )}
          </svg>
        </button>
        <span className="font-display text-sm" style={{ color: "var(--bark)" }}>{displayName}</span>
        <div className="w-8" />
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/20"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-64 flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--pure-white)" }}
      >
        {sidebarContent}
      </aside>

      <aside
        className="hidden md:flex w-64 min-h-screen flex-col shrink-0"
        style={{ background: "var(--pure-white)", borderRight: "1px solid var(--cream-dark)" }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
