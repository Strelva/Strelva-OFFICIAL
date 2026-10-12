"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  FileSearch,
  Globe2,
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
import { StCopy, StEmpty, StField, StHead, StNotice, StPage, StPill, StPillLink, StRow, StRows, StSection, StState, StTextButton, StTextField } from "@/components/ui/strelva/Kit";

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
  assigned: "Assigned clients",
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
    `Client: ${customer.displayName}`,
    `Resource: ${resourceLabel}`,
    "",
    "I would like to discuss Home Finder access for this client.",
  ].join("\n");
  return `mailto:hello@strelva.com?subject=${encodeURIComponent("Home Finder access")}&body=${encodeURIComponent(body)}`;
}

function resourceAvailabilityCopy(availability: CustomerResourceView["availability"]): string {
  if (availability === "available") return "Read-only access is available.";
  if (availability === "not_configured") return "Read-only access is not set up.";
  if (availability === "revoked") return "Read-only access was revoked. Nothing is shown.";
  return "This resource is unavailable. It is not an empty resource.";
}

function ResourceAction({ resource, onOpenHomeFinder }: {
  resource: CustomerResourceView;
  onOpenHomeFinder: (resource: CustomerResourceView) => void;
}) {
  const label = resource.label || RESOURCE_LABELS[resource.kind];
  const href = safeHttpHref(resource.href);
  if (resource.kind === "home_finder_installation" && resource.availability !== "revoked") {
    return <StTextButton onClick={() => onOpenHomeFinder(resource)} aria-label={`${resource.availability === "not_configured" ? "See requirements for" : "Open"} ${label}`}>
      {resource.availability === "not_configured" ? "See requirements" : resource.availability === "unavailable" ? "View unavailable state" : "Open Home Finder"}
    </StTextButton>;
  }
  if (resource.availability === "available" && href) return <StTextButton href={href}>Open {RESOURCE_LABELS[resource.kind]}</StTextButton>;
  return null;
}

function HomeFinderPanel({ resource, data, request, copyMessage, onCopy }: {
  resource: CustomerResourceView;
  data?: HomeFinderPanelData;
  request: string;
  copyMessage: string;
  onCopy: () => void;
}) {
  const previewHref = safeHttpHref(data?.summary.previewHref);
  if (resource.availability === "revoked") return <StSection title="Home Finder · Access"><StNotice tone="critical">Access revoked. {resourceAvailabilityCopy(resource.availability)}</StNotice></StSection>;
  if (resource.availability === "unavailable") return <StSection title="Home Finder"><StNotice tone="critical">Home Finder is unavailable. {resourceAvailabilityCopy(resource.availability)} Readiness and delivery evidence were not returned.</StNotice></StSection>;
  if (resource.availability === "not_configured" && !data) return <StSection title="Home Finder"><StEmpty>Home Finder is not set up. {resourceAvailabilityCopy(resource.availability)} There is no buyer preview or delivery evidence to show for this resource.</StEmpty></StSection>;
  if (!data) return <StSection title="Home Finder"><StNotice>Management details are unavailable. {resourceAvailabilityCopy(resource.availability)} No provider payload or raw receipt data is exposed here.</StNotice></StSection>;
  const readiness = data.readiness.readiness;
  const deliveries = data.deliveries.items;
  const readinessSources = Array.from(new Set(readiness.map(item => item.source))).join(" · ");
  return <>
    <StSection title={resource.label || "Home Finder"} meta={`${data.summary.brokerageName} · observed ${formatDateTime(data.summary.observedAt)}`}>
      <StCopy muted>Evidence source: {readinessSources || "Not returned"}</StCopy>
      {data.summary.mode === "demo" ? <StNotice>This is a buyer-facing synthetic preview. It uses no live listings, and buyer inquiries are not sent or stored.</StNotice> : null}
      <div className="flex flex-wrap items-center gap-4">
        {previewHref ? <StTextButton href={previewHref} target="_blank" rel="noreferrer">Open buyer preview</StTextButton> : null}
        <StTextButton href={request}>Email Strelva about access</StTextButton>
      </div>
    </StSection>
    <StSection title="Readiness" meta={`${readiness.length} checks`}>
      <StCopy muted>Evidence required before a live claim.</StCopy>
      {readiness.length ? <StRows label="Home Finder readiness">{readiness.map(item => <StRow key={item.requirement} title={item.requirement} detail={`${item.responsibleParty} · Source: ${item.source}`} value={<time dateTime={item.observedAt}>{formatDate(item.observedAt)}</time>} end={<StState kind={item.state === "confirmed" ? "live" : item.state === "missing" ? "down" : "need"}>{stateLabel(item.state)}</StState>} />)}</StRows> : <StEmpty>No readiness evidence was returned.</StEmpty>}
    </StSection>
    <StSection title="Delivery evidence" meta={`${deliveries.length} retained`}>
      <StCopy muted>Content-free receipts retained by IDX.</StCopy>
      {deliveries.length ? <StRows label="Delivery evidence">{deliveries.map(delivery => <StRow key={delivery.reference} title="Delivery receipt" detail={deliveryStateLabel(delivery.state)} value={<time dateTime={delivery.occurredAt}>{formatDateTime(delivery.occurredAt)}</time>} />)}</StRows> : <StEmpty>No retained delivery receipts. {data.summary.mode === "demo" ? "This synthetic fixture has no delivery receipts." : "No delivery evidence was returned for the retention window."} This is not proof that an inquiry was delivered.</StEmpty>}
    </StSection>
    <StSection title="Access & service">
      <StRows label="Access and service context">
        <StRow title="Access" value={AVAILABILITY_LABELS[resource.availability]} detail="Read-only access shows summaries only. It does not grant activation, destination changes, or buyer data." />
        <StRow title="Service details unavailable" detail="No accepted agreement, payer, or support responsibility is included in this view." />
      </StRows>
      <StCopy muted>Need access? Use the existing support path. Nothing is sent or granted from this screen.</StCopy>
      <StPill variant="soft" onClick={onCopy}>Copy access request</StPill>
      {copyMessage ? <div role="status"><StNotice>{copyMessage}</StNotice></div> : null}
    </StSection>
  </>;
}

