import * as Sentry from "@sentry/nextjs";
import { isPrivateWorkspaceLocation } from "./src/lib/workspace-privacy";
import { SENTRY_SECRET_VALUES } from "./src/lib/sentry-secret-env";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "./src/lib/sentry-scrubber";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  integrations: (defaultIntegrations) => {
    const requestData = Sentry.requestDataIntegration({
      include: { cookies: false, data: false, headers: true, ip: false, query_string: false, url: true },
    });
    return [...defaultIntegrations.filter((integration) => integration.name !== "RequestData"), requestData];
  },
  beforeSend: (event) => {
    const isPrivate = isPrivateWorkspaceLocation(event.request?.url);
    scrubSentryEvent(event, SENTRY_SECRET_VALUES);
    return isPrivate ? null : event;
  },
  beforeSendTransaction: (event) => {
    const isPrivate = isPrivateWorkspaceLocation(event.transaction) || isPrivateWorkspaceLocation(event.request?.url);
    scrubSentryEvent(event, SENTRY_SECRET_VALUES);
    return isPrivate ? null : event;
  },
  beforeBreadcrumb: (breadcrumb) => {
    const isPrivate = [breadcrumb.data?.url, breadcrumb.data?.from, breadcrumb.data?.to].some(isPrivateWorkspaceLocation);
    scrubSentryBreadcrumb(breadcrumb, SENTRY_SECRET_VALUES);
    return isPrivate ? null : breadcrumb;
  },
});
