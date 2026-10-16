/**
 * Fictional money fixtures for the xs-money preview (Harbor Dental, Dr. Amy
 * Lin, 1180 Elmwood Ave; North Studio, Maya Okafor). Local presentation only:
 * no server calls, no Stripe, no sends.
 */
import type {
  BusinessBilling,
  AgencyBilling,
} from "@/platform/business-billing";
import type { AgencyInvoice } from "@/platform/agency-billing/types";
import type {
  AgencyPayLink,
  MoneyDocument,
} from "@/platform/agency-pay-links/types";
import type {
  PayerTransition,
  PayerTransitionSnapshot,
} from "@/platform/work-economics/payer-transitions";
import { UNRELEASED_CHECKOUT } from "@/experience/workspace/billing/AgencyCheckoutStatus";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import type { GovernedMoneyGraph } from "@/platform/connect/governed-money-contract";
import type {
  NeutralCreatorSources,
  NeutralVersionMoneyGraph,
} from "@/platform/connect/neutral-creator-contract";
import type { CreatorMaintenanceGraph } from "@/platform/connect/creator-maintenance";

export const XS = {
  harbor: "a7000000-0000-4000-8000-000000000001",
  north: "a7000000-0000-4000-8000-000000000002",
  coast: "a7000000-0000-4000-8000-000000000003",
  fieldwork: "a7000000-0000-4000-8000-000000000004",
  lakeview: "a7000000-0000-4000-8000-000000000005",
  account: "a7000000-0000-4000-8000-000000000010",
  amy: "a7000000-0000-4000-8000-000000000020",
  maya: "a7000000-0000-4000-8000-000000000021",
  system: "a7000000-0000-4000-8000-000000000030",
  source: "a7000000-0000-4000-8000-000000000031",
  listing: "a7000000-0000-4000-8000-000000000032",
  version: "a7000000-0000-4000-8000-000000000033",
} as const;

export const NORTH_BRAND: OwnerBrand = {
  agencyId: XS.north,
  name: "North Studio",
  logoUrl: null,
  accentColor: "#2f5236",
  replyTo: null,
  credit: "runs_on_strelva",
};
export const CLIENT_COLORS = {
  harbor: "#2f5236",
  coast: "#9c522c",
  lakeview: "#4f7590",
  fieldwork: "#6b6f68",
} as const;

export const harborBilling: BusinessBilling = {
  workspaceId: XS.harbor,
  accountId: XS.account,
  state: "subscription",
  openItem: false,
  paymentStatus: "active",
  monthlyCents: 15000,
  planKey: "workspace",
  grandfatheredTerms: null,
  paidThrough: "2026-11-01",
  payer: { email: "dr.lin@harbordental.com", name: "Dr. Amy Lin" },
  payerParty: {
    kind: "business",
    workspaceId: XS.harbor,
    name: "Harbor Dental",
  },
  sites: [
    {
      tenantId: "harbor-dental",
      siteName: "harbordental.com",
      amountCents: 15000,
    },
  ],
  sources: null,
  paymentUpdatedAt: "2026-10-01T12:00:00Z",
};
export const harborBillingAgencyPays: BusinessBilling = {
  ...harborBilling,
  payer: null,
  payerParty: { kind: "agency", workspaceId: XS.north, name: "North Studio" },
};

export const harborBudget = {
  spentUsd: "3.50",
  reservedUsd: "1.25",
  capCents: 2500,
  subscribed: true,
  since: "2026-10-01T00:00:00Z",
  resetsAt: "2026-11-01T00:00:00Z",
  unknownCostCalls: 0,
};

const invoiceBase = {
  agency_workspace_id: XS.north,
  currency: "usd",
  provider_object_id: null,
  provider_account_id: null,
  checkout_url: null,
} as const;
export const harborRetail: AgencyInvoice = {
  ...invoiceBase,
  id: "a7000000-0000-4000-8000-000000000101",
  business_workspace_id: XS.harbor,
  kind: "rebill",
  amount_cents: 45000,
  description: "Website care, booking page and inquiry follow-up, every month",
  status: "proposed",
  can_accept: true,
  can_manage: false,
};
export const coastRetail: AgencyInvoice = {
  ...invoiceBase,
  id: "a7000000-0000-4000-8000-000000000102",
  business_workspace_id: XS.coast,
  kind: "pay_link",
  amount_cents: 120000,
  description: "Pages for six new listings",
  status: "accepted",
  can_manage: true,
};

