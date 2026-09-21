"use client";

import { useEffect, useMemo, useState } from "react";
import { InquiryExperience, InquiryWorkspaceExperience, type InquiryExperienceProps } from "./InquiryExperience";
import type { InquirySurfaceAdapter, InquirySurfaceResult, InquirySurfaceSnapshot } from "./contracts";
import styles from "./inquiry.module.css";

export type InquiryServerExperienceProps = Omit<InquiryExperienceProps, "adapter" | "initialSnapshot" | "scenario"> & {
  tenantId: string;
  endpoint?: string;
  adapter?: InquirySurfaceAdapter;
  initialSnapshot?: InquirySurfaceSnapshot;
};

export type InquiryServerWorkspaceExperienceProps = InquiryServerExperienceProps;

/**
 * Authenticated client bridge. The server owns the initial authorization and
 * the API repeats it for every command. A failed read is rendered as an
 * unavailable state and never falls back to preview data.
 */
export function InquiryServerExperience({
  ...props
}: InquiryServerExperienceProps) {
  return <ServerInquiryBridge key={`${props.endpoint || "default"}:${props.tenantId}:${props.initialView || "home"}:${props.initialRequestText || ""}`} surface="frame" {...props} />;
}

/** Authenticated inquiry work embedded in the shared workspace frame. */
export function InquiryServerWorkspaceExperience({
  ...props
}: InquiryServerWorkspaceExperienceProps) {
  return <ServerInquiryBridge key={`${props.endpoint || "default"}:${props.tenantId}:${props.initialView || "home"}:${props.initialRequestText || ""}`} surface="workspace" {...props} />;
}

function ServerInquiryBridge({
  surface,
  tenantId,
  endpoint = "/api/inquiry-workspace",
  adapter,
  initialSnapshot,
  ...props
}: InquiryServerExperienceProps & { surface: "frame" | "workspace" }) {
  const [snapshot, setSnapshot] = useState<InquirySurfaceSnapshot | null>(() => initialSnapshot || adapter?.getSnapshot() || null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialSnapshot || adapter) return;
    const controller = new AbortController();
    fetch(`${endpoint}?tenantId=${encodeURIComponent(tenantId)}`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(readApiError(body) || "This business could not be loaded.");
        const next = readSnapshot(body);
        if (!next) throw new Error("The business inquiry state could not be verified.");
        if (!controller.signal.aborted) setSnapshot(next);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "This business could not be loaded.");
      });
    return () => controller.abort();
  }, [adapter, endpoint, initialSnapshot, tenantId]);

  const serverAdapter = useMemo(() => {
    if (adapter || !snapshot) return adapter;
    return createHttpAdapter(endpoint, tenantId, snapshot);
  }, [adapter, endpoint, snapshot, tenantId]);

  if (!serverAdapter || !snapshot) return <ServerStatus error={error} />;
  const basePath = props.basePath || (surface === "workspace" ? "/workspace" : `/business/${encodeURIComponent(tenantId)}`);
  return surface === "workspace"
    ? <InquiryWorkspaceExperience {...props} adapter={serverAdapter} initialSnapshot={snapshot} basePath={basePath} routePrefix={props.routePrefix || "inquiry"} />
    : <InquiryExperience {...props} adapter={serverAdapter} initialSnapshot={snapshot} basePath={basePath} />;
}

function createHttpAdapter(endpoint: string, tenantId: string, initial: InquirySurfaceSnapshot): InquirySurfaceAdapter {
  let revision = initial.revision ?? null;
  return {
    getSnapshot: () => initial,
    async execute(action) {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, expectedRevision: revision, action }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(body) || "Refresh to check the latest receipt before trying again.");
      const result = readResult(body);
      if (!result) throw new Error("The inquiry result could not be confirmed. Refresh before trying again.");
      revision = result.snapshot.revision ?? revision;
      return result;
    },
  };
}

function readApiError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

function readSnapshot(value: unknown): InquirySurfaceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as { snapshot?: unknown }).snapshot || value;
  if (!candidate || typeof candidate !== "object") return null;
  const snapshot = candidate as Partial<InquirySurfaceSnapshot>;
  if (!snapshot.business || !snapshot.state || !Array.isArray(snapshot.capabilities) || !Array.isArray(snapshot.connections) || !snapshot.onboarding || typeof snapshot.available !== "boolean" || typeof snapshot.readOnly !== "boolean") return null;
  return candidate as InquirySurfaceSnapshot;
}

function readResult(value: unknown): InquirySurfaceResult | null {
  if (!value || typeof value !== "object") return null;
  const result = (value as { result?: unknown }).result || value;
  if (!result || typeof result !== "object") return null;
  const candidate = result as Partial<InquirySurfaceResult>;
  return readSnapshot(candidate.snapshot) ? result as InquirySurfaceResult : null;
}

function ServerStatus({ error }: { error: string }) {
  return <main className={styles.unavailablePage} role={error ? "alert" : "status"}><div className={styles.unavailablePanel}><span className={styles.eyebrow}>{error ? "INQUIRIES UNAVAILABLE" : "LOADING INQUIRIES"}</span><h1 className="font-display">{error ? "This business could not be loaded." : "Loading this Business scope…"}</h1><p>{error || "Checking the authorized inquiry state."}</p>{error ? <button type="button" className={styles.secondaryButton} onClick={() => window.location.reload()}>Try again</button> : null}</div></main>;
}
