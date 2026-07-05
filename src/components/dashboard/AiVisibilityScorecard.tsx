"use client";

import { Bot, Sparkles } from "lucide-react";
import type { AiVisibilityScorecard as Scorecard } from "@/lib/ai-visibility-scorecard";
import { StatTile } from "./StatTile";

/**
 * "You in AI answers" — the owner-facing AI-search visibility scorecard. Reads
 * the weekly visibility snapshot Strelva already collects (no new data). Verdict
 * first, positive only: how many of the tracked questions AI assistants name you
 * in, which ones, and what's new this week. Never shames a query you're not in.
 */
export function AiVisibilityScorecard({ data }: { data: Scorecard | null }) {
  // Not tracking yet, or tracking but no probed answer has landed. Either way the
  // honest owner-facing state is the same soft "we check weekly, results land here".
  if (!data || !data.hasData) {
    // Only promise a check once tracking is actually live (a snapshot exists).
    if (!data) return null;
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
          You in AI answers
        </p>
        <div className="rounded-xl border border-glass-border bg-glass p-4 sm:p-5">
          <div className="flex items-start gap-2.5">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-warm-black">
                We&apos;re checking weekly whether AI assistants recommend you
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-fg">
                Every week we ask AI assistants the questions your customers ask them.
                Your first results will show up right here.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { service, mentionedCount, total, mentionedQueries, newlyAppeared } = data;

  const headline =
    mentionedCount > 0
      ? `When people ask AI assistants for a ${service}, you come up in ${mentionedCount} of ${total} questions.`
      : `We asked AI assistants for a ${service} across ${total} of the questions your customers ask — you're not named yet, and we'll flag the moment that changes.`;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
        You in AI answers
      </p>
      <div className="rounded-xl border border-glass-border bg-glass p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.5} />
          <p className="text-[14px] font-medium leading-relaxed text-warm-black">{headline}</p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatTile
            countUp
            label="AI answers you're in"
            value={mentionedCount}
            detail={`out of ${total} question${total === 1 ? "" : "s"} checked this week`}
            icon={<Bot className="h-4 w-4" strokeWidth={1.5} />}
          />
          {newlyAppeared.length > 0 && (
            <StatTile
              countUp
              label="New this week"
              value={newlyAppeared.length}
              detail={newlyAppeared.length === 1 ? "question you newly show up in" : "questions you newly show up in"}
              icon={<Sparkles className="h-4 w-4" strokeWidth={1.5} />}
            />
          )}
        </div>

        {/* Positive only: the questions you DO come up in. The ones you don't are
            omitted, never listed as gaps — no shaming. */}
        {mentionedQueries.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-muted">
              You come up when people ask
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {mentionedQueries.map((q) => {
                const isNew = newlyAppeared.includes(q);
                return (
                  <span
                    key={q}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      isNew
                        ? "border border-success/30 bg-success-dim text-warm-black"
                        : "border border-accent/30 bg-accent-dim text-warm-black"
                    }`}
                  >
                    {isNew && <Sparkles className="h-3 w-3 text-success" strokeWidth={2} />}
                    &ldquo;{q}&rdquo;
                    {isNew && <span className="text-success">new</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">
          We check weekly by asking AI assistants the questions your customers ask them. AI
          answers vary by person and moment, so this is a directional read, not a fixed rank.
        </p>
      </div>
    </div>
  );
}
