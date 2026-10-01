/**
 * Strelva-hosted website addresses. Edge-safe: the proxy and the server share
 * this parser so a host resolves to the same published address everywhere.
 *
 * Hosted sites live on their own registrable domain (STRELVA_SITES_DOMAIN), not
 * under strelva.com, so generated sites never share a cookie scope with the
 * control plane. Include the port for local development, e.g.
 * `sites.localhost:3000`. Unset means hosted publishing is unavailable.
 */
export const HOSTED_SITES_DOMAIN_ENV = "STRELVA_SITES_DOMAIN" as const;

export const HOSTED_SITE_ADDRESS_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

const DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/;

export function hostedSitesDomain(raw = process.env[HOSTED_SITES_DOMAIN_ENV]): string | null {
  const domain = raw?.trim().toLowerCase().replace(/^\.+/, "") ?? "";
  return domain && DOMAIN_PATTERN.test(domain) && domain.includes(".") ? domain : null;
}

function withoutPort(host: string): string {
  return host.toLowerCase().split(":")[0] ?? "";
}

/** The published address for a request host, or null when it is not a hosted-site host. */
export function hostedSiteAddressFromHost(host: string, domain = hostedSitesDomain()): string | null {
  if (!domain) return null;
  const suffix = `.${withoutPort(domain)}`;
  const hostname = withoutPort(host);
  if (!hostname.endsWith(suffix)) return null;
  const address = hostname.slice(0, -suffix.length);
  return HOSTED_SITE_ADDRESS_PATTERN.test(address) ? address : null;
}

export function hostedSiteUrl(address: string, domain: string): string {
  const protocol = withoutPort(domain).endsWith(".localhost") ? "http" : "https";
  return `${protocol}://${address}.${domain}`;
}

/** Internal route that serves a hosted site; only the proxy rewrites to it. */
export function hostedSiteRewritePath(address: string, pathname: string): string {
  return `/hosted-site/${address}${pathname === "/" ? "" : pathname}`;
}
