"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/onboard", label: "Onboard" },
  { href: "/admin/pay-links", label: "Pay Links" },
  { href: "/admin/ops", label: "Ops" },
  { href: "/admin/drafts", label: "Drafts" },
  { href: "/admin/audit", label: "Audit" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 text-sm">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 transition-colors ${
              active
                ? "bg-glass text-warm-white"
                : "text-gray-muted hover:text-warm-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
