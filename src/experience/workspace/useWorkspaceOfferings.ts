"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OfferingCollection, OfferingCommand, OfferingInstallation, OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import { useWorkspaceRequest } from "./WorkspaceRequest";


export type WorkspaceOfferingMutationConflict = {
  kind: "installation" | "website_binding" | "definition";
  id: string;
  message: string;
  attemptedRevision?: number;
  authoritativeRevision?: number;
};

export type WorkspaceOfferingState =
  | { status: "unavailable"; reason: string }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      collection: OfferingCollection;
      saving: boolean;
      mutationError?: string;
      mutationConflict?: WorkspaceOfferingMutationConflict;
    };

export function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function useWorkspaceOfferings({
  businessId,
  enabled,
  unavailableReason,
}: {
  businessId: string;
  enabled: boolean;
  unavailableReason: string;
}) {
  const request = useWorkspaceRequest();
  const requestEpoch = useRef(0);
  const [state, setState] = useState<WorkspaceOfferingState>(
    enabled ? { status: "loading" } : { status: "unavailable", reason: unavailableReason },
  );

  useEffect(() => {
    requestEpoch.current += 1;
    return () => { requestEpoch.current += 1; };
  }, [businessId, enabled]);

  const fetchCollection = useCallback(async (): Promise<OfferingCollection> => {
    const response = await request(`/api/offerings?businessId=${encodeURIComponent(businessId)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorMessage(value, "Offerings could not be loaded for this business."));
    return value as OfferingCollection;
  }, [businessId, request]);

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ status: "unavailable", reason: unavailableReason });
      return;
    }
    const epoch = requestEpoch.current;
    setState({ status: "loading" });
    try {
      const collection = await fetchCollection();
      if (epoch !== requestEpoch.current) return;
      setState({ status: "ready", collection, saving: false });
    } catch (cause) {
      if (epoch !== requestEpoch.current) return;
      setState({
        status: "error",
        message: cause instanceof Error ? cause.message : "Offerings could not be loaded for this business.",
      });
    }
  }, [enabled, fetchCollection, unavailableReason]);

  useEffect(() => { void load(); }, [load]);

  const refreshAfterConflict = useCallback(async (conflict: WorkspaceOfferingMutationConflict) => {
    const epoch = requestEpoch.current;
    setState((current) => current.status === "ready"
      ? { ...current, saving: true, mutationError: undefined, mutationConflict: conflict }
      : current);
    try {
      const collection = await fetchCollection();
      if (epoch !== requestEpoch.current) return;
      let authoritativeRevision = conflict.authoritativeRevision;
      if (conflict.kind === "installation") {
        authoritativeRevision = collection.installations.find((item) => item.id === conflict.id)?.revision;
      } else if (conflict.kind === "website_binding") {
        authoritativeRevision = collection.websiteBindings.find((item) => item.id === conflict.id)?.revision;
      }
      setState((current) => current.status === "ready" ? {
        status: "ready",
        collection,
        saving: false,
        mutationConflict: { ...conflict, authoritativeRevision },
      } : current);
    } catch (cause) {
      if (epoch !== requestEpoch.current) return;
      setState((current) => current.status === "ready" ? {
        ...current,
        saving: false,
        mutationError: cause instanceof Error ? cause.message : "The latest offering version could not be loaded.",
        mutationConflict: conflict,
      } : current);
    }
  }, [fetchCollection]);

  function conflictTarget(input: OfferingCommand, message: string): WorkspaceOfferingMutationConflict {
    if (input.action === "install") return { kind: "definition", id: input.definitionId, message };
    return {
      kind: "installation",
      id: input.installationId,
      message,
      attemptedRevision: input.expectedRevision,
    };
  }

  const command = useCallback(async (input: OfferingCommand) => {
    if (!enabled || state.status !== "ready" || state.saving) return null;
    const epoch = requestEpoch.current;
    setState((current) => current.status === "ready" ? { ...current, saving: true, mutationError: undefined, mutationConflict: undefined } : current);
    try {
      const response = await request("/api/offerings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(input),
      });
      const value: unknown = await response.json().catch(() => null);
      // A late conflict must not refresh the previous business into the current view.
      if (epoch !== requestEpoch.current) return null;
      if (response.status === 409) {
        await refreshAfterConflict(conflictTarget(input, errorMessage(value, "This offering changed while you were editing.")));
        return null;
      }
      if (!response.ok) throw new Error(errorMessage(value, "This offering change could not be saved."));
      const installation = (value as { installation?: OfferingInstallation } | null)?.installation;
      if (!installation) throw new Error("The change was accepted, but its installation record could not be read. Reload offerings before making another change.");
      if (epoch !== requestEpoch.current) return null;
      setState((current) => current.status === "ready" ? {
        status: "ready",
        saving: false,
        collection: {
          ...current.collection,
          installations: current.collection.installations.some((item) => item.id === installation.id)
            ? current.collection.installations.map((item) => item.id === installation.id ? installation : item)
            : [installation, ...current.collection.installations],
        },
      } : current);
      return installation;
    } catch (cause) {
      if (epoch !== requestEpoch.current) return null;
      const message = cause instanceof Error ? cause.message : "This offering change could not be saved.";
      setState((current) => current.status === "ready" ? { ...current, saving: false, mutationError: message } : current);
      return null;
    }
  }, [enabled, refreshAfterConflict, request, state]);

  const websiteCommand = useCallback(async (input: OfferingWebsiteBindingCommand) => {
    if (!enabled || state.status !== "ready" || state.saving) return null;
    const epoch = requestEpoch.current;
    setState((current) => current.status === "ready" ? { ...current, saving: true, mutationError: undefined, mutationConflict: undefined } : current);
    try {
      const response = await request("/api/offerings/websites", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(input),
      });
      const value: unknown = await response.json().catch(() => null);
      // A late conflict must not refresh the previous business into the current view.
      if (epoch !== requestEpoch.current) return null;
      if (response.status === 409) {
        const conflict: WorkspaceOfferingMutationConflict = input.action === "bind_managed_website"
          ? { kind: "website_binding", id: input.tenantId, message: errorMessage(value, "This website assignment changed while you were editing.") }
          : { kind: "website_binding", id: input.bindingId, message: errorMessage(value, "This website assignment changed while you were editing."), attemptedRevision: input.expectedRevision };
        await refreshAfterConflict(conflict);
        return null;
      }
      if (!response.ok) throw new Error(errorMessage(value, "The website assignment could not be saved."));
      const binding = (value as { websiteBinding?: OfferingWebsiteBinding } | null)?.websiteBinding;
      if (!binding) throw new Error("The website assignment was accepted, but its record could not be read. Reload offerings before trying again.");
      if (epoch !== requestEpoch.current) return null;
      setState((current) => current.status === "ready" ? {
        status: "ready",
        saving: false,
        collection: {
          ...current.collection,
          websiteBindings: current.collection.websiteBindings.some((item) => item.id === binding.id)
            ? current.collection.websiteBindings.map((item) => item.id === binding.id ? binding : item)
            : [binding, ...current.collection.websiteBindings],
        },
      } : current);
      return binding;
    } catch (cause) {
      if (epoch !== requestEpoch.current) return null;
      const message = cause instanceof Error ? cause.message : "The website assignment could not be saved.";
      setState((current) => current.status === "ready" ? { ...current, saving: false, mutationError: message } : current);
      return null;
    }
  }, [enabled, refreshAfterConflict, request, state]);

  const retryConflict = useCallback(async () => {
    if (!enabled || state.status !== "ready" || state.saving || !state.mutationConflict) return;
    await refreshAfterConflict(state.mutationConflict);
  }, [enabled, refreshAfterConflict, state]);

  return { state, reload: load, command, websiteCommand, retryConflict };
}

export function boundManagedWebsiteIds(state: WorkspaceOfferingState): ReadonlySet<string> {
  if (state.status !== "ready") return new Set();
  return new Set(state.collection.websiteBindings
    .filter((binding) => binding.status === "active")
    .map((binding) => binding.tenantId));
}

export function boundOfferingResourceIds(state: WorkspaceOfferingState): ReadonlySet<string> {
  if (state.status !== "ready") return new Set();
  return new Set(state.collection.installations
    .filter((installation) => installation.status !== "retired")
    .flatMap((installation) => installation.nativeResources)
    .map((resource) => resource.id));
}
