"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ServiceRequest } from "@/platform/service-requests";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

type ResponseBody = { requests?: ServiceRequest[]; request?: ServiceRequest; error?: { message?: string } };

function requestName(item: ServiceRequest): string {
  const name = item.context.workspaceName;
  return typeof name === "string" && name.trim() ? name : item.businessId;
}

/** Scope values are stored identifiers; show them as words, never as raw keys. */
function scopeLabel(scope: string): string {
  const words = scope.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function providerResponseKey(item: ServiceRequest, decision: "accepted" | "declined"): string {
  return `service-request-response:${item.id}:${item.revision}:${decision}`;
}

export function ServiceRequestInbox({ providerWorkspaceId, surface = "admin" }: {
  /** The server-resolved agency workspace. Omit this for the Strelva inbox. */
  providerWorkspaceId?: string;
  surface?: "admin" | "workspace";
}) {
  const dark = surface === "admin";
  const transport = useWorkspaceRequest();
  const inboxQuery = providerWorkspaceId
    ? `/api/service-requests?providerWorkspaceId=${encodeURIComponent(providerWorkspaceId)}`
    : "/api/service-requests?providerKind=strelva";
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [responding, setResponding] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const inboxContextRef = useRef(inboxQuery);
  inboxContextRef.current = inboxQuery;

  useEffect(() => {
    setMessage("");
    setError("");
    setResponding(null);
  }, [inboxQuery]);

  const load = useCallback(async (signal: AbortSignal) => {
    const requestContext = inboxQuery;
    setLoading(true);
    setError("");
    try {
      const response = await transport(inboxQuery, { cache: "no-store", signal });
      const body = await response.json().catch(() => null) as ResponseBody | null;
      if (!response.ok) throw new Error(body?.error?.message || "Service requests could not be loaded.");
      if (!signal.aborted && inboxContextRef.current === requestContext) setRequests(Array.isArray(body?.requests) ? body.requests : []);
    } catch (cause) {
      if (!signal.aborted && inboxContextRef.current === requestContext) setError(cause instanceof Error ? cause.message : "Service requests could not be loaded.");
    } finally {
      if (!signal.aborted && inboxContextRef.current === requestContext) setLoading(false);
    }
  }, [inboxQuery, transport]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  async function respond(item: ServiceRequest, decision: "accepted" | "declined") {
    const requestContext = inboxQuery;
    setResponding(item.id);
    setError("");
    setMessage("");
    try {
      const response = await transport("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "respond", requestId: item.id, expectedRevision: item.revision, decision, idempotencyKey: providerResponseKey(item, decision) }),
      });
      const body = await response.json().catch(() => null) as ResponseBody | null;
      if (!response.ok || !body?.request) throw new Error(body?.error?.message || "The provider response could not be saved.");
      if (inboxContextRef.current !== requestContext) return;
      setRequests((current) => current.filter((candidate) => candidate.id !== item.id));
      setMessage(decision === "accepted"
        ? "Accepted for review. No installation, price, authority, or execution was created."
        : "Declined. No installation, price, authority, or execution was created.");
    } catch (cause) {
      if (inboxContextRef.current !== requestContext) return;
      setError(cause instanceof Error ? cause.message : "The provider response could not be saved.");
    } finally {
      if (inboxContextRef.current === requestContext) setResponding(null);
    }
  }

  if (loading) return <p role="status" className="text-sm text-gray-muted">Checking pre-installation service requests…</p>;
  if (error) return <section className={dark ? "rounded-xl border border-warning/25 bg-warning/10 p-4" : "border-y border-gray-border py-4"}><p role="alert" className="text-sm text-gray-muted">{error}</p><Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => setRetry((value) => value + 1)}>Check again</Button></section>;

  return <section aria-labelledby="service-request-inbox-title" className="space-y-4">
    {message ? <p role="status" className="rounded-lg border border-accent/20 bg-accent-dim px-3 py-2 text-[12px] leading-5 text-accent">{message}</p> : null}
    <p id="service-request-inbox-title" className="text-[12px] leading-5 text-gray-muted">These requests are saved before work begins. Your response records review; it does not set commercial terms, grant access, or start work.</p>
    {requests.length ? <ul className="space-y-3">{requests.map((item) => <li key={item.id} className={dark ? "rounded-xl border border-glass-border bg-glass p-4" : "rounded-xl border border-gray-border bg-surface p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">{requestName(item)} · pending review</p><h3 className={dark ? "mt-1 text-[14px] font-semibold text-warm-white" : "mt-1 text-[14px] font-semibold text-warm-black"}>{item.request}</h3><p className="mt-1 text-[12px] text-gray-muted">{item.scope.map(scopeLabel).join(" · ")}</p></div><span className="rounded-md bg-warning/12 px-2 py-1 text-[11px] font-semibold text-warning">Needs your response</span></div>
      <p className="mt-3 text-[12px] leading-5 text-gray-muted"><strong className={dark ? "font-medium text-warm-white" : "font-medium text-warm-black"}>Desired outcome:</strong> {item.outcome}</p>
      <div className="mt-4 flex flex-wrap gap-3"><Button type="button" size="sm" disabled={responding === item.id} loading={responding === item.id} onClick={() => void respond(item, "accepted")}>Accept for review</Button><Button type="button" size="sm" variant="secondary" disabled={responding === item.id} onClick={() => void respond(item, "declined")}>Decline</Button></div>
    </li>)}</ul> : <p className="rounded-xl border border-gray-border p-4 text-sm text-gray-muted">No pre-installation service requests are waiting for provider review.</p>}
  </section>;
}
