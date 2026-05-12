"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { useDashboardOptional } from "./DashboardContext";
import type { CustomRepoExternalDependency } from "@/lib/types";

interface DependencyHealthResponse {
  blockingDependencies?: CustomRepoExternalDependency[];
  hasBlockingDependency?: boolean;
}

export function CustomRepoDependencyBanner() {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref;
  const [dependency, setDependency] = useState<CustomRepoExternalDependency | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;

    const url = dashboardHref ? dashboardHref("/api/custom-repo/dependencies") : "/api/custom-repo/dependencies";
    fetch(url, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DependencyHealthResponse | null) => {
        if (cancelled || !data?.hasBlockingDependency) return;
        setDependency(data.blockingDependencies?.[0] ?? null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [dashboardHref, dismissed]);

  if (dismissed || !dependency) return null;

  return (
    <div className="shrink-0 border-b border-amber-400/30 bg-amber-300/12 px-4 py-3 text-amber-100">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" strokeWidth={1.7} />
        <div className="min-w-0 flex-1 text-[12px] leading-relaxed">
          <p>
            <span className="font-medium text-amber-50">{dependency.name} is {dependency.status}.</span>{" "}
            {dependency.notes || "A custom repo dependency needs attention before it affects the live site."}
          </p>
          <Link
            href={dashboardHref ? dashboardHref("/dashboard/settings#dependencies") : "/dashboard/settings#dependencies"}
            className="mt-1 inline-flex text-amber-50 underline decoration-amber-200/60 underline-offset-2 hover:text-white"
          >
            Review dependency health
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 text-amber-100/70 transition-colors hover:bg-amber-200/10 hover:text-amber-50"
          aria-label="Dismiss dependency warning"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
