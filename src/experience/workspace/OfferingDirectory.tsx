"use client";

import { ArrowRight, Box, Check, RefreshCw, Settings2 } from "lucide-react";
import { useRef } from "react";
import type { OfferingCollection, OfferingCommand, OfferingInstallation, OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import type { WorkspaceProduct, WorkspaceWork } from "./contracts";
import { sameAppHref, type ManagedWorkSummary } from "./workspace-discovery";
import { composeOfferingDiscovery, type OfferingDiscoveryEntry } from "./offering-discovery";
import { BusinessProviderStatus, useBusinessProviderDeliveries, type BusinessProviderDeliveryState } from "./business-provider-summary";
import styles from "./workspace-offerings.module.css";
import { type WorkspaceOfferingState } from "./useWorkspaceOfferings";
import { availabilityLabel, definitionFor } from "./offering-configuration";
import { OfferingInstallationView, OfferingInstallView } from "./OfferingInstallation";

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

function DiscoveryRows({
  entries,
  onOffering,
  onProduct,
  onRequestSetup,
}: {
  entries: readonly OfferingDiscoveryEntry[];
  onOffering: (entry: OfferingDiscoveryEntry) => void;
  onProduct?: (productId: string) => void;
  onRequestSetup?: (entry: OfferingDiscoveryEntry) => void;
}) {
  return <div className={styles.discoveryList}>
    {entries.map((entry) => {
      function run(target: "product" | "offering", action: OfferingDiscoveryEntry["action"]) {
        if (action.kind === "request" && onRequestSetup) {
          onRequestSetup(entry);
          return;
        }
        if (target === "offering") {
          if (!entry.offering) return;
          onOffering(entry);
          return;
        }
        if (entry.product && onProduct) onProduct(entry.product.id);
      }
      const action = () => run(entry.primaryTarget, entry.action);
      return <div className={styles.discoveryRow} key={entry.key}>
        <span className={styles.discoveryBody}>
          <strong>{entry.title}</strong>
          <p>{entry.description}</p>
          <small>{entry.action.kind === "open" ? "Installed for this business" : entry.action.kind === "start" ? "Available to start" : entry.action.kind === "explore" ? "Example only · live setup is not enabled" : "Setup requires a request"}</small>
        </span>
        <span className={styles.discoveryActions}>
          <button type="button" className={styles.discoveryAction} aria-label={`${entry.title}: ${entry.action.label}`} onClick={action}>{entry.action.label}</button>
          {entry.secondary ? <><small className={styles.discoverySecondaryTitle}>{entry.secondary.title}</small><button type="button" className={styles.discoverySecondaryAction} aria-label={`${entry.secondary.title}: ${entry.secondary.action.label}`} onClick={() => run(entry.secondary!.target, entry.secondary!.action)}>{entry.secondary.action.label}</button></> : null}
        </span>
      </div>;
    })}
  </div>;
}

export function WorkspaceOfferingDirectory({
  state,
  businessName,
  work,
  managedSites,
  products,
  selectedId,
  onSelect,
  onOpenWork,
  onOpenProduct,
  onRequestSetup,
  onRetryConflict,
  onRetry,
  onCommand,
  onWebsiteCommand,
}: {
  state: WorkspaceOfferingState;
  businessName: string;
  work: readonly WorkspaceWork[];
  managedSites: readonly ManagedWorkSummary[];
  products?: readonly WorkspaceProduct[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenWork: (id: string) => void;
  onOpenProduct?: (id: string) => void;
  onRequestSetup?: (entry: OfferingDiscoveryEntry) => void;
  onRetryConflict?: () => void;
  onRetry: () => void;
  onCommand: (command: OfferingCommand) => Promise<OfferingInstallation | null>;
  onWebsiteCommand: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
}) {
  const discoveryEntries = products
    ? composeOfferingDiscovery({
        products,
        definitions: state.status === "ready" ? state.collection.definitions : [],
        installations: state.status === "ready" ? state.collection.installations : [],
      })
    : null;
  const renderProductFallback = (statusMessage: string, role: "status" | "alert" = "status", retry = false) => <section aria-labelledby="business-offerings-title">
    <header className={styles.directoryHeader}><p className={styles.eyebrow}>Explore</p><h2 id="business-offerings-title">Useful outcomes for this workspace.</h2><p>Start work that is available here, or explore an example while business setup is being checked.</p></header>
    <DiscoveryRows entries={discoveryEntries ?? []} onOffering={() => undefined} onProduct={onOpenProduct} onRequestSetup={onRequestSetup} />
    <p className={role === "alert" ? styles.error : styles.note} role={role}>{statusMessage}</p>
    {retry ? <button className={styles.secondary} type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Try again</button> : null}
  </section>;
  if (state.status === "unavailable") {
    if (discoveryEntries) return renderProductFallback(state.reason);
    return <section className={styles.status}><Box size={22} aria-hidden="true" /><h2>Offerings belong to a business.</h2><p>{state.reason}</p></section>;
  }
  if (state.status === "loading") {
    if (discoveryEntries) return renderProductFallback("Checking whether business offerings can be added here…");
    return <p className={styles.status} role="status">Loading business offerings…</p>;
  }
  if (state.status === "error") {
    if (discoveryEntries) return renderProductFallback(`${state.message} Business offerings remain unavailable until this is checked again.`, "alert", true);
    return <section className={styles.status}><h2>Offerings could not be loaded.</h2><p role="alert">{state.message}</p><button className={styles.secondary} type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Try again</button></section>;
  }

  const selectedInstallation = state.collection.installations.find((installation) => installation.id === selectedId);
  if (selectedInstallation) return <><OfferingInstallationView key={selectedInstallation.id} collection={state.collection} installation={selectedInstallation} work={work} saving={state.saving} mutationConflict={state.mutationConflict} onRetryConflict={onRetryConflict} onBack={() => onSelect(null)} onOpenWork={onOpenWork} onCommand={onCommand} />{state.mutationError ? <p className={styles.error} role="alert">{state.mutationError}</p> : null}</>;
  const selectedDefinition = state.collection.definitions.find((definition) => definition.id === selectedId);
  if (selectedDefinition) return <><OfferingInstallView collection={state.collection} definition={selectedDefinition} businessName={businessName} work={work} saving={state.saving} onBack={() => onSelect(null)} onCommand={onCommand} />{state.mutationError ? <p className={styles.error} role="alert">{state.mutationError}</p> : null}</>;

  const currentByDefinition = new Map(state.collection.installations.filter((installation) => installation.status !== "retired").map((installation) => [installation.definitionId, installation]));
  return <section aria-labelledby="business-offerings-title">
    <header className={styles.directoryHeader}><p className={styles.eyebrow}>{discoveryEntries ? "Explore" : "Business offerings"}</p><h2 id="business-offerings-title">{discoveryEntries ? "Useful outcomes for this business." : "What this business can use."}</h2><p>{discoveryEntries ? "Start work that is available here, or request setup when it needs a connected service or release decision." : "Install a supported offering around work the business already owns. Availability does not grant access or promise a provider."}</p></header>
    <WebsiteAssignments collection={state.collection} sites={managedSites} saving={state.saving} onCommand={onWebsiteCommand} />
    {discoveryEntries ? <DiscoveryRows entries={discoveryEntries} onOffering={(entry) => {
      if (entry.offering) onSelect(entry.installation?.id ?? entry.offering.id);
    }} onProduct={onOpenProduct} onRequestSetup={onRequestSetup} /> : <div className={styles.list}>{state.collection.definitions.map((definition) => {
      const installed = currentByDefinition.get(definition.id);
      return <button type="button" key={`${definition.id}:${definition.version}`} className={styles.row} onClick={() => onSelect(installed?.id ?? definition.id)}>
        <span className={styles.symbol}>{installed ? <Check size={20} aria-hidden="true" /> : <Box size={20} aria-hidden="true" />}</span>
        <span><strong>{definition.name}</strong><p>{definition.description}</p><small>{installed ? installed.status === "draft" ? "Draft setup · publication required" : "Installed for this business" : availabilityLabel(definition)}</small></span>
        <ArrowRight size={17} aria-hidden="true" />
      </button>;
    })}</div>}
    {state.collection.installations.some((installation) => installation.status === "retired") ? <div className={styles.retiredList}><h3>Retired offerings</h3>{state.collection.installations.filter((installation) => installation.status === "retired").map((installation) => <button key={installation.id} type="button" onClick={() => onSelect(installation.id)}>{definitionFor(state.collection, installation)?.name ?? installation.definitionId}<ArrowRight size={14} /></button>)}</div> : null}
    {!state.collection.permissions.canManage ? <p className={styles.note}>This is a permission-limited view. Only a business owner or admin can install, change, or retire offerings.</p> : null}
  </section>;
}

export function BusinessOfferingSummary({
  state,
  work,
  onOpen,
  providerDeliveryState,
}: {
  state: WorkspaceOfferingState;
  work: readonly WorkspaceWork[];
  onOpen: (id?: string) => void;
  providerDeliveryState?: BusinessProviderDeliveryState;
}) {
  const fetchedProviderDeliveryState = useBusinessProviderDeliveries(state);
  if (state.status === "unavailable") return null;
  if (state.status === "loading") return <section className={styles.homePanel} aria-labelledby="home-offerings"><header><Settings2 size={17} aria-hidden="true" /><h2 id="home-offerings">Installed offerings</h2></header><p role="status">Loading offerings…</p></section>;
  if (state.status === "error") return <section className={styles.homePanel} aria-labelledby="home-offerings"><header><Settings2 size={17} aria-hidden="true" /><h2 id="home-offerings">Installed offerings</h2></header><p>Offering records are unavailable. Your saved work is unchanged.</p><button type="button" onClick={() => onOpen()}>Open offerings</button></section>;
  const current = state.collection.installations.filter((installation) => installation.status !== "retired");
  const providerState = providerDeliveryState ?? fetchedProviderDeliveryState;
  const providerDeliveries = providerState.status === "ready" ? providerState.deliveries : [];
  return <section className={styles.homePanel} aria-labelledby="home-offerings">
    <header><Settings2 size={17} aria-hidden="true" /><h2 id="home-offerings">Business offerings</h2><span>{current.length}</span></header>
    {current.length ? <ul>{current.map((installation) => <li key={installation.id}><button type="button" onClick={() => onOpen(installation.id)}><span><strong>{definitionFor(state.collection, installation)?.name ?? installation.definitionId}</strong><small>{installation.status === "draft" ? "Draft setup · publication required" : installation.nativeResources.map((resource) => work.find((item) => item.id === resource.id)?.title ?? resource.kind.replaceAll("_", " ")).join(" · ") || "No connected work"}</small></span><ArrowRight size={14} aria-hidden="true" /></button></li>)}</ul> : <div className={styles.homeEmpty}><p>No offerings are installed for this business. Saved work remains available on its own.</p><button type="button" onClick={() => onOpen()}>Explore offerings</button></div>}
    <BusinessProviderStatus state={providerState} deliveries={providerDeliveries} installations={current} collection={state.collection} onOpen={onOpen} />
  </section>;
}
