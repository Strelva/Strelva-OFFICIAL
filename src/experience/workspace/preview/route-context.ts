export interface PreviewRouteContext {
  scenario: string;
  systems?: "on" | "off";
}

/** Keep a preview's fixture selection when a local workspace link is opened directly. */
export function withPreviewRouteContext(href: string, context?: PreviewRouteContext): string {
  if (!context) return href;

  const url = new URL(href, "https://workspace.invalid");
  if (url.origin !== "https://workspace.invalid" || !url.pathname.endsWith("/workspace")) return href;

  url.searchParams.set("scenario", context.scenario);
  if (context.systems) url.searchParams.set("systems", context.systems);
  return `${url.pathname}${url.search}${url.hash}`;
}
