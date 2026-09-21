import type {
  CustomerCollection,
  CustomerDetail,
  CustomerResourceView,
  CustomerSummary,
} from "@/platform/customers";
import type {
  HomeFinderDeliveryDetail,
  HomeFinderDeliveryPage,
  HomeFinderInstallationSummary,
  HomeFinderReadiness,
} from "@/products/home-finder/contracts";

export const CUSTOMER_PREVIEW_SCENARIOS = [
  "assigned",
  "direct",
  "revoked",
  "empty",
  "unavailable",
] as const;

export type CustomerPreviewScenario = (typeof CUSTOMER_PREVIEW_SCENARIOS)[number];

const ORGANIZATIONS = {
  northstar: "10000000-0000-4000-8000-000000000001",
  direct: "10000000-0000-4000-8000-000000000003",
} as const;

const observedAt = "2026-09-08T12:00:00.000Z";

/** Fictional content-free management data for the populated preview state. */
export const CUSTOMER_PREVIEW_HOME_FINDER = {
  resourceId: "40000000-0000-4000-8000-000000000008",
  installationId: "preview-installation-alder",
  summary: {
    schemaVersion: "1",
    id: "preview-installation-alder",
    brokerageName: "Alder & Pine Realty",
    mode: "demo",
    previewHref: "/embed/agency-preview",
    observedAt,
    readiness: [],
  } satisfies HomeFinderInstallationSummary,
  readiness: {
    schemaVersion: "1",
    installationId: "preview-installation-alder",
    observedAt,
    readiness: [
      {
        requirement: "Provider authorization",
        state: "unverified",
        source: "Fictional preview configuration",
        observedAt,
        responsibleParty: "Fictional brokerage",
      },
    ],
  } satisfies HomeFinderReadiness,
  receipts: {
    schemaVersion: "1",
    installationId: "preview-installation-alder",
    observedAt,
    items: [
      {
        reference: "preview-receipt-001",
        state: "delivered",
        occurredAt: observedAt,
        expiresAt: "2026-10-08T12:00:00.000Z",
      },
    ],
  } satisfies HomeFinderDeliveryPage,
  receipt: {
    schemaVersion: "1",
    installationId: "preview-installation-alder",
    observedAt,
    reference: "preview-receipt-001",
    state: "delivered",
    occurredAt: observedAt,
    expiresAt: "2026-10-08T12:00:00.000Z",
  } satisfies HomeFinderDeliveryDetail,
} as const;

const summaries: Record<string, CustomerSummary> = {
  alder: {
    id: "30000000-0000-4000-8000-000000000001",
    displayName: "Alder & Pine Realty",
    kind: "organization",
    domain: "alderpine.example",
    observedAt,
    provenance: { source: "operator_reviewed", observedAt },
  },
  cedar: {
    id: "30000000-0000-4000-8000-000000000003",
    displayName: "Cedar Lane Homes",
    kind: "organization",
    domain: "cedarlane.example",
    observedAt,
    provenance: { source: "operator_reviewed", observedAt },
  },
  direct: {
    id: "30000000-0000-4000-8000-000000000004",
    displayName: "Alder & Pine Realty",
    kind: "organization",
    domain: "alderpine.example",
    observedAt,
    provenance: { source: "direct_mapping", observedAt },
  },
  revoked: {
    id: "30000000-0000-4000-8000-000000000006",
    displayName: "Harbor & Field Brokerage",
    kind: "organization",
    domain: "harborfield.example",
    observedAt,
    provenance: { source: "reconciled", observedAt },
  },
};

