/** Auth messages may contain identity/provider data; report only bounded SDK codes. */
export function localAuthFailure(stage: "create identity" | "sign in", error: unknown): Error {
  const value = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : {};
  const code = typeof value.code === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(value.code) ? value.code : "unavailable";
  const status = typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599 ? ` status=${value.status}` : "";
  return new Error(`Local Auth ${stage} failed: code=${code}${status}`);
}