function EmptyDetail({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <StSection title={title}><StEmpty action={action}>{description}</StEmpty></StSection>;
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
  const detailHeadingRef = useRef<HTMLSpanElement>(null);
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
          `Client: ${visibleDetail.customer.displayName}`,
          `Resource: ${selectedHomeFinder.label || "Home Finder"}`,
          "",
          "I would like to discuss Home Finder access for this client.",
        ].join("\n")
      : "I would like to discuss scoped client access.";
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

  return <div data-workspace-theme="linen" className="min-h-dvh bg-surface-base text-warm-black">
    {preview ? <aside className="px-6 py-4" aria-label="Local Customers preview controls">
      <StField label="Preview example" hint="Fictional relationships · changes reset on reload · no live actions">
        <select value={scenario} onChange={event => router.push(`${basePath}?scenario=${encodeURIComponent(event.target.value)}`)}>{CUSTOMER_PREVIEW_SCENARIOS.map(item => <option key={item} value={item}>{SCENARIO_LABELS[item]}</option>)}</select>
      </StField>
    </aside> : null}
    <StrelvaShell appBase="/preview/strelva" signOut={null} title="Customers" accountName="Morgan Reed" accountDetail={`${organizationName} · Fictional`} active={undefined}
      context={<StField label="Organization scope"><select value={scope} onChange={event => selectScope(event.target.value)}>{SCOPE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></StField>}
      navigation={<section aria-label="Organization"><h2>Organization</h2><Link href={`${basePath}?scenario=${encodeURIComponent(scenario)}`} aria-current="page"><Building2 size={16} aria-hidden="true" /><span>Customers</span></Link></section>}
      notice={<p className="px-6 py-2 text-xs text-gray-muted">Fictional access preview · Client mappings are synthetic. Availability is not an authorization or service promise.</p>} contentId="customers-main">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <StPage>
          <StHead title={scenario === "direct" ? "Your resources" : "Customers"} meta={scenario === "direct" ? "Open your website or Home Finder." : `Choose a customer to see the resources ${organizationName} can read.`} />
          <StSection title="Customer relationships" meta={collectionUnavailable ? "Count unavailable" : `${collection.customers.length} customer${collection.customers.length === 1 ? "" : "s"}`}>
            <StTextField ref={searchInputRef} type="search" label="Search customers" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or domain" />
            {normalizedQuery ? <StTextButton onClick={clearSearch}>Clear search</StTextButton> : null}
            {collectionUnavailable ? <StNotice tone="critical" action={<StTextButton onClick={() => router.refresh()}>Try again</StTextButton>}>Customers are unavailable. The organization could not be read. Nothing has been confirmed.</StNotice>
              : visibleCustomers.length ? <StRows label="Customer relationships">{visibleCustomers.map(customer => <StRow key={customer.id} title={customer.displayName} detail={customer.domain || "Organization"} href={`${basePath}/${encodeURIComponent(customer.id)}?scenario=${encodeURIComponent(scenario)}`} selected={visibleDetail?.customer.id === customer.id} end={<ArrowRight size={16} aria-hidden="true" />} />)}</StRows>
                : <StEmpty action={normalizedQuery ? <StTextButton onClick={clearSearch}>Clear search</StTextButton> : <StTextButton href="mailto:hello@strelva.com?subject=Customer%20access">Ask about customer access</StTextButton>}>
                  {normalizedQuery ? `No customers match “${normalizedQuery}”. Try a different name or domain within this organization.` : "No customers assigned. An explicit relationship and read assignment must exist before a customer appears here."}
                </StEmpty>}
          </StSection>
          {visibleDetail ? <>
            <StSection title={<span ref={detailHeadingRef} tabIndex={-1}>{visibleDetail.customer.displayName}</span>} meta={`${provenanceLabel(visibleDetail.customer.provenance.source)} · observed ${formatDate(visibleDetail.customer.observedAt)}`}>
              <StCopy muted>{visibleDetail.customer.kind === "organization" ? "Organization" : "Person"}{visibleDetail.customer.domain ? ` · ${visibleDetail.customer.domain}` : ""} · Read-only access</StCopy>
            </StSection>
            <StSection title="Resources" meta={`${visibleDetail.resources.length} resource${visibleDetail.resources.length === 1 ? "" : "s"}`}>
              <StCopy muted>Only resources this organization can read appear here.</StCopy>
              {visibleDetail.resources.length ? <StRows label="Authorized resources">{visibleDetail.resources.map(resource => {
                const Icon = RESOURCE_ICONS[resource.kind];
                return <StRow key={resource.id} selected={resource.id === selectedResourceId} lead={<Icon size={18} aria-hidden="true" />} title={resource.label || RESOURCE_LABELS[resource.kind]} detail={`${RESOURCE_LABELS[resource.kind]} · ${resourceAvailabilityCopy(resource.availability)}`} value={AVAILABILITY_LABELS[resource.availability]} end={<ResourceAction resource={resource} onOpenHomeFinder={openHomeFinder} />} />;
              })}</StRows> : <StEmpty>This customer has no resources available to this organization.</StEmpty>}
            </StSection>
            {selectedHomeFinder ? <HomeFinderPanel resource={selectedHomeFinder} data={selectedHomeFinderData} request={request} copyMessage={copyMessage} onCopy={() => void copyAccessRequest()} /> : null}
          </> : requestedCustomerId && !requestedCustomerKnown ? <EmptyDetail title="Customer unavailable" description="This customer is unavailable to your account. Return to the Customers list without revealing another customer." action={<StPillLink href={`${basePath}?scenario=${encodeURIComponent(scenario)}`}>Back to Customers</StPillLink>} />
            : collectionUnavailable ? <EmptyDetail title="Customer details are unavailable" description="The organization source could not be read, so no customer or resource has been confirmed." />
              : normalizedQuery && !visibleCustomers.length ? <EmptyDetail title="No customer selected" description="Clear the search or choose a customer from the Customers list." action={<StTextButton onClick={clearSearch}>Clear search</StTextButton>} />
                : visibleCustomers.length ? <EmptyDetail title="Select a customer" description="Choose a customer to see the resources this organization can read." /> : null}
        </StPage>
      </div>
    </StrelvaShell>
  </div>;
}
