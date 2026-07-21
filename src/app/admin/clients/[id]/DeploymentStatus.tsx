"use client";

import { useState } from "react";
import { ExternalLink, GitBranch, Rocket, RefreshCw } from "lucide-react";
import type { VercelProjectStatus } from "@/lib/vercel";
import { Chip } from "../../console";

/** Vercel deploy + git state for one client's site, surfaced in the cockpit so the
 *  operator sees it in-platform instead of opening the Vercel dashboard. Null status
 *  (token missing / never deployed) renders a calm "not connected yet" line.
 *
 *  When the deployment is in ERROR or CANCELED state, a "Retry deploy" button appears
 *  that POSTs to /api/admin/tenants/[id]/redeploy and reports the result inline. */
export function DeploymentStatus({
  status,
  tenantId,
}: {
  status: VercelProjectStatus | null;
  tenantId: string;
}) {
  const [retryState, setRetryState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [retryError, setRetryError] = useState<string | null>(null);
  const [newDeployId, setNewDeployId] = useState<string | null>(null);

  async function handleRetry() {
    setRetryState("loading");
    setRetryError(null);
    setNewDeployId(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/redeploy`, {
        method: "POST",
      });
      const data = (await res.json()) as { deploymentId?: string; state?: string; error?: string };
      if (!res.ok) {
        setRetryState("error");
        setRetryError(data.error ?? `HTTP ${res.status}`);
      } else {
        setRetryState("success");
        setNewDeployId(data.deploymentId ?? null);
      }
    } catch (err) {
      setRetryState("error");
      setRetryError(err instanceof Error ? err.message : "Request failed");
    }
  }

  if (!status) {
    return (
      <section className="rounded-2xl border border-glass-border bg-glass p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-dim text-accent">
            <Rocket className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <h2 className="text-[15px] font-medium text-warm-white">Deployment</h2>
        </div>
        <p className="mt-3 text-[12.5px] text-gray-muted">Vercel not connected — no project found or token not set.</p>
      </section>
    );
  }

  const state = status.state;
  const isErrored = state === "ERROR" || state === "CANCELED";
  const tone = state === "READY" ? "good" : isErrored ? "crit" : state ? "warn" : "neutral";
  const label =
    state === "READY" ? "Live" :
    state === "ERROR" ? "Build failed" :
    state === "CANCELED" ? "Canceled" :
    state ? "Building" :
    "Not deployed yet";

  const deployedLabel = status.deployedAt
    ? new Date(status.deployedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <section className="rounded-2xl border border-glass-border bg-glass p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-dim text-accent">
            <Rocket className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <h2 className="text-[15px] font-medium text-warm-white">Deployment</h2>
          <Chip tone={tone}>{label}</Chip>
        </div>
        <a
          href={status.inspectorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-muted transition-colors hover:text-warm-white"
        >
          Open in Vercel <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
        </a>
      </div>

      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-base px-3 py-2">
          <dt className="text-[12px] text-gray-muted">Last deploy</dt>
          <dd className="text-[12.5px] font-medium text-warm-white tabular-nums">{deployedLabel ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-base px-3 py-2">
          <dt className="flex items-center gap-1.5 text-[12px] text-gray-muted">
            <GitBranch className="h-3.5 w-3.5" strokeWidth={1.7} /> Repo
          </dt>
          <dd className="text-[12.5px] font-medium text-warm-white">
            {status.gitLinked ? "Connected" : <span className="text-warning">Not linked</span>}
          </dd>
        </div>
      </dl>

      {status.commitMessage && (
        <p className="mt-2.5 truncate text-[12px] text-gray-muted">
          <span className="text-gray-faint">Last change:</span> {status.commitMessage}
          {status.commitRef ? <span className="text-gray-faint"> · {status.commitRef}</span> : null}
        </p>
      )}

      {isErrored && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRetry}
            disabled={retryState === "loading" || retryState === "success"}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-glass-border bg-surface-base px-3 py-2 text-[12px] font-medium text-warm-white transition-colors hover:border-gray-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${retryState === "loading" ? "animate-spin" : ""}`}
              strokeWidth={1.8}
            />
            {retryState === "loading" ? "Queuing deploy…" : "Retry deploy"}
          </button>

          {retryState === "success" && (
            <span className="text-[12px] font-medium text-positive">
              Queued{newDeployId ? ` · ${newDeployId.slice(0, 12)}` : ""} — refresh Vercel to track progress.
            </span>
          )}
          {retryState === "error" && retryError && (
            <span className="text-[12px] font-medium text-critical">{retryError}</span>
          )}
        </div>
      )}
    </section>
  );
}
