import * as Sentry from "@sentry/nextjs";
import { isPrivateWorkspaceLocation, onPrivateWorkspacePage } from "./src/lib/workspace-privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  beforeSend: (event) => onPrivateWorkspacePage() || isPrivateWorkspaceLocation(event.request?.url) ? null : event,
  beforeSendTransaction: (event) => onPrivateWorkspacePage() || isPrivateWorkspaceLocation(event.transaction) || isPrivateWorkspaceLocation(event.request?.url) ? null : event,
  beforeBreadcrumb: (breadcrumb) => onPrivateWorkspacePage() ||
    [breadcrumb.data?.url, breadcrumb.data?.from, breadcrumb.data?.to].some(isPrivateWorkspaceLocation) ? null : breadcrumb,
});
