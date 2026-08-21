"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { RailBrand, NavList, RailFooter } from "./AdminRail";

/** The operator console's mobile navigation: a sticky top bar with the brand +
 *  a hamburger that opens the same grouped nav as a slide-in drawer. Desktop
 *  keeps the sidebar (this is md:hidden). Without this, the admin has no way to
 *  move between sections on a phone. */
export function AdminMobileNav({
  operatorName = "Operator",
  badges = {},
}: {
  operatorName?: string;
  badges?: Record<string, number | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  // A nav tap closes the drawer via NavList's onNavigate; while it's open, lock
  // body scroll and close on Escape. Focus the close button on open; restore
  // focus to the hamburger button on close.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const openButton = openButtonRef.current;
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      (prev ?? openButton)?.focus();
    };
  }, [open]);

  // Focus trap for the drawer: Tab/Shift+Tab cycle within focusable elements.
  const trapFocus = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key !== "Tab") return;
    const el = drawerRef.current;
    if (!el) return;
    const focusable = Array.from(
      el.querySelectorAll<HTMLElement>(
        'a[href], button, input, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((n) => !n.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  return (
    <div className="md:hidden">
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-glass-border bg-surface-base px-4 py-2.5">
        <RailBrand />
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-gray-muted transition-colors hover:bg-glass hover:text-warm-white"
        >
          <Menu className="h-5 w-5" strokeWidth={1.8} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute left-0 top-0 flex h-full w-[82%] max-w-[300px] flex-col border-r border-glass-border bg-surface-base px-3 py-[18px]"
            onKeyDown={trapFocus}
          >
            <div className="mb-5 flex items-center justify-between">
              <RailBrand />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-8 w-8 place-items-center rounded-lg text-gray-muted transition-colors hover:bg-glass hover:text-warm-white"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
            </div>
            <NavList badges={badges} onNavigate={() => setOpen(false)} />
            <RailFooter operatorName={operatorName} />
          </aside>
        </div>
      )}
    </div>
  );
}
