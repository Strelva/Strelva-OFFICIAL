"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OfferingCollection, OfferingInstallation } from "@/platform/offerings";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import type { PresentedProviderDelivery, WorkspaceOfferingState } from "./WorkspaceOfferings";
import styles from "./workspace-offerings.module.css";

export type BusinessProviderDeliveryState =
  | { status: "loading" }
  | { status: "ready"; deliveries: readonly PresentedProviderDelivery[] }
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

export function useBusinessProviderDeliveries(state: WorkspaceOfferingState): BusinessProviderDeliveryState {
  const request = useWorkspaceRequest();
  const businessId = state.status === "ready" ? state.collection.businessId : null;
  const installationIds = state.status === "ready"
    ? state.collection.installations.filter((installation) => installation.status !== "retired" && installation.responsibility.kind === "provider_requested").map((installation) => installation.id)
    : [];
  const installationKey = installationIds.join(",");
  const requestEpoch = useRef(0);
  const [deliveryState, setDeliveryState] = useState<BusinessProviderDeliveryState>(
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
      if (!response.ok) throw new Error(errorMessage(value, "Provider delivery status is unavailable."));
      if (epoch !== requestEpoch.current) return;
      setDeliveryState({ status: "ready", deliveries: ((value as { deliveries?: PresentedProviderDelivery[] } | null)?.deliveries ?? []).filter((delivery) => requestedInstallationIds.includes(delivery.installationId)) });
    } catch (cause) {
      if (epoch !== requestEpoch.current) return;
      setDeliveryState({ status: "error", message: cause instanceof Error ? cause.message : "Provider delivery status is unavailable." });
    }
  }, [businessId, installationKey, request]);

  useEffect(() => { void load(); }, [load]);
  return deliveryState;
}

export function BusinessProviderStatus({
  state,
  deliveries,
  installations,
  collection,
  onOpen,
}: {
  state: BusinessProviderDeliveryState;
  deliveries: readonly PresentedProviderDelivery[];
  installations: readonly OfferingInstallation[];
  collection: OfferingCollection;
  onOpen: (id?: string) => void;
}) {
  const providerInstallations = installations.filter((installation) => installation.responsibility.kind === "provider_requested");
  if (!providerInstallations.length) return null;
  const deliveryByInstallation = new Map(deliveries.map((delivery) => [delivery.installationId, delivery]));
  return <section className={styles.providerSummary} aria-labelledby="home-provider-status">
    <header><h3 id="home-provider-status">Provider requests</h3><span>Actual delivery status</span></header>
    {state.status === "loading" ? <p role="status">Checking provider delivery status…</p> : state.status === "error" ? <div className={styles.providerUnavailable}>
      <p role="alert">Provider delivery status is unavailable. Acceptance cannot be inferred from the offering record.</p>
      <button type="button" onClick={() => onOpen()}>Open provider details</button>
    </div> : <ul>{providerInstallations.map((installation) => {
      const delivery = deliveryByInstallation.get(installation.id);
      return <li key={installation.id}>
        <span><strong>{definitionName(collection, installation)}</strong>{delivery ? <small>{delivery.status === "requested" ? "Provider requested · waiting for acceptance" : delivery.status === "accepted" ? "Provider accepted" : "Provider delivery revoked"}</small> : <small>Provider requested. No delivery status has been returned yet.</small>}
        {delivery ? <small>Customer decision: {delivery.customerDecision === "pending" ? "pending" : delivery.customerDecision === "confirmed" ? "confirmed" : "changes requested"}</small> : null}</span>
        <button type="button" onClick={() => onOpen(installation.id)}>Review</button>
      </li>;
    })}</ul>}
  </section>;
}
