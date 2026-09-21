export {
  createHomeFinderServerAdapter,
} from "./server-adapter";
export type { HomeFinderServerAdapter } from "./server-adapter";
export {
  HOME_FINDER_PUBLIC_BASE_URL_ENV,
  HOME_FINDER_SYNTHETIC_PREVIEW_PATH,
  resolveHomeFinderPreviewHref,
} from "./preview";

import { createHomeFinderServerAdapter } from "./server-adapter";
import type { HomeFinderServerAdapter } from "./server-adapter";

export const HOME_FINDER_MANAGEMENT_BASE_URL_ENV =
  "HOME_FINDER_MANAGEMENT_BASE_URL" as const;
export const HOME_FINDER_MANAGEMENT_SIGNING_KEY_ENV =
  "HOME_FINDER_MANAGEMENT_SIGNING_KEY" as const;

/** Server-only composition. Missing or invalid configuration grants nothing. */
export function getConfiguredHomeFinderAdapter(): HomeFinderServerAdapter | null {
  const baseUrl = process.env[HOME_FINDER_MANAGEMENT_BASE_URL_ENV]?.trim();
  const signingKey = process.env[HOME_FINDER_MANAGEMENT_SIGNING_KEY_ENV]?.trim();
  if (!baseUrl || !signingKey) return null;

  try {
    return createHomeFinderServerAdapter({ baseUrl, signingKey });
  } catch {
    return null;
  }
}
