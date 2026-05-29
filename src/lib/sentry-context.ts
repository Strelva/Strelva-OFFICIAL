/**
 * Sentry context enrichment for API routes.
 *
 * Sets structured tags (tenantId, userId, route) and breadcrumbs
 * on every error so Sentry issues are filterable by tenant and user.
 */

import * as Sentry from "@sentry/nextjs";

/**
 * Set Sentry tags for the current scope. Call at the top of API route handlers.
 */
export function setSentryContext(context: {
  tenantId?: string | null;
  userId?: string | null;
  route?: string;
}): void {
  if (context.tenantId) Sentry.setTag("tenantId", context.tenantId);
  if (context.userId) Sentry.setTag("userId", context.userId);
  if (context.route) Sentry.setTag("route", context.route);
}

/**
 * Add a Sentry breadcrumb for key operations.
 */
export function addSentryBreadcrumb(
  category: "content" | "agent" | "webhook" | "billing" | "auth",
  message: string,
  data?: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: "info",
  });
}
