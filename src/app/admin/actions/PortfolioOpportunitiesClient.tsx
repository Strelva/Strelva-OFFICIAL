"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleAlert, Loader2, Sparkles, Wand2 } from "lucide-react";
import { draftPortfolioOpportunity } from "./actions";
import type {
  OpportunityGroup,
  OpportunityKind,
  PortfolioOpportunitiesSnapshot,
} from "./portfolio-opportunities";

/** Per-group result after a "Draft these" pass — what landed, what didn't. */
type GroupResult = { drafted: number; skipped: number; failed: number };

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
      <div>
        <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[20px] font-medium text-warm-white">
          <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} />
          Ready to work
        </h2>
        <p className="mt-1 text-sm text-gray-muted">
          Latent work across the portfolio nobody has drafted yet. Draft it in one pass. Every
          draft lands in the client&rsquo;s queue for approval, nothing publishes on its own.
        </p>
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
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-warm-white">{group.title}</span>
                    <span className="shrink-0 rounded-full bg-gray-bg px-2 py-0.5 text-[11px] text-gray-muted">
                      {group.clients.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-muted">{group.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => draftGroup(group)}
                  disabled={processing !== null}
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
                    <p className="text-emerald-300">
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
                    <p className="mt-1 flex items-center gap-1 text-amber-300">
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
