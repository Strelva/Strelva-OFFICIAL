"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { serviceRequestSchema, type ServiceRequest } from "@/platform/service-requests/types";
import { deliveryCommitmentStatus } from "@/platform/service-requests/delivery-commitment";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

export type DeliveryQueueScope = { businessId: string } | { providerWorkspaceId: string } | { providerKind: "strelva" };
const responseSchema = z.object({ requests: z.array(serviceRequestSchema) });
export function ServiceDeliveryQueue({ scope }: { scope: DeliveryQueueScope }) {
  const params = "businessId" in scope ? `businessId=${encodeURIComponent(scope.businessId)}` : "providerWorkspaceId" in scope ? `providerWorkspaceId=${encodeURIComponent(scope.providerWorkspaceId)}` : "providerKind=strelva";
  const query = `${"businessId" in scope ? "/api/service-requests" : "/api/service-requests/delivery"}?${params}`;
  const backHref = "businessId" in scope ? `/workspace?workspaceId=${encodeURIComponent(scope.businessId)}` : "providerWorkspaceId" in scope ? `/workspace?workspaceId=${encodeURIComponent(scope.providerWorkspaceId)}` : "/admin/work";
  // A new scope gets a fresh view immediately; private rows never survive a switch.
  return <DeliveryQueueView key={query} query={query} backHref={backHref} returnTo={`/workspace/delivery?${params}`} />;
}
function DeliveryQueueView({ query, backHref, returnTo }: { query: string; backHref: string; returnTo: string }) {
  const transport = useWorkspaceRequest();
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    transport(query, { cache: "no-store", signal: abort.signal }).then(async response => {
      if (abort.signal.aborted) return;
      if (response.status === 401 || (response.redirected && new URL(response.url).pathname.startsWith("/sign-in"))) { setSignIn(true); throw new Error("Sign in to review delivery work."); }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Delivery work could not be loaded. Access or storage may be unavailable.");
      const result = responseSchema.safeParse(body);
      if (!result.success) throw new Error("The delivery list could not be confirmed.");
      if (!abort.signal.aborted) setRows(result.data.requests);
    }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Delivery work is unavailable."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [query, transport, attempt]);
  return <section className="space-y-6" aria-labelledby="delivery-queue-title"><header className="space-y-3"><h1 id="delivery-queue-title" className="font-display text-3xl">Delivery work</h1><p className="text-gray-muted">Review accepted scope, original deadlines, blockers, and submitted results. Publication and payments remain separate actions.</p><Link href={backHref}>Back to work</Link></header>
    {loading ? <p role="status">Checking delivery work…</p> : error ? <p role="alert">{error}</p> : rows.length ? <ul className="space-y-4">{rows.map(item => <li key={item.id} className="space-y-3 rounded-3xl border border-gray-border bg-surface p-6"><h2 className="text-xl"><Link href={`/workspace/delivery/${item.id}`}>{item.outcome}</Link></h2><p>{item.deliveryCommitment ? deliveryCommitmentStatus(item.deliveryCommitment) : item.providerAcceptance.status === "accepted" ? "Accepted for review; no delivery clock has started." : item.providerAcceptance.status === "declined" ? "Provider declined this request." : item.status === "withdrawn" ? "Request withdrawn." : "Waiting for provider review."}</p>{item.deliveryCommitment?.dueAt ? <p className="text-sm">Original deadline: {new Date(item.deliveryCommitment.dueAt).toLocaleString()}</p> : null}{item.deliveryCommitment?.blocker ? <p>Blocked: {item.deliveryCommitment.blocker.note}</p> : null}<p className="text-sm text-gray-muted">{item.request}</p><Link href={`/workspace/delivery/${item.id}`}>Open delivery and next actions</Link></li>)}</ul> : <p>No delivery work is currently available in this scope.</p>}
    {signIn ? <Link href={`/sign-in?next=${encodeURIComponent(returnTo)}`}>Sign in to review delivery work</Link> : null}
    <Button variant="secondary" disabled={loading} onClick={() => { setRows([]); setLoading(true); setError(""); setSignIn(false); setAttempt(value => value + 1); }}>Refresh delivery work</Button>
  </section>;
}
