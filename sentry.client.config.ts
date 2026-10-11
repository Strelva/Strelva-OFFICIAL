import * as Sentry from "@sentry/nextjs";
import { isPrivateWorkspaceLocation, onPrivateWorkspacePage } from "./src/lib/workspace-privacy";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "./src/lib/sentry-scrubber";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  beforeSend: (event) => {
    const isPrivate = onPrivateWorkspacePage() || isPrivateWorkspaceLocation(event.request?.url);
    scrubSentryEvent(event);
    return isPrivate ? null : event;
  },
  beforeSendTransaction: (event) => {
    const isPrivate = onPrivateWorkspacePage() || isPrivateWorkspaceLocation(event.transaction) || isPrivateWorkspaceLocation(event.request?.url);
    scrubSentryEvent(event);
    return isPrivate ? null : event;
  },
  beforeBreadcrumb: (breadcrumb) => {
    const isPrivate = onPrivateWorkspacePage() ||
      [breadcrumb.data?.url, breadcrumb.data?.from, breadcrumb.data?.to].some(isPrivateWorkspaceLocation);
    scrubSentryBreadcrumb(breadcrumb);
    return isPrivate ? null : breadcrumb;
  },
});
