/** Private static website previews have no executable scripts or form writes. */
export const WEBSITE_PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-same-origin";

export function isWebsiteCandidatePreviewPath(pathname: string): boolean {
  if (pathname === "/preview/strelva/rebuild/site") return true;
  return /^\/api\/websites\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/preview$/.test(pathname);
}

/** Agency JSON and existing routes retain their framing policy. Only the exact
 * activated HTML preview action participates in private same-origin framing. */
export function isWebsiteCandidatePreviewRequest(pathname: string, searchParams: Pick<URLSearchParams,"getAll">, rebuildEnabled: boolean): boolean {
  if (isWebsiteCandidatePreviewPath(pathname)) return true;
  const actions = searchParams.getAll("document");
  return rebuildEnabled && pathname === "/api/agency-website-draft-access" && actions.length === 1 && actions[0] === "preview";
}
