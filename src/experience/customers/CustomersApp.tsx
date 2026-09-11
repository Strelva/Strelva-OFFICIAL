"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileSearch,
  Globe2,
  Mail,
  Search,
  ShieldAlert,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type {
  CustomerCollection,
  CustomerDetail,
  CustomerResourceKind,
  CustomerResourceView,
  CustomerSummary,
} from "@/platform/customers";
import type {
  HomeFinderDeliveryPage,
  HomeFinderInstallationSummary,
  HomeFinderReadiness,
  HomeFinderReadinessItem,
} from "@/products/home-finder/contracts";
import {
  CUSTOMER_PREVIEW_HOME_FINDER,
  CUSTOMER_PREVIEW_SCENARIOS,
  type CustomerPreviewScenario,
} from "./preview-fixture";
import styles from "./customers.module.css";

const BASE_PATH = "/preview/strelva/customers";

const RESOURCE_LABELS: Record<CustomerResourceKind, string> = {
  website: "Website",
  assessment: "Assessment",
  home_finder_installation: "Home Finder",
};

const RESOURCE_ICONS: Record<CustomerResourceKind, LucideIcon> = {
  website: Globe2,
  assessment: FileSearch,
  home_finder_installation: Building2,
};

const AVAILABILITY_LABELS: Record<CustomerResourceView["availability"], string> = {
  available: "Available",
  not_configured: "Not configured",
  unavailable: "Unavailable",
  revoked: "Access revoked",
};

const SCENARIO_LABELS: Record<CustomerPreviewScenario, string> = {
  assigned: "Assigned customers",
  direct: "Direct brokerage",
  revoked: "Revoked resource",
  empty: "No assignments",
  unavailable: "Source unavailable",
};

const SCOPE_OPTIONS = [
  { id: "northstar", label: "Northstar agency", scenario: "assigned" as const },
  { id: "direct", label: "Direct brokerage", scenario: "direct" as const },
];

export type HomeFinderPanelData = {
  summary: HomeFinderInstallationSummary;
  readiness: HomeFinderReadiness;
  deliveries: HomeFinderDeliveryPage;
};

export interface CustomersAppProps {
  collection: CustomerCollection;
  detail?: CustomerDetail;
  organizationName: string;
  scenario: CustomerPreviewScenario;
  requestedCustomerId?: string;
  initialResourceId?: string;
  previewHref?: string;
  /** Preview routes use the same typed projection as the live Customers view. */
  preview?: boolean;
  homeFinderData?: Readonly<Record<string, HomeFinderPanelData>>;
  basePath?: string;
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function safeHttpHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, "http://strelva-preview.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function customerMatches(customer: CustomerSummary, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase("en-US");
  return customer.displayName.toLocaleLowerCase("en-US").includes(normalized) ||
    customer.domain?.toLocaleLowerCase("en-US").includes(normalized) === true;
}

function provenanceLabel(value: CustomerSummary["provenance"]["source"]): string {
  if (value === "operator_reviewed") return "Operator reviewed";
  if (value === "direct_mapping") return "Direct mapping";
  return "Reconciled mapping";
}

function scopeKey(scenario: CustomerPreviewScenario): string {
  return scenario === "direct" ? "direct" : "northstar";
}

/** Adapt the fixture-owned records without inventing a second Home Finder dataset in the view. */
function previewHomeFinderData(previewHref: string | undefined): HomeFinderPanelData {
  return {
    summary: {
      ...CUSTOMER_PREVIEW_HOME_FINDER.summary,
      previewHref: previewHref || CUSTOMER_PREVIEW_HOME_FINDER.summary.previewHref,
    },
    readiness: CUSTOMER_PREVIEW_HOME_FINDER.readiness,
    deliveries: CUSTOMER_PREVIEW_HOME_FINDER.receipts,
  };
}

function stateIcon(state: HomeFinderReadinessItem["state"]): ReactNode {
  if (state === "confirmed") return <CheckCircle2 size={16} aria-hidden="true" />;
  if (state === "missing") return <XCircle size={16} aria-hidden="true" />;
  if (state === "stale") return <TriangleAlert size={16} aria-hidden="true" />;
  return <ShieldAlert size={16} aria-hidden="true" />;
}

