"use client";

import { ArrowRight, Box, Check, ExternalLink, RefreshCw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  OfferingCollection,
  OfferingCommand,
  OfferingConfigurationField,
  OfferingDefinitionView,
  OfferingInstallation,
  ProviderDelivery,
  ProviderDeliveryCommand,
  OfferingResponsibility,
  OfferingWebsiteBinding,
  OfferingWebsiteBindingCommand,
} from "@/platform/offerings";
import { Button } from "@/components/ui/Button";
import { workspaceWorkLabel } from "./work-label";
import type { WorkspaceWork } from "./contracts";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { sameAppHref, type ManagedWorkSummary } from "./workspace-discovery";
import styles from "./workspace-offerings.module.css";

export type WorkspaceOfferingState =
  | { status: "unavailable"; reason: string }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; collection: OfferingCollection; saving: boolean; mutationError?: string };

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
  const [state, setState] = useState<WorkspaceOfferingState>(
    enabled ? { status: "loading" } : { status: "unavailable", reason: unavailableReason },
  );

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ status: "unavailable", reason: unavailableReason });
      return;
    }
    setState({ status: "loading" });
    try {
      const response = await request(`/api/offerings?businessId=${encodeURIComponent(businessId)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(value, "Offerings could not be loaded for this business."));
      setState({ status: "ready", collection: value as OfferingCollection, saving: false });
    } catch (cause) {
      setState({
        status: "error",
        message: cause instanceof Error ? cause.message : "Offerings could not be loaded for this business.",
      });
    }
  }, [businessId, enabled, request, unavailableReason]);

  useEffect(() => { void load(); }, [load]);

  const command = useCallback(async (input: OfferingCommand) => {
    if (!enabled || state.status !== "ready" || state.saving) return null;
    setState({ ...state, saving: true, mutationError: undefined });
    try {
      const response = await request("/api/offerings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(input),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(value, "This offering change could not be saved."));
      const installation = (value as { installation?: OfferingInstallation } | null)?.installation;
      if (!installation) throw new Error("The change was accepted, but its installation record could not be read. Reload offerings before making another change.");
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
      const message = cause instanceof Error ? cause.message : "This offering change could not be saved.";
      setState((current) => current.status === "ready" ? { ...current, saving: false, mutationError: message } : current);
      return null;
    }
  }, [enabled, request, state]);

  const websiteCommand = useCallback(async (input: OfferingWebsiteBindingCommand) => {
    if (!enabled || state.status !== "ready" || state.saving) return null;
    setState({ ...state, saving: true, mutationError: undefined });
    try {
      const response = await request("/api/offerings/websites", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(input),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(value, "The website assignment could not be saved."));
      const binding = (value as { websiteBinding?: OfferingWebsiteBinding } | null)?.websiteBinding;
      if (!binding) throw new Error("The website assignment was accepted, but its record could not be read. Reload offerings before trying again.");
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
      const message = cause instanceof Error ? cause.message : "The website assignment could not be saved.";
      setState((current) => current.status === "ready" ? { ...current, saving: false, mutationError: message } : current);
      return null;
    }
  }, [enabled, request, state]);

  return { state, reload: load, command, websiteCommand };
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

export function activeOfferingCount(state: WorkspaceOfferingState): number {
  return state.status === "ready"
    ? state.collection.installations.filter((installation) => installation.status === "active").length
    : 0;
}

/**
 * A small setup handoff for an account-authorized website that is not yet a
 * business installation. It deliberately uses the same website-binding
 * command as the offering directory; the page that presents the handoff does
 * not become a second authorization or persistence boundary.
 */
export function WebsiteAssignmentHandoff({
  businessName,
  state,
  sites,
  onRetry,
  onCommand,
}: {
  businessName: string;
  state: WorkspaceOfferingState;
  sites: readonly ManagedWorkSummary[];
  onRetry?: () => void;
  onCommand?: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
}) {
  const pendingKeys = useRef(new Map<string, string>());
  const activeTenantIds = state.status === "ready"
    ? new Set(state.collection.websiteBindings.filter((binding) => binding.status === "active").map((binding) => binding.tenantId))
    : new Set<string>();
  const available = state.status === "ready"
    ? sites.filter((site) => !activeTenantIds.has(site.id))
    : sites;

  if (!sites.length) return null;

  if (state.status === "loading") {
    return <section className={styles.websiteAssignments} aria-labelledby="website-assignment-title" data-testid="website-assignment-handoff">
      <header><p className={styles.eyebrow}>Business setup</p><h2 id="website-assignment-title">Website assignment</h2><p role="status">Checking whether an account-authorized website is assigned to {businessName}…</p></header>
    </section>;
  }

  if (state.status === "unavailable") {
    return <section className={styles.websiteAssignments} aria-labelledby="website-assignment-title" data-testid="website-assignment-handoff">
      <header><p className={styles.eyebrow}>Business setup</p><h2 id="website-assignment-title">Website assignment</h2><p role="status">Website assignment is unavailable for {businessName} in this workspace. {state.reason}</p></header>
      {onRetry ? <button className={styles.secondary} type="button" onClick={onRetry}>Try again</button> : null}
    </section>;
  }

  if (state.status === "error") {
    return <section className={styles.websiteAssignments} aria-labelledby="website-assignment-title" data-testid="website-assignment-handoff">
      <header><p className={styles.eyebrow}>Business setup</p><h2 id="website-assignment-title">Website assignment</h2><p role="alert">Website assignment could not be checked for {businessName}. {state.message}</p></header>
      {onRetry ? <button className={styles.secondary} type="button" onClick={onRetry}>Try again</button> : null}
    </section>;
  }

  if (!available.length) return null;

  const readyState = state;
  const canManage = readyState.collection.permissions.canManage && Boolean(onCommand);

  async function assign(site: ManagedWorkSummary) {
    if (!onCommand || !canManage || readyState.saving) return;
    const keyId = `bind:${site.id}`;
    const idempotencyKey = pendingKeys.current.get(keyId) ?? crypto.randomUUID();
    pendingKeys.current.set(keyId, idempotencyKey);
    const saved = await onCommand({
      action: "bind_managed_website",
      businessId: readyState.collection.businessId,
      tenantId: site.id,
      idempotencyKey,
    });
    if (saved) pendingKeys.current.delete(keyId);
  }

  return <section className={styles.websiteAssignments} aria-labelledby="website-assignment-title" data-testid="website-assignment-handoff">
    <header>
      <p className={styles.eyebrow}>Business setup</p>
      <h2 id="website-assignment-title">Assign a website to {businessName}</h2>
      <p>These websites are authorized for your account but are not assigned to {businessName}. Assigning one creates the existing business website binding. Domains, connections, and billing stay in that website&apos;s native controls.</p>
    </header>
    {!canManage ? <p className={styles.blocked}>Only a business owner or admin can assign a website to {businessName}. Your current access can view the relationship but cannot change it.</p> : null}
    <div className={styles.availableSites}>
      {available.map((site) => <div key={site.id}>
        <span><strong>{site.title}</strong><small>Authorized for your account · not assigned to {businessName}</small></span>
        {canManage ? <button type="button" disabled={readyState.saving} aria-label={`Assign ${site.title} to ${businessName}`} onClick={() => void assign(site)}>{readyState.saving ? "Assigning…" : readyState.mutationError ? "Retry assignment" : "Assign site to this business"}</button> : null}
      </div>)}
    </div>
    {readyState.mutationError ? <p className={styles.error} role="alert">{readyState.mutationError} Retry the same assignment after checking the current state.</p> : null}
  </section>;
}

function availabilityLabel(definition: OfferingDefinitionView): string {
  if (definition.installability === "available") return definition.availability === "local" ? "Local release" : "Available to install";
  if (definition.installability === "provider_only") return "Existing clients · provider setup";
  return "Release gated";
}

function definitionFor(collection: OfferingCollection, installation: OfferingInstallation): OfferingDefinitionView | undefined {
  return collection.definitions.find((definition) => definition.id === installation.definitionId && definition.version === installation.definitionVersion);
}

function configurationFrom(definition: OfferingDefinitionView, installation?: OfferingInstallation): Record<string, string | boolean> {
  return Object.fromEntries(definition.configurationFields.map((field) => {
    const value = installation?.configuration[field.id];
    return [field.id, field.kind === "boolean" ? value === true : typeof value === "string" ? value : ""];
  }));
}

function serializeConfiguration(
  fields: readonly OfferingConfigurationField[],
  values: Record<string, string | boolean>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.id];
    if (field.kind === "boolean") {
      result[field.id] = value === true;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (text || field.required) result[field.id] = text;
  }
  return result;
}

function ConfigurationFields({
  fields,
  values,
  disabled,
  onChange,
}: {
  fields: readonly OfferingConfigurationField[];
  values: Record<string, string | boolean>;
  disabled: boolean;
  onChange: (id: string, value: string | boolean) => void;
}) {
  if (!fields.length) return null;
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend>How this appears to your team</legend>
    {fields.map((field) => field.kind === "boolean" ? (
      <label key={field.id} className={styles.checkField}>
        <input type="checkbox" checked={values[field.id] === true} onChange={(event) => onChange(field.id, event.target.checked)} />
        <span>{field.label}</span>
      </label>
    ) : (
      <label key={field.id}>
        <span>{field.label}{field.required ? " · Required" : ""}</span>
        {field.kind === "long_text" ? (
          <textarea required={field.required} maxLength={field.maximumLength} value={String(values[field.id] ?? "")} onChange={(event) => onChange(field.id, event.target.value)} />
        ) : (
          <input required={field.required} maxLength={field.maximumLength} value={String(values[field.id] ?? "")} onChange={(event) => onChange(field.id, event.target.value)} />
        )}
      </label>
    ))}
  </fieldset>;
}

function OfferingInstallationView({
  collection,
  installation,
  work,
  saving,
  onBack,
  onOpenWork,
  onCommand,
}: {
  collection: OfferingCollection;
  installation: OfferingInstallation;
  work: readonly WorkspaceWork[];
  saving: boolean;
  onBack: () => void;
  onOpenWork: (id: string) => void;
  onCommand: (command: OfferingCommand) => Promise<OfferingInstallation | null>;
}) {
  const definition = definitionFor(collection, installation);
  const [configuration, setConfiguration] = useState(() => definition ? configurationFrom(definition, installation) : {});
  const [retireOpen, setRetireOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const canManage = collection.permissions.canManage && installation.status !== "retired";

  async function saveConfiguration(event: FormEvent) {
    event.preventDefault();
    await onCommand({
      action: "update_configuration",
      businessId: collection.businessId,
      installationId: installation.id,
      expectedRevision: installation.revision,
      configuration: definition ? serializeConfiguration(definition.configurationFields, configuration) : {},
    });
  }

  async function retire(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    const saved = await onCommand({
      action: "retire",
      businessId: collection.businessId,
      installationId: installation.id,
      expectedRevision: installation.revision,
      reason: reason.trim(),
    });
    if (saved) setRetireOpen(false);
  }

  async function activate() {
    await onCommand({
      action: "activate",
      businessId: collection.businessId,
      installationId: installation.id,
      expectedRevision: installation.revision,
    });
  }

  return <div className={styles.detail}>
    <button type="button" className={styles.back} onClick={onBack}>Back to offerings</button>
    <header>
      <p className={styles.eyebrow}>{installation.status === "active" ? "Installed" : installation.status === "draft" ? "Draft setup" : "Retired"}</p>
      <h2>{definition?.name ?? installation.definitionId}</h2>
      <p>{definition?.description ?? "This installed offering uses an older definition that is no longer listed."}</p>
    </header>

    <section className={styles.section} aria-labelledby={`offering-resources-${installation.id}`}>
      <h3 id={`offering-resources-${installation.id}`}>Connected work</h3>
      <ul className={styles.simpleList}>{installation.nativeResources.map((resource) => {
        const item = work.find((candidate) => candidate.id === resource.id && candidate.workspaceId === collection.businessId && candidate.resourceKind === resource.kind);
        const website = resource.kind === "managed_website" ? collection.websiteBindings.find((binding) => binding.id === resource.id && binding.businessId === collection.businessId && binding.status === "active") : undefined;
        const websiteHref = website?.canOpen && website.tenantActive && website.surface.href ? sameAppHref(website.surface.href) : null;
        return <li key={`${resource.kind}:${resource.id}`}>
          <span><strong>{item?.title ?? website?.siteName ?? "Connected work unavailable"}</strong><small>{item ? item.unavailableReason || workspaceWorkLabel(item) : website ? "Managed website" : "This work is no longer available in your current business view."}</small></span>
          {item && !item.unavailableReason ? <Button type="button" variant="secondary" size="sm" aria-label={`Open ${item.title}`} onClick={() => onOpenWork(item.id)}>Open <ArrowRight size={14} aria-hidden="true" /></Button> : websiteHref ? <a href={websiteHref}>Open <ExternalLink size={14} aria-hidden="true" /></a> : null}
        </li>;
      })}</ul>
    </section>

    <section className={styles.section} aria-labelledby={`offering-surfaces-${installation.id}`}>
      <h3 id={`offering-surfaces-${installation.id}`}>Where people use it</h3>
      <ul className={styles.simpleList}>{installation.surfaces.map((surface) => {
        const href = surface.href ? sameAppHref(surface.href) : null;
        return <li key={surface.id}><span><strong>{surface.label}</strong><small>{surface.description}</small></span>{href ? <a href={href}>Open <ExternalLink size={14} aria-hidden="true" /></a> : <span>Unavailable</span>}</li>;
      })}</ul>
    </section>

    <section className={styles.section} aria-labelledby={`offering-responsibility-${installation.id}`}>
      <h3 id={`offering-responsibility-${installation.id}`}>Who operates it</h3>
      <p>{installation.responsibility.kind === "customer_operated"
        ? `${installation.responsibility.providerName} operates this offering.`
        : `${installation.responsibility.providerName} has been requested as the provider. This record does not confirm they accepted the work.`}</p>
    </section>

    {installation.responsibility.kind === "provider_requested" && installation.responsibility.providerKind === "strelva"
      ? <ProviderDeliveryPanel collection={collection} installation={installation} work={work} /> : null}

    {installation.status === "draft" ? <section className={styles.section} aria-labelledby={`offering-activation-${installation.id}`}>
      <h3 id={`offering-activation-${installation.id}`}>Finish setup</h3>
      <p>Open the business workspace, rehearse the application, and publish it through the existing application review. Then activate this offering so staff can use its released form.</p>
      {canManage ? <>
        <label className={styles.activationConfirm}>
          <input type="checkbox" checked={publicationConfirmed} onChange={(event) => setPublicationConfirmed(event.target.checked)} />
          <span>I published the connected application through its review.</span>
        </label>
        <button className={styles.primary} type="button" disabled={saving || !publicationConfirmed} onClick={() => void activate()}>{saving ? "Checking release…" : "Activate released offering"}</button>
      </> : <p className={styles.note}>Only a business owner or admin can activate the offering after publication.</p>}
    </section> : null}

    {definition?.configurationFields.length ? <form className={styles.section} onSubmit={saveConfiguration}>
      <ConfigurationFields fields={definition.configurationFields} values={configuration} disabled={!canManage || saving} onChange={(id, value) => setConfiguration((current) => ({ ...current, [id]: value }))} />
      <p className={styles.note}>These fields describe the offering record. They do not change the connected application or its published behavior.</p>
      {canManage ? <button className={styles.primary} type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button> : <p className={styles.note}>You can view this configuration, but only a business owner or admin can change it.</p>}
    </form> : null}

    {installation.status === "retired" ? <p className={styles.retired}>Retired {installation.retiredAt ? new Date(installation.retiredAt).toLocaleDateString() : ""}. {installation.retirementReason}</p> : canManage ? <section className={styles.section}>
      {!retireOpen ? <button className={styles.secondary} type="button" disabled={saving} onClick={() => setRetireOpen(true)}>Retire this offering</button> : <form onSubmit={retire} className={styles.retireForm}>
        <label><span>Why are you retiring it?</span><textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <p>This stops presenting the installation as active. Its existing work and history stay in the business.</p>
        <div><button className={styles.secondary} type="button" disabled={saving} onClick={() => { setRetireOpen(false); setReason(""); }}>Cancel</button><button className={styles.danger} type="submit" disabled={saving || !reason.trim()}>{saving ? "Retiring…" : "Retire offering"}</button></div>
      </form>}
    </section> : null}
  </div>;
}

type PresentedDelivery = ProviderDelivery & { canManage: boolean; canAccept: boolean };

function ProviderDeliveryPanel({ collection, installation, work }: {
  collection: OfferingCollection;
  installation: OfferingInstallation;
  work: readonly WorkspaceWork[];
}) {
  const request = useWorkspaceRequest();
  const [deliveries, setDeliveries] = useState<PresentedDelivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const requestKey = useRef<string | null>(null);
  const responsibilities = work.filter((item) => item.productId === "operations" && item.resourceKind === "responsibility");

  const load = useCallback(async () => {
    try {
      const response = await request(`/api/offerings/provider-delivery?businessId=${encodeURIComponent(collection.businessId)}`, { cache: "no-store" });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(value, "Provider delivery could not be loaded."));
      setDeliveries(((value as { deliveries?: PresentedDelivery[] } | null)?.deliveries ?? []).filter((item) => item.installationId === installation.id));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Provider delivery could not be loaded.");
    }
  }, [collection.businessId, installation.id, request]);

  useEffect(() => { void load(); }, [load]);

  async function command(input: ProviderDeliveryCommand) {
    setSaving(true); setError(null);
    try {
      const response = await request("/api/offerings/provider-delivery", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(value, "Provider delivery could not be changed."));
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Provider delivery could not be changed.");
      return false;
    } finally { setSaving(false); }
  }

  async function requestDelivery(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkId) return;
    setSaving(true); setError(null);
    try {
      const response = await request(`/api/operational-assignments?workId=${encodeURIComponent(selectedWorkId)}`, { cache: "no-store" });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(value, "The selected work has no available provider assignment."));
      const assignmentId = (value as { id?: unknown } | null)?.id;
      if (typeof assignmentId !== "string") throw new Error("Offer this approved work to a Strelva assignee before requesting delivery.");
      const idempotencyKey = requestKey.current ?? crypto.randomUUID();
      requestKey.current = idempotencyKey;
      const saved = await command({ action: "request", businessId: collection.businessId, installationId: installation.id, assignmentId, idempotencyKey });
      if (saved) requestKey.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected work could not be checked for provider delivery.");
    } finally { setSaving(false); }
  }

  if (!deliveries && !error) return <section className={styles.section} aria-label="Provider delivery"><p role="status">Checking provider delivery…</p></section>;
  if (!deliveries) return <section className={styles.section} aria-labelledby={`provider-delivery-${installation.id}`}>
    <h3 id={`provider-delivery-${installation.id}`}>Provider delivery</h3>
    <p role="alert" className={styles.error}>Provider delivery status is unavailable. {error} <button type="button" onClick={() => void load()}>Try again</button></p>
  </section>;
  const current = deliveries?.[0];
  return <section className={styles.section} aria-labelledby={`provider-delivery-${installation.id}`}>
    <h3 id={`provider-delivery-${installation.id}`}>Provider delivery</h3>
    {!current ? <>
      <p>No provider has accepted this request. First approve exact zero-cost work and offer it to a verified Strelva assignee in Ongoing.</p>
      {collection.permissions.canManage ? <form onSubmit={requestDelivery} className={styles.retireForm}>
        <label><span>Approved assigned work</span><select required value={selectedWorkId} onChange={(event) => setSelectedWorkId(event.target.value)}><option value="">Choose work</option>{responsibilities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <button className={styles.primary} type="submit" disabled={saving || !selectedWorkId}>{saving ? "Requesting…" : "Request Strelva delivery"}</button>
      </form> : <p className={styles.note}>A business owner manages provider requests.</p>}
    </> : <>
      <p>{current.status === "requested" ? "Requested. Strelva has not accepted this work." : current.status === "accepted" ? "Accepted by the exact assigned Strelva operator." : "Revoked. No new assigned action is permitted."}</p>
      <p className={styles.note}>Customer review: {current.customerDecision === "pending" ? "Pending" : current.customerDecision === "confirmed" ? "Confirmed" : "Changes requested"}</p>
      <a href={`/workspace?workspaceId=${encodeURIComponent(current.businessId)}&view=operations&assignmentId=${encodeURIComponent(current.assignmentId)}`}>Open assigned work</a>
      {current.canAccept ? <button className={styles.primary} type="button" disabled={saving} onClick={() => void command({ action: "accept", deliveryId: current.id })}>{saving ? "Accepting…" : "Accept assigned delivery"}</button> : null}
      {current.canManage && current.status !== "revoked" ? <button className={styles.secondary} type="button" disabled={saving} onClick={() => void command({ action: "revoke", deliveryId: current.id, expectedRevision: current.revision, reason: "Customer stopped provider delivery." })}>Revoke provider delivery</button> : null}
      {current.canManage && current.status === "accepted" && current.customerDecision === "pending" ? <form className={styles.retireForm} onSubmit={(event) => { event.preventDefault(); if (decisionNote.trim()) void command({ action: "decide", deliveryId: current.id, expectedRevision: current.revision, decision: "confirmed", note: decisionNote.trim() }); }}>
        <label><span>Customer confirmation</span><textarea required maxLength={1000} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label>
        <button className={styles.primary} type="submit" disabled={saving || !decisionNote.trim()}>Confirm completed delivery</button>
        <button className={styles.secondary} type="button" disabled={saving || !decisionNote.trim()} onClick={() => void command({ action: "decide", deliveryId: current.id, expectedRevision: current.revision, decision: "changes_requested", note: decisionNote.trim() })}>Request changes</button>
      </form> : null}
    </>}
    {error ? <p className={styles.error} role="alert">{error} <button type="button" onClick={() => void load()}>Try again</button></p> : null}
  </section>;
}

function OfferingInstallView({
  collection,
  definition,
  businessName,
  work,
  saving,
  onBack,
  onCommand,
}: {
  collection: OfferingCollection;
  definition: OfferingDefinitionView;
  businessName: string;
  work: readonly WorkspaceWork[];
  saving: boolean;
  onBack: () => void;
  onCommand: (command: OfferingCommand) => Promise<OfferingInstallation | null>;
}) {
  const resources = [
    ...work.filter((item) => definition.requiredResources.some((requirement) => requirement.kind === item.resourceKind)).map((item) => ({ id: item.id, title: item.title, resourceKind: item.resourceKind })),
    ...collection.websiteBindings.filter((binding) => binding.status === "active" && binding.tenantActive && binding.canOpen && definition.requiredResources.some((requirement) => requirement.kind === "managed_website")).map((binding) => ({ id: binding.id, title: binding.siteName, resourceKind: "managed_website" })),
  ];
  const canPrepareDefault = definition.id === "private_staff_requests";
  const [resourceMode, setResourceMode] = useState<"default" | "existing">(canPrepareDefault ? "default" : "existing");
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [configuration, setConfiguration] = useState(() => configurationFrom(definition));
  const [operator, setOperator] = useState<"customer_operated" | "provider_requested">("customer_operated");
  const [providerKind, setProviderKind] = useState<"strelva" | "named_third_party">("strelva");
  const [providerName, setProviderName] = useState(businessName);
  const [requestNote, setRequestNote] = useState("");
  const pendingCommand = useRef<Extract<OfferingCommand, { action: "install" }> | null>(null);
  const [attempted, setAttempted] = useState(false);
  const canInstall = collection.permissions.canManage && definition.installability === "available" && (resourceMode === "default" ? canPrepareDefault : resources.length > 0);

  async function install(event: FormEvent) {
    event.preventDefault();
    const resource = resourceMode === "existing" ? resources.find((item) => item.id === resourceId) : undefined;
    if ((resourceMode === "existing" && !resource) || !canInstall || !providerName.trim()) return;
    const responsibility: OfferingResponsibility = operator === "customer_operated"
      ? { kind: "customer_operated", providerName: providerName.trim() }
      : {
          kind: "provider_requested",
          providerKind,
          providerName: providerKind === "strelva" ? "Strelva" : providerName.trim(),
          ...(requestNote.trim() ? { requestNote: requestNote.trim() } : {}),
        };
    const command = pendingCommand.current ?? {
      action: "install",
      businessId: collection.businessId,
      definitionId: definition.id,
      definitionVersion: definition.version,
      idempotencyKey: crypto.randomUUID(),
      configuration: serializeConfiguration(definition.configurationFields, configuration),
      ...(resource ? { nativeResources: [{ kind: resource.resourceKind as "application" | "inquiry_workspace" | "managed_website", id: resource.id }] } : {}),
      responsibility,
      acceptedScope: definition.scopes.filter((scope) => scope.required).map((scope) => scope.id),
      surfaceIds: definition.surfaces.filter((surface) => surface.required).map((surface) => surface.id),
    } satisfies Extract<OfferingCommand, { action: "install" }>;
    pendingCommand.current = command;
    setAttempted(true);
    const saved = await onCommand(command);
    if (saved) {
      pendingCommand.current = null;
      const workspace = saved.surfaces.find((surface) => surface.id === "business_workspace" && surface.href);
      const href = workspace?.href ? sameAppHref(workspace.href) : null;
      if (href) window.location.assign(href);
      else onBack();
    }
  }

  return <form className={styles.detail} onSubmit={install}>
    <button type="button" className={styles.back} onClick={onBack}>Back to offerings</button>
    <header><p className={styles.eyebrow}>{availabilityLabel(definition)}</p><h2>Install {definition.name}</h2><p>{definition.description}</p></header>
    <p className={styles.note}>{definition.installationNote}</p>

    <fieldset className={styles.fields} disabled={!collection.permissions.canManage || saving || attempted}>
      <legend>Connect existing work</legend>
      {canPrepareDefault ? <label className={styles.radioField}><input type="radio" name="resource-mode" checked={resourceMode === "default"} onChange={() => setResourceMode("default")} /><span>Create the standard staff request application</span></label> : null}
      {resources.length ? <><label className={styles.radioField}><input type="radio" name="resource-mode" checked={resourceMode === "existing"} onChange={() => setResourceMode("existing")} /><span>Use an existing {definition.requiredResources[0]?.kind === "managed_website" ? "website assignment" : "application"}</span></label>{resourceMode === "existing" ? <label><span>{definition.requiredResources[0]?.kind === "managed_website" ? "Website" : "Application"}</span><select required value={resourceId} onChange={(event) => setResourceId(event.target.value)}>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}</select></label> : null}</> : !canPrepareDefault ? <p className={styles.blocked}>{definition.requiredResources[0]?.kind === "managed_website" ? "Assign an account-authorized website to this business before installing this offering." : "Create and release the required application before installing this offering."}</p> : null}
      {resourceMode === "default" ? <p className={styles.note}>This creates a private application draft with a request form and review list. Staff cannot use it until you rehearse and publish the application.</p> : null}
    </fieldset>

    <ConfigurationFields fields={definition.configurationFields} values={configuration} disabled={!collection.permissions.canManage || saving || attempted} onChange={(id, value) => setConfiguration((current) => ({ ...current, [id]: value }))} />

    <fieldset className={styles.fields} disabled={!collection.permissions.canManage || saving || attempted}>
      <legend>Operating responsibility</legend>
      <label className={styles.radioField}><input type="radio" name="responsibility" checked={operator === "customer_operated"} onChange={() => { setOperator("customer_operated"); setProviderName(businessName); }} /><span>Your business operates it</span></label>
      <label className={styles.radioField}><input type="radio" name="responsibility" checked={operator === "provider_requested"} onChange={() => { setOperator("provider_requested"); setProviderName("Strelva"); }} /><span>Request a provider</span></label>
      {operator === "provider_requested" ? <div className={styles.nestedFields}>
        <label><span>Requested provider</span><select value={providerKind} onChange={(event) => { const next = event.target.value as typeof providerKind; setProviderKind(next); setProviderName(next === "strelva" ? "Strelva" : ""); }}><option value="strelva">Strelva</option><option value="named_third_party">Named third party</option></select></label>
        {providerKind === "named_third_party" ? <label><span>Provider name</span><input required maxLength={120} value={providerName} onChange={(event) => setProviderName(event.target.value)} /></label> : null}
        <label><span>Request note</span><textarea maxLength={500} value={requestNote} onChange={(event) => setRequestNote(event.target.value)} /></label>
        <p className={styles.blocked}>This records your request. It does not confirm Strelva or a third party accepted the work.</p>
      </div> : null}
    </fieldset>

    <section className={styles.accepted} aria-labelledby={`offering-scope-${definition.id}`}>
      <h3 id={`offering-scope-${definition.id}`}>What the software will allow</h3>
      <ul>{definition.scopes.map((scope) => <li key={scope.id}><Check size={16} aria-hidden="true" /><span><strong>{scope.label}</strong><small>{scope.description}</small></span></li>)}</ul>
    </section>

    {!collection.permissions.canManage ? <p className={styles.blocked}>You can review this offering, but only a business owner or admin can install it.</p> : definition.installability !== "available" ? <p className={styles.blocked}>{definition.installationNote}</p> : null}
    {attempted && !saving ? <p className={styles.blocked}>The first request did not return confirmation. The setup is locked so retry sends the exact same command. Reload offerings before changing it.</p> : null}
    <button className={styles.primary} type="submit" disabled={saving || !canInstall || (resourceMode === "existing" && !resourceId) || !providerName.trim()}>{saving ? "Preparing…" : attempted ? "Retry exact setup" : resourceMode === "default" ? "Prepare offering" : "Install offering"} <ArrowRight size={16} aria-hidden="true" /></button>
  </form>;
}

function WebsiteAssignments({
  collection,
  sites,
  saving,
  onCommand,
}: {
  collection: OfferingCollection;
  sites: readonly ManagedWorkSummary[];
  saving: boolean;
  onCommand: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
}) {
  const pendingKeys = useRef(new Map<string, string>());
  const active = collection.websiteBindings.filter((binding) => binding.status === "active");
  const activeTenants = new Set(active.map((binding) => binding.tenantId));
  const available = sites.filter((site) => !activeTenants.has(site.id));
  if (!active.length && !available.length) return null;

  async function bind(tenantId: string) {
    const key = pendingKeys.current.get(`bind:${tenantId}`) ?? crypto.randomUUID();
    pendingKeys.current.set(`bind:${tenantId}`, key);
    const saved = await onCommand({ action: "bind_managed_website", businessId: collection.businessId, tenantId, idempotencyKey: key });
    if (saved) pendingKeys.current.delete(`bind:${tenantId}`);
  }

  async function revoke(binding: OfferingWebsiteBinding) {
    await onCommand({
      action: "revoke_managed_website_binding",
      businessId: collection.businessId,
      bindingId: binding.id,
      expectedRevision: binding.revision,
      reason: "Removed from this business in the workspace.",
    });
  }

  return <section className={styles.websiteAssignments} aria-labelledby="website-assignments-title">
    <header><p className={styles.eyebrow}>Managed websites</p><h2 id="website-assignments-title">Website assignments</h2><p>An account-authorized site is not this business&apos;s installation until an owner explicitly assigns it here.</p></header>
    {active.length ? <ul className={styles.simpleList}>{active.map((binding) => {
      const href = binding.surface.href ? sameAppHref(binding.surface.href) : null;
      return <li key={binding.id}><span><strong>{binding.siteName}</strong><small>Assigned to this business{!binding.tenantActive ? " · Website inactive" : href ? " · You can open it" : " · Website access not granted to you"}</small></span><span className={styles.bindingActions}>{href ? <a href={href}>Open</a> : null}{collection.permissions.canManage ? <button type="button" disabled={saving} onClick={() => void revoke(binding)}>Remove assignment</button> : null}</span></li>;
    })}</ul> : null}
    {available.length ? <div className={styles.availableSites}><h3>Authorized sites not assigned here</h3>{available.map((site) => <div key={site.id}><span><strong>{site.title}</strong><small>Available to your account</small></span>{collection.permissions.canManage ? <button type="button" disabled={saving} onClick={() => void bind(site.id)}>Assign to this business</button> : null}</div>)}</div> : null}
  </section>;
}

export function WorkspaceOfferingDirectory({
  state,
  businessName,
  work,
  managedSites,
  selectedId,
  onSelect,
  onOpenWork,
  onRetry,
  onCommand,
  onWebsiteCommand,
}: {
  state: WorkspaceOfferingState;
  businessName: string;
  work: readonly WorkspaceWork[];
  managedSites: readonly ManagedWorkSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenWork: (id: string) => void;
  onRetry: () => void;
  onCommand: (command: OfferingCommand) => Promise<OfferingInstallation | null>;
  onWebsiteCommand: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
}) {
  if (state.status === "unavailable") return <section className={styles.status}><Box size={22} aria-hidden="true" /><h2>Offerings belong to a business.</h2><p>{state.reason}</p></section>;
  if (state.status === "loading") return <p className={styles.status} role="status">Loading business offerings…</p>;
  if (state.status === "error") return <section className={styles.status}><h2>Offerings could not be loaded.</h2><p role="alert">{state.message}</p><button className={styles.secondary} type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Try again</button></section>;

  const selectedInstallation = state.collection.installations.find((installation) => installation.id === selectedId);
  if (selectedInstallation) return <><OfferingInstallationView key={`${selectedInstallation.id}:${selectedInstallation.revision}`} collection={state.collection} installation={selectedInstallation} work={work} saving={state.saving} onBack={() => onSelect(null)} onOpenWork={onOpenWork} onCommand={onCommand} />{state.mutationError ? <p className={styles.error} role="alert">{state.mutationError}</p> : null}</>;
  const selectedDefinition = state.collection.definitions.find((definition) => definition.id === selectedId);
  if (selectedDefinition) return <><OfferingInstallView collection={state.collection} definition={selectedDefinition} businessName={businessName} work={work} saving={state.saving} onBack={() => onSelect(null)} onCommand={onCommand} />{state.mutationError ? <p className={styles.error} role="alert">{state.mutationError}</p> : null}</>;

  const currentByDefinition = new Map(state.collection.installations.filter((installation) => installation.status !== "retired").map((installation) => [installation.definitionId, installation]));
  return <section aria-labelledby="business-offerings-title">
    <header className={styles.directoryHeader}><p className={styles.eyebrow}>Business offerings</p><h2 id="business-offerings-title">What this business can use.</h2><p>Install a supported offering around work the business already owns. Availability does not grant access or promise a provider.</p></header>
    <WebsiteAssignments collection={state.collection} sites={managedSites} saving={state.saving} onCommand={onWebsiteCommand} />
    <div className={styles.list}>{state.collection.definitions.map((definition) => {
      const installed = currentByDefinition.get(definition.id);
      return <button type="button" key={`${definition.id}:${definition.version}`} className={styles.row} onClick={() => onSelect(installed?.id ?? definition.id)}>
        <span className={styles.symbol}>{installed ? <Check size={20} aria-hidden="true" /> : <Box size={20} aria-hidden="true" />}</span>
        <span><strong>{definition.name}</strong><p>{definition.description}</p><small>{installed ? installed.status === "draft" ? "Draft setup · publication required" : "Installed for this business" : availabilityLabel(definition)}</small></span>
        <ArrowRight size={17} aria-hidden="true" />
      </button>;
    })}</div>
    {state.collection.installations.some((installation) => installation.status === "retired") ? <div className={styles.retiredList}><h3>Retired offerings</h3>{state.collection.installations.filter((installation) => installation.status === "retired").map((installation) => <button key={installation.id} type="button" onClick={() => onSelect(installation.id)}>{definitionFor(state.collection, installation)?.name ?? installation.definitionId}<ArrowRight size={14} /></button>)}</div> : null}
    {!state.collection.permissions.canManage ? <p className={styles.note}>This is a permission-limited view. Only a business owner or admin can install, change, or retire offerings.</p> : null}
  </section>;
}

export function BusinessOfferingSummary({
  state,
  work,
  onOpen,
}: {
  state: WorkspaceOfferingState;
  work: readonly WorkspaceWork[];
  onOpen: (id?: string) => void;
}) {
  if (state.status === "unavailable") return null;
  if (state.status === "loading") return <section className={styles.homePanel} aria-labelledby="home-offerings"><header><Settings2 size={17} aria-hidden="true" /><h2 id="home-offerings">Installed offerings</h2></header><p role="status">Loading offerings…</p></section>;
  if (state.status === "error") return <section className={styles.homePanel} aria-labelledby="home-offerings"><header><Settings2 size={17} aria-hidden="true" /><h2 id="home-offerings">Installed offerings</h2></header><p>Offering records are unavailable. Your saved work is unchanged.</p><button type="button" onClick={() => onOpen()}>Open offerings</button></section>;
  const current = state.collection.installations.filter((installation) => installation.status !== "retired");
  return <section className={styles.homePanel} aria-labelledby="home-offerings">
    <header><Settings2 size={17} aria-hidden="true" /><h2 id="home-offerings">Business offerings</h2><span>{current.length}</span></header>
    {current.length ? <ul>{current.map((installation) => <li key={installation.id}><button type="button" onClick={() => onOpen(installation.id)}><span><strong>{definitionFor(state.collection, installation)?.name ?? installation.definitionId}</strong><small>{installation.status === "draft" ? "Draft setup · publication required" : installation.nativeResources.map((resource) => work.find((item) => item.id === resource.id)?.title ?? resource.kind.replaceAll("_", " ")).join(" · ") || "No connected work"}</small></span><ArrowRight size={14} aria-hidden="true" /></button></li>)}</ul> : <div className={styles.homeEmpty}><p>No offerings are installed for this business. Saved work remains available on its own.</p><button type="button" onClick={() => onOpen()}>Explore offerings</button></div>}
  </section>;
}
