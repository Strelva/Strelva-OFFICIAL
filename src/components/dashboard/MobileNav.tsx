"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, FileText, LayoutPanelLeft, MessageSquare } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";

const NAV_ITEMS = [
  { href: "/dashboard/brief", label: "Report", icon: FileText },
  { href: "/dashboard/queue", label: "Review", icon: Inbox },
  { href: "/dashboard/chat", label: "AI", icon: MessageSquare },
  { href: "/dashboard/content", label: "Site", icon: LayoutPanelLeft },
];

export function MobileNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

  const getActiveIndex = useCallback(() => {
    return NAV_ITEMS.findIndex(
      (item) =>
        pathname === item.href || pathname?.startsWith(item.href + "/")
    );
  }, [pathname]);

  useEffect(() => {
    const activeIndex = getActiveIndex();
    if (activeIndex === -1 || !navRef.current) return;

    const buttons = navRef.current.querySelectorAll<HTMLAnchorElement>("a");
    const activeButton = buttons[activeIndex];
    if (!activeButton) return;

    const navRect = navRef.current.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setPillStyle({
      left: buttonRect.left - navRect.left,
      width: buttonRect.width,
    });
  }, [getActiveIndex]);

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-base/92 border-t border-glass-border pb-safe backdrop-blur-xl"
      data-dashboard
      aria-label="Primary navigation"
    >
      <div className="relative flex items-center justify-around h-16" ref={navRef}>
        <div
          className="mobile-nav-pill absolute top-1 h-[calc(100%-8px)] rounded-xl bg-gray-bg-hover shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] pointer-events-none"
          style={{
            left: pillStyle.left,
            width: pillStyle.width,
            opacity: pillStyle.width > 0 ? 1 : 0,
          }}
        />
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          const showBadge = item.href === "/dashboard/queue" && pendingCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-1 w-16 h-14 rounded-xl transition-colors ${
                isActive ? "text-warm-black" : "text-gray-muted"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                {showBadge && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 text-[9px] font-semibold bg-accent text-surface-base rounded-full flex items-center justify-center">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
