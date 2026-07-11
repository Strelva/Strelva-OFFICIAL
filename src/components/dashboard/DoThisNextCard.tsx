"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { useDashboard } from "./DashboardContext";

/**
 * "Do this next" — surfaces your latest pending suggestion on Today
 * with a one-tap hand-off into chat. Tapping prefills Ask Strelva with the exact
 * ask (same setChatPrompt + navigate path the rest of the dashboard uses), so the
 * owner never has to retype it. Only rendered when there's a real pending
 * suggestion; the page skips it entirely otherwise.
 */
export function DoThisNextCard({ title, prompt }: { title: string; prompt: string }) {
  const { dashboardHref, setChatPrompt } = useDashboard();
  const router = useRouter();

  function ask() {
    setChatPrompt(prompt);
    router.push(dashboardHref("/dashboard/chat"));
  }

  return (
    <section className="rounded-2xl border border-accent/25 bg-accent-dim/40 p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
        Do this next
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="min-w-0 font-[family-name:var(--font-display)] text-[18px] font-normal leading-snug text-warm-black">
          {title}
        </h2>
        <button
          type="button"
          onClick={ask}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          Ask Strelva to do it
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </section>
  );
}
