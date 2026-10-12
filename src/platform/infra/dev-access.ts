// New code uses SCAFFOLD_*; the legacy REB_* names are kept as a fallback so a
// local .env that still sets them keeps working through the rename. Dev-only:
// both are inert in production (NODE_ENV gate below).
export function isDevAccessBypassEnabled(): boolean {
  const flag =
    process.env.SCAFFOLD_DEV_UNGATED_ACCESS ?? process.env.REB_DEV_UNGATED_ACCESS;
  return process.env.NODE_ENV !== "production" && flag === "1";
}

export function getDevAccessTenant(): string | null {
  if (!isDevAccessBypassEnabled()) return null;
  const tenant = (process.env.SCAFFOLD_DEV_TENANT ?? process.env.REB_DEV_TENANT)?.trim();
  return tenant && /^[a-z0-9-]+$/.test(tenant) ? tenant : null;
}
