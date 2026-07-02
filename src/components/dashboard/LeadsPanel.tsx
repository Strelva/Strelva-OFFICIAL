import { Inbox, Mail, MessageSquare } from "lucide-react";
import type { LeadRecord } from "@/lib/leads";

interface LeadsPanelProps {
  leads: LeadRecord[];
}

function formatWhen(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Humanize a raw source tag like "contact-form" -> "Contact form". */
function sourceLabel(source: string): string {
  const s = source.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function LeadCard({ lead }: { lead: LeadRecord }) {
  return (
    <div className="rounded-xl dashboard-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-warm-black truncate">{lead.name}</p>
          <p className="mt-1 text-[11px] text-gray-muted">{formatWhen(lead.createdAt)}</p>
        </div>
        {lead.source && (
          <span className="shrink-0 rounded-md border border-glass-border bg-glass px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-muted">
            {sourceLabel(lead.source)}
          </span>
        )}
      </div>

      {lead.message && (
        <p className="mt-3 text-[13px] leading-relaxed text-gray-fg">{lead.message}</p>
      )}

      {lead.email && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={`mailto:${lead.email}`}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent/85"
          >
            <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
            Reply by email
          </a>
          <a
            href={`mailto:${lead.email}`}
            className="text-[12px] text-gray-muted underline-offset-2 hover:text-warm-black hover:underline"
          >
            {lead.email}
          </a>
        </div>
      )}
    </div>
  );
}

export function LeadsPanel({ leads }: LeadsPanelProps) {
  if (leads.length === 0) {
    return (
      <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
              Leads
            </p>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-warm-black sm:text-[30px]">
              No one has reached out yet
            </h1>
          </div>
          <div className="rounded-xl dashboard-panel p-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim text-accent">
              <MessageSquare className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <p className="text-[14px] font-medium text-warm-black">
              When someone reaches out through your website, they&apos;ll show up here
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-gray-muted">
              Every contact-form message lands in this inbox with their name and what they asked,
              so you can follow up in one click.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Leads
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[24px] font-normal tracking-[-0.01em] text-warm-black sm:text-[30px]">
            Who reached out
          </h1>
          <p className="mt-3 flex items-center gap-1.5 text-[14px] text-gray-muted">
            <Inbox className="h-4 w-4 text-accent" strokeWidth={1.5} />
            {leads.length} {leads.length === 1 ? "person has" : "people have"} contacted you
          </p>
        </div>

        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      </div>
    </div>
  );
}
