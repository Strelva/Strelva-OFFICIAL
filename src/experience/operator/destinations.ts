/** Operator navigation and headings share these names. Routes stay compatible
 * with saved links; Sites are support records, never business identities. */
export const OPERATOR_DESTINATIONS = {
  overview: { href: "/admin", label: "Overview", group: "Operations", icon: "overview", exact: true },
  queue: { href: "/admin/queue", label: "Queue", group: "Operations", icon: "queue", primary: true, previewHref: "/preview/strelva/operator-queue" },
  checks: { href: "/admin/uptime", label: "Checks", group: "Operations", icon: "checks", primary: true, previewHref: "/preview/strelva/operator-checks" },
  sites: { href: "/admin/clients", label: "Sites", group: "Support", icon: "sites", primary: true, badgeKey: "clients", previewHref: "/preview/strelva/operator-client", aliases: ["/admin/tenants"] },
  inquiryReview: { href: "/admin/client-leads/inquiries", label: "Inquiry review", group: "Support", icon: "inquiries" },
  inquiries: { href: "/admin/client-leads", label: "Client inquiries", group: "Support", icon: "inquiries" },
  billingGroups: { href: "/admin/accounts", label: "Billing groups", group: "Support", icon: "billing", badgeKey: "accounts" },
  policy: { href: "/admin/needs-you", label: "Who decides", group: "Operations", icon: "policy" },
  work: { href: "/admin/work", label: "Internal work", group: "Operations", icon: "work" },
  health: { href: "/admin/ops", label: "Operational health", group: "System administration", icon: "checks", badgeKey: "ops" },
  audits: { href: "/admin/audit", label: "Site audits", group: "System administration", icon: "audits" },
  analytics: { href: "/admin/analytics", label: "Analytics", group: "Support", icon: "analytics" },
  money: { href: "/admin/money", label: "Money records", group: "Support", icon: "payment", moneyOnly: true },
  actions: { href: "/admin/actions", label: "Strelva Agency work", group: "Strelva Agency", icon: "actions", badgeKey: "actions" },
  onboard: { href: "/admin/onboard", label: "Add a Strelva Agency client", group: "Strelva Agency", icon: "onboard" },
  payLinks: { href: "/admin/pay-links", label: "Strelva Agency payment links", group: "Strelva Agency", icon: "payment" },
  prospects: { href: "/admin/leads", label: "Prospects", group: "Strelva Agency", icon: "prospects", badgeKey: "leads" },
  websites: { href: "/admin/websites", label: "Website rebuilds", group: "Strelva Agency", icon: "sites" },
  drafts: { href: "/admin/drafts", label: "Pending drafts", group: "Strelva Agency", icon: "drafts" },
  maintenance: { href: "/admin/digests", label: "Maintenance digests", group: "Strelva Agency", icon: "maintenance" },
  cleanup: { href: "/admin/tenant-cleanup/[id]", label: "Site cleanup recovery", group: "Support", icon: "sites", detail: true },
} as const satisfies Record<string, OperatorDestination>;

export interface OperatorDestination {
  href: string; label: string; group: string; icon: string;
  exact?: boolean; primary?: boolean; previewHref?: string; badgeKey?: string;
  moneyOnly?: boolean; aliases?: readonly string[]; detail?: boolean;
}

export function operatorDestinations({ moneyEnabled = false, preview = false } = {}): OperatorDestination[] {
  return (Object.values(OPERATOR_DESTINATIONS) as OperatorDestination[])
    .filter(item => !item.detail && (!item.moneyOnly || moneyEnabled) && (!preview || item.previewHref))
    .map(item => preview ? { ...item, href: item.previewHref! } : item);
}

/** Longest path wins, so Inquiry review does not select Client inquiries. */
export function operatorDestination(pathname: string): OperatorDestination | undefined {
  return (Object.values(OPERATOR_DESTINATIONS) as OperatorDestination[]).slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find(item => [item.href, ...(item.aliases ?? [])].some(href => {
      if (href.includes("[id]")) { const prefix = href.split("[id]")[0]!; return pathname.startsWith(prefix) && pathname.length > prefix.length; }
      return pathname === href || (!item.exact && pathname.startsWith(`${href}/`));
    }));
}
