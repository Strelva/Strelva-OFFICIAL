"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OfferingCollection, OfferingInstallation } from "@/platform/offerings";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import type { PresentedAgencyDelivery, WorkspaceOfferingState } from "./WorkspaceOfferings";
import styles from "./workspace-offerings.module.css";

export type BusinessAgencyDeliveryState =
  | { status: "loading" }
  | { status: "ready"; deliveries: readonly PresentedAgencyDelivery[] }
  | { status: "error"; message: string };

function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function definitionName(collection: OfferingCollection, installation: OfferingInstallation): string {
  return collection.definitions.find((definition) => definition.id === installation.definitionId && definition.version === installation.definitionVersion)?.name ?? installation.definitionId;
}

export function useBusinessAgencyDeliveries(state: WorkspaceOfferingState): BusinessAgencyDeliveryState {
  const request = useWorkspaceRequest();
  const businessId = state.status === "ready" ? state.collection.businessId : null;
  const installationIds = state.status === "ready"
    ? state.collection.installations.filter((installation) => installation.status !== "retired" && installation.responsibility.kind === "provider_requested").map((installation) => installation.id)
    : [];
  const installationKey = installationIds.join(",");
  const requestEpoch = useRef(0);
  const [deliveryState, setDeliveryState] = useState<BusinessAgencyDeliveryState>(
    businessId && installationIds.length ? { status: "loading" } : { status: "ready", deliveries: [] },
  );

  useEffect(() => {
    requestEpoch.current += 1;
  }, [businessId, installationKey]);

  const load = useCallback(async () => {
    const epoch = requestEpoch.current;
    const requestedInstallationIds = installationKey ? installationKey.split(",") : [];
    if (!businessId || !requestedInstallationIds.length) {
      setDeliveryState({ status: "ready", deliveries: [] });
      return;
    }
    setDeliveryState({ status: "loading" });
    try {
      const response = await request(`/api/offerings/provider-delivery?businessId=${encodeURIComponent(businessId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(value, "Agency delivery status is unavailable."));
      if (epoch !== requestEpoch.current) return;
      setDeliveryState({ status: "ready", deliveries: ((value as { deliveries?: PresentedAgencyDelivery[] } | null)?.deliveries ?? []).filter((delivery) => requestedInstallationIds.includes(delivery.installationId)) });
    } catch (cause) {
      if (epoch !== requestEpoch.current) return;
      setDeliveryState({ status: "error", message: cause instanceof Error ? cause.message : "Agency delivery status is unavailable." });
    }
  }, [businessId, installationKey, request]);

  useEffect(() => { void load(); }, [load]);
  return deliveryState;
}

export function BusinessAgencyStatus({
  state,
  deliveries,
  installations,
  collection,
  onOpen,
}: {
  state: BusinessAgencyDeliveryState;
  deliveries: readonly PresentedAgencyDelivery[];
  installations: readonly OfferingInstallation[];
  collection: OfferingCollection;
  onOpen: (id?: string) => void;
}) {
  const providerInstallations = installations.filter((installation) => installation.responsibility.kind === "provider_requested");
  if (!providerInstallations.length) return null;
  const deliveryByInstallation = new Map(deliveries.map((delivery) => [delivery.installationId, delivery]));
  return <section className={styles.providerSummary} aria-labelledby="home-provider-status">
    <header><h3 id="home-provider-status">Agency requests</h3><span>Actual delivery status</span></header>
    {state.status === "loading" ? <p role="status">Checking agency delivery status…</p> : state.status === "error" ? <div className={styles.providerUnavailable}>
      <p role="alert">Agency delivery status is unavailable. Acceptance cannot be inferred from the offering record.</p>
      <button type="button" onClick={() => onOpen()}>Open agency details</button>
    </div> : <ul>{providerInstallations.map((installation) => {
      const delivery = deliveryByInstallation.get(installation.id);
      return <li key={installation.id}>
        <span><strong>{definitionName(collection, installation)}</strong>{delivery ? <small>{delivery.status === "requested" ? "Agency requested · waiting for acceptance" : delivery.status === "accepted" ? "Agency accepted" : "Agency delivery revoked"}</small> : <small>Agency requested. No delivery status has been returned yet.</small>}
        {delivery ? <small>Your decision: {delivery.customerDecision === "pending" ? "pending" : delivery.customerDecision === "confirmed" ? "confirmed" : "changes requested"}</small> : null}</span>
        <button type="button" onClick={() => onOpen(installation.id)}>Review</button>
      </li>;
    })}</ul>}
  </section>;
}

/** @deprecated Use BusinessAgencyDeliveryState. */
export type BusinessProviderDeliveryState = BusinessAgencyDeliveryState;
/** @deprecated Use useBusinessAgencyDeliveries. */
export const useBusinessProviderDeliveries = useBusinessAgencyDeliveries;
/** @deprecated Use BusinessAgencyStatus. */
export const BusinessProviderStatus = BusinessAgencyStatus;
