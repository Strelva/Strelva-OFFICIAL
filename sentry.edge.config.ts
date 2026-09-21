import * as Sentry from "@sentry/nextjs";
import { isPrivateWorkspaceLocation } from "./src/lib/workspace-privacy";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  beforeSend: (event) => isPrivateWorkspaceLocation(event.request?.url) ? null : event,
  beforeSendTransaction: (event) => isPrivateWorkspaceLocation(event.transaction) || isPrivateWorkspaceLocation(event.request?.url) ? null : event,
});
