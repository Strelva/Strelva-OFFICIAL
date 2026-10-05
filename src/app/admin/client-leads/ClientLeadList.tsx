import Link from "next/link";
import type { OperatorClientLead } from "@/lib/client-leads";
import { Chip } from "@/app/admin/console";

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : WHEN.format(date);
}

function day(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DAY.format(date);
}

/** One list of client leads. Used by /admin/client-leads and a client's page. */
export function ClientLeadList({ leads, showClient = true }: { leads: OperatorClientLead[]; showClient?: boolean }) {
  return (
    <ul className="divide-y divide-glass-border overflow-hidden rounded-2xl border border-glass-border bg-glass">
      {leads.map((lead) => {
        const extraFields = lead.fields
          ? Object.entries(lead.fields).filter(([key]) => !["name", "email", "message"].includes(key))
          : [];
        return (
          <li key={lead.key} className="px-4 py-3.5 sm:px-[18px]">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-warm-white break-words">
                  {lead.name || "No name given"}
                  {lead.email && (
                    <a
                      href={`mailto:${lead.email}`}
                      className="ml-2 text-[12.5px] font-normal text-gray-muted underline-offset-2 hover:text-accent hover:underline focus-visible:text-accent focus-visible:underline focus-visible:outline-none break-all"
                    >
                      {lead.email}
                    </a>
                  )}
                </p>
                <p className="mt-0.5 text-[11.5px] text-gray-faint">
                  {showClient && (
                    <>
                      <Link
                        href={`/admin/clients/${encodeURIComponent(lead.tenantId)}`}
                        className="font-medium text-gray-muted hover:text-accent focus-visible:text-accent focus-visible:outline-none"
                      >
                        {lead.siteName}
                      </Link>
                      {" · "}
                    </>
                  )}
                  <time dateTime={lead.capturedAt}>{when(lead.capturedAt)}</time>
                  {lead.source ? ` · ${lead.source}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {lead.stored === "postgres" ? (
                  <Chip tone="good">Kept in Postgres</Chip>
                ) : (
                  <Chip tone="warn">
                    Redis only{lead.expiresAt ? ` · gone ${day(lead.expiresAt)}` : ""}
                  </Chip>
                )}
              </div>
            </div>
            {lead.message && (
              <p className="mt-2 whitespace-pre-line break-words text-[13px] leading-relaxed text-gray-muted line-clamp-4">
                {lead.message}
              </p>
            )}
            {extraFields.length > 0 && (
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
                {extraFields.slice(0, 8).map(([key, value]) => (
                  <div key={key} className="flex min-w-0 gap-1.5">
                    <dt className="shrink-0 text-gray-faint">{key}</dt>
                    <dd className="min-w-0 truncate text-gray-muted">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
