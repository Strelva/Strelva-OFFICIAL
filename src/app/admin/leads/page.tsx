import { getDeliveryLeads, type DeliveryLead } from "@/lib/access-request-delivery";

export const dynamic = "force-dynamic";

function planLabel(plan: DeliveryLead["plan"]): string {
  if (plan === "one-time") return "One-time build";
  if (plan === "monthly") return "Monthly plan";
  return "Not sure";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export default async function AdminLeadsPage() {
  const leads = await getDeliveryLeads();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-normal text-warm-white">
          Leads
        </h1>
        <p className="text-sm text-gray-muted mt-1">
          {leads.length} lead{leads.length !== 1 ? "s" : ""} from the marketing site, newest first.
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl bg-glass border border-glass-border p-10 text-center">
          <p className="text-sm font-medium text-warm-white">No leads yet</p>
          <p className="mt-1 text-xs text-gray-muted">
            Contact, discovery, and get-started form submissions land here the moment they come in.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-glass border border-glass-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-glass-border text-gray-muted text-left">
                  <th className="px-6 py-3 font-medium">Business</th>
                  <th className="px-6 py-3 font-medium">Contact</th>
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-6 py-3 font-medium">Submitted</th>
                  <th className="px-6 py-3 font-medium">Current site</th>
                  <th className="px-6 py-3 font-medium">Referred by</th>
                  <th className="px-6 py-3 font-medium">Message</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border/50">
                {leads.map((lead) => (
                  <tr
                    key={lead.statusToken}
                    className="hover:bg-gray-bg transition-colors align-top"
                  >
                    <td className="px-6 py-5">
                      <p className="font-medium text-warm-white">{lead.businessName}</p>
                      {lead.location && (
                        <p className="mt-1 text-xs text-gray-faint">{lead.location}</p>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <a
                        href={`mailto:${lead.email}`}
                        className="text-xs text-accent hover:underline"
                      >
                        {lead.email}
                      </a>
                      <p className="mt-1 text-xs text-gray-muted">{lead.phone || "No phone"}</p>
                    </td>
                    <td className="px-6 py-5 text-gray-muted">{planLabel(lead.plan)}</td>
                    <td className="px-6 py-5 text-gray-muted">{formatDate(lead.submittedAt)}</td>
                    <td className="px-6 py-5">
                      {lead.currentWebsite ? (
                        <a
                          href={lead.currentWebsite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block max-w-[200px] truncate font-mono text-xs text-gray-muted hover:text-warm-white"
                        >
                          {stripProtocol(lead.currentWebsite)}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-faint">None</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-xs text-gray-muted">
                      {lead.referredBy || "Direct"}
                    </td>
                    <td className="px-6 py-5">
                      <p className="max-w-[280px] whitespace-pre-wrap text-xs text-gray-muted">
                        {lead.description || "—"}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <span className="inline-flex rounded-full border border-glass-border px-2 py-0.5 text-xs font-medium capitalize text-warm-white">
                        {lead.deliveryStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
