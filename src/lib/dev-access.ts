export function isDevAccessBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.REB_DEV_UNGATED_ACCESS === "1";
}

export function getDevAccessTenant(): string | null {
  if (!isDevAccessBypassEnabled()) return null;
  const tenant = process.env.REB_DEV_TENANT?.trim();
  return tenant && /^[a-z0-9-]+$/.test(tenant) ? tenant : null;
}