const resources: Record<string, CustomerResourceView[]> = {
  alder: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      kind: "website",
      label: "Alder & Pine website",
      availability: "available",
      observedAt,
      href: "/preview/strelva/website/dashboard/site",
    },
    {
      id: "40000000-0000-4000-8000-000000000002",
      kind: "home_finder_installation",
      label: "Alder & Pine Home Finder",
      availability: "not_configured",
      observedAt,
    },
    {
      id: CUSTOMER_PREVIEW_HOME_FINDER.resourceId,
      kind: "home_finder_installation",
      label: "Alder & Pine managed installation",
      availability: "available",
      observedAt,
      href: `/api/customers/${summaries.alder!.id}/resources/${CUSTOMER_PREVIEW_HOME_FINDER.resourceId}?organizationId=${ORGANIZATIONS.northstar}&view=summary`,
    },
  ],
  cedar: [
    {
      id: "40000000-0000-4000-8000-000000000004",
      kind: "home_finder_installation",
      label: "Cedar Lane Home Finder",
      availability: "unavailable",
      observedAt,
    },
    {
      id: "40000000-0000-4000-8000-000000000005",
      kind: "assessment",
      label: "Cedar Lane assessment",
      availability: "revoked",
      observedAt,
    },
  ],
  direct: [
    {
      id: "40000000-0000-4000-8000-000000000006",
      kind: "website",
      label: "Alder & Pine direct website",
      availability: "available",
      observedAt,
      href: "/preview/strelva/website/dashboard/site",
    },
    {
      id: "40000000-0000-4000-8000-000000000009",
      kind: "home_finder_installation",
      label: "Alder & Pine direct Home Finder",
      availability: "available",
      observedAt,
      href: "/preview/strelva/customers?scenario=direct&resource=home-finder",
    },
  ],
  revoked: [
    {
      id: "40000000-0000-4000-8000-000000000007",
      kind: "website",
      label: "Harbor & Field website",
      availability: "revoked",
      observedAt,
    },
  ],
};

const details: Record<string, CustomerDetail> = {
  alder: { organizationId: ORGANIZATIONS.northstar, customer: summaries.alder!, resources: resources.alder! },
  cedar: { organizationId: ORGANIZATIONS.northstar, customer: summaries.cedar!, resources: resources.cedar! },
  direct: { organizationId: ORGANIZATIONS.direct, customer: summaries.direct!, resources: resources.direct! },
  revoked: { organizationId: ORGANIZATIONS.northstar, customer: summaries.revoked!, resources: resources.revoked! },
};

const customersByScenario: Record<CustomerPreviewScenario, CustomerSummary[]> = {
  assigned: [summaries.alder!, summaries.cedar!],
  direct: [summaries.direct!],
  revoked: [summaries.revoked!],
  empty: [],
  unavailable: [summaries.cedar!],
};

const detailKeyById = new Map(
  Object.entries(summaries).map(([key, summary]) => [summary.id, key]),
);

export function customerPreviewScenario(value: string | undefined): CustomerPreviewScenario {
  return CUSTOMER_PREVIEW_SCENARIOS.includes(value as CustomerPreviewScenario)
    ? value as CustomerPreviewScenario
    : "assigned";
}

export function customerPreviewState(
  scenario: CustomerPreviewScenario,
  query = "",
  selectedCustomerId?: string,
): {
  collection: CustomerCollection;
  detail?: CustomerDetail;
  selectedCustomerId?: string;
} {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const customers = customersByScenario[scenario].filter((customer) => {
    if (!normalizedQuery) return true;
    return customer.displayName.toLocaleLowerCase("en-US").includes(normalizedQuery) ||
      customer.domain?.toLocaleLowerCase("en-US").includes(normalizedQuery) === true;
  });
  const resolvedId = selectedCustomerId && customers.some((customer) => customer.id === selectedCustomerId)
    ? selectedCustomerId
    : customers[0]?.id;
  const key = resolvedId ? detailKeyById.get(resolvedId) : undefined;
  return {
    collection: { organizationId: details[key ?? ""]?.organizationId ?? ORGANIZATIONS.northstar, customers },
    ...(key ? { detail: details[key] } : {}),
    ...(resolvedId ? { selectedCustomerId: resolvedId } : {}),
  };
}

export function customerPreviewOrganization(scenario: CustomerPreviewScenario): string {
  return scenario === "direct" ? "Direct brokerage" : "Northstar agency";
}
