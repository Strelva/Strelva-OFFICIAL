import { isClientFallbackRoot } from "./client-fallback";

function isLocalDashboardHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
}

function hostnameFromHost(host: string): string {
  return host.split(":")[0] || "";
}

export function getLocalClientPreviewUrl({
  clientFallbackRoot,
  requestHost,
  requestProto,
}: {
  clientFallbackRoot: string;
  requestHost: string;
  requestProto: string;
}): string | null {
  if (!isClientFallbackRoot(clientFallbackRoot)) return null;
  if (!isLocalDashboardHost(hostnameFromHost(requestHost))) return null;
  return `${requestProto}://${requestHost}`;
}
