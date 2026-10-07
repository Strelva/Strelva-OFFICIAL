"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { QueueItem } from "@/platform/operator-queue/contracts";
import type { ServiceRequest } from "@/platform/service-requests/types";
import type { QueueActionResult } from "./actions";
import { readQueueServiceRequestAction, runQueueSourceAction, type QueueSourceAction } from "./source-actions";

/** Native source actions remain beside their item; no new provider dispatcher. */
export function QueueSourceActions({ item, onResult }: { item: QueueItem; onResult(result: QueueActionResult): void }) {
  const [pending, start] = useTransition();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [commandId] = useState(() => crypto.randomUUID());
  const router = useRouter();
  function run(action: QueueSourceAction) {
    start(async () => {
      const result = await runQueueSourceAction({ key: item.key, action, commandId, ...(request ? { expectedRevision: request.revision } : {}) });
      onResult(result);
      if (result.ok) { setRequest(null); router.refresh(); }
    });
  }
  const action = item.kind === "lead_unkept" ? "retry_lead" : item.kind === "site_health" ? "check_health"
    : item.kind === "domain_alert" || item.kind === "domain_unverified" ? "check_domain" : null;
  if (action) return <div className="mb-3"><Button size="sm" loading={pending} onClick={() => run(action)}>
    {action === "retry_lead" ? "Retry lead copy" : action === "check_health" ? "Recheck site" : "Recheck domain"}
  </Button></div>;
  if (item.kind === "change_request") return <div className="mb-3 flex flex-wrap gap-2">
    <Button size="sm" disabled={pending} onClick={() => run("triage")}>Mark triaged</Button>
    <Button size="sm" disabled={pending} onClick={() => run("quote")}>Move to quote</Button>
  </div>;
  if (item.kind !== "service_request") return null;
  return <div className="mb-3 space-y-3">
    {!request ? <Button size="sm" loading={pending} onClick={() => start(async () => {
      const result = await readQueueServiceRequestAction(item.key);
      if (result.ok) setRequest(result.request);
      else onResult(result);
    })}>Review request</Button> : <>
      <p className="text-[13px] text-warm-white">{request.request}</p>
      <p className="text-[12px] text-gray-muted">Requested result: {request.outcome}</p>
      <ul className="list-inside list-disc text-[12px] text-gray-muted">{request.scope.map(scope => <li key={scope}>{scope}</li>)}</ul>
      <p className="text-[12px] text-gray-muted">Accepting means Strelva will consider this work. Scope and deadline still need agreement.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run("accept_request")}>Accept request</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("decline_request")}>Decline request</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRequest(null)}>Cancel</Button>
      </div>
    </>}
  </div>;
}
