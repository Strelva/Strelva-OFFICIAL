/** Drop private workspace telemetry, including invitation fragments and API payloads. */
export function isPrivateWorkspaceLocation(value: unknown): boolean {
  return typeof value === "string" && /(?:^|\/)\b(?:api\/)?workspace(?:[/?#\s]|$)/.test(value);
}

export function onPrivateWorkspacePage(): boolean {
  return typeof window !== "undefined" && isPrivateWorkspaceLocation(window.location.pathname);
}
