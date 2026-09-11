/** Drop private work telemetry, including inquiry records and invitation fragments. */
export function isPrivateWorkspaceLocation(value: unknown): boolean {
  return typeof value === "string" && /(?:^|\/)(?:(?:api\/)?(?:workspace|inquiry-workspace)|business|preview\/strelva\/inquiries)(?:[/?#\s]|$)/.test(value);
}

export function onPrivateWorkspacePage(): boolean {
  return typeof window !== "undefined" && isPrivateWorkspaceLocation(window.location.pathname);
}
