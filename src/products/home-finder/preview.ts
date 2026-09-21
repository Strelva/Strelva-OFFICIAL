/**
 * Resolve the external Home Finder synthetic preview without making the
 * workspace a second installation authority. Only an origin-only server
 * setting is accepted; the browser cannot supply or alter this destination.
 */
export const HOME_FINDER_PUBLIC_BASE_URL_ENV = "HOME_FINDER_PUBLIC_BASE_URL" as const;
export const HOME_FINDER_SYNTHETIC_PREVIEW_PATH = "/embed/agency-preview" as const;

export function resolveHomeFinderPreviewHref(
  env: Record<string, string | undefined> = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string | undefined {
  const configuredBase = env[HOME_FINDER_PUBLIC_BASE_URL_ENV]?.trim();
  if (configuredBase) {
    try {
      const base = new URL(configuredBase);
      const localHttp = base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
      const allowedProtocol = base.protocol === "https:" || (nodeEnv !== "production" && localHttp);
      const originOnly = !base.username && !base.password && !base.search && !base.hash && (base.pathname === "/" || base.pathname === "");
      if (allowedProtocol && originOnly) return new URL(HOME_FINDER_SYNTHETIC_PREVIEW_PATH, base.origin).toString();
    } catch {
      // Fall through to the local synthetic worker only outside production.
    }
  }
  return nodeEnv === "production" ? undefined : `http://127.0.0.1:3213${HOME_FINDER_SYNTHETIC_PREVIEW_PATH}`;
}
