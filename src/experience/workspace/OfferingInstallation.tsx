"use client";

import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { OfferingCollection, OfferingCommand, OfferingConfigurationField, OfferingDefinitionView, OfferingInstallation, AgencyDelivery, AgencyDeliveryCommand, OfferingResponsibility } from "@/platform/offerings";
import { Button } from "@/components/ui/Button";
import { agencyDeliveryReason } from "@/platform/presentation/agency-delivery";
import { workspaceWorkLabel } from "./work-label";
import type { WorkspaceWork } from "./contracts";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { sameAppHref } from "./workspace-discovery";
import { offeringRetryFromConflict, preserveOfferingDraftOnConflict } from "./offering-recovery";
import styles from "./workspace-offerings.module.css";
import { type WorkspaceOfferingMutationConflict, errorMessage } from "./useWorkspaceOfferings";
import { availabilityLabel, definitionFor, configurationFrom, configurationDisplayValue, serializeConfiguration } from "./offering-configuration";

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

export function OfferingInstallationView({
  collection,
  installation,
  work,
  saving,
  mutationConflict,
  onRetryConflict,
  onBack,
  onOpenWork,
  onCommand,
}: {
  collection: OfferingCollection;
  installation: OfferingInstallation;
  work: readonly WorkspaceWork[];
  saving: boolean;
  mutationConflict?: WorkspaceOfferingMutationConflict;
  onRetryConflict?: () => void;
  onBack: () => void;
  onOpenWork: (id: string) => void;
  onCommand: (command: OfferingCommand) => Promise<OfferingInstallation | null>;
}) {
  const definition = definitionFor(collection, installation);
  const pristineConfiguration = definition ? configurationFrom(definition, installation) : {};
  const [draft, setDraft] = useState<{ values: Record<string, string | boolean>; dirty: boolean }>(() => ({ values: pristineConfiguration, dirty: false }));
  const configuration = draft.dirty ? draft.values : pristineConfiguration;
  const [retireOpen, setRetireOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const canManage = collection.permissions.canManage && installation.status !== "retired";
  const conflictMatchesInstallation = mutationConflict?.kind === "installation" && mutationConflict.id === installation.id;
  const conflictInput = conflictMatchesInstallation ? mutationConflict : undefined;
  const conflictReview = conflictInput ? preserveOfferingDraftOnConflict(configuration, conflictInput) : null;
  const conflictNeedsRefresh = conflictMatchesInstallation && conflictInput?.authoritativeRevision == null;

  async function saveConfiguration(event: FormEvent) {
    event.preventDefault();
    if (conflictNeedsRefresh) return;
    const retry = conflictReview ? offeringRetryFromConflict(conflictReview) : null;
    const saved = await onCommand({
      action: "update_configuration",
      businessId: collection.businessId,
      installationId: installation.id,
      expectedRevision: retry?.expectedRevision ?? installation.revision,
      configuration: definition ? serializeConfiguration(definition.configurationFields, configuration) : {},
    });
    if (saved) {
      setDraft({ values: definition ? configurationFrom(definition, saved) : {}, dirty: false });
    }
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
    <button type="button" className={styles.back} onClick={onBack}>Back to ready-made systems</button>
    <header>
      <p className={styles.eyebrow}>{installation.status === "active" ? "Installed" : installation.status === "draft" ? "Draft setup" : "Retired"}</p>
      <h2>{definition?.name ?? installation.definitionId}</h2>
      <p>{definition?.description ?? "This system was set up from an older design that is no longer listed."}</p>
    </header>
    {conflictMatchesInstallation ? <div className={styles.conflict} role="alert">
      <strong>{mutationConflict.message}</strong>
      <p>{conflictInput?.authoritativeRevision != null ? `The latest History entry is ${conflictInput.authoritativeRevision}. Review the current saved state, then save your draft to retry. Nothing was submitted automatically.` : "The latest History entry could not be loaded. Refresh it before retrying; nothing was submitted automatically."}</p>
      {conflictNeedsRefresh && onRetryConflict ? <button className={styles.secondary} type="button" onClick={onRetryConflict}>Refresh History</button> : null}
      {definition?.configurationFields.length ? <div className={styles.conflictComparison}>
        <strong>Review saved values against your draft</strong>
        {definition.configurationFields.map((field) => <div key={field.id}>
          <span>{field.label}</span>
          <small>Latest saved: {configurationDisplayValue(installation.configuration[field.id])}</small>
          <small>Your draft: {configurationDisplayValue(configuration[field.id])}</small>
        </div>)}
      </div> : null}
    </div> : null}

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
        : `${installation.responsibility.providerKind === "strelva" ? "Strelva Agency" : installation.responsibility.providerName} has been requested as the agency. This record does not confirm they accepted the work.`}</p>
    </section>

    {installation.responsibility.kind === "provider_requested" && installation.responsibility.providerKind === "strelva"
      ? <AgencyDeliveryPanel collection={collection} installation={installation} work={work} /> : null}

    {installation.status === "draft" ? <section className={styles.section} aria-labelledby={`offering-activation-${installation.id}`}>
      <h3 id={`offering-activation-${installation.id}`}>Finish setup</h3>
      <p>Open the business workspace, rehearse the application, and publish it through the existing application review. Then activate it so staff can use its released form.</p>
      {canManage ? <>
        <label className={styles.activationConfirm}>
          <input type="checkbox" checked={publicationConfirmed} onChange={(event) => setPublicationConfirmed(event.target.checked)} />
          <span>I published the connected application through its review.</span>
        </label>
        <button className={styles.primary} type="button" disabled={saving || !publicationConfirmed} onClick={() => void activate()}>{saving ? "Checking release…" : "Activate release"}</button>
      </> : <p className={styles.note}>Only a business owner or admin can activate it after publication.</p>}
    </section> : null}

    {definition?.configurationFields.length ? <form className={styles.section} onSubmit={saveConfiguration}>
      <ConfigurationFields fields={definition.configurationFields} values={configuration} disabled={!canManage || saving} onChange={(id, value) => setDraft((current) => ({ values: { ...(current.dirty ? current.values : configuration), [id]: value }, dirty: true }))} />
      <p className={styles.note}>These fields describe this setup. They do not change the connected application or its published behavior.</p>
      {canManage ? <button className={styles.primary} type="submit" disabled={saving || conflictNeedsRefresh}>{saving ? "Saving…" : "Save changes"}</button> : <p className={styles.note}>You can view this configuration, but only a business owner or admin can change it.</p>}
    </form> : null}

    {installation.status === "retired" ? <p className={styles.retired}>Retired {installation.retiredAt ? new Date(installation.retiredAt).toLocaleDateString() : ""}. {installation.retirementReason}</p> : canManage ? <section className={styles.section}>
      {!retireOpen ? <button className={styles.secondary} type="button" disabled={saving} onClick={() => setRetireOpen(true)}>Retire this system</button> : <form onSubmit={retire} className={styles.retireForm}>
        <label><span>Why are you retiring it?</span><textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <p>This stops presenting it as active. Its existing work and history stay in the business.</p>
        <div><button className={styles.secondary} type="button" disabled={saving} onClick={() => { setRetireOpen(false); setReason(""); }}>Cancel</button><button className={styles.danger} type="submit" disabled={saving || !reason.trim()}>{saving ? "Retiring…" : "Retire system"}</button></div>
      </form>}
    </section> : null}
  </div>;
}

export type PresentedAgencyDelivery = AgencyDelivery & { canManage: boolean; canAccept: boolean };
/** @deprecated Use PresentedAgencyDelivery. */
export type PresentedProviderDelivery = PresentedAgencyDelivery;

function AgencyDeliveryPanel({ collection, installation, work }: {
  collection: OfferingCollection;
  installation: OfferingInstallation;
  work: readonly WorkspaceWork[];
}) {
  const request = useWorkspaceRequest();
  const [deliveries, setDeliveries] = useState<PresentedAgencyDelivery[] | null>(null);
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
      if (!response.ok) throw new Error(errorMessage(value, "Agency delivery could not be loaded."));
      setDeliveries(((value as { deliveries?: PresentedAgencyDelivery[] } | null)?.deliveries ?? []).filter((item) => item.installationId === installation.id));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agency delivery could not be loaded.");
    }
  }, [collection.businessId, installation.id, request]);

  useEffect(() => { void load(); }, [load]);

  async function command(input: AgencyDeliveryCommand) {
    setSaving(true); setError(null);
    try {
      const response = await request("/api/offerings/provider-delivery", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(value, "Agency delivery could not be changed."));
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agency delivery could not be changed.");
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
      if (!response.ok) throw new Error(errorMessage(value, "The selected work has no available agency assignment."));
      const assignmentId = (value as { id?: unknown } | null)?.id;
      if (typeof assignmentId !== "string") throw new Error("Offer this approved work to a Strelva Agency assignee before requesting delivery.");
      const idempotencyKey = requestKey.current ?? crypto.randomUUID();
      requestKey.current = idempotencyKey;
      const saved = await command({ action: "request", businessId: collection.businessId, installationId: installation.id, assignmentId, idempotencyKey });
      if (saved) requestKey.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected work could not be checked for agency delivery.");
    } finally { setSaving(false); }
  }

  if (!deliveries && !error) return <section className={styles.section} aria-label="Agency delivery"><p role="status">Checking agency delivery…</p></section>;
  if (!deliveries) return <section className={styles.section} aria-labelledby={`provider-delivery-${installation.id}`}>
    <h3 id={`provider-delivery-${installation.id}`}>Agency delivery</h3>
    <p role="alert" className={styles.error}>Agency delivery status is unavailable. {error} <button type="button" onClick={() => void load()}>Try again</button></p>
  </section>;
  const current = deliveries?.[0];
  return <section className={styles.section} aria-labelledby={`provider-delivery-${installation.id}`}>
    <h3 id={`provider-delivery-${installation.id}`}>Agency delivery</h3>
    {!current ? <>
      <p>No agency has accepted this request. First approve exact zero-cost work and offer it to a verified Strelva Agency assignee in Running.</p>
      {collection.permissions.canManage ? <form onSubmit={requestDelivery} className={styles.retireForm}>
        <label><span>Approved assigned work</span><select required value={selectedWorkId} onChange={(event) => setSelectedWorkId(event.target.value)}><option value="">Choose work</option>{responsibilities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <button className={styles.primary} type="submit" disabled={saving || !selectedWorkId}>{saving ? "Requesting…" : "Request Strelva Agency delivery"}</button>
      </form> : <p className={styles.note}>A business owner manages agency requests.</p>}
    </> : <>
      <p>{current.status === "requested" ? "Requested. Strelva Agency has not accepted this work." : current.status === "accepted" ? "Accepted by the assigned Strelva Agency staff member." : "Revoked. No new assigned action is permitted."}</p>
      {current.status === "revoked" && current.revocationReason ? <p>{agencyDeliveryReason(current.revocationReason)}</p> : null}
      <p className={styles.note}>Your review: {current.customerDecision === "pending" ? "Pending" : current.customerDecision === "confirmed" ? "Confirmed" : "Changes requested"}</p>
      <a href={`/workspace?workspaceId=${encodeURIComponent(current.businessId)}&view=operations&assignmentId=${encodeURIComponent(current.assignmentId)}`}>Open assigned work</a>
      {current.canAccept ? <button className={styles.primary} type="button" disabled={saving} onClick={() => void command({ action: "accept", deliveryId: current.id })}>{saving ? "Accepting…" : "Accept assigned delivery"}</button> : null}
      {current.canManage && current.status !== "revoked" ? <button className={styles.secondary} type="button" disabled={saving} onClick={() => void command({ action: "revoke", deliveryId: current.id, expectedRevision: current.revision, reason: "Customer stopped provider delivery." })}>Revoke agency delivery</button> : null}
      {current.canManage && current.status === "accepted" && current.customerDecision === "pending" ? <form className={styles.retireForm} onSubmit={(event) => { event.preventDefault(); if (decisionNote.trim()) void command({ action: "decide", deliveryId: current.id, expectedRevision: current.revision, decision: "confirmed", note: decisionNote.trim() }); }}>
        <label><span>Your confirmation</span><textarea required maxLength={1000} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label>
        <button className={styles.primary} type="submit" disabled={saving || !decisionNote.trim()}>Confirm completed delivery</button>
        <button className={styles.secondary} type="button" disabled={saving || !decisionNote.trim()} onClick={() => void command({ action: "decide", deliveryId: current.id, expectedRevision: current.revision, decision: "changes_requested", note: decisionNote.trim() })}>Request changes</button>
      </form> : null}
    </>}
    {error ? <p className={styles.error} role="alert">{error} <button type="button" onClick={() => void load()}>Try again</button></p> : null}
  </section>;
}

