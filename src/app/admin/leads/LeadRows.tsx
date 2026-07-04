"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeliveryLead } from "@/lib/access-request-delivery";
import type { LeadWorkflow, LeadWorkflowStatus } from "@/lib/lead-workflow";

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

const WORKFLOW_BADGE: Record<LeadWorkflowStatus, string> = {
  new: "border-glass-border text-warm-white",
  contacted: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  converted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  dismissed: "border-glass-border/60 text-gray-faint",
};

const WORKFLOW_LABEL: Record<LeadWorkflowStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  dismissed: "Dismissed",
};

export function LeadRows({
  leads,
  initialWorkflow,
}: {
  leads: DeliveryLead[];
  initialWorkflow: Record<string, LeadWorkflow>;
}) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Record<string, LeadWorkflow>>(initialWorkflow);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [showDismissed, setShowDismissed] = useState(false);

  function statusOf(token: string): LeadWorkflowStatus {
    return workflow[token]?.status ?? "new";
  }

  async function setStatus(token: string, status: LeadWorkflowStatus): Promise<boolean> {
    setPending((p) => ({ ...p, [token]: true }));
    try {
      const res = await fetch(`/api/admin/leads/${token}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { workflow: LeadWorkflow };
      setWorkflow((w) => ({ ...w, [token]: data.workflow }));
      return true;
    } catch {
      return false;
    } finally {
      setPending((p) => ({ ...p, [token]: false }));
    }
  }

  async function convert(lead: DeliveryLead) {
    // Records operator intent (status → converted) and hands off to the onboard
    // flow prefilled. Does NOT create a tenant — the onboarding form still needs
    // a human to submit.
    await setStatus(lead.statusToken, "converted");
    const q = new URLSearchParams({
      siteName: lead.businessName,
      ownerEmail: lead.email,
    });
    router.push(`/admin/onboard?${q.toString()}`);
  }

  const { active, dismissed } = useMemo(() => {
    const activeList: DeliveryLead[] = [];
    const dismissedList: DeliveryLead[] = [];
    for (const lead of leads) {
      if (statusOf(lead.statusToken) === "dismissed") dismissedList.push(lead);
      else activeList.push(lead);
    }
    return { active: activeList, dismissed: dismissedList };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, workflow]);

  function renderTable(rows: DeliveryLead[], receded: boolean) {
    return (
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
                <th className="px-6 py-3 font-medium">Message</th>
                <th className="px-6 py-3 font-medium">Delivery</th>
                <th className="px-6 py-3 font-medium">Workflow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border/50">
              {rows.map((lead) => {
                const status = statusOf(lead.statusToken);
                const busy = Boolean(pending[lead.statusToken]);
                return (
                  <tr
                    key={lead.statusToken}
                    className={`hover:bg-gray-bg transition-colors align-top ${
                      receded ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-6 py-5">
                      <p className="font-medium text-warm-white">{lead.businessName}</p>
                      {lead.location && (
                        <p className="mt-1 text-xs text-gray-faint">{lead.location}</p>
                      )}
                      {lead.referredBy && (
                        <p className="mt-1 text-xs text-gray-faint">Ref: {lead.referredBy}</p>
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
                          className="block max-w-[180px] truncate font-mono text-xs text-gray-muted hover:text-warm-white"
                        >
                          {stripProtocol(lead.currentWebsite)}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-faint">None</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <p className="max-w-[240px] whitespace-pre-wrap text-xs text-gray-muted">
                        {lead.description || "—"}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <span className="inline-flex rounded-full border border-glass-border px-2 py-0.5 text-xs font-medium capitalize text-warm-white">
                        {lead.deliveryStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${WORKFLOW_BADGE[status]}`}
                      >
                        {WORKFLOW_LABEL[status]}
                      </span>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {status === "dismissed" ? (
                          <button
                            onClick={() => void setStatus(lead.statusToken, "new")}
                            disabled={busy}
                            className="rounded-md border border-glass-border px-2 py-1 text-xs text-warm-white transition-colors hover:bg-gray-bg disabled:opacity-40"
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => void setStatus(lead.statusToken, "contacted")}
                              disabled={busy || status === "contacted"}
                              className="rounded-md border border-glass-border px-2 py-1 text-xs text-warm-white transition-colors hover:bg-gray-bg disabled:opacity-40"
                            >
                              Mark contacted
                            </button>
                            <button
                              onClick={() => void convert(lead)}
                              disabled={busy}
                              className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-on-accent transition-colors hover:opacity-90 disabled:opacity-40"
                            >
                              Convert
                            </button>
                            <button
                              onClick={() => void setStatus(lead.statusToken, "dismissed")}
                              disabled={busy}
                              className="rounded-md border border-glass-border px-2 py-1 text-xs text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white disabled:opacity-40"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {active.length === 0 ? (
        <div className="rounded-xl bg-glass border border-glass-border p-10 text-center">
          <p className="text-sm font-medium text-warm-white">No leads to work</p>
          <p className="mt-1 text-xs text-gray-muted">
            {dismissed.length > 0
              ? "Every lead has been worked or dismissed."
              : "New form submissions land here the moment they come in."}
          </p>
        </div>
      ) : (
        renderTable(active, false)
      )}

      {dismissed.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowDismissed((s) => !s)}
            className="text-xs font-medium text-gray-muted hover:text-warm-white"
          >
            {showDismissed ? "Hide" : "Show"} dismissed ({dismissed.length})
          </button>
          {showDismissed && renderTable(dismissed, true)}
        </div>
      )}
    </div>
  );
}
