/** Private static website previews have no executable scripts or form writes. */
export const WEBSITE_PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-same-origin";

export function isWebsiteCandidatePreviewPath(pathname: string): boolean {
  return /^\/api\/websites\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/preview$/.test(pathname);
}
