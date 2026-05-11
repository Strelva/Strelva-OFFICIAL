type HeaderReader = {
  get(name: string): string | null;
};

const CLIENT_FALLBACK_ROOT_RE = /^\/client\/[a-z0-9-]+$/;

export function isClientFallbackRoot(value: string | null | undefined): value is string {
  return typeof value === "string" && CLIENT_FALLBACK_ROOT_RE.test(value);
}

export function getClientFallbackRoot(requestHeaders: HeaderReader): string {
  const clientFallbackRoot = requestHeaders.get("x-client-fallback-root");
  return isClientFallbackRoot(clientFallbackRoot) ? clientFallbackRoot : "";
}

export function withClientFallbackRoot(
  clientFallbackRoot: string | null | undefined,
  path: string,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return isClientFallbackRoot(clientFallbackRoot)
    ? `${clientFallbackRoot}${normalizedPath}`
    : normalizedPath;
}
