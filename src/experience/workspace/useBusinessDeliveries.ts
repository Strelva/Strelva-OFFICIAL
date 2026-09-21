"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { serviceRequestSchema } from "@/platform/service-requests/types";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { businessDeliveryItems, type BusinessDeliveryItem } from "./business-delivery-summary";

const responseSchema = z.object({ requests: z.array(serviceRequestSchema) });
type Result = { businessId: string; status: "ready"; items: BusinessDeliveryItem[] } | { businessId: string; status: "error"; message: string };
export function useBusinessDeliveries(businessId: string | undefined) {
  const transport = useWorkspaceRequest();
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!businessId) return;
    const abort = new AbortController();
    transport(`/api/service-requests?businessId=${encodeURIComponent(businessId)}`, { cache: "no-store", signal: abort.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Delivery status is unavailable. Your other saved work is unchanged.");
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success || parsed.data.requests.some(request => request.businessId !== businessId)) throw new Error("The delivery scope could not be confirmed.");
      if (!abort.signal.aborted) setResult({ businessId, status: "ready", items: businessDeliveryItems(parsed.data.requests) });
    }).catch(cause => { if (!abort.signal.aborted) setResult({ businessId, status: "error", message: cause instanceof Error ? cause.message : "Delivery status is unavailable." }); });
    return () => abort.abort();
  }, [businessId, transport, attempt]);
  const state = !businessId ? { status: "disabled" as const } : result?.businessId === businessId ? result : { status: "loading" as const };
  return { state, refresh: () => { setResult(null); setAttempt(value => value + 1); } };
}
