"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { XaButtonLink, XaDecision, XaEmpty, XaHeadline, XaRow, XaRows, XaStatus, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { XaBlock, XaNote, XaObjectPage } from "@/components/ui/strelva/Xa";
import { deliverySentence } from "./DeliveryCommitmentPanel";
import styles from "./delivery-panel.module.css";
import { serviceRequestSchema, type ServiceRequest } from "@/platform/service-requests/types";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

export type DeliveryQueueScope = { businessId: string } | { providerWorkspaceId: string } | { providerKind: "strelva" };
const responseSchema = z.object({ requests: z.array(serviceRequestSchema), askedBy: z.record(z.string(), z.string()).optional() });
export function ServiceDeliveryQueue({ scope }: { scope: DeliveryQueueScope }) {
  const params = "businessId" in scope ? `businessId=${encodeURIComponent(scope.businessId)}` : "providerWorkspaceId" in scope ? `providerWorkspaceId=${encodeURIComponent(scope.providerWorkspaceId)}` : "providerKind=strelva";
  const query = `${"businessId" in scope ? "/api/service-requests" : "/api/service-requests/delivery"}?${params}`;
  const backHref = "businessId" in scope ? `/workspace?workspaceId=${encodeURIComponent(scope.businessId)}` : "providerWorkspaceId" in scope ? `/workspace?workspaceId=${encodeURIComponent(scope.providerWorkspaceId)}` : "/admin/work";
  // A new scope gets a fresh view immediately; private rows never survive a switch.
  return <DeliveryQueueView key={query} query={query} backHref={backHref} returnTo={`/workspace/delivery?${params}`} viewer={"businessId" in scope ? "business" : "agency"} />;
}
function DeliveryQueueView({ query, backHref, returnTo, viewer }: { query: string; backHref: string; returnTo: string; viewer: "business" | "agency" }) {
  const transport = useWorkspaceRequest();
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [askedBy, setAskedBy] = useState<Record<string, string>>({});
  const [now] = useState(() => Date.now());
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
      if (!abort.signal.aborted) { setRows(result.data.requests); setAskedBy(result.data.askedBy ?? {}); }
    }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Delivery work is unavailable."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [query, transport, attempt]);
  const refresh = () => { setRows([]); setLoading(true); setError(""); setSignIn(false); setAttempt(value => value + 1); };
  const waits = (item: ServiceRequest) => item.deliveryCommitment?.status === "proposed" || item.deliveryCommitment?.status === "submitted" || Boolean(item.deliveryCommitment?.blocker);
  const closed = (item: ServiceRequest) => item.deliveryCommitment?.status === "accepted" || item.deliveryCommitment?.status === "cancelled" || item.status === "withdrawn";
  const late = (item: ServiceRequest) => !closed(item) && Boolean(item.deliveryCommitment?.dueAt && Date.parse(item.deliveryCommitment.dueAt) <= now);
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(":00", "");
  const sentence = (item: ServiceRequest) => deliverySentence(item.deliveryCommitment, item, viewer, now, { askedBy: askedBy[item.id] ?? null });
  // A row says something only when it is the exception: someone's move, blocked, late or done.
  const detail = (item: ServiceRequest) => waits(item) || late(item) ? sentence(item) : closed(item) ? sentence(item) : undefined;
  const open = rows.filter(item => !closed(item));
  const next = rows.find(waits) ?? open[0] ?? rows[0];
  if (loading) return <XaObjectPage story={<XaWorking title="Checking delivery work" steps={[{ id: "read", label: "Reading Requests with agreed scope and deadlines", state: "active" }]} />} />;
  if (error) return <XaObjectPage story={<div role="alert"><XaEmpty pose="fixing" title="Delivery work couldn't be read" job="Nothing changed in any Request."
    action={signIn ? <XaButtonLink variant="primary" size="lg" href={`/sign-in?next=${encodeURIComponent(returnTo)}`}>Sign in to review delivery work</XaButtonLink> : undefined}
    secondary={<XaTextLink onClick={refresh}>Try again</XaTextLink>}>{error}</XaEmpty>
    <p className="sr-only"><XaTextLink href={backHref}>Back to work</XaTextLink></p></div>} />;
  if (!rows.length) return <XaObjectPage story={<XaEmpty pose="resting" title="No delivery work here" job="New Requests show here once scope and a deadline are agreed."
    secondary={<XaTextLink href={backHref}>Back to work</XaTextLink>}>No Request in this place has an agreed delivery yet.</XaEmpty>} />;
  return <XaObjectPage label="Delivery work" phone="object-first"
    head={<XaHeadline quiet={next && !closed(next) ? `Next: ${next.outcome}. ${sentence(next)}` : "Nothing waits on anyone."}>{open.length} {open.length === 1 ? "Request" : "Requests"} open.</XaHeadline>}
    story={<>
      <XaBlock label="Every request" action={<XaTextLink onClick={refresh}>Check again</XaTextLink>}>
        <XaRows label="Delivery work">{rows.map(item => <XaRow key={item.id} href={`/workspace/delivery/${item.id}`} current={item.id === next?.id}
          title={item.outcome} detail={detail(item)} tone={waits(item) || late(item) ? "waits" : undefined} />)}</XaRows>
      </XaBlock>
    </>}
    object={next ? <XaDecision label="Next up" status={waits(next) ? <XaStatus kind="waits">{askedBy[next.id] && (next.deliveryCommitment?.status === "submitted" || next.deliveryCommitment?.status === "proposed") ? `Waiting on ${askedBy[next.id]}` : next.deliveryCommitment?.blocker ? "Blocked" : "Waiting"}</XaStatus> : closed(next) ? <XaStatus kind="live">Done</XaStatus> : <XaStatus kind="working">In progress</XaStatus>}
      meta={next.deliveryCommitment?.dueAt && !closed(next) ? `Due ${when(next.deliveryCommitment.dueAt)}` : undefined}
      yes={<XaButtonLink variant="primary" size="lg" block href={`/workspace/delivery/${next.id}`}>Open it</XaButtonLink>}>
      <p className={styles.title}>{next.outcome}</p>
      <XaNote>{sentence(next)}</XaNote>
      <p className={styles.copyNote}>{next.deliveryCommitment?.deliveryDefinition || next.request}</p>
    </XaDecision> : undefined} />;
}
