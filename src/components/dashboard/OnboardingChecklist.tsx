"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaLabel, XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
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

  // Day-one shell: reserve the spot while the real progress loads instead of flashing nothing.
  if (!steps) {
    if (!defaultOpen || loaded) return null;
    return (
      <section className="flex flex-col gap-3" aria-busy="true" aria-labelledby="getting-started-label">
        <XaLabel id="getting-started-label">Getting started</XaLabel>
        <StSkeleton width="70%" label="Loading getting started" />
        <StSkeleton width="58%" label="Loading getting started" />
        <StSkeleton width="64%" label="Loading getting started" />
      </section>
    );
  }

  const doneCount = steps.filter((s) => s.done).length;
  // The first not-yet-done step is THE next action.
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <section className="flex flex-col gap-2" aria-labelledby="getting-started-label">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <XaLabel id="getting-started-label">Getting started · {doneCount} of {steps.length} done</XaLabel>
        <XaTextLink onClick={dismiss} aria-label="Hide getting started">Hide</XaTextLink>
      </div>
      <XaRows label="Getting started">
        {steps.map((s, i) => (
          <XaRow
            key={s.key}
            href={s.href}
            lead={<span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${s.done ? "bg-[var(--st-tint)] text-[var(--st-accent)]" : "border border-[var(--st-line-strong)] text-transparent"}`} aria-hidden="true"><Check size={13} strokeWidth={2.4} /></span>}
            title={<span className={s.done ? "text-[var(--st-text-3)]" : undefined}>{s.label}</span>}
            detail={s.done ? "Done" : i === nextIdx ? "Start here" : undefined}
            meta={!s.done && i === nextIdx ? <ChevronRight size={16} aria-hidden="true" /> : undefined}
          />
        ))}
      </XaRows>
    </section>
  );
}