function stateLabel(state: HomeFinderReadinessItem["state"]): string {
  if (state === "confirmed") return "Confirmed";
  if (state === "missing") return "Missing";
  if (state === "stale") return "Stale";
  return "Unverified";
}

function deliveryStateLabel(state: HomeFinderDeliveryPage["items"][number]["state"]): string {
  if (state === "delivered") return "Delivered";
  if (state === "bounced") return "Bounced";
  if (state === "failed") return "Failed";
  return "Pending";
}

function requestHref(customer: CustomerSummary, organizationName: string, resourceLabel: string): string {
  const body = [
    `Organization scope: ${organizationName}`,
    `Customer: ${customer.displayName}`,
    `Resource: ${resourceLabel}`,
    "",
    "I would like to discuss Home Finder access for this customer.",
  ].join("\n");
  return `mailto:hello@strelva.com?subject=${encodeURIComponent("Home Finder access")}&body=${encodeURIComponent(body)}`;
}

function resourceAvailabilityCopy(availability: CustomerResourceView["availability"]): string {
  if (availability === "available") return "Read-only access is available.";
  if (availability === "not_configured") return "Read-only access is not set up.";
  if (availability === "revoked") return "Read-only access was revoked. Nothing is shown.";
  return "This resource is unavailable. It is not an empty resource.";
}

function ResourceAction({
  resource,
  onOpenHomeFinder,
}: {
  resource: CustomerResourceView;
  onOpenHomeFinder: (resource: CustomerResourceView) => void;
}) {
  const label = resource.label || RESOURCE_LABELS[resource.kind];
  const href = safeHttpHref(resource.href);

  if (resource.kind === "home_finder_installation") {
    if (resource.availability === "revoked") {
      return <span className={styles.resourceStatus} data-state="revoked">Access revoked</span>;
    }
    return (
      <button
        type="button"
        className={styles.resourceAction}
        onClick={() => onOpenHomeFinder(resource)}
        aria-label={`${resource.availability === "not_configured" ? "See requirements for" : "Open"} ${label}`}
      >
        {resource.availability === "not_configured" ? "See requirements" : resource.availability === "unavailable" ? "View unavailable state" : "Open Home Finder"}
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    );
  }

  if (resource.availability === "available" && href) {
    return (
      <Link className={styles.resourceAction} href={href} prefetch={false}>
        Open {RESOURCE_LABELS[resource.kind]}
        <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    );
  }

  return <span className={styles.resourceStatus} data-state={resource.availability}>{AVAILABILITY_LABELS[resource.availability]}</span>;
}