export function OfferingInstallView({
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
  const [agencyKind, setAgencyKind] = useState<"strelva" | "named_third_party">("strelva");
  const [agencyName, setAgencyName] = useState(businessName);
  const [requestNote, setRequestNote] = useState("");
  const pendingCommand = useRef<Extract<OfferingCommand, { action: "install" }> | null>(null);
  const [attempted, setAttempted] = useState(false);
  const canInstall = collection.permissions.canManage && definition.installability === "available" && (resourceMode === "default" ? canPrepareDefault : resources.length > 0);

  async function install(event: FormEvent) {
    event.preventDefault();
    const resource = resourceMode === "existing" ? resources.find((item) => item.id === resourceId) : undefined;
    if ((resourceMode === "existing" && !resource) || !canInstall || !agencyName.trim()) return;
    const responsibility: OfferingResponsibility = operator === "customer_operated"
      ? { kind: "customer_operated", providerName: agencyName.trim() }
      : {
          kind: "provider_requested",
          providerKind: agencyKind,
          providerName: agencyKind === "strelva" ? "Strelva" : agencyName.trim(),
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
    <button type="button" className={styles.back} onClick={onBack}>Back to ready-made systems</button>
    <header><p className={styles.eyebrow}>{availabilityLabel(definition)}</p><h2>Install {definition.name}</h2><p>{definition.description}</p></header>
    <p className={styles.note}>{definition.installationNote}</p>

    <fieldset className={styles.fields} disabled={!collection.permissions.canManage || saving || attempted}>
      <legend>Connect existing work</legend>
      {canPrepareDefault ? <label className={styles.radioField}><input type="radio" name="resource-mode" checked={resourceMode === "default"} onChange={() => setResourceMode("default")} /><span>Create the standard staff request application</span></label> : null}
      {resources.length ? <><label className={styles.radioField}><input type="radio" name="resource-mode" checked={resourceMode === "existing"} onChange={() => setResourceMode("existing")} /><span>Use an existing {definition.requiredResources[0]?.kind === "managed_website" ? "website assignment" : "application"}</span></label>{resourceMode === "existing" ? <label><span>{definition.requiredResources[0]?.kind === "managed_website" ? "Website" : "Application"}</span><select required value={resourceId} onChange={(event) => setResourceId(event.target.value)}>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}</select></label> : null}</> : !canPrepareDefault ? <p className={styles.blocked}>{definition.requiredResources[0]?.kind === "managed_website" ? "Assign an account-authorized website to this business before setting this up." : "Create and release the required application before setting this up."}</p> : null}
      {resourceMode === "default" ? <p className={styles.note}>This creates a private application draft with a request form and review list. Staff cannot use it until you rehearse and publish the application.</p> : null}
    </fieldset>

    <ConfigurationFields fields={definition.configurationFields} values={configuration} disabled={!collection.permissions.canManage || saving || attempted} onChange={(id, value) => setConfiguration((current) => ({ ...current, [id]: value }))} />

    <fieldset className={styles.fields} disabled={!collection.permissions.canManage || saving || attempted}>
      <legend>Operating responsibility</legend>
      <label className={styles.radioField}><input type="radio" name="responsibility" checked={operator === "customer_operated"} onChange={() => { setOperator("customer_operated"); setAgencyName(businessName); }} /><span>Your business operates it</span></label>
      <label className={styles.radioField}><input type="radio" name="responsibility" checked={operator === "provider_requested"} onChange={() => { setOperator("provider_requested"); setAgencyName("Strelva"); }} /><span>Request an agency</span></label>
      {operator === "provider_requested" ? <div className={styles.nestedFields}>
        <label><span>Requested agency</span><select value={agencyKind} onChange={(event) => { const next = event.target.value as typeof agencyKind; setAgencyKind(next); setAgencyName(next === "strelva" ? "Strelva" : ""); }}><option value="strelva">Strelva Agency</option><option value="named_third_party">Named third party</option></select></label>
        {agencyKind === "named_third_party" ? <label><span>Agency name</span><input required maxLength={120} value={agencyName} onChange={(event) => setAgencyName(event.target.value)} /></label> : null}
        <label><span>Request note</span><textarea maxLength={500} value={requestNote} onChange={(event) => setRequestNote(event.target.value)} /></label>
        <p className={styles.blocked}>This records your request. It does not confirm Strelva or a third party accepted the work.</p>
      </div> : null}
    </fieldset>

    <section className={styles.accepted} aria-labelledby={`offering-scope-${definition.id}`}>
      <h3 id={`offering-scope-${definition.id}`}>What the software will allow</h3>
      <ul>{definition.scopes.map((scope) => <li key={scope.id}><Check size={16} aria-hidden="true" /><span><strong>{scope.label}</strong><small>{scope.description}</small></span></li>)}</ul>
    </section>

    {!collection.permissions.canManage ? <p className={styles.blocked}>You can review this, but only a business owner or admin can set it up.</p> : definition.installability !== "available" ? <p className={styles.blocked}>{definition.installationNote}</p> : null}
    {attempted && !saving ? <p className={styles.blocked}>The first request did not return confirmation. The setup is locked so retry sends the exact same command. Reload before changing it.</p> : null}
    <button className={styles.primary} type="submit" disabled={saving || !canInstall || (resourceMode === "existing" && !resourceId) || !agencyName.trim()}>{saving ? "Preparing…" : attempted ? "Retry exact setup" : resourceMode === "default" ? "Prepare setup" : "Set up"} <ArrowRight size={16} aria-hidden="true" /></button>
  </form>;
}