export function agencyBilling(priced: boolean): AgencyBilling {
  const line = (
    workspaceId: string,
    name: string,
    cents: number,
    invoices: AgencyInvoice[] = [],
  ) => ({
    workspaceId,
    name,
    state: "subscription" as const,
    paymentStatus: "active",
    lineState: "active" as const,
    monthlyCents: priced ? cents : null,
    planKey: "workspace",
    endedAt: null,
    invoices,
  });
  return {
    workspaceId: XS.north,
    accountId: XS.account,
    name: "North Studio",
    paymentStatus: "active",
    clients: [
      line(XS.harbor, "Harbor Dental", 4800, [harborRetail]),
      line(XS.coast, "North Coast Realty", 3600, [coastRetail]),
      line(XS.fieldwork, "Fieldwork Studio", 2400),
      line(XS.lakeview, "Lakeview Mediation", 1200),
    ],
  };
}

const transition = (over: Partial<PayerTransition>): PayerTransition => ({
  id: "a7000000-0000-4000-8000-000000000201",
  workspaceId: XS.harbor,
  successorKind: "agency",
  canRespond: false,
  successorUserId: "",
  successorEmail: "",
  successorWorkspaceId: XS.north,
  successorWorkspaceName: "North Studio",
  proposerEmail: "dr.lin@harbordental.com",
  status: "pending",
  proposedAt: "2026-10-14T15:12:00Z",
  resolvedAt: null,
  acceptedAt: null,
  workspaceName: "Harbor Dental",
  ...over,
});
export const payerPending = transition({});
export const payerAccepted = transition({
  id: "a7000000-0000-4000-8000-000000000202",
  status: "accepted",
  acceptedAt: "2026-10-02T14:00:00Z",
  resolvedAt: "2026-10-02T14:00:00Z",
  proposedAt: "2026-10-01T09:00:00Z",
});
export function payerSnapshot(
  kind: "none" | "pending" | "accepted",
): PayerTransitionSnapshot {
  const transitions =
    kind === "pending"
      ? [payerPending]
      : kind === "accepted"
        ? [payerAccepted]
        : [];
  return {
    transitions,
    current: kind === "accepted" ? payerAccepted : null,
    pending: kind === "pending" ? payerPending : null,
    currentActorId: XS.amy,
  };
}
export const agencyInbox: PayerTransitionSnapshot = {
  transitions: [
    { ...payerPending, canRespond: true },
    {
      ...payerPending,
      id: "a7000000-0000-4000-8000-000000000203",
      workspaceId: XS.lakeview,
      workspaceName: "Lakeview Mediation",
      proposerEmail: "ruth@lakeviewmediation.com",
      canRespond: true,
    },
  ],
  current: null,
  pending: null,
  currentActorId: XS.maya,
  jobs: [
    {
      id: "a7000000-0000-4000-8000-000000000301",
      workspaceId: XS.harbor,
      workspaceName: "Harbor Dental",
      productId: "website",
      resourceKind: "job",
      estimateCents: 6000,
      maxAuthorizedCents: 9600,
      reservedCents: 2400,
      usedCents: 1800,
      actualCents: null,
      actualKnown: false,
      status: "draft",
      createdAt: "2026-10-15T13:00:00Z",
    },
  ],
};

