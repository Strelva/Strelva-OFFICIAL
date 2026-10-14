import * as Sentry from "@sentry/nextjs";
import { onPrivateWorkspacePage } from "./src/lib/workspace-privacy";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "./src/lib/sentry-scrubber";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  beforeSend: (event) => scrubSentryEvent(event, [], onPrivateWorkspacePage()),
  beforeSendTransaction: (event) => scrubSentryEvent(event, [], onPrivateWorkspacePage()),
  beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb, [], onPrivateWorkspacePage()),
});