function HomeFinderPanel({
  resource,
  data,
  request,
  copyMessage,
  onCopy,
}: {
  resource: CustomerResourceView;
  data?: HomeFinderPanelData;
  request: string;
  copyMessage: string;
  onCopy: () => void;
}) {
  const previewHref = safeHttpHref(data?.summary.previewHref);
  const canPreview = Boolean(previewHref) && resource.availability !== "revoked" && resource.availability !== "unavailable";

  if (resource.availability === "revoked") {
    return (
      <section className={styles.homeFinderPanel} aria-labelledby="home-finder-revoked-title">
        <div className={styles.resourcePanelHeader}>
          <p className={styles.eyebrow}>Home Finder · Access</p>
          <h3 id="home-finder-revoked-title">Access revoked</h3>
          <p>{resourceAvailabilityCopy(resource.availability)}</p>
        </div>
      </section>
    );
  }

  if (resource.availability === "unavailable") {
    return (
      <section className={styles.homeFinderPanel} aria-labelledby="home-finder-unavailable-title">
        <div className={styles.resourcePanelHeader}>
          <p className={styles.eyebrow}>Home Finder · Source</p>
          <h3 id="home-finder-unavailable-title">Home Finder is unavailable</h3>
          <p>{resourceAvailabilityCopy(resource.availability)} Readiness and delivery evidence were not returned.</p>
        </div>
      </section>
    );
  }

  if (resource.availability === "not_configured" && !data) {
    return (
      <section className={styles.homeFinderPanel} aria-labelledby="home-finder-not-configured-title">
        <div className={styles.resourcePanelHeader}>
          <p className={styles.eyebrow}>Home Finder · Setup</p>
          <h3 id="home-finder-not-configured-title">Home Finder is not set up</h3>
          <p>{resourceAvailabilityCopy(resource.availability)} There is no buyer preview or delivery evidence to show for this resource.</p>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className={styles.homeFinderPanel} aria-labelledby="home-finder-not-loaded-title">
        <div className={styles.resourcePanelHeader}>
          <p className={styles.eyebrow}>Home Finder · Management</p>
          <h3 id="home-finder-not-loaded-title">Management details are unavailable</h3>
          <p>{resourceAvailabilityCopy(resource.availability)} No provider payload or raw receipt data is exposed here.</p>
        </div>
      </section>
    );
  }

  const readiness = data.readiness.readiness;
  const deliveries = data.deliveries.items;
  const readinessSources = Array.from(new Set(readiness.map((item) => item.source))).join(" · ");
  return (
    <section className={styles.homeFinderPanel} aria-labelledby="home-finder-title">
      <div className={styles.resourcePanelHeader}>
        <p className={styles.eyebrow}>Home Finder · {data.summary.mode === "demo" ? "Synthetic preview" : "Installation"}</p>
        <h3 id="home-finder-title">{resource.label || "Home Finder"}</h3>
        <p>{data.summary.brokerageName} · observed {formatDateTime(data.summary.observedAt)}</p>
        <p className={styles.dataSource}>Evidence source: {readinessSources || "Not returned"}</p>
        <div className={styles.homeFinderActions}>
          {canPreview && (
            <a className={styles.primaryAction} href={previewHref} target="_blank" rel="noreferrer">
              Open buyer preview <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
          <a className={styles.secondaryAction} href={request}>
            <Mail size={16} aria-hidden="true" /> Email Strelva about access
          </a>
        </div>
        {data.summary.mode === "demo" && (
          <p className={styles.previewExplanation}>This is a buyer-facing synthetic preview. It uses no live listings, and buyer inquiries are not sent or stored.</p>
        )}
      </div>

      <div className={styles.homeFinderGrid}>
        <section className={styles.subsection} aria-labelledby="home-finder-readiness-title">
          <div className={styles.subsectionHeading}>
            <div><h4 id="home-finder-readiness-title">Readiness</h4><p>Evidence required before a live claim.</p></div>
            <span className={styles.quietLabel}>{readiness.length} check{readiness.length === 1 ? "" : "s"}</span>
          </div>
          <ul className={styles.readinessList}>
            {readiness.map((item) => (
              <li key={item.requirement} className={styles.readinessItem} data-state={item.state}>
                <span className={styles.stateIcon} data-state={item.state}>{stateIcon(item.state)}</span>
                <span className={styles.readinessCopy}>
                  <strong>{item.requirement}</strong>
                  <small>{stateLabel(item.state)} · {item.responsibleParty}</small>
                  <small className={styles.readinessSource}>Source: {item.source}</small>
                </span>
                <time dateTime={item.observedAt}>{formatDate(item.observedAt)}</time>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.subsection} aria-labelledby="home-finder-deliveries-title">
          <div className={styles.subsectionHeading}>
            <div><h4 id="home-finder-deliveries-title">Delivery evidence</h4><p>Content-free receipts retained by IDX.</p></div>
            <span className={styles.quietLabel}>{deliveries.length} retained</span>
          </div>
          {deliveries.length > 0 ? (
            <ul className={styles.deliveryList}>
                {deliveries.map((delivery) => (
                  <li key={delivery.reference} className={styles.deliveryItem} data-state={delivery.state}>
                  <span><strong>Delivery receipt</strong><small>{deliveryStateLabel(delivery.state)}</small></span>
                  <time dateTime={delivery.occurredAt}>{formatDateTime(delivery.occurredAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.inlineEmpty}>
              <h5>No retained delivery receipts</h5>
              <p>{data.summary.mode === "demo" ? "This synthetic fixture has no delivery receipts." : "No delivery evidence was returned for the retention window."} This is not proof that an inquiry was delivered.</p>
            </div>
          )}
        </section>
      </div>

      <div className={styles.contextGrid}>
        <section className={styles.contextSection} aria-labelledby="home-finder-access-title">
          <h4 id="home-finder-access-title">Access</h4>
          <p className={styles.contextValue}>{AVAILABILITY_LABELS[resource.availability]}</p>
          <p>Read-only access shows summaries only. It does not grant activation, destination changes, or buyer data.</p>
        </section>
        <section className={styles.contextSection} aria-labelledby="home-finder-service-title">
          <h4 id="home-finder-service-title">Service</h4>
          <p className={styles.contextValue}>Service details unavailable</p>
          <p>No accepted agreement, payer, or support responsibility is included in this view.</p>
        </section>
      </div>

      <div className={styles.requestBlock}>
        <div><h4>Need access?</h4><p>Use the existing support path. Nothing is sent or granted from this screen.</p></div>
        <button type="button" className={styles.secondaryAction} onClick={onCopy}><Clipboard size={16} aria-hidden="true" /> Copy access request</button>
        {copyMessage && <p className={styles.copyMessage} role="status">{copyMessage}</p>}
      </div>
    </section>
  );
}

function EmptyDetail({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return <div className={styles.detailEmpty}>{icon && <div className={styles.emptyIcon}>{icon}</div>}<h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function CustomersApp({
  collection,
  detail,
  organizationName,
  scenario,
  requestedCustomerId,
  initialResourceId,
  previewHref,
  preview = false,
  homeFinderData,
  basePath = BASE_PATH,
}: CustomersAppProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(() => initialResourceId || null);
  const [copyMessage, setCopyMessage] = useState("");
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim();
  const collectionUnavailable = preview && scenario === "unavailable";
  const visibleCustomers = useMemo(
    () => collection.customers.filter((customer) => customerMatches(customer, normalizedQuery)),
    [collection.customers, normalizedQuery],
  );
  const requestedCustomerKnown = !requestedCustomerId || collection.customers.some((customer) => customer.id === requestedCustomerId);
  const detailInVisibleScope = Boolean(detail && visibleCustomers.some((customer) => customer.id === detail.customer.id));
  const visibleDetail = !collectionUnavailable && requestedCustomerKnown && detailInVisibleScope ? detail : undefined;
  const selectedHomeFinder = visibleDetail?.resources.find((resource) => resource.id === selectedResourceId && resource.kind === "home_finder_installation") || undefined;
  const selectedHomeFinderData = selectedHomeFinder
    ? homeFinderData?.[selectedHomeFinder.id] || (preview && selectedHomeFinder.id === CUSTOMER_PREVIEW_HOME_FINDER.resourceId ? previewHomeFinderData(previewHref) : undefined)
    : undefined;
  const visibleDetailId = visibleDetail?.customer.id;

  useEffect(() => {
    if (visibleDetailId) {
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      detailHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [visibleDetailId]);

  const scope = scopeKey(scenario);
  const request = visibleDetail && selectedHomeFinder
    ? requestHref(visibleDetail.customer, organizationName, selectedHomeFinder.label || "Home Finder")
    : "mailto:hello@strelva.com?subject=Customer%20access";

  async function copyAccessRequest() {
    const body = visibleDetail && selectedHomeFinder
      ? [
          `Organization scope: ${organizationName}`,
          `Customer: ${visibleDetail.customer.displayName}`,
          `Resource: ${selectedHomeFinder.label || "Home Finder"}`,
          "",
          "I would like to discuss Home Finder access for this customer.",
        ].join("\n")
      : "I would like to discuss scoped customer access.";
    try {
      await navigator.clipboard.writeText(body);
      setCopyMessage("Copied. Nothing was sent or granted.");
    } catch {
      setCopyMessage("Copy is unavailable. Select the request in your email app instead.");
    }
  }

  function selectScope(nextScope: string) {
    const option = SCOPE_OPTIONS.find((item) => item.id === nextScope);
    if (!option) return;
    router.push(`${basePath}?scenario=${encodeURIComponent(option.scenario)}`);
  }

  function clearSearch() {
    setQuery("");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function openHomeFinder(resource: CustomerResourceView) {
    setSelectedResourceId(resource.id);
    setCopyMessage("");
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    if (preview && visibleDetail) {
      const params = new URLSearchParams({ scenario, resourceId: resource.id });
      router.push(`${basePath}/${encodeURIComponent(visibleDetail.customer.id)}?${params.toString()}`);
    }
  }

  return (
    <div className={styles.preview} data-dashboard>
      {preview && (
        <aside className={styles.previewControls} aria-label="Local Customers preview controls">
          <div><strong>Customers preview</strong><span>Fictional relationships · changes reset on reload · no live actions</span></div>
          <label htmlFor="customers-preview-scenario">Example<select id="customers-preview-scenario" value={scenario} onChange={(event) => router.push(`${basePath}?scenario=${encodeURIComponent(event.target.value)}`)}>{CUSTOMER_PREVIEW_SCENARIOS.map((item) => <option key={item} value={item}>{SCENARIO_LABELS[item]}</option>)}</select></label>
        </aside>
      )}
      <StrelvaShell
        appBase="/preview/strelva"
        signOut={null}
        title="Customers"
        accountName="Morgan Reed"
        accountDetail={`${organizationName} · Fictional`}
        active={undefined}
        context={<label className={styles.scopeControl}><span>Scope</span><select aria-label="Organization scope" value={scope} onChange={(event) => selectScope(event.target.value)}>{SCOPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
        navigation={<section aria-label="Organization"><h2>Organization</h2><Link href={`${basePath}?scenario=${encodeURIComponent(scenario)}`} aria-current="page"><Building2 size={16} aria-hidden="true" /><span>Customers</span></Link></section>}
        notice={<div className={styles.notice} role="note"><strong>Fictional access preview</strong><span>Customer mappings are synthetic. Availability is not an authorization or service promise.</span></div>}
        contentId="customers-main"
      >
        <div ref={scrollRef} className={styles.scroll} aria-busy={false}>
          <div className={styles.page}>
            <header className={styles.pageHeader}>
              <p className={styles.eyebrow}>{scenario === "direct" ? "Resources · Direct brokerage" : `Customers · ${organizationName}`}</p>
              <h1>{scenario === "direct" ? "Your resources" : "Customers you can access"}</h1>
              <p>{scenario === "direct" ? "Open your website or Home Finder." : "Choose a customer to see the resources this organization can read."}</p>
            </header>

            <div className={styles.customerWorkspace}>
              <section className={styles.collectionPanel} aria-labelledby="customer-list-title">
                <div className={styles.collectionHeader}>
                  <div><h2 id="customer-list-title">{scenario === "direct" ? "Your resources" : "Customers you can access"}</h2><p>{collectionUnavailable ? "Count unavailable" : `${collection.customers.length} customer${collection.customers.length === 1 ? "" : "s"}`}</p></div>
                  <span className={styles.scopeBadge}>{organizationName}</span>
                </div>
                <div className={styles.searchRow}>
                  <label className={styles.searchField}>
                    <Search size={17} aria-hidden="true" />
                    <span className="sr-only">Search customers</span>
                    <input ref={searchInputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or domain" aria-label="Search customers" />
                  </label>
                  {normalizedQuery && <button type="button" className={styles.clearSearch} onClick={clearSearch}>Clear</button>}
                </div>
                {collectionUnavailable ? (
                  <div className={styles.collectionState} role="status"><TriangleAlert size={20} aria-hidden="true" /><h3>Customers are unavailable</h3><p>The organization could not be read. Nothing has been confirmed.</p><button type="button" className={styles.textAction} onClick={() => router.refresh()}>Try again <ArrowRight size={15} aria-hidden="true" /></button></div>
                ) : visibleCustomers.length > 0 ? (
                  <div className={styles.customerList}>
                    {visibleCustomers.map((customer) => {
                      const isSelected = visibleDetail?.customer.id === customer.id;
                      return <Link key={customer.id} href={`${basePath}/${encodeURIComponent(customer.id)}?scenario=${encodeURIComponent(scenario)}`} className={styles.customerRow} aria-current={isSelected ? "page" : undefined} prefetch={false}>
                        <span className={styles.customerInitial} aria-hidden="true">{customer.displayName.slice(0, 1).toUpperCase()}</span>
                        <span className={styles.customerRowCopy}><strong>{customer.displayName}</strong><small>{customer.domain || "Organization"}</small></span>
                        <span className={styles.customerRowMeta}>{isSelected ? "Open" : <ArrowUpRight size={16} aria-hidden="true" />}</span>
                      </Link>;
                    })}
                  </div>
                ) : (
                  <div className={styles.collectionState} role="status"><Search size={20} aria-hidden="true" /><h3>{normalizedQuery ? `No customers match “${normalizedQuery}”` : "No customers assigned"}</h3><p>{normalizedQuery ? "Try a different name or domain within this organization." : "An explicit relationship and read assignment must exist before a customer appears here."}</p>{normalizedQuery ? <button type="button" className={styles.textAction} onClick={clearSearch}>Clear search <ArrowRight size={15} aria-hidden="true" /></button> : <a className={styles.textAction} href="mailto:hello@strelva.com?subject=Customer%20access">Ask about customer access <ArrowRight size={15} aria-hidden="true" /></a>}</div>
                )}
              </section>

              <section className={styles.detailPanel} aria-labelledby={visibleDetail ? "customer-detail-title" : undefined}>
                {visibleDetail ? (
                  <>
                    <Link className={styles.backLink} href={`${basePath}?scenario=${encodeURIComponent(scenario)}`}><ArrowLeft size={15} aria-hidden="true" /> Customers</Link>
                    <header className={styles.detailHeader}>
                      <p className={styles.eyebrow}>Customer · {organizationName}</p>
                      <h2 id="customer-detail-title" ref={detailHeadingRef} tabIndex={-1}>{visibleDetail.customer.displayName}</h2>
                      <p>{visibleDetail.customer.kind === "organization" ? "Organization" : "Person"}{visibleDetail.customer.domain ? ` · ${visibleDetail.customer.domain}` : ""}</p>
                      <div className={styles.detailMeta}><span className={styles.statusBadge} data-state="available">Read-only access</span><span>{provenanceLabel(visibleDetail.customer.provenance.source)} · observed {formatDate(visibleDetail.customer.observedAt)}</span></div>
                    </header>

                    <section className={styles.resourcesSection} aria-labelledby="authorized-resources-title">
                      <div className={styles.sectionHeading}><div><h3 id="authorized-resources-title">Resources</h3><p>Only resources this organization can read appear here.</p></div><span className={styles.quietLabel}>{visibleDetail.resources.length} resource{visibleDetail.resources.length === 1 ? "" : "s"}</span></div>
                      {visibleDetail.resources.length > 0 ? <ul className={styles.resourceList}>{visibleDetail.resources.map((resource) => { const Icon = RESOURCE_ICONS[resource.kind]; const selected = resource.id === selectedResourceId; return <li key={resource.id} className={styles.resourceRow} data-selected={selected || undefined}><span className={styles.resourceIcon}><Icon size={18} aria-hidden="true" /></span><span className={styles.resourceCopy}><strong>{resource.label || RESOURCE_LABELS[resource.kind]}</strong><small>{RESOURCE_LABELS[resource.kind]} · {resourceAvailabilityCopy(resource.availability)}</small></span><span className={styles.resourceRight}><span className={styles.statusBadge} data-state={resource.availability}>{AVAILABILITY_LABELS[resource.availability]}</span><ResourceAction resource={resource} onOpenHomeFinder={openHomeFinder} /></span></li>; })}</ul> : <div className={styles.inlineEmpty}><h4>No resources</h4><p>This customer has no resources available to this organization.</p></div>}
                    </section>

                    {selectedHomeFinder && <HomeFinderPanel resource={selectedHomeFinder} data={selectedHomeFinderData} request={request} copyMessage={copyMessage} onCopy={() => void copyAccessRequest()} />}
                  </>
                ) : requestedCustomerId && !requestedCustomerKnown ? (
                  <EmptyDetail title="Customer unavailable" description="This customer is unavailable to your account. Return to the Customers list without revealing another customer." icon={<ShieldAlert size={22} aria-hidden="true" />} action={<Link className={styles.primaryAction} href={`${basePath}?scenario=${encodeURIComponent(scenario)}`}>Back to Customers <ArrowRight size={16} aria-hidden="true" /></Link>} />
                ) : collectionUnavailable ? (
                  <EmptyDetail title="Customer details are unavailable" description="The organization source could not be read, so no customer or resource has been confirmed." icon={<TriangleAlert size={22} aria-hidden="true" />} />
                ) : normalizedQuery && visibleCustomers.length === 0 ? (
                  <EmptyDetail title="No customer selected" description="Clear the search or choose a customer from the Customers list." icon={<Search size={22} aria-hidden="true" />} action={<button type="button" className={styles.secondaryAction} onClick={clearSearch}>Clear search</button>} />
                ) : visibleCustomers.length > 0 ? (
                  <EmptyDetail title="Select a customer" description="Choose a customer to see the resources this organization can read." icon={<Building2 size={22} aria-hidden="true" />} />
                ) : null}
              </section>
            </div>
          </div>
        </div>
      </StrelvaShell>
    </div>
  );
}
