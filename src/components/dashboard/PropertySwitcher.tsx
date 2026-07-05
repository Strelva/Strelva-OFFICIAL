"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { useDashboard } from "./DashboardContext";

type Property = { id: string; name: string; href: string };

/**
 * Header switcher for users who manage more than one property (separate sites
 * today; per-location views later plug into the same control). Self-fetches the
 * list and renders nothing but the plain name when there's only one — so a
 * single-site client never sees a switcher.
 */
export function PropertySwitcher({ fallbackName }: { fallbackName: string }) {
  const { tenantId, dashboardHref } = useDashboard();
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The menu is position:fixed so the sidebar's overflow-auto can't clip it;
  // we anchor it to the trigger's viewport rect on open.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(dashboardHref("/api/my-properties"))
      .then((r) => r.json())
      .then((d) => {
        if (active) setProperties(Array.isArray(d.properties) ? d.properties : []);
      })
      .catch(() => {
        if (active) setProperties([]);
      });
    return () => {
      active = false;
    };
  }, [dashboardHref]);

  // The current property's richest name is the layout's fallbackName (from
  // content settings); other properties use the name from the API.
  const name = fallbackName;

  // One property (or still loading / none) → just the name, no switcher.
  if (!properties || properties.length <= 1) {
    return (
      <p className="truncate text-[13px] font-medium leading-tight text-warm-black">
        {name}
      </p>
    );
  }

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 8, left: r.left });
    }
    setOpen((o) => !o);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="group flex max-w-full items-center gap-1.5 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate text-[13px] font-medium leading-tight text-warm-black">
          {name}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-gray-muted transition-colors group-hover:text-warm-black" />
      </button>

      {open && menuPos && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed z-[61] w-64 overflow-hidden rounded-xl border border-glass-border bg-[var(--cream-mid)] shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-muted">
              Switch property
            </p>
            <div className="pb-1">
              {properties.map((p) => {
                const isCurrent = p.id === tenantId;
                return (
                  <a
                    key={p.id}
                    href={isCurrent ? undefined : p.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 text-[13px] transition-colors ${
                      isCurrent
                        ? "text-warm-black"
                        : "text-gray-muted hover:bg-glass hover:text-warm-black"
                    }`}
                  >
                    <span className="truncate">{isCurrent ? fallbackName : p.name}</span>
                    {isCurrent && <Check className="size-3.5 shrink-0 text-accent" />}
                  </a>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
