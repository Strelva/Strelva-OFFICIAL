"use client";

import { useRouter } from "next/navigation";
import { XaLabel, XaRow, XaRows, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import type { AiVisibilityScorecard as Scorecard } from "@/lib/ai-visibility-scorecard";
import { useDashboardOptional } from "./DashboardContext";

/** Short, human "as of" date for the subtle checked-on note. Null-safe. */
function formatCheckedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * "You in AI answers" — the owner-facing AI-search visibility scorecard. Reads
 * the weekly visibility snapshot Strelva already collects (no new data). Verdict
 * first, positive only: how many of the tracked questions AI assistants name you
 * in, which ones, and what's new this week. Never shames a query you're not in.
 */
export function AiVisibilityScorecard({ data }: { data: Scorecard | null }) {
  // Hooks first (Rules of Hooks) — the chat-prefill wiring reused for the
  // zero-state next step; degrades to nothing outside a dashboard context.
  const dashboard = useDashboardOptional();
  const router = useRouter();
  const setChatPrompt = dashboard?.setChatPrompt;
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);

  // Not tracking yet, or tracking but no probed answer has landed. Either way the
  // honest owner-facing state is the same soft "we check weekly, results land here".
  if (!data) return null;
  if (!data.hasData) {
    return (
      <section className="flex flex-col gap-3" aria-labelledby="ai-answers-label">
        <XaLabel id="ai-answers-label">You in AI answers</XaLabel>
        <p className="m-0 max-w-[640px] text-[15px] leading-[1.5] text-[var(--st-text-body)]">Every week Strelva asks AI assistants the questions your customers ask them. The first answers show up here.</p>
      </section>
    );
  }

  const { service, mentionedCount, total, mentionedQueries, newlyAppeared, checkedAt } = data;
  const checkedLabel = formatCheckedAt(checkedAt);

  const askStrelva = () => {
    if (!setChatPrompt) return;
    setChatPrompt(`AI assistants aren't naming us yet when people ask for a ${service}. What would help us show up?`);
    router.push(dashboardHref("/dashboard/chat"));
  };

  const headline =
    mentionedCount > 0
      ? `When people ask AI assistants for a ${service}, you come up in ${mentionedCount} of ${total} questions${newlyAppeared.length ? `, ${newlyAppeared.length} of them new this week` : ""}.`
      : `Strelva asked AI assistants for a ${service} across ${total} questions your customers ask. You aren't named yet; this flags the moment that changes.`;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="ai-answers-label">
      <XaLabel id="ai-answers-label">You in AI answers</XaLabel>
      <p className="m-0 max-w-[640px] text-[15px] leading-[1.5] text-[var(--st-text)]">{headline}</p>
      {/* Positive only: the questions you DO come up in. The rest are never listed as gaps. */}
      {mentionedQueries.length > 0 ? (
        <XaRows label="You come up when people ask">
          {mentionedQueries.map((q) => <XaRow key={q} title={<>&ldquo;{q}&rdquo;</>} meta={newlyAppeared.includes(q) ? <XaStatus kind="live" size="sm">New this week</XaStatus> : undefined} />)}
        </XaRows>
      ) : null}
      <p className="m-0 text-[13px] leading-relaxed text-[var(--st-text-3)]">
        AI answers vary by person and moment, so read this as a direction, not a rank.{checkedLabel ? ` Last checked ${checkedLabel}.` : ""}
        {mentionedCount === 0 && setChatPrompt ? <> <XaTextLink onClick={askStrelva}>Ask Strelva what would help</XaTextLink></> : null}
      </p>
    </section>
  );
}
