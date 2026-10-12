"use client";
import { useEffect, useState } from "react";
import { useWorkspaceRequest } from "./WorkspaceRequest";
export interface AgencyRecipient { agencyWorkspaceId: string; name: string; providerOfRecord: boolean }
export function useServiceRequestProviders(businessId?: string) {
  const request = useWorkspaceRequest();
  const [state, setState] = useState<{ businessId?: string; providers: AgencyRecipient[]; error?: string; loading: boolean }>({ providers: [], loading: Boolean(businessId) });
  useEffect(() => {
    if (!businessId) return;
    const abort = new AbortController();
    void request(`/api/service-requests?providersBusinessId=${encodeURIComponent(businessId)}`, { cache: "no-store", signal: abort.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.providers)) throw new Error("Agency choices could not be loaded. Reload to try again.");
      if (!abort.signal.aborted) setState({ businessId, providers: body.providers, loading: false });
    }).catch(error => { if (!abort.signal.aborted) setState({ businessId, providers: [], loading: false, error: error instanceof Error ? error.message : "Agency choices are unavailable." }); });
    return () => abort.abort();
  }, [businessId, request]);
  return state.businessId === businessId ? state : { providers: [], loading: Boolean(businessId), error: undefined };
}
