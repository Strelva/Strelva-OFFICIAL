/** Pure legacy domain normalization; no routing, provider or database access. */
function withoutProtocol(domain: string): string {
  return domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function normalizeTenantDomain(domain: string | undefined): string | null {
  const normalized = domain ? withoutProtocol(domain).toLowerCase() : "";
  return normalized || null;
}
