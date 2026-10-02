import type { SiteDocument } from "./site-document-schema";

/** Resolve bounded chains to a known document page; no external redirects. */
export function hostedRedirectTarget(document: SiteDocument, path: string): string | null {
  const redirects = new Map(document.redirects.map(item => [item.from, item.to]));
  let target = redirects.get(path);
  if (!target) return null;
  const seen = new Set([path]);
  while (target && redirects.has(target)) {
    if (seen.has(target) || seen.size > 200) return null;
    seen.add(target); target = redirects.get(target);
  }
  return target && /^\/(?:[a-zA-Z0-9_.-]+\/?)*$/.test(target) && !target.split("/").some(segment => segment === "." || segment === "..") && document.pages.some(page => page.path === target) ? target : null;
}
