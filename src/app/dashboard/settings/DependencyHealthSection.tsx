"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { SkeletonLine } from "@/components/ui/Skeleton";
import type { CustomRepoExternalDependency } from "@/lib/types";
import { useDashboardApiPath } from "./useDashboardApiPath";

type DependencyHealthData = {
  deliveryModel: string;
  dependencies: CustomRepoExternalDependency[];
  blockingDependencies: CustomRepoExternalDependency[];
  hasBlockingDependency: boolean;
  summary: { status: string; severity: string };
};

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  degraded: { label: "Degraded", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  paused: { label: "Paused", className: "border-red-400/30 bg-red-400/10 text-red-300" },
  failing: { label: "Failing", className: "border-red-400/30 bg-red-400/10 text-red-300" },
  unknown: { label: "Unknown", className: "border-glass-border text-gray-faint" },
};

export function DependencyHealthSection() {
  const apiPath = useDashboardApiPath();
  const [data, setData] = useState<DependencyHealthData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch(apiPath("/api/custom-repo/dependencies"), { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("Could not load dependency health");
        return res.json();
      })
      .then((next) => {
        setError("");
        setData(next);
      })
      .catch(() => setError("Could not load dependency health."));
  }, [apiPath]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-4 text-[12px] text-red-200">
        {error}
      </div>
    );
  }
  if (!data) return <SkeletonLine width="w-full" height="h-24" />;
  if (data.deliveryModel !== "custom_repo") {
    return (
      <div className="rounded-lg border border-glass-border bg-glass p-4">
        <p className="text-[13px] text-warm-white">No connected services to monitor</p>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">
          This site doesn&apos;t rely on any outside services we need to keep an eye on.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.hasBlockingDependency && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-300/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" strokeWidth={1.7} />
            <div>
              <p className="text-[13px] font-medium text-amber-50">
                A custom repo dependency needs attention before the client site depends on it.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-100/80">
                Strelva is showing this here so paused services are caught before they look like a storefront or AI issue.
              </p>
            </div>
          </div>
        </div>
      )}

      {data.dependencies.length === 0 && (
        <div className="rounded-lg border border-glass-border bg-glass p-4">
          <p className="text-[13px] text-warm-white">No external dependencies recorded</p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">
            Add dependencies to the tenant custom repo metadata as they become operationally important.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {data.dependencies.map((dependency) => {
          const status = STATUS_COPY[dependency.status] || STATUS_COPY.unknown;
          return (
            <div key={dependency.id} className="rounded-lg border border-glass-border bg-glass p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-warm-white">{dependency.name}</p>
                  <p className="mt-1 text-[12px] text-gray-muted">{dependency.provider} · {dependency.purpose}</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
              {(dependency.source || dependency.detectedAt) && (
                <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-gray-faint">
                  {dependency.source || "Recorded dependency"}{dependency.detectedAt ? ` · ${dependency.detectedAt}` : ""}
                </p>
              )}
              {dependency.notes && (
                <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">{dependency.notes}</p>
              )}
              {dependency.actionUrl && (
                <a
                  href={dependency.actionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent/80"
                >
                  Open dependency
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
