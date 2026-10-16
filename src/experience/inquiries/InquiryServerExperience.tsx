"use client";

import { useEffect, useMemo, useState } from "react";
import { InquiryExperience, InquiryWorkspaceExperience, type InquiryExperienceProps } from "./InquiryExperience";
import type { InquirySurfaceAdapter, InquirySurfaceResult, InquirySurfaceSnapshot } from "./contracts";
import styles from "./inquiry.module.css";
import { XaButton, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { XaPlace, XaPlaceTrouble } from "@/experience/places/XaPlace";

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
        if (!response.ok) throw new Error(readApiError(body) || "Inquiries didn't load.");
        const next = readSnapshot(body);
        if (!next) throw new Error("Inquiries didn't load.");
        if (!controller.signal.aborted) setSnapshot(next);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Inquiries didn't load.");
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

/**
 * Loading and failure for one business, in XA: Pebble is reading it, or
 * Pebble is in frame with what failed and two ways forward. `businessName`
 * is known when the route read it; the API error text is never shown to the
 * owner because it is written for builders.
 */
export function ServerStatus({ error, businessName }: { error: string; businessName?: string }) {
  const whose = businessName ? `${businessName}'s inquiries` : "Your inquiries";
  return <main className={styles.unavailablePage} data-workspace-theme="linen" id="strelva-main"><XaPlace width="read" label={businessName ?? "Your business"}>
    {error ? <XaPlaceTrouble title={`${whose} didn't load.`} quiet="Nothing changed. Try again, or open another business." action={<><XaButton variant="primary" onClick={() => window.location.reload()}>Try again</XaButton><XaTextLink href="/business">Choose another business</XaTextLink></>} />
      : <XaWorking title={businessName ? `Opening ${businessName}…` : "Opening your inquiries…"} steps={[{ id: "read", label: "Reading inquiries and replies", state: "active" }]} />}
  </XaPlace></main>;
}
