import * as Sentry from "@sentry/nextjs";
import { SENTRY_SECRET_VALUES } from "./src/lib/sentry-secret-env";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "./src/lib/sentry-scrubber";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  integrations: (defaultIntegrations) => {
    const requestData = Sentry.requestDataIntegration({
      include: { cookies: false, data: false, headers: true, ip: false, query_string: false, url: true },
    });
    return [...defaultIntegrations.filter((integration) => integration.name !== "RequestData"), requestData];
  },
  beforeSend: (event) => scrubSentryEvent(event, SENTRY_SECRET_VALUES),
  beforeSendTransaction: (event) => scrubSentryEvent(event, SENTRY_SECRET_VALUES),
  beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb, SENTRY_SECRET_VALUES),
});
