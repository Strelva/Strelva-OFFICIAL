"use client";

import { ChevronDown } from "lucide-react";
import { useDashboard } from "../DashboardContext";

const PAGE_OPTIONS = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "services", label: "Services" },
  { id: "contact", label: "Contact" },
];

export function PageSelector() {
  const { activePage, setActivePage } = useDashboard();

  return (
    <div className="relative">
      <select
        value={activePage}
        onChange={(e) => setActivePage(e.target.value)}
        className="appearance-none bg-surface-inset border border-gray-border rounded-lg pl-3 pr-8 py-1.5 text-[12px] font-medium text-warm-black cursor-pointer hover:border-gray-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
      >
        {PAGE_OPTIONS.map((page) => (
          <option key={page.id} value={page.id}>
            {page.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-muted pointer-events-none"
        strokeWidth={1.5}
      />
    </div>
  );
}