const link = (over: Partial<AgencyPayLink>): AgencyPayLink => ({
  id: "a7000000-0000-4000-8000-000000000401",
  slug: "harbor-dental-k3x9q",
  rail: "connected_account",
  agencyWorkspaceId: XS.north,
  businessWorkspaceId: XS.harbor,
  clientName: "Harbor Dental",
  description:
    "Website care for November: booking page, hours and two inquiry follow-ups",
  door: null,
  amountCents: 125050,
  minCents: null,
  maxCents: null,
  currency: "usd",
  agencyDisplayName: "North Studio",
  createdBy: null,
  createdAt: "2026-10-09T15:00:00Z",
  revokedAt: null,
  revokedBy: null,
  checkoutGeneration: 1,
  legacyTenantId: null,
  leadSlug: null,
  returnUrl: null,
  status: "open",
  paidAt: null,
  paidAmountCents: null,
  invoiceNumber: 7,
  receiptNumber: null,
  ...over,
});
export const connectedLinks: AgencyPayLink[] = [
  link({}),
  link({
    id: "a7000000-0000-4000-8000-000000000402",
    slug: "fieldwork-studio-p2m7t",
    businessWorkspaceId: XS.fieldwork,
    clientName: "Fieldwork Studio",
    description: "Intake form and print price list",
    amountCents: 60000,
    status: "paid",
    paidAt: "2026-10-12T16:20:00Z",
    paidAmountCents: 60000,
    invoiceNumber: 5,
    receiptNumber: 3,
    createdAt: "2026-10-06T12:00:00Z",
  }),
  link({
    id: "a7000000-0000-4000-8000-000000000403",
    slug: "lakeview-mediation-r8d2w",
    businessWorkspaceId: XS.lakeview,
    clientName: "Lakeview Mediation",
    description: "Spanish intake form",
    amountCents: null,
    minCents: 20000,
    maxCents: 40000,
    status: "expired",
    revokedAt: "2026-10-10T10:00:00Z",
    invoiceNumber: 4,
    createdAt: "2026-10-01T12:00:00Z",
  }),
];
export function paymentLinksSnapshot(
  reason: "ready" | "setup_required" | "off" | "unavailable",
  links = connectedLinks,
) {
  return {
    agency: { id: XS.north, name: "North Studio", role: "owner" },
    currentActorId: XS.maya,
    legacyMerchant: false,
    checkoutAvailability:
      reason === "off" ? UNRELEASED_CHECKOUT : { status: reason },
    payLinks: [],
    paidPayments: {},
    paymentStatusAvailable: true,
    clients: [],
    connectedLinks: links,
    creation: { enabled: reason !== "off", reason },
  };
}

export const invoiceDoc: MoneyDocument = {
  id: "a7000000-0000-4000-8000-000000000501",
  kind: "invoice",
  number: 7,
  issuer_workspace_id: XS.north,
  source_id: connectedLinks[0]!.id,
  payment_id: null,
  issued_at: "2026-10-09T15:00:00Z",
  snapshot: {
    issuerName: "North Studio",
    billTo: "Harbor Dental, 1180 Elmwood Ave, Buffalo, NY 14222",
    description:
      "Website care for November: booking page, hours and two inquiry follow-ups",
    amountCents: 125050,
    currency: "usd",
    issuedAt: "2026-10-09T15:00:00Z",
  },
};
export const receiptDoc: MoneyDocument = {
  id: "a7000000-0000-4000-8000-000000000502",
  kind: "payment_receipt",
  number: 3,
  issuer_workspace_id: XS.north,
  source_id: connectedLinks[1]!.id,
  payment_id: "a7000000-0000-4000-8000-000000000601",
  issued_at: "2026-10-12T16:21:00Z",
  snapshot: {
    issuerName: "North Studio",
    billTo: "Fieldwork Studio",
    description: "Intake form and print price list",
    amountPaidCents: 60000,
    currency: "usd",
    paidAt: "2026-10-12T16:20:00Z",
    paymentReference: "Stripe payment 4418",
  },
};

export const businessMoney = {
  account: { state: "ready" },
  payments: [
    {
      id: "a7000000-0000-4000-8000-000000000701",
      amount_cents: 12000,
      currency: "usd",
      purpose: "booking_deposit",
    },
    {
      id: "a7000000-0000-4000-8000-000000000702",
      amount_cents: 45000,
      currency: "usd",
      purpose: "quoted_work",
    },
    {
      id: "a7000000-0000-4000-8000-000000000703",
      amount_cents: 12000,
      currency: "usd",
      purpose: "booking_deposit",
    },
  ],
  events: [
    {
      payment_id: "a7000000-0000-4000-8000-000000000701",
      kind: "paid",
      amount_cents: 12000,
    },
    {
      payment_id: "a7000000-0000-4000-8000-000000000702",
      kind: "paid",
      amount_cents: 45000,
    },
    {
      payment_id: "a7000000-0000-4000-8000-000000000702",
      kind: "refund",
      amount_cents: 5000,
    },
  ],
};
export const paymentSources = [
  {
    source_id: "a7000000-0000-4000-8000-000000000801",
    kind: "deposit" as const,
    label: "Ana R. · cleaning, Mon Nov 23 at 10:30",
  },
  {
    source_id: "a7000000-0000-4000-8000-000000000802",
    kind: "quote" as const,
    label: "J. Patel · crown, quoted Oct 13",
    approvedCents: 145000,
    approvedCurrency: "usd",
    approvedTerms:
      "Quoted by Dr. Lin on Oct 13. Half is due before the first visit.",
  },
];
export const paymentRequests = [
  {
    id: "a7000000-0000-4000-8000-000000000901",
    kind: "deposit",
    amount_cents: 12000,
    currency: "usd",
    status: "paid",
    refundRequired: false,
  },
  {
    id: "a7000000-0000-4000-8000-000000000902",
    kind: "quote",
    amount_cents: 72500,
    currency: "usd",
    status: "unpaid",
    refundRequired: false,
  },
];

