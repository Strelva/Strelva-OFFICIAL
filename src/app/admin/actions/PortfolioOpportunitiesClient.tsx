"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CircleAlert, Loader2, Sparkles, Wand2, MessageSquare, FileText, Wrench,
  PenLine, Eye, Send, ArrowRight, type LucideIcon,
} from "lucide-react";
import { draftPortfolioOpportunity } from "./actions";
import type {
  OpportunityGroup,
  OpportunityKind,
  PortfolioOpportunitiesSnapshot,
} from "./portfolio-opportunities";

/** Per-group result after a "Draft these" pass — what landed, what didn't. */
type GroupResult = { drafted: number; skipped: number; failed: number };

/** What each opportunity kind actually produces, in plain terms — so the
 *  operator knows what a button will draft before clicking it. */
const KIND_INFO: Record<OpportunityKind, { icon: LucideIcon; drafts: string; lands: string }> = {
  // Review replies are an owner decision — they land in the client's approval queue.
  // Site/health work is operator craft — it lands on our side (each client's cockpit),
  // never as client homework.
  unreplied_reviews: { icon: MessageSquare, drafts: "a reply written in the client's voice", lands: "ready to approve in each client's queue" },
  stale_sites: { icon: FileText, drafts: "a fresh post or update for the site", lands: "onto your work-list on each client's page" },
  low_health: { icon: Wrench, drafts: "the prioritized fixes for their site health", lands: "onto your work-list on each client's page" },
};

/** The governed pipeline every draft follows — shown once so "Draft fixes /
 *  replies" reads as "start this", not "publish now". Nothing skips a step. */
function FlowStrip() {
  const steps: { icon: LucideIcon; label: string; sub: string }[] = [
    { icon: PenLine, label: "Strelva drafts", sub: "AI writes it" },
    { icon: Eye, label: "You approve", sub: "review first" },
    { icon: Send, label: "Goes live", sub: "posts to their site / Google" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-xl border border-glass-border bg-glass px-4 py-3">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-dim text-accent">
            <s.icon className="h-3.5 w-3.5" strokeWidth={1.9} />
          </span>
          <span className="leading-tight">
            <span className="block text-[12.5px] font-semibold text-warm-white">{s.label}</span>
            <span className="block text-[11px] text-gray-faint">{s.sub}</span>
          </span>
          {i < steps.length - 1 && <ArrowRight className="mx-1.5 h-3.5 w-3.5 shrink-0 text-gray-faint" strokeWidth={2} />}
        </div>
      ))}
    </div>
  );
}

/** Reasons that are "nothing to do", not a failure, so we don't alarm the operator. */
const BENIGN_REASONS = new Set(["already_drafted", "no_unreplied_review", "nothing_to_draft"]);

export function PortfolioOpportunitiesClient({
  snapshot,
}: {
  snapshot: PortfolioOpportunitiesSnapshot;
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState<OpportunityKind | null>(null);
  const [results, setResults] = useState<Record<string, GroupResult>>({});
  const [, startTransition] = useTransition();

  const draftGroup = useCallback(
    (group: OpportunityGroup) => {
      setProcessing(group.kind);
      setResults((prev) => {
        const next = { ...prev };
        delete next[group.kind];
        return next;
      });
      startTransition(async () => {
        try {
          const res = await draftPortfolioOpportunity(
            group.kind,
            group.clients.map((c) => c.tenantId),
          );
          if (res.ok) {
            const drafted = res.results.filter((r) => r.drafted).length;
            const failed = res.results.filter(
              (r) => !r.drafted && !BENIGN_REASONS.has(r.reason ?? ""),
            ).length;
            const skipped = res.results.length - drafted - failed;
            setResults((prev) => ({ ...prev, [group.kind]: { drafted, skipped, failed } }));
          }
        } finally {
          setProcessing(null);
          // Re-read server truth: drafted items now show in the queue below.
          router.refresh();
        }
      });
    },
    [router],
  );

  if (snapshot.totalOpportunities === 0) return null;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2.5 font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">
            <Sparkles className="h-5 w-5 text-accent" strokeWidth={2} />
            Ready to work
          </h2>
          <p className="mt-1 text-sm text-gray-muted">
            Work waiting across the portfolio that nobody has drafted yet. Hit draft and Strelva
            writes it for each client &mdash; you approve before anything goes live.
          </p>
        </div>
        <FlowStrip />
      </div>

      <div className="space-y-3">
        {snapshot.groups.map((group) => {
          const busy = processing === group.kind;
          const result = results[group.kind];
          return (
            <section
              key={group.kind}
              className="rounded-xl border border-glass-border bg-glass overflow-hidden"
            >
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-glass-border bg-surface-raised text-accent">
                    {(() => { const K = KIND_INFO[group.kind].icon; return <K className="h-[18px] w-[18px]" strokeWidth={1.8} />; })()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-warm-white">{group.title}</span>
                      <span className="shrink-0 rounded-full bg-gray-bg px-2 py-0.5 text-[11px] text-gray-muted">
                        {group.clients.length}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-muted">{group.summary}</p>
                    <p className="mt-1 text-[12.5px] text-gray-faint">
                      Drafts {KIND_INFO[group.kind].drafts}, {KIND_INFO[group.kind].lands}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => draftGroup(group)}
                  disabled={processing !== null}
                  title={`Draft ${KIND_INFO[group.kind].drafts} for ${group.clients.length} client${group.clients.length === 1 ? "" : "s"} — ${KIND_INFO[group.kind].lands}`}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  ) : (
                    <Wand2 className="h-4 w-4" strokeWidth={2} />
                  )}
                  {group.actionLabel}
                </button>
              </div>

              <ul className="divide-y divide-glass-border border-t border-glass-border">
                {group.clients.map((client) => (
                  <li
                    key={client.tenantId}
                    className="flex items-center justify-between gap-3 px-5 py-2.5"
                  >
                    <Link
                      href={`/admin/clients/${client.tenantId}`}
                      className="truncate text-sm text-warm-white hover:text-accent"
                    >
                      {client.siteName}
                    </Link>
                    <span className="shrink-0 text-[12px] text-gray-muted">{client.detail}</span>
                  </li>
                ))}
              </ul>

              {result && (
                <div className="border-t border-glass-border px-5 py-2.5 text-[12px]">
                  {result.drafted > 0 ? (
                    <p className="text-positive">
                      Drafted for {result.drafted} of {result.drafted + result.skipped + result.failed}{" "}
                      client{result.drafted + result.skipped + result.failed === 1 ? "" : "s"},
                      waiting for approval below.
                      {result.skipped > 0
                        ? ` ${result.skipped} had nothing to draft or already had one.`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-gray-muted">
                      Nothing new to draft. These clients had nothing to draft or already have a
                      pending draft.
                    </p>
                  )}
                  {result.failed > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-warning">
                      <CircleAlert className="h-3 w-3" strokeWidth={2} />
                      {result.failed} client{result.failed === 1 ? "" : "s"} couldn&rsquo;t be
                      drafted. Try again.
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
