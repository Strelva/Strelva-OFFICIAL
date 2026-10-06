import { Chip } from "../../console";
import type { DomainViewLoad } from "@/platform/operator-queue/domain-view-loader";

type Tone = "good" | "warn" | "crit" | "neutral" | "accent";

function verificationTone(status: string): Tone {
  if (status === "verified") return "good";
  if (status === "pending") return "warn";
  if (status === "not_claimed") return "neutral";
  return "crit";
}

function uptimeTone(state: string | undefined): Tone {
  if (state === "up") return "good";
  if (!state || state === "unknown") return "neutral";
  return "crit";
}

/** The one domain view (spec §3.11): claims, registration, uptime and expiry
 *  read through one projection. Read-only; changes stay in the manager below. */
export function DomainView({ load }: { load: DomainViewLoad | null }) {
  if (!load) {
    return <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] text-warm-white">Domains could not be read. Nothing here means &ldquo;fine&rdquo; until they can.</p>;
  }
  return (
    <section aria-labelledby="domain-view-title" className="rounded-2xl border border-glass-border bg-glass overflow-hidden" id="domains">
      <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] pt-[15px] pb-3">
        <h3 id="domain-view-title" className="text-[13.5px] font-semibold text-warm-white">Domains</h3>
        <span className="text-[11px] font-mono text-gray-faint">
          {load.monitorKnown && load.monitorScannedAt ? `Monitor read ${new Date(load.monitorScannedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "No monitor scan on record: uptime and expiry unknown"}
        </span>
      </div>
      {load.rows.length === 0
        ? <p className="border-t border-glass-border px-[18px] py-3 text-[13px] text-gray-muted">No domains are claimed or monitored for this site.</p>
        : (
          <ul className="divide-y divide-glass-border border-t border-glass-border">
            {load.rows.map((row) => (
              <li key={row.domain} className="px-[18px] py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 font-mono text-[13px] text-warm-white">{row.domain}</span>
                  <Chip tone={verificationTone(row.verification.status)}>{row.verification.label}</Chip>
                  <Chip tone={uptimeTone(row.uptime?.state)}>{row.uptime?.label ?? "Uptime unknown"}</Chip>
                  <Chip tone={row.expiry.days !== null && row.expiry.days <= 7 ? "crit" : row.expiry.days !== null && row.expiry.days <= 30 ? "warn" : "neutral"}>{row.expiry.label}</Chip>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-gray-muted">
                  On {row.system}{row.role !== "monitored" ? ` · ${row.role}` : ""}
                  {row.registration ? ` · registration ${row.registration.replace("_", " ")}` : ""}
                  {row.lastCheckedAt ? ` · last checked ${new Date(row.lastCheckedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </p>
                <p className="mt-0.5 text-[12px] leading-5 text-gray-faint">{row.whoCanChange}</p>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