export const governedGraph = (empty: boolean): GovernedMoneyGraph => ({
  workspaceId: XS.harbor,
  canPrepare: true,
  payer: { kind: "business", workspaceId: XS.harbor, customerConfigured: true },
  prices: empty
    ? []
    : [
        {
          version: "Harbor Dental care plan 2026",
          amountCents: 15000,
          currency: "usd",
          definitionId: null,
          effectiveFrom: "2026-10-01T00:00:00Z",
          effectiveUntil: null,
        },
      ],
  terms: empty
    ? []
    : [
        {
          lineId: "line-oct",
          workspaceId: XS.harbor,
          priceVersion: "Harbor Dental care plan 2026",
          amountCents: 15000,
          currency: "usd",
          installationId: null,
          acceptedBy: XS.amy,
          acceptedAt: "2026-10-01T13:00:00Z",
          periodStart: "2026-10-01T00:00:00Z",
          periodEnd: "2026-11-01T00:00:00Z",
        },
      ],
  installations: [],
  collectionDispatch: "not_configured",
});
export const versionGraph = (empty: boolean): NeutralVersionMoneyGraph => ({
  workspaceId: XS.harbor,
  canPrepare: true,
  customerConfigured: true,
  payerKind: "business",
  payerWorkspaceId: XS.harbor,
  installations: empty
    ? []
    : [
        {
          versionId: XS.version,
          releaseNumber: 2,
          name: "Dental intake",
          sourceSystemId: XS.system,
          sourceRevisionId: XS.source,
          creatorWorkspaceId: XS.north,
          definitionId: `system-source:${XS.system}`,
          listingId: XS.listing,
          qualified: true,
          released: true,
        },
      ],
  prices: empty
    ? []
    : [
        {
          version: "Dental intake 2026",
          amountCents: 1200,
          currency: "usd",
          definitionId: `system-source:${XS.system}`,
          effectiveFrom: "2026-10-01T00:00:00Z",
          effectiveUntil: null,
        },
      ],
  history: [],
  collectionDispatch: "not_configured",
});

export const creatorSources = (empty: boolean): NeutralCreatorSources => ({
  workspaceId: XS.north,
  canRegister: true,
  sources: empty
    ? []
    : [
        {
          sourceSystemId: XS.system,
          sourceRevisionId: XS.source,
          creatorWorkspaceId: XS.north,
          definitionId: `system-source:${XS.system}`,
          name: "Dental intake",
          revision: 2,
          qualified: true,
          listingId: XS.listing,
          listingAgreementVersion: "North Studio creator terms 2026",
          listingRateReference: "Written rate A",
        },
      ],
  agreements: [
    {
      version: "North Studio creator terms 2026",
      rateReference: "Written rate A",
      rateBps: 1000,
      effectiveFrom: "2026-10-01T00:00:00Z",
      effectiveUntil: null,
    },
  ],
});
export const creatorMaintenance = (
  empty: boolean,
): CreatorMaintenanceGraph => ({
  workspaceId: XS.north,
  canMaintain: true,
  listings: empty
    ? []
    : [
        {
          id: XS.listing,
          definitionId: "Dental intake",
          sourceRevisionId: XS.source,
          agreementVersion: "North Studio creator terms 2026",
          rateReference: "Written rate A",
          maintainerState: "creator",
          history: [],
        },
      ],
  agreements: [
    {
      version: "North Studio creator terms 2026",
      rateReference: "Written rate A",
      rateBps: 1000,
      effectiveFrom: "2026-10-01T00:00:00Z",
      effectiveUntil: null,
    },
  ],
});

export const reconciliationIssues = [
  {
    account_id: "acct_north_studio",
    event_id: "evt_4418",
    reason: "unmatched_payment",
    event_type: "payment_intent.succeeded",
    object_id: "pi_4418",
    resolution: null,
  },
  {
    account_id: "acct_north_studio",
    event_id: "evt_4402",
    reason: "late_refund",
    event_type: "charge.refunded",
    object_id: "ch_4402",
    resolution: {
      id: "a7000000-0000-4000-8000-000000000990",
      kind: "no_effect_after_review",
      note: "Refund matched the Oct 12 receipt for Fieldwork Studio. Nothing else moved.",
    },
  },
];
