/**
 * /api/admin/domains — compatibility alias for the client-dashboard domain
 * management route. This is NOT a super-admin route: it is client-scoped and
 * gated by requireTenantPermission(tenant, "domains:manage"), where `tenant`
 * is resolved from the x-tenant header set by the proxy. Super-admin
 * enforcement is NOT applied here.
 *
 * Prefer calling /api/tenant/domains directly from client-dashboard surfaces.
 * This alias exists for backward compatibility only and may be removed once
 * all callers (e.g. OwnershipSection.tsx) have been updated.
 *
 * Security model: relies on the proxy injecting x-tenant from the authenticated
 * session — the route does NOT trust a caller-supplied tenant value.
 */
export { DELETE, GET, PATCH, POST } from "@/app/api/tenant/domains/route";
