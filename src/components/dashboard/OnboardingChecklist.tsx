"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, ChevronRight } from "lucide-react";
import { useDashboardOptional } from "./DashboardContext";

interface Step {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

/**
 * First-run onboarding checklist for the owner. Self-contained: fetches its own
 * real progress from /api/dashboard/onboarding-status (no rewiring of the
 * dashboard page), persists dismissal per tenant in localStorage, and hides
 * itself once every step is done. Replaces the dead `?welcome=1` banner that
 * only fired on checkout (and billing is off).
 */
export function OnboardingChecklist({
  tenant,
  defaultOpen = false,
}: {
  tenant: string;
  /**
   * When true (a server-detected fresh/day-one client), the checklist renders
   * a lightweight loading shell immediately instead of waiting for the status
   * fetch — so a new owner sees their starting point up top with no flash of
   * nothing. Dismissal and real completion still win.
   */
  defaultOpen?: boolean;
}) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [hidden, setHidden] = useState(!defaultOpen);
  const [loaded, setLoaded] = useState(false);
  // Prefix the dashboard base path so this works under /client/{tenant} path-
  // fallback hosting, not just subdomains.
  const dashboardHref = useDashboardOptional()?.dashboardHref ?? ((p: string) => p);

  const storageKey = `strelva_onboarding_dismissed_${tenant}`;

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(storageKey) === "1") {
      setHidden(true); // dismissed previously — never show, even when defaultOpen
      return;
    }
    let active = true;
    fetch(dashboardHref("/api/dashboard/onboarding-status"))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { steps?: Step[]; complete?: boolean } | null) => {
        if (!active) return;
        setLoaded(true);
        if (!data?.steps) {
          if (!defaultOpen) setHidden(true);
          return;
        }
        if (data.complete) {
          localStorage.setItem(storageKey, "1");
          setHidden(true);
          return;
        }
        setSteps(data.steps);
        setHidden(false);
      })
      .catch(() => {
        if (active && !defaultOpen) setHidden(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setHidden(true);
  }

  if (hidden) return null;

  // Day-one shell: server flagged this as a fresh client, so reserve the spot
  // at the top of the overview while the real progress loads instead of
  // flashing nothing.
  if (!steps) {
    if (!defaultOpen || loaded) return null;
    return (
      <div className="rounded-xl border border-glass-border bg-glass p-5">
        <p className="text-[15px] font-semibold text-warm-black">Get set up</p>
        <p className="mt-0.5 text-[12px] text-gray-muted">A few quick wins to start.</p>
        <div className="mt-4 space-y-2" aria-hidden="true">
          <div className="h-7 rounded-lg bg-gray-bg/60" />
          <div className="h-7 rounded-lg bg-gray-bg/60" />
          <div className="h-7 rounded-lg bg-gray-bg/60" />
        </div>
      </div>
    );
  }

  const doneCount = steps.filter((s) => s.done).length;
  // The first not-yet-done step is THE next action — highlight it so a day-one
  // owner knows exactly where to start, instead of four look-alike rows.
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="rounded-xl border border-glass-border bg-glass p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold text-warm-black">Get set up</p>
          <p className="mt-0.5 text-[12px] text-gray-muted">
            {doneCount} of {steps.length} done: a few quick wins to start.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-gray-muted hover:text-warm-black transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-4 space-y-1.5">
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${
                  isNext ? "border border-accent/25 bg-accent-dim/40 hover:bg-accent-dim/60" : "hover:bg-gray-bg"
                }`}
              >
                {s.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-positive0" strokeWidth={2} />
                ) : (
                  <Circle className={`h-4 w-4 shrink-0 ${isNext ? "text-accent" : "text-gray-muted"}`} strokeWidth={1.5} />
                )}
                <span className={`flex-1 text-[13px] ${s.done ? "text-gray-muted line-through" : isNext ? "font-medium text-warm-black" : "text-warm-black"}`}>
                  {s.label}
                </span>
                {isNext ? (
                  <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-accent-text">
                    Start <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                ) : !s.done ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-faint opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
