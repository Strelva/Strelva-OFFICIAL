"use client";

import { Check, X, AlertTriangle, Info } from "lucide-react";
import type { PreviewDiff, RiskAssessment } from "@/lib/agent-risk";

interface AgentPreviewProps {
  section: string;
  diffs: PreviewDiff[];
  risk: RiskAssessment;
  onApprove: () => void;
  onReject: () => void;
  isApplying?: boolean;
}

export function AgentPreview({
  section,
  diffs,
  risk,
  onApprove,
  onReject,
  isApplying,
}: AgentPreviewProps) {
  const riskColors = {
    low: "text-positive bg-positive border-positive",
    medium: "text-warning bg-warning border-warning",
    high: "text-critical bg-critical border-critical",
  };

  const RiskIcon = risk.level === "high" ? AlertTriangle : Info;

  return (
    <div className="border border-gray-border rounded-lg bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-border bg-surface-base flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-medium text-warm-black">
            Preview Changes to {section}
          </h3>
          <div
            className={`inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${riskColors[risk.level]}`}
          >
            <RiskIcon className="w-3 h-3" />
            {risk.level.toUpperCase()} RISK
          </div>
        </div>
      </div>

      {/* Risk explanation */}
      <div className="px-4 py-2 bg-surface-base border-b border-gray-border">
        <p className="text-[11px] text-gray-muted">{risk.reason}</p>
      </div>

      {/* Diffs */}
      <div className="max-h-[300px] overflow-y-auto">
        {diffs.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[12px] text-gray-faint">No visible changes</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-border">
            {diffs.map((diff, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-medium text-gray-faint uppercase tracking-wider">
                    {diff.field}
                  </span>
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded ${
                      diff.type === "added"
                        ? "bg-positive text-positive"
                        : diff.type === "removed"
                          ? "bg-critical text-critical"
                          : "bg-accent text-accent"
                    }`}
                  >
                    {diff.type}
                  </span>
                </div>

                {diff.type === "changed" && (
                  <div className="space-y-2">
                    <div className="bg-critical border border-critical rounded-md px-3 py-2">
                      <p className="text-[11px] text-critical line-through">
                        {truncate(diff.before, 200)}
                      </p>
                    </div>
                    <div className="bg-positive border border-positive rounded-md px-3 py-2">
                      <p className="text-[11px] text-positive">{truncate(diff.after, 200)}</p>
                    </div>
                  </div>
                )}

                {diff.type === "added" && (
                  <div className="bg-positive border border-positive rounded-md px-3 py-2">
                    <p className="text-[11px] text-positive">{truncate(diff.after, 200)}</p>
                  </div>
                )}

                {diff.type === "removed" && (
                  <div className="bg-critical border border-critical rounded-md px-3 py-2">
                    <p className="text-[11px] text-critical line-through">
                      {truncate(diff.before, 200)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-border bg-surface-base flex items-center gap-2">
        <button
          onClick={onApprove}
          disabled={isApplying}
          className="flex-1 h-[32px] rounded-lg bg-accent text-on-accent text-[12px] font-medium hover:bg-accent/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          {isApplying ? "Dismissing..." : "Dismiss Preview"}
        </button>
        <button
          onClick={onReject}
          disabled={isApplying}
          className="h-[32px] px-4 rounded-lg bg-surface border border-gray-border text-gray-muted text-[12px] font-medium hover:border-gray-muted transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}
