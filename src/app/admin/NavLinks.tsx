"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

// Five primary destinations. Everything operator-technical lives under "More"
// so the top bar stays scannable.
const PRIMARY: NavItem[] = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/ops", label: "Ops" },
];

const MORE: NavItem[] = [
  { href: "/admin/actions", label: "Actions" },
  { href: "/admin/onboard", label: "Onboard" },
  { href: "/admin/pay-links", label: "Pay Links" },
  { href: "/admin/digests", label: "Maintenance" },
  { href: "/admin/drafts", label: "Drafts" },
  { href: "/admin/audit", label: "Audit" },
];

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

const primaryLinkClass = (active: boolean) =>
  `rounded-md px-2.5 py-1.5 transition-colors ${
    active ? "bg-accent text-on-accent" : "text-gray-muted hover:text-warm-white"
  }`;

export function NavLinks() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [moreOpen]);

  const moreActive = MORE.some((item) => isActive(pathname, item));

  return (
    <div className="flex items-center gap-1 text-sm">
      {PRIMARY.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={primaryLinkClass(active)}
          >
            {item.label}
          </Link>
        );
      })}

      <div className="relative" ref={moreRef}>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          className={primaryLinkClass(moreActive)}
        >
          More
          <span className="ml-1 text-[10px] text-gray-faint" aria-hidden>
            ▾
          </span>
        </button>
        {moreOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-1 min-w-[160px] rounded-lg border border-glass-border bg-surface-base py-1 shadow-lg z-50"
          >
            {MORE.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMoreOpen(false)}
                  className={`block px-3 py-1.5 text-sm transition-colors ${
                    active ? "text-warm-white bg-glass" : "text-gray-muted hover:text-warm-white hover:bg-gray-bg"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
