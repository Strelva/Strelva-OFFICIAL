import { Sparkles } from "lucide-react";
import type { Suggestion } from "@/lib/suggestions";

/**
 * The done-for-you work-list for one client. These are the site/SEO/content
 * suggestions the engine generates — operator craft the CLIENT never sees. They
 * live here so we act on them for the client (who sees the result, not the
 * homework). Read-only for now: it names the work; drafting stays in the agent /
 * the portfolio "Ready to work" pass.
 */
export function OperatorOpportunities({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-glass-border bg-glass p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-dim text-accent">
          <Sparkles className="h-4 w-4" strokeWidth={1.9} />
        </span>
        <h2 className="text-[15px] font-medium text-warm-white">Do this for them</h2>
      </div>
      <p className="mb-4 text-[12.5px] text-gray-muted">
        Site, SEO, and content work Strelva surfaced for this client. They never see these —
        we do the work; they see the result. {suggestions.length} open.
      </p>

      <ul className="divide-y divide-glass-border">
        {suggestions.map((s) => (
          <li key={s.id} className="flex items-start gap-3 py-2.5">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-warm-white">{s.title}</p>
              <p className="mt-0.5 text-[12px] text-gray-muted">{s.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
